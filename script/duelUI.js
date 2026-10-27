// Pojedynki 1v1: przeglądarka lobby, prośba o walkę z akceptacją hosta i ekran walki.
// Serwer (functions/api/duel/*) tylko przekazuje ruchy; walkę liczy DuelEngine u obu graczy.
// Ładowany po duelEngine.js i battleUI.js.
(function () {
  const API = "/api/duel";
  const MIN_LEVEL = 51;                 // ukończony 50. poziom (serwer sprawdza to w zapisie z chmury)
  const POLL_BROWSER_MS = 5000;         // lista lobby
  const POLL_WAIT_MS = 2000;            // czekanie na akceptację / ruch przeciwnika
  const POLL_TURN_MS = 5000;            // moja tura (tylko kontrola, czy walka się nie skończyła)
  const E = window.DuelEngine;

  const EFFECT_LABELS = {
    stun: "Ogłuszenie", poison: "Zatrucie", vines: "Pnącza", enemyAccuracy: "Osłabiona celność",
    mirror: "Lustro", mushin: "Mushin", bastionTurns: "Bastion", evadeNext: "Unik", ironTaunt: "Żelazna Zaczepka",
    rageArmor: "Pancerz z Gniewu", accuracy: "Zwiększona celność",
  };
  const DEBUFFS = ["stun", "poison", "vines", "enemyAccuracy"]; // przechowywane u tego, kto je nałożył
  const BUFFS = ["mirror", "mushin", "bastionTurns", "evadeNext", "ironTaunt", "rageArmor", "accuracy"];
  const END_REASONS = {
    timeout: "przeciwnik nie wykonał ruchu w 30 s", forfeit: "poddanie się", normal: "walka rozegrana do końca",
    reported: "przeciwnik opuścił walkę po jej zakończeniu", desync: "wykryto rozjazd symulacji", abandoned: "obaj gracze opuścili walkę",
  };
  const DECLINE_TEXT = {
    declined: "Host odrzucił prośbę.", timeout: "Host nie odpowiedział w ciągu 20 s.", busy: "Któryś z graczy jest już w innej walce.",
    invalid: "Twój zapis w chmurze jest nieprawidłowy.",
  };
  const ERROR_TEXT = {
    unauthorized: "Sesja wygasła — zaloguj się ponownie przez Discord.",
    no_save: "Brak zapisu w chmurze. Zapisz postać w Opcjach → „Zapisz w chmurze”.",
    level_too_low: `Zapis w chmurze ma za niski poziom (wymagany ${MIN_LEVEL}+). Zapisz aktualną postać w chmurze.`,
    invalid_save: "Zapis w chmurze jest uszkodzony.", no_class: "Zapis w chmurze nie ma klasy postaci.",
    build_too_large: "Zapis w chmurze jest zbyt duży.", in_duel: "Masz już trwającą walkę.",
    request_pending: "Czekasz już na odpowiedź innego hosta.", busy: "Ten host rozpatruje już inną prośbę.",
    not_available: "To lobby nie jest już dostępne.", own_lobby: "To twoje własne lobby.", mode_unavailable: "Ten tryb jest jeszcze niedostępny.",
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const other = (side) => (side === "host" ? "guest" : "host");

  let me = { loggedIn: false };
  let panel = null;
  let screen = null;
  let phase = "closed";     // closed | browser | hosting | requesting | fight
  let pollTimer = null;
  let tickTimer = null;
  let lobbyId = null;
  let fight = null;

  // ---------- Pomocnicze ----------
  async function api(path, { method = "GET", body } = {}) {
    try {
      const response = await fetch(`${API}${path}`, {
        method,
        credentials: "same-origin",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      let data = null;
      try { data = await response.json(); } catch (error) { data = null; }
      if (response.status === 401) me = { loggedIn: false };
      return { ok: response.ok, status: response.status, data: data || {} };
    } catch (error) {
      return { ok: false, status: 0, data: { error: "network" } };
    }
  }

  function errorText(data) {
    if (data && data.error === "level_too_low") return `Zapis w chmurze ma za niski poziom (wymagany ${data.minLevel || MIN_LEVEL}+). Zapisz aktualną postać w chmurze.`;
    return ERROR_TEXT[data && data.error] || "Coś poszło nie tak. Spróbuj ponownie.";
  }

  function className(classId) {
    return (window.gameClasses || []).find((item) => item.id === classId)?.name || classId || "?";
  }

  function abilityName(classId, abilityId) {
    return (window.classAbilities?.[classId]?.active || []).find((item) => item.id === abilityId)?.name || abilityId;
  }

  function setStatus(text, type) {
    const element = $("#duel-status", panel);
    if (!element) return;
    element.textContent = text || "";
    element.className = `screen-message${type ? ` ${type}` : ""}`;
  }

  // Komunikat o wyniku prośby (odrzucona, wygasła...) — zostaje, dopóki gracz nie zrobi kolejnego kroku,
  // bo pasek stanu jest odświeżany razem z listą lobby.
  function setNotice(text, type) {
    const element = $("#duel-notice", panel);
    if (!element) return;
    element.textContent = text || "";
    element.className = `screen-message${text ? "" : " hidden"}${type ? ` ${type}` : ""}`;
  }

  function stopTimers() {
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  function schedule(fn, delay) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(fn, delay);
  }

  async function refreshMe() {
    try {
      const response = await fetch("/api/me", { credentials: "same-origin" });
      me = response.ok ? await response.json() : { loggedIn: false };
    } catch (error) {
      me = { loggedIn: false };
    }
    return me;
  }

  // ---------- Przycisk w menu ----------
  function refreshButton() {
    const button = document.getElementById("duel-btn");
    if (!button) return;
    button.classList.toggle("hidden", !(window.player && window.player.level >= MIN_LEVEL));
  }

  // ---------- Okno lobby ----------
  function ensureDom() {
    if (panel) return;
    const main = document.querySelector(".main") || document.body;

    panel = document.createElement("section");
    panel.id = "duel-panel";
    panel.className = "modal hidden";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "duel-panel-title");
    panel.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2 id="duel-panel-title">🥊 Pojedynki 1v1</h2>
          <button id="duel-close-btn" class="modal-close" type="button" aria-label="Zamknij">✕</button>
        </div>
        <p id="duel-notice" class="screen-message hidden" aria-live="polite"></p>
        <p id="duel-status" class="screen-message" aria-live="polite"></p>
        <div id="duel-body"></div>
      </div>`;
    main.appendChild(panel);
    $("#duel-close-btn", panel).addEventListener("click", closePanel);

    screen = document.createElement("section");
    screen.id = "duel-screen";
    screen.className = "hidden";
    screen.setAttribute("aria-live", "polite");
    screen.innerHTML = `
      <div class="battle-header">
        <div><span class="eyebrow" id="duel-mode">POJEDYNEK · CASUAL</span><h2 id="duel-title">Walka</h2></div>
        <div id="duel-round">Runda 1</div>
      </div>
      <div id="duel-score" class="duel-score"></div>
      <div class="battle-arena">
        <article class="combatant combatant-player" id="duel-me">
          <span class="combatant-label">TY</span>
          <h3 data-role="name">Gracz</h3>
          <div class="battle-model battle-model-player"><img data-role="model" src="res/skins/player_model.png" alt=""></div>
          <div class="battle-resource-bars">
            <div><span class="resource-label">HP: <strong data-role="hp">0 / 0</strong></span><div class="health-bar"><span data-role="hp-bar"></span></div></div>
            <div><span class="resource-label">Mana: <strong data-role="mana">0 / 0</strong></span><div class="health-bar mana-bar"><span data-role="mana-bar"></span></div></div>
          </div>
          <div class="duel-chips" data-role="chips"></div>
        </article>
        <div class="battle-versus">VS</div>
        <article class="combatant combatant-enemy" id="duel-foe">
          <span class="combatant-label">PRZECIWNIK</span>
          <h3 data-role="name">Przeciwnik</h3>
          <div class="battle-model battle-model-enemy"><img data-role="model" src="res/skins/player_model.png" alt=""></div>
          <div class="battle-resource-bars">
            <div><span class="resource-label">HP: <strong data-role="hp">0 / 0</strong></span><div class="health-bar enemy-health-bar"><span data-role="hp-bar"></span></div></div>
            <div><span class="resource-label">Mana: <strong data-role="mana">0 / 0</strong></span><div class="health-bar mana-bar"><span data-role="mana-bar"></span></div></div>
          </div>
          <div class="duel-chips" data-role="chips"></div>
        </article>
      </div>
      <div id="duel-timer" class="duel-timer"></div>
      <div id="duel-log" class="battle-log">Walka się rozpoczyna…</div>
      <div id="duel-actions" class="battle-actions duel-actions"></div>
      <div class="battle-actions">
        <button id="duel-forfeit-btn" type="button" class="secondary-button">🏳️ Poddaj się</button>
        <button id="duel-back-btn" type="button" class="secondary-button hidden">Wróć do menu</button>
      </div>`;
    main.appendChild(screen);
    $("#duel-forfeit-btn", screen).addEventListener("click", forfeit);
    $("#duel-back-btn", screen).addEventListener("click", leaveFight);
  }

  function openPanel() {
    ensureDom();
    panel.classList.remove("hidden");
  }

  function closePanel() {
    if (phase === "hosting" && lobbyId) closeLobby(true);
    if (phase === "requesting" && lobbyId) cancelRequest(true);
    stopTimers();
    phase = "closed";
    panel.classList.add("hidden");
  }

  async function openBrowser() {
    ensureDom();
    openPanel();
    phase = "browser";
    $("#duel-body", panel).replaceChildren();
    setNotice("");
    setStatus("Sprawdzam logowanie…");
    await refreshMe();
    if (!me.loggedIn) {
      setStatus("Pojedynki wymagają logowania przez Discord (nick z Discorda jest twoim nickiem w pojedynkach).", "warning");
      $("#duel-body", panel).innerHTML = `<div class="modal-actions"><button type="button" id="duel-login-btn" class="btn-primary">🔑 Zaloguj przez Discord</button></div>`;
      $("#duel-login-btn", panel).addEventListener("click", () => {
        if (!window.confirm("Logowanie przeładuje stronę — niezapisany postęp zniknie. Najpierw skopiuj kod zapisu lub zapisz w chmurze. Kontynuować?")) return;
        window.LowNavGuard?.allowLeave();
        window.location.href = "/api/auth/login";
      });
      return;
    }
    pollBrowser();
  }

  async function pollBrowser() {
    if (phase !== "browser") return;
    const result = await api("/lobbies");
    if (phase !== "browser") return;
    if (!result.ok) {
      setStatus(errorText(result.data), "warning");
      if (result.status === 401) return;
    } else {
      renderBrowser(result.data);
    }
    schedule(pollBrowser, POLL_BROWSER_MS);
  }

  function renderBrowser(data) {
    const body = $("#duel-body", panel);
    const saved = me.updatedAt ? new Date(me.updatedAt).toLocaleString("pl-PL") : "brak";
    setStatus(`Zalogowany jako ${me.username}. Walczysz buildem z zapisu w chmurze (ostatni zapis: ${saved}). Po zmianie ekwipunku kliknij „Zapisz w chmurze”.`);

    const rows = (data.lobbies || []).map((lobby) => `
      <li class="duel-lobby">
        <span class="duel-lobby-name"><strong></strong> <small>${className(lobby.classId)} · poz. ${lobby.level} · Casual (bo3)</small></span>
        <button type="button" data-join="${lobby.id}" ${lobby.mine || lobby.busy ? "disabled" : ""}>${lobby.mine ? "Twoje" : lobby.busy ? "Zajęte" : "⚔️ Walcz"}</button>
      </li>`).join("");
    body.innerHTML = `
      ${data.activeDuelId ? `<div class="modal-actions"><button type="button" id="duel-resume-btn" class="btn-primary">↩️ Wróć do trwającej walki</button></div>` : ""}
      <div class="modal-actions"><button type="button" id="duel-create-btn" class="btn-primary">➕ Utwórz lobby (Casual, best of 3)</button></div>
      <h3 class="menu-section-title">Otwarte lobby</h3>
      <ul class="duel-lobby-list">${rows || `<li class="duel-empty">Nikt jeszcze nie czeka na przeciwnika. Utwórz lobby!</li>`}</ul>`;
    // nicki wstawiamy jako tekst (nick z Discorda nie może wstrzyknąć HTML)
    body.querySelectorAll(".duel-lobby").forEach((item, index) => { $("strong", item).textContent = data.lobbies[index].host; });
    body.querySelectorAll("[data-join]").forEach((button) => button.addEventListener("click", () => requestFight(button.dataset.join)));
    $("#duel-create-btn", body).addEventListener("click", createLobby);
    const resume = $("#duel-resume-btn", body);
    if (resume) resume.addEventListener("click", () => resumeFight(data.activeDuelId));
  }

  // ---------- Host: tworzenie lobby i odpowiedź na prośby ----------
  async function createLobby() {
    stopTimers();
    setNotice("");
    setStatus("Tworzę lobby…");
    const result = await api("/lobbies", { method: "POST", body: { mode: "casual" } });
    if (!result.ok) {
      if (result.data.error === "in_duel") return resumeFight(result.data.id);
      setStatus(errorText(result.data), "warning");
      schedule(pollBrowser, POLL_BROWSER_MS);
      return;
    }
    lobbyId = result.data.id;
    phase = "hosting";
    pollHosting();
  }

  async function pollHosting() {
    if (phase !== "hosting") return;
    const result = await api(`/state?id=${lobbyId}&builds=1`);
    if (phase !== "hosting") return;
    if (!result.ok) {
      setStatus(errorText(result.data), "warning");
      if (result.status === 404 || result.status === 401) { phase = "browser"; lobbyId = null; return openBrowser(); }
      return schedule(pollHosting, POLL_WAIT_MS);
    }
    const duel = result.data;
    if (duel.status === "playing") return startFight(duel, duel.moves || []);
    if (duel.status === "closed" || duel.status === "finished" || duel.status === "void") { lobbyId = null; return openBrowser(); }
    renderHosting(duel);
    schedule(pollHosting, POLL_WAIT_MS);
  }

  function renderHosting(duel) {
    const body = $("#duel-body", panel);
    if (duel.status === "pending" && duel.guest) {
      const seconds = Math.max(0, Math.ceil((duel.requestExpiresAt - duel.serverTime) / 1000));
      setStatus("Ktoś chce z tobą walczyć! Masz około 20 s na odpowiedź.", "success");
      body.innerHTML = `
        <div class="duel-request">
          <p><strong data-role="guest"></strong> (${className(duel.guest.classId)}, poz. ${duel.guest.level}) prosi o walkę <small>(${seconds} s)</small></p>
          <div class="modal-actions">
            <button type="button" id="duel-accept-btn" class="btn-primary">✅ Akceptuj</button>
            <button type="button" id="duel-decline-btn">✖️ Odrzuć</button>
          </div>
        </div>`;
      $("[data-role=guest]", body).textContent = duel.guest.name;
      $("#duel-accept-btn", body).addEventListener("click", () => respond(true));
      $("#duel-decline-btn", body).addEventListener("click", () => respond(false));
      return;
    }
    setStatus(`Lobby ${duel.id} jest otwarte. Czekasz na przeciwnika… (lista odświeża się u innych graczy, nie zamykaj tego okna)`);
    body.innerHTML = `<div class="modal-actions"><button type="button" id="duel-close-lobby-btn">🚪 Zamknij lobby</button></div>`;
    $("#duel-close-lobby-btn", body).addEventListener("click", () => closeLobby(false));
  }

  async function respond(accept) {
    stopTimers();
    const result = await api("/respond", { method: "POST", body: { id: lobbyId, accept } });
    if (accept && result.ok && result.data.duel) return startFight(result.data.duel, []);
    if (!result.ok && result.data.error !== "no_request") setStatus(errorText(result.data), "warning");
    if (phase === "hosting") pollHosting();
  }

  async function closeLobby(silent) {
    stopTimers();
    const id = lobbyId;
    lobbyId = null;
    if (id) await api(`/lobbies?id=${id}`, { method: "DELETE" });
    if (silent) return;
    phase = "browser";
    openBrowser();
  }

  // ---------- Gość: prośba o walkę ----------
  async function requestFight(id) {
    stopTimers();
    setNotice("");
    setStatus("Wysyłam prośbę o walkę…");
    const result = await api("/join", { method: "POST", body: { id } });
    if (!result.ok) {
      if (result.data.error === "in_duel") return resumeFight(result.data.id);
      setStatus(errorText(result.data), "warning");
      return schedule(pollBrowser, POLL_BROWSER_MS);
    }
    lobbyId = id;
    phase = "requesting";
    $("#duel-body", panel).innerHTML = `<div class="modal-actions"><button type="button" id="duel-cancel-request-btn">↩️ Wycofaj prośbę</button></div>`;
    $("#duel-cancel-request-btn", panel).addEventListener("click", () => cancelRequest(false));
    pollRequesting(result.data.duel);
  }

  async function pollRequesting(first) {
    if (phase !== "requesting") return;
    let duel = first;
    if (!duel) {
      const result = await api(`/state?id=${lobbyId}&builds=1`);
      if (phase !== "requesting") return;
      if (!result.ok) {
        if (result.status === 404 || result.status === 401) { setNotice("Prośba została wycofana.", "warning"); return backToBrowser(); }
        return schedule(() => pollRequesting(), POLL_WAIT_MS);
      }
      duel = result.data;
    }
    if (duel.status === "playing") return startFight(duel, duel.moves || []);
    if (duel.status === "declined") { setNotice(DECLINE_TEXT[duel.reason] || "Prośba została odrzucona.", "warning"); return backToBrowser(); }
    if (duel.status === "closed" || duel.status === "void" || duel.status === "finished") { setNotice("Lobby zostało zamknięte.", "warning"); return backToBrowser(); }
    const seconds = duel.requestExpiresAt ? Math.max(0, Math.ceil((duel.requestExpiresAt - duel.serverTime) / 1000)) : 0;
    setStatus(`Czekam, aż ${duel.host.name} zaakceptuje walkę… (${seconds} s)`);
    schedule(() => pollRequesting(), POLL_WAIT_MS);
  }

  async function cancelRequest(silent) {
    stopTimers();
    const id = lobbyId;
    lobbyId = null;
    if (id) await api("/respond", { method: "POST", body: { id, cancel: true } });
    if (!silent) backToBrowser();
  }

  function backToBrowser() {
    stopTimers();
    lobbyId = null;
    phase = "browser";
    $("#duel-body", panel).replaceChildren();
    pollBrowser();
  }

  // ---------- Walka ----------
  async function resumeFight(id) {
    stopTimers();
    setStatus("Wczytuję walkę…");
    const result = await api(`/state?id=${id}&since=0&builds=1`);
    if (!result.ok || result.data.status !== "playing") {
      setNotice(result.ok ? "Ta walka już się zakończyła." : errorText(result.data), "warning");
      return backToBrowser();
    }
    startFight(result.data, result.data.moves || []);
  }

  function rebuildDuel() {
    fight.duel = E.create({ builds: fight.builds, seed: fight.seed, first: fight.first, bestOf: fight.bestOf });
    const replay = fight.moves;
    fight.moves = [];
    for (const move of replay) {
      const res = E.apply(fight.duel, move.side, move.action);
      if (!res.ok || res.next !== move.next) return false;
      fight.moves.push(move);
    }
    return true;
  }

  function startFight(view, moves) {
    stopTimers();
    ensureDom();
    panel.classList.add("hidden");
    document.getElementById("main-menu")?.classList.add("hidden");
    phase = "fight";
    lobbyId = null;
    fight = {
      id: view.id, side: view.side, builds: view.builds, seed: view.seed, first: view.first, bestOf: view.bestOf,
      names: { host: view.host.name, guest: view.guest.name },
      moves: [], duel: null, busy: false, reported: false, ended: false,
      offset: view.serverTime - Date.now(), deadline: view.deadline, status: view.status, log: [],
    };
    if (!view.builds) { setStatus("Brak danych walki.", "warning"); return finishFight(); }
    const replay = (moves || []).map((move) => ({ ...move }));
    fight.duel = E.create({ builds: fight.builds, seed: fight.seed, first: fight.first, bestOf: fight.bestOf });
    for (const move of replay) {
      const res = E.apply(fight.duel, move.side, move.action);
      if (!res.ok || res.next !== move.next) return desync();
      fight.moves.push(move);
    }
    $("#duel-title", screen).textContent = `${fight.names.host} vs ${fight.names.guest}`;
    $("#duel-back-btn", screen).classList.add("hidden");
    $("#duel-forfeit-btn", screen).classList.remove("hidden");
    $("#duel-log", screen).textContent = replay.length ? "Walka wznowiona." : "Walka się rozpoczyna!";
    screen.classList.remove("hidden");
    renderFight();
    clearInterval(tickTimer);
    tickTimer = setInterval(tickTimerText, 500);
    schedule(pollFight, 400);
  }

  function logLine(text, type) {
    const element = $("#duel-log", screen);
    element.textContent = text;
    element.className = `battle-log${type ? ` ${type}` : ""}`;
  }

  function describeMove(move, res) {
    const side = move.side;
    const name = fight.names[side];
    const classId = fight.duel.sides[side].player.classId;
    const label = move.action.kind === "attack" ? "atakuje" : `używa ${abilityName(classId, move.action.id)}`;
    let text;
    if (res.missed || res.evaded) text = `${name} ${label}, ale chybia.`;
    else if (res.damage > 0) text = `${name} ${label}: ${res.damage} obrażeń${res.critical ? " (KRYTYK!)" : ""}.`;
    else text = `${name} ${label}.`;
    if (res.reflected > 0) text += ` Odbicie rani go za ${res.reflected}.`;
    if (res.burst > 0) text += ` Gniew detonuje: ${res.burst} obrażeń.`;
    if (res.roundOver) text += ` Rundę wygrywa ${fight.names[res.roundWinner]}!`;
    return text;
  }

  function effectChips(own, foe) {
    const chips = [];
    BUFFS.forEach((key) => { if (own.effects[key]) chips.push(EFFECT_LABELS[key]); });
    DEBUFFS.forEach((key) => { if (foe.effects[key]) chips.push(EFFECT_LABELS[key]); });
    return chips;
  }

  function fillCard(card, side, view, opponentView) {
    const unit = view[side === fight.side ? "me" : "opponent"];
    const opposite = view[side === fight.side ? "opponent" : "me"];
    $("[data-role=name]", card).textContent = fight.names[side];
    $("[data-role=hp]", card).textContent = `${Math.max(0, unit.hp)} / ${unit.maxHp}`;
    $("[data-role=mana]", card).textContent = `${unit.mana} / ${unit.maxMana}`;
    $("[data-role=hp-bar]", card).style.width = `${Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100))}%`;
    $("[data-role=mana-bar]", card).style.width = `${Math.max(0, Math.min(100, (unit.mana / Math.max(1, unit.maxMana)) * 100))}%`;
    const skin = window.skinCatalog?.find((item) => item.id === fight.builds[side].skinName);
    const model = $("[data-role=model]", card);
    model.onerror = () => { model.onerror = null; model.src = "res/skins/player_model.png"; };
    model.src = skin ? skin.modelAlive : "res/skins/player_model.png";
    model.alt = fight.names[side];
    const chips = $("[data-role=chips]", card);
    chips.replaceChildren();
    const classChip = document.createElement("span");
    classChip.textContent = className(unit.classId);
    chips.appendChild(classChip);
    effectChips(unit, opposite).forEach((label) => {
      const chip = document.createElement("span");
      chip.textContent = label;
      chips.appendChild(chip);
    });
  }

  function renderFight() {
    const view = E.view(fight.duel, fight.side);
    $("#duel-round", screen).textContent = `Runda ${view.round} · best of ${view.bestOf}`;
    const mine = view.wins[fight.side];
    const theirs = view.wins[other(fight.side)];
    $("#duel-score", screen).textContent = `Wygrane rundy: Ty ${mine} : ${theirs} Przeciwnik`;
    fillCard($("#duel-me", screen), fight.side, view);
    fillCard($("#duel-foe", screen), other(fight.side), view);
    renderActions(view);
    tickTimerText();
  }

  function renderActions(view) {
    const holder = $("#duel-actions", screen);
    holder.replaceChildren();
    const myTurn = !fight.ended && !view.matchWinner && view.actor === fight.side;
    const make = (label, hint, action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      const check = myTurn ? E.validate(fight.duel, fight.side, action) : { ok: false, reason: "not_your_turn" };
      button.disabled = fight.busy || !check.ok;
      button.title = hint;
      button.addEventListener("click", () => playMove(action));
      holder.appendChild(button);
    };
    make("⚔️ Atakuj", "Zwykły atak", { kind: "attack" });
    E.abilitiesOf(fight.duel.sides[fight.side].player).forEach((ability) => {
      const cooldown = view.me.cooldowns[ability.id] > 0 ? ` (${view.me.cooldowns[ability.id]} t.)` : "";
      const cost = ability.cost ? ` · ${ability.cost} many` : "";
      make(`${ability.name}${cost}${cooldown}`, ability.description || ability.name, { kind: "ability", id: ability.id });
    });
  }

  function tickTimerText() {
    if (!fight || !screen) return;
    const element = $("#duel-timer", screen);
    if (fight.ended) { element.textContent = ""; return; }
    const actor = fight.duel.actor;
    if (!actor) { element.textContent = "Walka zakończona — czekam na potwierdzenie wyniku…"; return; }
    const remaining = Math.max(0, Math.ceil((fight.deadline - (Date.now() + fight.offset)) / 1000));
    const who = actor === fight.side ? "Twój ruch" : `Ruch: ${fight.names[actor]}`;
    element.textContent = `${who} — pozostało ${remaining} s`;
    element.classList.toggle("is-urgent", remaining <= 10);
  }

  async function playMove(action) {
    if (!fight || fight.busy || fight.ended) return;
    if (!E.validate(fight.duel, fight.side, action).ok) return;
    fight.busy = true;
    const n = fight.moves.length;
    const move = { n, side: fight.side, action, next: null };
    const res = E.apply(fight.duel, fight.side, action);
    move.next = res.next;
    logLine(describeMove(move, res), res.roundOver ? "success" : "");
    renderFight();

    const result = await api("/move", { method: "POST", body: { id: fight.id, n, action, next: res.next } });
    if (result.ok) {
      fight.moves.push(move);
      fight.deadline = result.data.deadline;
      fight.offset = result.data.serverTime - Date.now();
      if (res.matchOver) reportResult();
    } else {
      // Serwer odrzucił ruch (np. czas minął) — wracamy do stanu potwierdzonego przez serwer.
      if (!rebuildDuel()) return desync();
      logLine(result.data.error === "not_playing" ? "Walka już się zakończyła." : "Ruch nie został przyjęty — odświeżam stan.", "warning");
    }
    fight.busy = false;
    renderFight();
    schedule(pollFight, 300);
  }

  async function pollFight() {
    if (phase !== "fight" || !fight || fight.ended) return;
    if (fight.busy) return schedule(pollFight, 300);
    const result = await api(`/state?id=${fight.id}&since=${fight.moves.length}`);
    if (phase !== "fight" || !fight || fight.ended || fight.busy) return schedule(pollFight, 300);
    if (!result.ok) {
      if (result.status === 401 || result.status === 404) { logLine(errorText(result.data), "warning"); return finishFight(); }
      return schedule(pollFight, POLL_WAIT_MS);
    }
    const state = result.data;
    fight.offset = state.serverTime - Date.now();
    fight.deadline = state.deadline;

    for (const move of state.moves || []) {
      if (move.n < fight.moves.length) continue;
      if (move.n !== fight.moves.length || move.side !== fight.duel.actor) return desync();
      const res = E.apply(fight.duel, move.side, move.action);
      if (!res.ok || res.next !== move.next) return desync();
      fight.moves.push(move);
      logLine(describeMove(move, res), res.roundOver ? "success" : "");
      if (res.matchOver) reportResult();
    }
    renderFight();

    if (state.status !== "playing") return concludeFight(state);
    schedule(pollFight, fight.duel.actor === fight.side ? POLL_TURN_MS : POLL_WAIT_MS);
  }

  function reportResult() {
    if (fight.reported) return;
    fight.reported = true;
    api("/finish", { method: "POST", body: { id: fight.id, winner: fight.duel.matchWinner } });
  }

  async function desync() {
    if (!fight || fight.ended) return;
    stopTimers();
    await api("/finish", { method: "POST", body: { id: fight.id, desync: true } });
    logLine("Wykryto rozjazd symulacji (np. różne wersje gry u graczy) — walka została anulowana bez wyniku.", "danger");
    finishFight();
  }

  async function forfeit() {
    if (!fight || fight.ended) return;
    if (!window.confirm("Poddać walkę? Przeciwnik wygrywa.")) return;
    stopTimers();
    const result = await api("/finish", { method: "POST", body: { id: fight.id, forfeit: true } });
    if (result.ok && result.data.duel) return concludeFight(result.data.duel);
    finishFight();
  }

  function concludeFight(state) {
    const youWon = state.winner === fight.side;
    const reason = END_REASONS[state.endReason] || "";
    if (state.status === "finished") {
      const score = `${fight.duel.wins[fight.side]}:${fight.duel.wins[other(fight.side)]}`;
      const base = state.endReason === "normal" || state.endReason === "reported" ? ` (rundy ${score})` : "";
      logLine(youWon ? `🏆 Wygrałeś pojedynek${base}!${state.endReason === "timeout" ? " Przeciwnik nie wykonał ruchu w 30 s." : state.endReason === "forfeit" ? " Przeciwnik się poddał." : ""}`
        : `Przegrałeś pojedynek${base}${state.endReason === "timeout" ? ": nie wykonałeś ruchu w 30 s" : state.endReason === "forfeit" ? ": poddanie się" : ""}.`, youWon ? "success" : "danger");
    } else if (state.status === "void") {
      logLine(`Walka anulowana bez wyniku${reason ? ` (${reason})` : ""}.`, "warning");
    } else {
      logLine("Walka została zamknięta.", "warning");
    }
    finishFight();
  }

  function finishFight() {
    stopTimers();
    clearInterval(tickTimer);
    tickTimer = null;
    if (fight) fight.ended = true;
    if (!screen) return;
    $("#duel-forfeit-btn", screen).classList.add("hidden");
    $("#duel-back-btn", screen).classList.remove("hidden");
    if (fight.duel) renderFight();
    $("#duel-timer", screen).textContent = "";
  }

  function leaveFight() {
    stopTimers();
    clearInterval(tickTimer);
    tickTimer = null;
    fight = null;
    phase = "closed";
    screen.classList.add("hidden");
    if (typeof window.showMainMenu === "function") window.showMainMenu();
    else document.getElementById("main-menu")?.classList.remove("hidden");
  }

  // ---------- Start ----------
  function init() {
    const button = document.getElementById("duel-btn");
    if (button) button.addEventListener("click", openBrowser);
    refreshButton();
  }

  window.DuelUI = { refreshButton, open: openBrowser };
  init();
})();

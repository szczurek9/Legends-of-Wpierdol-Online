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
    const unlocked = Boolean(window.player && window.player.level >= MIN_LEVEL);
    // Po ukończeniu 50. poziomu „Pojedynki” zastępują „Graj” jako główny przycisk menu.
    button.classList.toggle("hidden", !unlocked);
    button.classList.toggle("btn-primary", unlocked);
    button.classList.toggle("is-main", unlocked);
    document.getElementById("play-btn")?.classList.toggle("hidden", unlocked);
  }

  // ---------- Gratulacje po ukończeniu 50. poziomu ----------
  function showUnlockPrompt() {
    if (document.getElementById("duel-unlock-modal")) return;
    const modal = document.createElement("section");
    modal.id = "duel-unlock-modal";
    modal.className = "modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "duel-unlock-title");
    modal.innerHTML = `
      <div class="modal-content duel-unlock">
        <div class="duel-unlock-trophy" aria-hidden="true">🏆</div>
        <h2 id="duel-unlock-title">Gratulacje!</h2>
        <p class="duel-unlock-lead">Przeszedłeś wszystkie 50 poziomów Legends of Wpierdol!</p>
        <p class="duel-unlock-question">Co teraz? Zmierz się z innymi graczami w pojedynkach 1v1.</p>
        <ul class="duel-unlock-perks">
          <li>🥊 Walki na żywo z prawdziwymi graczami (best of 3)</li>
          <li>🛠️ Walczysz własnym buildem — im lepszy ekwipunek, tym większe szanse</li>
          <li>☁️ Wymagane: logowanie przez Discord i zapis postaci w chmurze</li>
        </ul>
        <div class="modal-actions duel-unlock-actions">
          <button type="button" id="duel-unlock-go" class="btn-primary">🥊 Do pojedynków</button>
          <button type="button" id="duel-unlock-later">Później</button>
        </div>
      </div>`;
    document.querySelector(".main")?.appendChild(modal) || document.body.appendChild(modal);
    const close = () => modal.remove();
    $("#duel-unlock-later", modal).addEventListener("click", close);
    $("#duel-unlock-go", modal).addEventListener("click", () => {
      close();
      document.getElementById("battle-back-btn")?.click(); // wyjście z ekranu walki do menu
      openBrowser();
    });
    $("#duel-unlock-go", modal).focus();
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
      <div class="battle-header duel-header">
        <div class="duel-header-title">
          <span class="eyebrow" id="duel-mode">POJEDYNEK · CASUAL</span>
          <h2 id="duel-title">Walka</h2>
        </div>
        <div class="duel-round-box">
          <div id="duel-round">Runda 1</div>
          <div id="duel-score" class="duel-score" role="img">
            <span class="duel-score-side"><span class="duel-score-num" data-role="score-me">0</span><span class="duel-score-label">TY</span></span>
            <span class="duel-score-sep" aria-hidden="true">:</span>
            <span class="duel-score-side"><span class="duel-score-num" data-role="score-foe">0</span><span class="duel-score-label">RYWAL</span></span>
          </div>
        </div>
        <div class="battle-header-actions duel-header-actions">
          <button id="duel-forfeit-btn" type="button" class="battle-escape-top">🏳️ Poddaj się</button>
        </div>
      </div>

      <div class="battle-arena">
        <article class="combatant combatant-player" id="duel-me">
          <span class="combatant-label">TY</span>
          <h3 data-role="name">Gracz</h3>
          <div class="battle-model battle-model-player"><img data-role="model" src="res/skins/player_model.png" alt="Twoja postać"></div>
          <div class="battle-resource-bars">
            <div>
              <span class="resource-label"><span class="stat-icon" data-stat-icon="hp"></span> HP: <strong data-role="hp">0 / 0</strong></span>
              <div class="health-bar"><span data-role="hp-bar"></span></div>
            </div>
            <div>
              <span class="resource-label"><span class="stat-icon" data-stat-icon="mana"></span> Mana: <strong data-role="mana">0 / 0</strong></span>
              <div class="health-bar mana-bar"><span data-role="mana-bar"></span></div>
            </div>
          </div>
          <div class="stat-chips">
            <div class="chips-group" data-role="chips-a"></div>
            <div class="chips-group" data-role="chips-b"></div>
          </div>
        </article>

        <div class="battle-versus">VS</div>

        <article class="combatant combatant-enemy" id="duel-foe">
          <span class="combatant-label">PRZECIWNIK</span>
          <h3 data-role="name">Przeciwnik</h3>
          <div class="battle-model battle-model-enemy"><img data-role="model" src="res/skins/player_model.png" alt="Przeciwnik"></div>
          <div class="battle-resource-bars">
            <div>
              <span class="resource-label"><span class="stat-icon" data-stat-icon="hp"></span> HP: <strong data-role="hp">0 / 0</strong></span>
              <div class="health-bar enemy-health-bar"><span data-role="hp-bar"></span></div>
            </div>
            <div>
              <span class="resource-label"><span class="stat-icon" data-stat-icon="mana"></span> Mana: <strong data-role="mana">0 / 0</strong></span>
              <div class="health-bar mana-bar"><span data-role="mana-bar"></span></div>
            </div>
          </div>
          <div class="stat-chips" data-role="chips-a"></div>
        </article>
      </div>

      <div id="duel-timer" class="duel-timer"></div>
      <div id="duel-log" class="battle-log">Walka się rozpoczyna…</div>

      <div class="battle-dock">
        <div id="duel-actions" class="battle-abilities"></div>
      </div>
      <div id="duel-effects" class="battle-effects">Brak aktywnych efektów.</div>
      <button id="duel-back-btn" type="button" class="secondary-button hidden">Wróć do menu</button>`;
    main.appendChild(screen);
    window.GameIcons?.hydrate(screen);
    // Telefon: statystyki obu walczących jako lista rozwijana, tak jak w walce PvE (mobileCards.js).
    screen.querySelectorAll(".stat-chips").forEach((chips) => window.MobileCards?.initCollapsible(chips, "Statystyki"));
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

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function waitText(seconds) {
    if (seconds < 20) return "przed chwilą";
    if (seconds < 90) return `${seconds} s`;
    return `${Math.round(seconds / 60)} min`;
  }

  function lobbyRow(lobby) {
    const row = el("li", `duel-lobby${lobby.mine ? " is-mine" : ""}${lobby.busy ? " is-busy" : ""}`);
    const icon = window.GameIcons?.classIcon(lobby.classId, "duel-lobby-icon");
    if (icon) row.appendChild(icon);

    const info = el("span", "duel-lobby-name");
    info.appendChild(el("strong", "", lobby.host));          // nick jako tekst — bez wstrzykiwania HTML
    const meta = el("span", "duel-chips");
    meta.append(
      el("span", "duel-chip", className(lobby.classId)),
      el("span", "duel-chip", `poz. ${lobby.level}`),
      el("span", "duel-chip", `⏱ ${waitText(lobby.ageSeconds || 0)}`),
    );
    info.appendChild(meta);
    row.appendChild(info);

    const button = el("button", lobby.mine || lobby.busy ? "" : "btn-primary", lobby.mine ? "Twoje" : lobby.busy ? "Zajęte" : "⚔️ Walcz");
    button.type = "button";
    button.disabled = Boolean(lobby.mine || lobby.busy);
    if (!button.disabled) button.addEventListener("click", () => requestFight(lobby.id));
    row.appendChild(button);
    return row;
  }

  function renderBrowser(data) {
    const body = $("#duel-body", panel);
    setStatus("");
    const saved = me.updatedAt ? new Date(me.updatedAt).toLocaleString("pl-PL") : "brak";
    const lobbies = [...(data.lobbies || [])].sort((x, y) => (Number(y.mine) - Number(x.mine)) || (Number(x.busy) - Number(y.busy)));
    body.replaceChildren();

    // Karta gracza
    const card = el("div", "duel-player-card");
    const cardIcon = window.GameIcons?.classIcon(window.player?.classId, "duel-lobby-icon");
    if (cardIcon) card.appendChild(cardIcon);
    const who = el("span", "duel-lobby-name");
    who.appendChild(el("strong", "", me.username || window.player?.nickname || "Gracz"));
    who.appendChild(el("small", "", `${className(window.player?.classId)} · poz. ${window.player?.level ?? "?"}`));
    card.appendChild(who);
    const save = el("span", "duel-save-info");
    save.append(el("span", "", "☁️ Ostatni zapis"), el("strong", "", saved));
    card.appendChild(save);
    body.appendChild(card);
    body.appendChild(el("p", "duel-hint", "Walczysz buildem z zapisu w chmurze. Po zmianie ekwipunku kliknij „Zapisz w chmurze” w Opcjach."));

    // Wróć do trwającej walki
    if (data.activeDuelId) {
      const resume = el("button", "btn-primary duel-wide", "↩️ Wróć do trwającej walki");
      resume.type = "button";
      resume.addEventListener("click", () => resumeFight(data.activeDuelId));
      body.appendChild(resume);
    }

    // Utwórz lobby
    const create = el("button", "btn-primary duel-create", "");
    create.type = "button";
    create.append(el("span", "duel-create-title", "➕ Utwórz lobby"), el("small", "", "Casual · best of 3 — poczekaj na rywala"));
    create.addEventListener("click", createLobby);
    body.appendChild(create);

    // Lista lobby
    const head = el("div", "duel-list-head");
    head.appendChild(el("h3", "menu-section-title", `Otwarte lobby (${lobbies.length})`));
    const refresh = el("button", "duel-refresh", "↻ Odśwież");
    refresh.type = "button";
    refresh.addEventListener("click", () => { stopTimers(); pollBrowser(); });
    head.appendChild(refresh);
    body.appendChild(head);

    const list = el("ul", "duel-lobby-list");
    if (lobbies.length) {
      lobbies.forEach((lobby) => list.appendChild(lobbyRow(lobby)));
    } else {
      const empty = el("li", "duel-empty");
      empty.append(el("span", "duel-empty-icon", "🏜️"), el("strong", "", "Pusto na arenie"), el("small", "", "Nikt jeszcze nie czeka na przeciwnika. Utwórz lobby i zostań pierwszy!"));
      list.appendChild(empty);
    }
    body.appendChild(list);
    body.appendChild(el("p", "duel-hint", "Lista odświeża się automatycznie co 5 s."));
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
    if (move.action.kind === "weapon") {
      if (fight.duel.sides[side].player.weaponId === "yamato") {
        return `${name} używa Judgement Cut — egzekucja!${res.roundOver ? ` Rundę wygrywa ${fight.names[res.roundWinner]}!` : ""}`;
      }
      return `${name} wystrzeliwuje pulę Pistoletu Jhina: ${res.damage} obrażeń.${res.roundOver ? ` Rundę wygrywa ${fight.names[res.roundWinner]}!` : ""}`;
    }
    if (move.action.kind === "pass") return `${name} nie ma żadnej dostępnej akcji i traci turę.`;
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

  // ---------- Renderowanie (te same helpery i klasy co ekran walki PvE) ----------
  const R = () => window.BattleUIRender;
  const HIDDEN_EFFECTS = ["accuracy", "enemyAccuracy", "bastionArmor", "evadeNext", "accuracyTurns", "enemyAccuracyTurns"];
  const DEBUFFS_ON_TARGET = ["stun", "poison", "vines"]; // zapisane u tego, kto je nałożył

  function shortNumber(n) {
    return n >= 10000 ? `${String(Math.round(n / 100) / 10).replace(".", ",")}k` : String(n);
  }

  // Efekty własne jednej strony (buffy, pule, znaczniki) jako wpisy [ikona, wartość, podpis].
  function ownEffectEntries(unit, prefix) {
    const out = [];
    Object.entries(unit.effects)
      .filter(([name]) => !HIDDEN_EFFECTS.includes(name) && !DEBUFFS_ON_TARGET.includes(name))
      .forEach(([name, value]) => {
        const id = name.endsWith("Turns") ? name.slice(0, -5) : name;
        const label = window.GameIcons.EFFECTS[id] || id;
        if (id === "rageArmor") out.push([id, `+${value}`, `${prefix}${label}: +${value}`]);
        else if (value === true) out.push([id, "", `${prefix}${label}: aktywne`]);
        else out.push([id, value, `${prefix}${label}: ${value} tur`]);
      });
    if (unit.focusMark) out.push(["focusMark", "", `${prefix}Znacznik Skupienia: następny atak`]);
    if (unit.effects.evadeNext) out.push(["evadeNext", "", `${prefix}Unik następnego ataku`]);
    if (unit.effects.enemyAccuracyTurns > 0) out.push(["undodgeableSpeed", unit.effects.enemyAccuracyTurns, `${prefix}Un-Dodgable Speed: ${unit.effects.enemyAccuracyTurns} tur`]);
    if (unit.guaranteedCrit) out.push(["primalStrike", "", `${prefix}Primal Strike: następny atak to gwarantowany krytyk`]);
    if (unit.classId === "assassin" && unit.overkillPool > 0) out.push(["overkillPool", shortNumber(Math.floor(unit.overkillPool)), `${prefix}Overkill: ${Math.floor(unit.overkillPool)}`]);
    if (unit.classId === "tank" && unit.rage > 0) out.push(["ragePool", shortNumber(Math.floor(unit.rage)), `${prefix}Skumulowany Gniew: ${Math.floor(unit.rage)}`]);
    if (unit.weaponId === "jhinPistol" && unit.jhinPool > 0) out.push(["jhinPool", shortNumber(unit.jhinPool), `${prefix}Pula Pistoletu Jhina: ${unit.jhinPool}`]);
    if (unit.weaponId === "yamato") out.push(["yamatoJudgement", `${unit.yamatoThreshold}%`, `${prefix}Judgement Cut: egzekucja poniżej ${unit.yamatoThreshold}% HP`]);
    return out;
  }

  // Ogłuszenie, zatrucie i pnącza nałożone przez `caster` na jego przeciwnika.
  function debuffEntries(caster, prefix) {
    return DEBUFFS_ON_TARGET.filter((name) => caster.effects[name] > 0).map((name) => {
      const label = window.GameIcons.EFFECTS[name] || name;
      return [name, caster.effects[name], `${prefix}${label}: ${caster.effects[name]} tur`];
    });
  }

  function renderEffectsPanel(view) {
    const panel = $("#duel-effects", screen);
    const entries = [
      ...ownEffectEntries(view.me, "Ty: "),
      ...debuffEntries(view.opponent, "Ty: "),
      ...ownEffectEntries(view.opponent, "Przeciwnik: "),
      ...debuffEntries(view.me, "Przeciwnik: "),
    ];
    panel.replaceChildren();
    // Rzadziej potrzebne statystyki gracza (AD, regeneracja many) mieszkają tu, nie na karcie walczącego.
    const labels = window.GameIcons.STATS;
    panel.append(
      window.GameIcons.chip("ad", view.me.stats.ad, `Ty: ${labels.ad.label}`),
      window.GameIcons.chip("manaRegen", `+${view.me.stats.manaRegen}`, `Ty: ${labels.manaRegen.label}`),
    );
    entries.forEach(([id, value, label]) => panel.appendChild(window.GameIcons.effectChip(id, value, label)));
  }

  function fillCard(card, side, unit, isMe) {
    const dead = unit.hp <= 0 || (fight.duel.matchWinner && fight.duel.matchWinner !== side);
    $("[data-role=name]", card).textContent = fight.names[side];
    const hpElement = $("[data-role=hp]", card);
    R().flashIfHit(card, hpElement, unit.hp);
    hpElement.textContent = `${Math.max(0, unit.hp)} / ${unit.maxHp}`;
    R().setBar($("[data-role=hp-bar]", card), Math.max(0, unit.hp), unit.maxHp);
    $("[data-role=mana]", card).textContent = `${unit.mana} / ${unit.maxMana}`;
    R().setBar($("[data-role=mana-bar]", card), unit.mana, Math.max(1, unit.maxMana));

    const skin = window.skinCatalog?.find((item) => item.id === unit.skinName);
    const model = $("[data-role=model]", card);
    model.onerror = () => { model.onerror = null; model.src = "res/skins/player_model.png"; };
    model.src = skin ? (dead ? skin.modelDead : skin.modelAlive) : "res/skins/player_model.png";
    model.alt = `${fight.names[side]}${dead ? " — pokonany" : ""}`;

    const stats = unit.stats;
    // AD i regeneracja many gracza są w panelu na dole (renderEffectsPanel), żeby pasek statystyk mieścił się w jednym rzędzie.
    if (isMe) {
      R().renderChips($("[data-role=chips-a]", card), [["damage", stats.damage, "Obrażenia broni"], ["crit", `${stats.crit}%`], ["armorPen", stats.armorPen]]);
      R().renderChips($("[data-role=chips-b]", card), [["ap", stats.ap], ["armor", stats.armor], ["mr", stats.mr]]);
    } else {
      R().renderChips($("[data-role=chips-a]", card), [["damage", stats.damage], ["crit", `${stats.crit}%`], ["armor", stats.armor], ["mr", stats.mr], ["armorPen", stats.armorPen], ["ap", stats.ap]]);
    }
  }

  function renderFight() {
    const view = E.view(fight.duel, fight.side);
    const foeSide = other(fight.side);
    $("#duel-round", screen).textContent = `Runda ${view.round} / best of ${view.bestOf}`;
    // Wynik jak na tablicy: wygrane rundy, wyżej prowadzący.
    const myWins = view.wins[fight.side];
    const foeWins = view.wins[foeSide];
    const scoreBoard = $("#duel-score", screen);
    const myScore = $("[data-role=score-me]", scoreBoard);
    const foeScore = $("[data-role=score-foe]", scoreBoard);
    myScore.textContent = String(myWins);
    foeScore.textContent = String(foeWins);
    myScore.classList.toggle("is-leading", myWins > foeWins);
    foeScore.classList.toggle("is-leading", foeWins > myWins);
    scoreBoard.setAttribute("aria-label", `Wygrane rundy: Ty ${myWins}, Rywal ${foeWins}`);
    fillCard($("#duel-me", screen), fight.side, view.me, true);
    fillCard($("#duel-foe", screen), foeSide, view.opponent, false);
    renderEffectsPanel(view);
    renderActions(view);
    tickTimerText();
  }

  // Kafelki akcji jak w PvE: ikona, skrót, koszt many, odnowienie. Skróty: Q/W/E/R (Mag: Q/W/E/R to umiejętności).
  function renderActions(view) {
    const holder = $("#duel-actions", screen);
    holder.replaceChildren();
    fight.hotkeys = {};
    const myTurn = !fight.ended && !view.matchWinner && view.actor === fight.side;
    const classId = view.me.classId;
    const isMage = classId === "mage";
    const abilities = E.abilitiesOf(fight.duel.sides[fight.side].player);

    const addTile = (action, tile, icon, title) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ability-button";
      R().buildTile(button, { ...tile, icon });
      button.title = title;
      button.setAttribute("aria-label", R().describeTile(tile));
      const check = myTurn ? E.validate(fight.duel, fight.side, action) : { ok: false };
      button.disabled = fight.busy || !check.ok;
      button.addEventListener("click", () => playMove(action));
      if (tile.hotkey && !button.disabled) fight.hotkeys[tile.hotkey.toLowerCase()] = action;
      holder.appendChild(button);
    };

    if (!isMage) {
      addTile({ kind: "attack" }, { name: "Atakuj", hotkey: "Q" }, window.GameIcons.stat("damage", "tile-glyph"), `Atak bronią: ${fight.duel.sides[fight.side].player.weaponName}`);
    }
    // Umiejętność broni unikalnej (Yamato, Pistolet Jhina): wolna akcja pod Spacją.
    const weaponId = view.me.weaponId;
    if (weaponId === "yamato" || weaponId === "jhinPistol") {
      const yamato = weaponId === "yamato";
      const pool = Math.floor(view.me.jhinPool);
      const ready = yamato
        ? view.opponent.hp <= view.opponent.maxHp * view.me.yamatoThreshold / 100 && view.opponent.hp > 0
        : pool > 0;
      const tile = {
        name: yamato ? "Judgement Cut" : "Pula Jhina",
        hotkey: "Spc",
        sub: yamato ? `poniżej ${view.me.yamatoThreshold}% HP` : (pool > 0 ? String(pool) : "pusta"),
      };
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ability-button weapon-ability-button";
      R().buildTile(button, { ...tile, icon: window.GameIcons.itemIcon("weapons", weaponId, "tile-img") });
      button.title = `Umiejętność broni: ${view.me.weaponName}`;
      button.setAttribute("aria-label", `${tile.name}, ${tile.sub}, skrót Spacja`);
      button.classList.toggle("is-no-mana", !ready);
      button.disabled = fight.busy || !myTurn;
      button.addEventListener("click", () => playMove({ kind: "weapon" }));
      if (!button.disabled) fight.hotkeys.space = { kind: "weapon" };
      holder.appendChild(button);
    }
    abilities.forEach((ability, index) => {
      const hotkey = isMage ? ["Q", "W", "E", "R"][index] : ["W", "E", "R"][index];
      const isToggle = ability.id === "senNoKata";
      const cooldown = isToggle ? 0 : (view.me.cooldowns[ability.id] || 0);
      const noMana = view.me.mana < ability.cost;
      const maxCooldown = window.BattleMath.effectiveCooldown ? window.BattleMath.effectiveCooldown(ability) : ability.cooldown;
      const sub = isToggle ? (view.me.senMode === "boei" ? `Bōei · atak ${view.me.senAttackCount}/3` : "Chikara") : "";
      const cooldownNote = maxCooldown ? ` | CD: ${maxCooldown} tur` : "";
      addTile({ kind: "ability", id: ability.id }, { name: ability.name, hotkey, cost: ability.cost, cooldown, noMana, sub, maxCooldown },
        window.GameIcons.abilityIcon(classId, ability, "tile-img"), `${ability.description} Koszt: ${ability.cost} many${cooldownNote}`);
      if (isToggle) holder.lastChild.classList.add(view.me.senMode === "boei" ? "ability-mode-boei" : "ability-mode-chikara");
    });
    // Brak jakiejkolwiek akcji (np. Mag bez many): można tylko oddać turę, zamiast czekać na timeout.
    if (myTurn && !E.hasAnyAction(fight.duel, fight.side)) {
      addTile({ kind: "pass" }, { name: "Pomiń turę", hotkey: "P" }, window.GameIcons.stat("mana", "tile-glyph"), "Nie masz żadnej dostępnej akcji — oddajesz turę.");
    }
  }

  function onKeydown(event) {
    if (!fight || fight.ended || fight.busy || !screen || screen.classList.contains("hidden")) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^(input|textarea|select)$/i.test(event.target?.tagName || "")) return;
    const key = event.key === " " ? "space" : event.key.toLowerCase();
    const action = fight.hotkeys && fight.hotkeys[key];
    if (!action) return;
    event.preventDefault();
    playMove(action);
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
    const check = E.validate(fight.duel, fight.side, action);
    if (!check.ok) {
      if (action.kind === "weapon") {
        logLine(check.reason === "pool_empty" ? "Pula Pistoletu Jhina jest pusta."
          : `Judgement Cut wymaga celu poniżej ${E.yamatoThreshold(fight.duel)}% HP.`, "warning");
      }
      return;
    }
    fight.busy = true;
    const n = fight.moves.length;
    const move = { n, side: fight.side, action, next: null };
    const res = E.apply(fight.duel, fight.side, action);
    move.next = res.next;
    logLine(describeMove(move, res), res.roundOver ? "success" : "");
    renderFight();

    const current = fight;
    const result = await api("/move", { method: "POST", body: { id: fight.id, n, action, next: res.next } });
    if (fight !== current) return; // wyszedł do menu w trakcie wysyłania ruchu
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
    const current = fight;
    await api("/finish", { method: "POST", body: { id: fight.id, desync: true } });
    if (fight !== current) return; // gracz zdążył wyjść do menu
    logLine("Wykryto rozjazd symulacji (np. różne wersje gry u graczy) — walka została anulowana bez wyniku.", "danger");
    finishFight();
  }

  async function forfeit() {
    if (!fight || fight.ended) return;
    if (!window.confirm("Poddać walkę? Przeciwnik wygrywa.")) return;
    stopTimers();
    const current = fight;
    const result = await api("/finish", { method: "POST", body: { id: fight.id, forfeit: true } });
    if (fight !== current) return;
    if (result.ok && result.data.duel) return concludeFight(result.data.duel);
    finishFight();
  }

  function concludeFight(state) {
    if (!fight) return;
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
    if (!fight || !screen) return;
    fight.ended = true;
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
    document.addEventListener("keydown", onKeydown);
    refreshButton();
  }

  window.DuelUI = { refreshButton, open: openBrowser, showUnlockPrompt, MIN_LEVEL };
  init();
})();

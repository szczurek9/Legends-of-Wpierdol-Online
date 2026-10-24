// Osiągnięcia — tylko online (logowanie przez Discord) i tylko dla postaci założonych po zalogowaniu.
// Lista odblokowanych osiągnięć i liczniki leżą na serwerze (functions/api/achievements.js);
// w zapisie gry są tylko flagi przebiegu (player.achRun), flaga postaci i licznik SP.
// Walka woła tu funkcje on*(); każda z nich jest bezpieczna, gdy osiągnięcia są wyłączone.
(function () {
  const API = "/api/achievements";
  const RETRY_MS = 15000;
  const COUNTER_DELAY_MS = 5000;   // same liczniki (bez odblokowania) wysyłamy paczkami, nie na każde zdarzenie
  const RELOAD_COOLDOWN_MS = 10000;

  const mainMenu = document.getElementById("main-menu");
  const screen = document.getElementById("achievements-screen");
  const openButton = document.getElementById("achievements-btn");
  const backButton = document.getElementById("achievements-back-btn");
  const listEl = document.getElementById("achievements-list");
  const summaryEl = document.getElementById("achievements-summary");
  const statusEl = document.getElementById("achievements-status");

  let defs = null;               // zawartość data/achievements.json
  let byId = new Map();
  let loggedIn = false;
  let loaded = false;            // stan z serwera pobrany
  let loading = false;
  let lastLoadAttempt = 0;
  let loadFailed = false;
  let server = emptyServer();
  const queue = { unlock: new Set(), counters: {}, sets: {} };
  let flushing = false;
  let retryTimer = null;
  let flushTimer = null;
  let lvl = freshLevel();        // dane bieżącej walki (poziomu); nie są zapisywane

  function emptyServer() {
    return { unlocked: {}, counters: {}, sets: {} };
  }

  function freshLevel() {
    return {
      arena: false,
      manual: false,             // czy w tym poziomie była akcja poza Auto-walką na 3×
      potion: false,
      samuraiStreak: 0,
      focusStrikes: 0,
      enemyWasFull: false,       // wróg miał pełne HP tuż przed ostatnią akcją
      lastKill: { hp: Infinity, mana: Infinity },
    };
  }

  // --- Stan ---------------------------------------------------------------

  function player() {
    return window.player;
  }

  // Śledzenie przebiegu (flagi w zapisie) działa na każdej postaci z włączonymi osiągnięciami.
  function tracking() {
    const p = player();
    return p.achievementsEnabled === true && Boolean(p.classId);
  }

  // Zdobywanie: zalogowany, stan z serwera pobrany i postać z włączonymi osiągnięciami.
  function isActive() {
    return Boolean(defs) && loggedIn && loaded && tracking();
  }

  function ensureRun() {
    const p = player();
    if (!p.achRun || typeof p.achRun !== "object") p.achRun = window.createAchievementRun();
    return p.achRun;
  }

  function spOf(def) {
    return defs?.tiers?.[def.tier]?.sp || 0;
  }

  function allDefs() {
    return defs ? [...defs.achievements, defs.platinum] : [];
  }

  // --- Kolejka zgłoszeń do serwera ---------------------------------------

  function hasQueued() {
    return queue.unlock.size > 0 || Object.keys(queue.counters).length > 0 || Object.keys(queue.sets).length > 0;
  }

  function takeQueue() {
    if (!hasQueued()) return null;
    const body = {
      unlock: [...queue.unlock],
      counters: { ...queue.counters },
      sets: Object.fromEntries(Object.entries(queue.sets).map(([name, values]) => [name, [...values]])),
    };
    queue.unlock.clear();
    queue.counters = {};
    queue.sets = {};
    return body;
  }

  function restoreQueue(body) {
    body.unlock.forEach((id) => queue.unlock.add(id));
    Object.entries(body.counters).forEach(([name, delta]) => { queue.counters[name] = (queue.counters[name] || 0) + delta; });
    Object.entries(body.sets).forEach(([name, values]) => {
      const set = queue.sets[name] || (queue.sets[name] = new Set());
      values.forEach((value) => set.add(value));
    });
  }

  // delay 0 = od razu (odblokowanie: gracz czeka na powiadomienie); inaczej zbieramy zdarzenia w jedno żądanie.
  function scheduleFlush(delay = 0) {
    if (delay === 0) {
      window.clearTimeout(flushTimer);
      flushTimer = null;
      Promise.resolve().then(flush);
      return;
    }
    if (flushTimer) return;
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      flush();
    }, delay);
  }

  function scheduleRetry() {
    if (retryTimer) return;
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      flush();
    }, RETRY_MS);
  }

  async function flush() {
    if (flushing || !loggedIn) return;
    const body = takeQueue();
    if (!body) return;

    flushing = true;
    let retry = false;
    try {
      const response = await fetch(API, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      });
      if (response.status === 401) {
        // Sesja wygasła: zgłoszenia przepadają, trzeba zalogować się ponownie.
        loggedIn = false;
        loaded = false;
        renderIfOpen();
      } else if (response.status >= 500) {
        throw new Error(String(response.status));
      } else if (response.ok) {
        applyServer(await response.json());
      }
      // Inne 4xx: zgłoszenie jest błędne, ponawianie nic by nie dało.
    } catch (error) {
      restoreQueue(body);
      retry = true;
    } finally {
      flushing = false;
    }
    if (retry) scheduleRetry();
    else if (loggedIn && hasQueued()) scheduleFlush(queue.unlock.size ? 0 : COUNTER_DELAY_MS);
  }

  function unlock(id) {
    if (!isActive() || !byId.has(id) || server.unlocked[id] || queue.unlock.has(id)) return;
    queue.unlock.add(id);
    scheduleFlush();
  }

  // Licznik nie rośnie, gdy osiągnięcie, któremu służy, jest już zdobyte (inaczej bez końca generowałby żądania).
  function counterIsDone(name) {
    const def = allDefs().find((item) => item.progress?.type === "counter" && item.progress.key === name);
    return Boolean(def && server.unlocked[def.id]);
  }

  function count(name, delta = 1) {
    if (!isActive() || counterIsDone(name)) return;
    queue.counters[name] = (queue.counters[name] || 0) + delta;
    scheduleFlush(COUNTER_DELAY_MS);
  }

  function addToSet(name, value) {
    if (!isActive() || (server.sets[name] || []).includes(value)) return;
    const set = queue.sets[name] || (queue.sets[name] = new Set());
    if (set.has(value)) return;
    set.add(value);
    scheduleFlush();
  }

  // --- Odpowiedź serwera, SP, powiadomienia ------------------------------

  function applyServer(data) {
    server = {
      unlocked: data.unlocked || {},
      counters: data.counters || {},
      sets: data.sets || {},
    };
    loaded = true;
    loadFailed = false;
    (Array.isArray(data.newlyUnlocked) ? data.newlyUnlocked : []).forEach(announce);
    applySp();
    renderIfOpen();
  }

  function announce(id) {
    const def = byId.get(id);
    if (!def || !window.showToast) return;
    if (def.tier === "P") {
      window.showToast(`🏆 PLATYNA! ${def.name} — odblokowano wszystkie osiągnięcia!`, "success", 8000);
      return;
    }
    const reward = spOf(def) > 0 ? ` (+${spOf(def)} SP)` : "";
    window.showToast(`🏆 Osiągnięcie: ${def.name}${reward}`, "success", 4500);
  }

  function totalSp() {
    return Object.keys(server.unlocked).reduce((sum, id) => sum + (byId.has(id) ? spOf(byId.get(id)) : 0), 0);
  }

  // Postać dostaje różnicę między SP za wszystkie odblokowane osiągnięcia a tym, co już dostała.
  function applySp() {
    const p = player();
    if (!defs || !loaded || p.achievementsEnabled !== true) return;
    const total = totalSp();
    const granted = Number(p.achievementSpGranted) || 0;
    if (total <= granted) return;
    p.skinPoints += total - granted;
    p.achievementSpGranted = total;
    window.showToast?.(`🎨 +${total - granted} SP za osiągnięcia`, "success", 4000);
    window.refreshMainMenu?.();
    window.refreshSkins?.();
  }

  // --- Komunikacja: logowanie i pobranie stanu ---------------------------

  async function loadFromServer() {
    if (loading || !loggedIn) return;
    loading = true;
    lastLoadAttempt = Date.now();
    try {
      const response = await fetch(API, { credentials: "same-origin" });
      if (response.status === 401) {
        loggedIn = false;
        return;
      }
      if (!response.ok) throw new Error(String(response.status));
      applyServer(await response.json());
      evaluateState();
    } catch (error) {
      loadFailed = true;
    } finally {
      loading = false;
      renderIfOpen();
    }
  }

  function resetServerState() {
    loaded = false;
    loadFailed = false;
    server = emptyServer();
    queue.unlock.clear();
    queue.counters = {};
    queue.sets = {};
  }

  // Wołane przez cloudSave.js po każdym sprawdzeniu, kto jest zalogowany.
  function setCloudStatus(me) {
    const now = Boolean(me && me.loggedIn);
    loggedIn = now;
    if (!now) resetServerState();
    else if (!loaded) loadFromServer();
    renderIfOpen();
  }

  // Nowa postać: osiągnięcia ma tylko ta założona po zalogowaniu przez Discord.
  function markNewGame() {
    const p = player();
    p.achievementsEnabled = loggedIn;
    p.achievementSpGranted = 0;
    p.achRun = window.createAchievementRun();
  }

  // --- Osiągnięcia zależne od stanu postaci (powtarzalne, bezpieczne do wielokrotnego wołania) ---

  function ownedSkins(predicate) {
    const p = player();
    return (window.skinCatalog || []).filter((skin) => p.skinInventory.includes(skin.id) && predicate(skin));
  }

  const isCountableSkin = (skin) => Boolean(skin["achivement-countable"] ?? skin["achievement-countable"]);
  const UNIQUE_WEAPONS = ["yamato", "jhinPistol"];
  const ownedUniqueCount = () => UNIQUE_WEAPONS.filter((id) => player().inventory.some((weapon) => weapon.id === id)).length;

  function evaluateState() {
    if (!isActive()) return;
    const p = player();
    const run = ensureRun();

    if (p.level >= 2) unlock("firstBlood");
    if (p.level >= 16) unlock("legendBegins");
    if (p.level >= 41) unlock("waitingInLine");
    if (p.level >= 51) {
      unlock("crabWinner");
      addToSet("classesCleared", p.classId);
      if (run.noItems) unlock("hardcore");
    }
    if (p.level >= 10 && run.fistsOnly && p.classId !== "mage") unlock("fistfighter");
    if (p.level >= 15 && run.escapes === 0) unlock("noFear");
    if (run.potionFreeLevels >= 10) unlock("noPotions");

    const owned = ownedUniqueCount();
    if (owned >= 1) unlock("gambler");
    if (owned >= 2) unlock("uniqueCollector");
    if (ownedSkins(isCountableSkin).length >= 8) unlock("wardrobe");
    if (ownedSkins((skin) => skin.gender === "female").length >= 5) unlock("masterGooner");
  }

  // --- Zdarzenia z walki --------------------------------------------------

  function onBattleStart({ arena = false } = {}) {
    lvl = freshLevel();
    lvl.arena = arena;
    if (!tracking()) return;

    const p = player();
    const run = ensureRun();
    if (p.weaponId !== "fists") run.fistsOnly = false;
    const equippedAd = Math.max((p.equippedAdItems || []).length, (p.adItemInventory || []).filter((item) => item && item.equipped).length);
    const equippedMagic = window.countEquippedItems ? window.countEquippedItems().magic : 0;
    if (equippedAd + equippedMagic > 0) run.noItems = false;
  }

  // Każda akcja gracza. autoAtMax = wykonana przez Auto-walkę na 3×.
  function onAction({ autoAtMax = false, enemyFull = false } = {}) {
    if (!autoAtMax) lvl.manual = true;
    lvl.enemyWasFull = Boolean(enemyFull);
  }

  function onPotion() {
    lvl.potion = true;
    if (!lvl.arena && tracking()) ensureRun().potionFreeLevels = 0;
  }

  function onEscape() {
    if (tracking()) ensureRun().escapes += 1;
  }

  function registerSamuraiAttack(missed) {
    if (lvl.arena || player().classId !== "samurai") return;
    if (missed) {
      lvl.samuraiStreak = 0;
      return;
    }
    lvl.samuraiStreak += 1;
    if (lvl.samuraiStreak >= 12) unlock("samuraiStreak");
  }

  function checkRageBurst(result) {
    if (player().classId === "tank" && (result.rageBurst || 0) > 800) unlock("tankRage");
  }

  // Zwykły atak (Q). focused = atak wzmocniony Nieokiełznanym Skupieniem.
  function onAttack(result, { focused = false } = {}) {
    const p = player();
    const missed = Boolean(result.missed);
    registerSamuraiAttack(missed);
    if (p.classId === "archer" && focused && !missed && !lvl.arena) {
      lvl.focusStrikes += 1;
      if (lvl.focusStrikes >= 5) unlock("archerFocus");
    }
    if (p.classId === "assassin" && result.overkillArmorBreak && !missed) count("overkillProcs");
    checkRageBurst(result);
  }

  function onAbility(abilityId, result) {
    if (abilityId === "kōgeki") registerSamuraiAttack(Boolean(result.missed));
    checkRageBurst(result);
  }

  // Wróg padł (każda fala). Zapamiętujemy HP i manę bez premii z Drugiego Tchnienia.
  function onEnemyDefeated(state) {
    const p = player();
    const enemy = window.BattleState.enemyOf(state);
    const heal = p.secondWind ? Math.floor(p.maxHealthPoints * 0.25) : 0;
    const mana = p.secondWind ? Math.floor(p.maxManaPoints * 0.25) : 0;
    lvl.lastKill = { hp: Math.max(0, p.healthPoints - heal), mana: Math.max(0, p.manaPoints - mana) };
    if (!lvl.arena && enemy && enemy.isBoss && lvl.enemyWasFull) unlock("oneTap");
  }

  // Poziom ukończony (po nextWave: poziom gracza już wzrósł).
  function onLevelComplete(state) {
    if (lvl.arena) return;
    const p = player();
    const enemy = window.BattleState.enemyOf(state);

    if (tracking() && !lvl.potion) ensureRun().potionFreeLevels += 1;
    if (enemy && enemy.isBoss && (state.arenaDamageTaken || 0) === 0) unlock("untouchable");
    if (lvl.lastKill.hp < p.maxHealthPoints * 0.15) unlock("edgerunner");
    if (p.classId === "mage" && lvl.lastKill.mana < p.maxManaPoints * 0.10) unlock("mageMana");
    if (!lvl.manual) count("autoLevels");
    evaluateState();
  }

  function onArenaWin({ difficulty, fullHp }) {
    unlock("arenaFirst");
    addToSet("arenaDifficulties", difficulty);
    if (difficulty === "hard" && fullHp) unlock("gladiator");
  }

  // Śmierć w kampanii. Na pierwszej fali z pełnym HP wroga = nie zadano ani jednego obrażenia.
  function onPlayerDeath(state) {
    if (state.arena) return;
    if (state.currentWave === 1 && state.enemyHealth >= state.enemyMaxHealth) unlock("shame");
  }

  function onMenuRefresh() {
    if (loggedIn && !loaded && !loading && Date.now() - lastLoadAttempt > RELOAD_COOLDOWN_MS) loadFromServer();
    if (!loaded) return;
    applySp();
    evaluateState();
  }

  // --- Ekran osiągnięć ----------------------------------------------------

  function isOpen() {
    return !screen.classList.contains("hidden");
  }

  function renderIfOpen() {
    if (isOpen()) render();
  }

  function progressOf(def) {
    const spec = def.progress;
    if (!spec) return null;
    const p = player();
    let value = 0;
    if (spec.type === "counter") value = server.counters[spec.key] || 0;
    else if (spec.type === "set") value = (server.sets[spec.key] || []).length;
    else if (spec.type === "potionStreak") value = p.achRun?.potionFreeLevels || 0;
    else if (spec.type === "skins") value = ownedSkins(isCountableSkin).length;
    else if (spec.type === "femaleSkins") value = ownedSkins((skin) => skin.gender === "female").length;
    else if (spec.type === "uniqueWeapons") value = ownedUniqueCount();
    return { value: Math.min(value, spec.goal), goal: spec.goal };
  }

  function formatDate(iso) {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pl-PL");
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function createCard(def) {
    const unlockedAt = server.unlocked[def.id];
    const hidden = Boolean(def.secret) && !unlockedAt;
    const classLabel = def.class ? window.gameClasses?.find((item) => item.id === def.class)?.name : "";

    const card = element("article", `ach-card ach-${hidden ? "secret" : def.tier} ${unlockedAt ? "is-unlocked" : "is-locked"}`);
    card.dataset.achievement = def.id;

    const head = element("div", "ach-head");
    head.append(element("h4", "ach-name", hidden ? "???" : def.name));
    if (!hidden) head.append(element("span", "ach-tier", defs.tiers[def.tier]?.label || def.tier));
    card.append(head);

    card.append(element("p", "ach-desc", hidden ? "Sekretne osiągnięcie." : def.description));
    if (classLabel && !hidden) card.append(element("span", "ach-class", `Tylko klasa: ${classLabel}`));

    const foot = element("div", "ach-foot");
    const progress = hidden ? null : progressOf(def);
    if (unlockedAt) foot.append(element("span", "ach-done", `✓ ${formatDate(unlockedAt)}`));
    else if (progress) foot.append(element("span", "", `${progress.value} / ${progress.goal}`));
    else foot.append(element("span", "", ""));
    if (!hidden && spOf(def) > 0) foot.append(element("span", "ach-reward", `+${spOf(def)} SP`));
    card.append(foot);
    return card;
  }

  function createPlatinumCard() {
    const def = defs.platinum;
    const unlockedAt = server.unlocked[def.id];
    const others = defs.achievements;
    const done = others.filter((item) => server.unlocked[item.id]).length;

    const card = element("article", `ach-card ach-P ach-platinum ${unlockedAt ? "is-unlocked" : "is-locked"}`);
    card.dataset.achievement = def.id;
    const head = element("div", "ach-head");
    head.append(element("h4", "ach-name", `🏆 ${def.name}`), element("span", "ach-tier", defs.tiers.P.label));
    card.append(head, element("p", "ach-desc", def.description));
    const foot = element("div", "ach-foot");
    foot.append(element("span", unlockedAt ? "ach-done" : "", unlockedAt ? `✓ ${formatDate(unlockedAt)}` : `${done} / ${others.length}`));
    foot.append(element("span", "ach-reward", `+${spOf(def)} SP`));
    card.append(foot);
    return card;
  }

  function statusText() {
    const p = player();
    if (!defs) return { text: "Ładowanie osiągnięć…", type: "" };
    if (!loggedIn) return { text: "Osiągnięcia zdobywa się tylko po zalogowaniu przez Discord (Opcje → Chmura), na postaci założonej po zalogowaniu.", type: "warning" };
    if (loadFailed && !loaded) return { text: "Nie udało się połączyć z serwerem osiągnięć. Spróbuj ponownie za chwilę.", type: "danger" };
    if (!loaded) return { text: "Łączenie z serwerem osiągnięć…", type: "" };
    if (p.achievementsEnabled !== true) return { text: "Ta postać nie zdobywa osiągnięć (założona jako gość albo przed ich dodaniem). Załóż nową grę po zalogowaniu przez Discord.", type: "warning" };
    return { text: "Ta postać zdobywa osiągnięcia.", type: "success" };
  }

  function render() {
    const status = statusText();
    window.setStatusMessage(statusEl, status.text, "screen-message", status.type);
    if (!defs) {
      listEl.replaceChildren();
      summaryEl.textContent = "";
      return;
    }

    const all = allDefs();
    const unlockedCount = all.filter((def) => server.unlocked[def.id]).length;
    const spEarned = totalSp();
    const spMax = all.reduce((sum, def) => sum + spOf(def), 0);
    summaryEl.replaceChildren(
      document.createTextNode(`🏆 ${unlockedCount} / ${all.length}`),
      element("small", "", `SP z osiągnięć: ${spEarned} / ${spMax}`),
    );

    const nodes = [createPlatinumCard()];
    defs.sections.forEach((section) => {
      const items = defs.achievements.filter((def) => def.section === section.id);
      if (!items.length) return;
      const wrapper = element("section", "ach-section");
      wrapper.append(element("h3", "ach-section-title", section.title));
      const grid = element("div", "ach-grid");
      items.forEach((def) => grid.append(createCard(def)));
      wrapper.append(grid);
      nodes.push(wrapper);
    });
    listEl.replaceChildren(...nodes);
  }

  function openScreen() {
    mainMenu.classList.add("hidden");
    screen.classList.remove("hidden");
    if (loggedIn && !loaded && !loading) loadFromServer();
    render();
    screen.scrollIntoView?.({ block: "start" });
  }

  function closeScreen() {
    screen.classList.add("hidden");
    mainMenu.classList.remove("hidden");
    window.refreshMainMenu?.();
  }

  // Zamykanie karty / przełączenie na inną: wysyłamy, co się zebrało.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && hasQueued()) scheduleFlush();
  });
  window.addEventListener("pagehide", () => {
    if (hasQueued()) flush();
  });

  openButton.addEventListener("click", openScreen);
  backButton.addEventListener("click", closeScreen);

  window.Achievements = {
    setCloudStatus,
    markNewGame,
    onMenuRefresh,
    onBattleStart,
    onAction,
    onPotion,
    onEscape,
    onAttack,
    onAbility,
    onEnemyDefeated,
    onLevelComplete,
    onArenaWin,
    onPlayerDeath,
  };

  window.achievementsReady = fetch("data/achievements.json")
    .then((response) => {
      if (!response.ok) throw new Error(`Nie udało się wczytać osiągnięć: ${response.status}`);
      return response.json();
    })
    .then((data) => {
      defs = data;
      byId = new Map(allDefs().map((def) => [def.id, def]));
      renderIfOpen();
      onMenuRefresh();
    })
    .catch((error) => {
      console.error(error);
    });

  // cloudSave.js mógł sprawdzić logowanie, zanim ten plik się załadował.
  if (window.LowCloudStatus) setCloudStatus(window.LowCloudStatus);
})();

// Battle screen controller: owns the DOM refs, the current battle state, and
// all event handling. Actual combat resolution lives in window.BattleSystem
// (battle.js); actual DOM rendering lives in window.BattleUIRender
// (battleUIRender.js).
(function () {
  const refs = {
    mainMenu: document.getElementById("main-menu"),
    battleScreen: document.getElementById("battle-screen"),
    playButton: document.getElementById("play-btn"),
    attackButton: document.getElementById("attack-btn"),
    escapeButton: document.getElementById("escape-btn"),
    backButton: document.getElementById("battle-back-btn"),
    actions: document.getElementById("battle-actions"),
    abilitiesPanel: document.getElementById("battle-abilities"),
    potionsPanel: document.getElementById("battle-potions"),
    effectsPanel: document.getElementById("battle-effects"),
    battleLog: document.getElementById("battle-log"),
    deathPanel: document.getElementById("battle-death-panel"),
    deathNewGameButton: document.getElementById("death-new-game-btn"),
    deathRestoreButton: document.getElementById("death-restore-btn"),
    battleTitle: document.getElementById("battle-title"),
    battleWave: document.getElementById("battle-wave"),
    playerName: document.getElementById("battle-player-name"),
    playerModel: document.querySelector(".battle-model-player img"),
    playerHp: document.getElementById("battle-player-hp"),
    playerHealthBar: document.getElementById("battle-player-health-bar"),
    playerManaBar: document.getElementById("battle-player-mana-bar"),
    playerManaValue: document.getElementById("battle-player-mana-value"),
    playerWeaponName: document.getElementById("battle-player-weapon-name"),
    playerWeapon: document.getElementById("battle-player-weapon"),
    playerMana: document.getElementById("battle-player-mana"),
    enemyName: document.getElementById("battle-enemy-name"),
    enemyModel: document.getElementById("battle-enemy-model"),
    enemyModelFallback: document.getElementById("enemy-model-fallback"),
    enemyHp: document.getElementById("battle-enemy-hp"),
    enemyHealthBar: document.getElementById("battle-enemy-health-bar"),
    enemyStats: document.getElementById("battle-enemy-stats"),
    arenaButton: document.getElementById("arena-btn"),
    arenaPanel: document.getElementById("arena-panel"),
    arenaStatus: document.getElementById("arena-status"),
    arenaCloseButton: document.getElementById("arena-close-btn"),
  };

  const UI = window.BattleUIRender;
  const Settings = window.GameSettings;
  const optionsModal = document.getElementById("options-modal");
  let state;
  let isTransitioning = false;

  // One-time DOM rearrangement: fold the attack button into the abilities
  // panel, and move the wave counter + escape button into a shared header.
  refs.abilitiesPanel.appendChild(refs.attackButton);
  refs.attackButton.classList.add("ability-button");
  const battleHeaderActions = document.createElement("div");
  battleHeaderActions.className = "battle-header-actions";
  refs.battleWave.replaceWith(battleHeaderActions);
  battleHeaderActions.append(refs.battleWave, refs.escapeButton);
  refs.escapeButton.classList.add("battle-escape-top");

  // Historia logu walki: ostatnie komunikaty w zwijanym panelu pod głównym logiem.
  const logHistory = document.createElement("details");
  logHistory.className = "battle-history";
  logHistory.innerHTML = "<summary>📜 Historia walki</summary><ol></ol>";
  refs.battleLog.after(logHistory);
  const logHistoryList = logHistory.querySelector("ol");

  function showMessage(message, type) {
    window.setStatusMessage(refs.battleLog, message, "battle-log", type);
    const entry = document.createElement("li");
    entry.textContent = message;
    if (type) entry.className = type;
    logHistoryList.prepend(entry);
    while (logHistoryList.children.length > 30) logHistoryList.lastElementChild.remove();
  }

  // --- Spadające liczby obrażeń i leczenia ---
  // Wartości liczone są po stronie interfejsu: różnica HP przeciwnika oraz
  // dane o trafieniu w gracza (state.enemyHit); leczenie = zmiana HP gracza
  // + faktycznie utracone HP (dzięki temu lifesteal, mikstury itp. łapią się same).
  let pendingFx = null;
  const enemyModelBox = document.querySelector(".battle-model-enemy");
  const playerModelBox = document.querySelector(".battle-model-player");

  function beginAction() {
    pendingFx = { hp: window.player.healthPoints, enemyHp: state.enemyHealth };
    // Osiągnięcia: akcja wykonana przez Auto-walkę na 3× i to, czy wróg miał pełne HP.
    window.Achievements?.onAction({
      autoAtMax: autoActing && AUTO_SPEEDS[autoSpeedIndex] === 3,
      enemyFull: state.enemyHealth >= state.enemyMaxHealth,
    });
    // Flagi z poprzedniej akcji nie mogą przeciekać do nowej.
    state = { ...state, critical: false, superCritical: false, enemyCritical: false, enemyHit: null, rageBurst: 0 };
  }

  function spawnFloat(box, kind, text, options = {}) {
    if (!box) return;
    const element = document.createElement("span");
    element.className = `fx-float fx-${kind}${options.crit ? " fx-crit" : ""}`;
    element.setAttribute("aria-hidden", "true");
    // Losowe miejsce w polu modelu; strefa lewa/prawa rozdziela liczby pojawiające się razem.
    const zones = { left: [18, 42], right: [58, 82], any: [20, 80] };
    const [minX, maxX] = zones[options.zone] || zones.any;
    element.style.left = `${minX + Math.random() * (maxX - minX)}%`;
    element.style.top = `${4 + Math.random() * 36}%`;
    element.style.animationDelay = `${options.delay || 0}ms`;
    if (options.crit) {
      const label = document.createElement("span");
      label.className = "fx-label";
      label.textContent = options.crit;
      element.appendChild(label);
    }
    const number = document.createElement("span");
    number.className = "fx-num";
    number.textContent = text;
    element.appendChild(number);
    box.appendChild(element);
    // animationend nie odpala się przy wyłączonych animacjach, stąd awaryjny timer.
    window.setTimeout(() => element.remove(), (options.delay || 0) + 1800);
  }

  function playFloats(snapshot) {
    const enemyDamage = snapshot.enemyHp - state.enemyHealth;
    const hit = state.enemyHit;
    const taken = hit ? hit.damage : 0;
    const healed = window.player.healthPoints - snapshot.hp + (hit ? hit.applied : 0);
    const critLabel = state.superCritical ? "SUPER CRIT!" : "CRIT!";

    if (enemyDamage > 0) {
      spawnFloat(enemyModelBox, "damage", `-${enemyDamage}`, { crit: state.critical ? critLabel : null });
    }
    if (healed > 0) {
      spawnFloat(playerModelBox, "heal", `+${healed}`, { delay: 120, zone: taken > 0 ? "left" : "any" });
    }
    if (taken > 0) {
      spawnFloat(playerModelBox, "damage", `-${taken}`, { crit: state.enemyCritical ? "CRIT!" : null, delay: 380, zone: healed > 0 ? "right" : "any" });
    }
  }

  function renderAll() {
    UI.render(refs, state);
    UI.renderAbilities(refs, state, useAbility, useWeaponAbility);
    UI.renderPotions(refs, state, usePotion);
    updateAutoButtons();
    if (pendingFx) {
      const snapshot = pendingFx;
      pendingFx = null;
      playFloats(snapshot);
    }
  }

  function finish(message, type) {
    stopAuto();
    refs.actions.classList.add("hidden");
    refs.escapeButton.classList.add("hidden");
    refs.abilitiesPanel.classList.add("hidden");
    refs.potionsPanel.classList.add("hidden");
    refs.effectsPanel.classList.add("hidden");
    refs.backButton.classList.remove("hidden");
    stopBonusMana();
    updateAutoButtons();
    showMessage(message, type);
  }

  function showDeathPanel() {
    if (state.arena) {
      window.SaveSystem.endArena({ cooldownMs: window.Arena.COOLDOWN_MS });
      state = { ...state, finished: true };
      finish("Przegrywasz w arenie. Brak nagrody, cooldown areny uruchomiony.", "danger");
      return;
    }
    window.Achievements?.onPlayerDeath(state);
    const autoWasOn = autoOn;   // stopAuto() je zeruje, a restart po śmierci dotyczy tylko auto-walki
    stopAuto();
    refs.actions.classList.add("hidden");
    refs.escapeButton.classList.add("hidden");
    refs.abilitiesPanel.classList.add("hidden");
    refs.potionsPanel.classList.add("hidden");
    refs.effectsPanel.classList.add("hidden");
    refs.backButton.classList.add("hidden");
    refs.deathPanel.classList.remove("hidden");
    stopBonusMana();
    updateAutoButtons();
    UI.renderPlayerModel(refs, true);
    showMessage("Przegrywasz walkę.", "danger");
    if (autoWasOn && Settings.auto.restartOnDeath) scheduleDeathRestart();
  }

  function canAct() {
    return Boolean(state
      && !state.finished
      && !isTransitioning
      && window.player.healthPoints > 0
      && refs.deathPanel.classList.contains("hidden"));
  }

  // Bonusowy regen many w czasie rzeczywistym: +5 many co 5 sekund walki.
  // Wartość stała — nie zależy od manaRegenPercent ani od regeneracji na turę.
  const BONUS_MANA_INTERVAL_MS = 5000;
  const BONUS_MANA_AMOUNT = 5;
  let bonusManaTimer = null;

  function stopBonusMana() {
    window.clearInterval(bonusManaTimer);
    bonusManaTimer = null;
  }

  function startBonusMana() {
    stopBonusMana();
    bonusManaTimer = window.setInterval(() => {
      const player = window.player;
      if (!state || state.finished || player.healthPoints <= 0 || !refs.deathPanel.classList.contains("hidden")) return;
      if (player.manaPoints >= player.maxManaPoints) return;
      player.manaPoints = window.BattleMath.clamp(player.manaPoints + BONUS_MANA_AMOUNT, 0, player.maxManaPoints);
      renderAll();
    }, BONUS_MANA_INTERVAL_MS);
  }

  // Wspólne przygotowanie ekranu walki (kampania i arena).
  function showBattleScreen() {
    cancelPendingAuto();
    stopAuto();
    startBonusMana();
    logHistoryList.replaceChildren();
    pendingFx = null;
    refs.mainMenu.classList.add("hidden");
    refs.battleScreen.classList.remove("hidden");
    refs.actions.classList.remove("hidden");
    refs.escapeButton.classList.remove("hidden");
    refs.abilitiesPanel.classList.remove("hidden");
    refs.potionsPanel.classList.remove("hidden");
    refs.effectsPanel.classList.remove("hidden");
    refs.backButton.classList.add("hidden");
    refs.deathPanel.classList.add("hidden");
    isTransitioning = false;
  }

  function openBattle() {
    window.SaveSystem.captureBattleState();
    state = window.BattleSystem.start(window.player.level);
    showBattleScreen();
    if (!state.finished) window.Achievements?.onBattleStart({ arena: false });

    if (state.finished) {
      refs.battleTitle.textContent = "Koniec gry";
      refs.battleWave.textContent = "UKONCZONO";
      finish(state.message, "success");
      return;
    }

    renderAll();
    showMessage("Wybierz akcje.");
  }

  // --- Auto-walka ---
  // Decyzje podejmuje window.AutoBattle (autoBattle.js); tutaj tylko pętla czasowa,
  // przyciski i wykonywanie akcji tymi samymi funkcjami co ręczna gra.
  const AUTO_SPEEDS = [1, 2, 3];
  const AUTO_BASE_DELAY_MS = 1000;
  const AUTO_SPEED_KEY = "autoBattleSpeed";
  let autoOn = false;
  let autoTimer = null;
  let autoSpeedIndex = readAutoSpeedIndex();
  let autoWaiting = false;   // auto-walka czeka na manę (opcja „bez zatrzymywania”)

  function readAutoSpeedIndex() {
    try {
      const index = AUTO_SPEEDS.indexOf(Number(window.localStorage.getItem(AUTO_SPEED_KEY)));
      return index >= 0 ? index : 0;
    } catch (error) { return 0; }   // brak dostępu do storage
  }

  const autoButton = document.createElement("button");
  autoButton.type = "button";
  autoButton.id = "auto-btn";
  autoButton.className = "battle-auto-btn";
  const autoSpeedButton = document.createElement("button");
  autoSpeedButton.type = "button";
  autoSpeedButton.id = "auto-speed-btn";
  autoSpeedButton.className = "battle-auto-speed";
  autoSpeedButton.title = "Prędkość auto-walki";
  battleHeaderActions.prepend(autoButton, autoSpeedButton);

  function autoAllowed() {
    return Boolean(state) && (!state.arena || window.AutoBattle.allowInArena);
  }

  function updateAutoButtons() {
    const visible = autoAllowed() && !state.finished && refs.deathPanel.classList.contains("hidden");
    autoButton.classList.toggle("hidden", !visible);
    autoSpeedButton.classList.toggle("hidden", !visible);
    autoButton.classList.toggle("is-active", autoOn);
    autoButton.setAttribute("aria-pressed", String(autoOn));
    autoButton.textContent = autoOn ? "⏸ Auto: WŁ." : "▶ Auto";
    autoButton.title = `Auto-walka (${Settings.label("auto")}): gra za Ciebie — używa umiejętności, mikstur zdrowia i ataku`;
    autoSpeedButton.textContent = `${AUTO_SPEEDS[autoSpeedIndex]}×`;
    autoSpeedButton.setAttribute("aria-label", `Prędkość auto-walki: ${AUTO_SPEEDS[autoSpeedIndex]}×`);
  }

  function scheduleAuto(delay = AUTO_BASE_DELAY_MS / AUTO_SPEEDS[autoSpeedIndex]) {
    window.clearTimeout(autoTimer);
    autoTimer = autoOn ? window.setTimeout(autoStep, delay) : null;
  }

  function stopAuto(message, type) {
    window.clearTimeout(autoTimer);
    autoTimer = null;
    if (!autoOn) return;
    autoOn = false;
    updateAutoButtons();
    if (message) showMessage(message, type || "warning");
  }

  function toggleAuto() {
    if (!autoAllowed() || state.finished) return;
    if (autoOn) {
      stopAuto("Auto-walka wyłączona.");
      return;
    }
    if (!canAct() && !isTransitioning) return;
    enableAuto();
  }

  function enableAuto(delay = 250) {
    autoOn = true;
    autoWaiting = false;
    updateAutoButtons();
    showMessage("Auto-walka włączona.");
    scheduleAuto(delay);
  }

  // Osiągnięcia odróżniają akcje Auto-walki od ręcznych (Leniwiec).
  let autoActing = false;

  function runAutoAction(action) {
    autoActing = true;
    try {
      if (action.kind === "potion") usePotion(action.id);
      else if (action.kind === "weapon") useWeaponAbility();
      else if (action.kind === "ability") useAbility(action.id);
      else attack();
    } finally {
      autoActing = false;
    }
  }

  function autoStep() {
    autoTimer = null;
    if (!autoOn) return;
    if (!state || state.finished || refs.battleScreen.classList.contains("hidden")) {
      stopAuto();
      return;
    }
    // Pauza po zabiciu wroga / przejście do następnej fali — poczekaj.
    if (isTransitioning) {
      scheduleAuto(300);
      return;
    }
    if (!canAct()) {   // gracz poległ albo walka się skończyła
      stopAuto();
      return;
    }
    // Akcje, które nie zajmują tury (mikstury, Spacja, znacznik Skupienia),
    // są wykonywane od razu, a dopiero akcja kończąca turę zamyka krok.
    for (let step = 0; step < 5 && autoOn && canAct(); step += 1) {
      const action = window.AutoBattle.decide(state);
      if (action.kind === "pause") {
        stopAuto(action.reason);
        return;
      }
      if (action.kind === "wait") {
        // Mag bez many: nic nie robimy, dopóki mana (+5 co 5 s) nie wystarczy na czar.
        if (!autoWaiting) showMessage("Auto-walka czeka na regenerację many…", "warning");
        autoWaiting = true;
        scheduleAuto(AUTO_BASE_DELAY_MS);
        return;
      }
      autoWaiting = false;
      runAutoAction(action);
      if (!action.free) break;
    }
    scheduleAuto();
  }

  autoButton.addEventListener("click", toggleAuto);
  autoSpeedButton.addEventListener("click", () => {
    autoSpeedIndex = (autoSpeedIndex + 1) % AUTO_SPEEDS.length;
    try { window.localStorage.setItem(AUTO_SPEED_KEY, String(AUTO_SPEEDS[autoSpeedIndex])); } catch (error) { /* brak dostępu do storage */ }
    updateAutoButtons();
    if (autoOn) scheduleAuto();
  });

  // --- Automatyczny restart po śmierci i kontynuacja po poziomie (opcje auto-walki) ---
  // Restart = to samo, co ręcznie „Cofnij stan sprzed walki” + „Graj”.
  const deathRestart = document.createElement("div");
  deathRestart.className = "death-restart hidden";
  const deathRestartText = document.createElement("p");
  deathRestartText.setAttribute("role", "status");
  const deathRestartCancel = document.createElement("button");
  deathRestartCancel.type = "button";
  deathRestartCancel.className = "secondary-button";
  deathRestartCancel.textContent = "Anuluj automatyczny restart";
  deathRestart.append(deathRestartText, deathRestartCancel);
  refs.deathPanel.querySelector(".death-actions").before(deathRestart);

  let restartTicker = null;
  let nextLevelTimer = null;
  const NEXT_LEVEL_DELAY_MS = 2000;

  function cancelPendingAuto() {
    window.clearInterval(restartTicker);
    restartTicker = null;
    window.clearTimeout(nextLevelTimer);
    nextLevelTimer = null;
    deathRestart.classList.add("hidden");
  }

  function scheduleDeathRestart() {
    window.clearInterval(restartTicker);
    let left = Settings.auto.restartDelay;
    const render = () => { deathRestartText.textContent = `Automatyczny restart walki za ${left} s…`; };
    render();
    deathRestart.classList.remove("hidden");
    restartTicker = window.setInterval(() => {
      left -= 1;
      if (left > 0) {
        render();
        return;
      }
      cancelPendingAuto();
      restartBattleAfterDeath();
    }, 1000);
  }

  function restartBattleAfterDeath() {
    if (refs.battleScreen.classList.contains("hidden") || refs.deathPanel.classList.contains("hidden")) return;
    const restored = window.SaveSystem.restoreBattleState();
    closeBattle();   // wraca do menu i odświeża je, jak po „Cofnij stan sprzed walki”
    if (!restored) return;
    openBattle();    // jak kliknięcie „Graj”
    if (state && !state.finished) enableAuto();
  }

  function scheduleNextLevel() {
    const level = window.player.level;
    if (!window.enemies?.[level - 1]) return;                                  // ukończono wszystkie poziomy
    if (window.DuelUI && level === window.DuelUI.MIN_LEVEL) return;           // zostaw okno odblokowania pojedynków
    showMessage(`${refs.battleLog.textContent} Auto-walka: następny poziom za chwilę — „Wróć do menu” przerywa.`, "success");
    window.clearTimeout(nextLevelTimer);
    nextLevelTimer = window.setTimeout(() => {
      nextLevelTimer = null;
      if (refs.battleScreen.classList.contains("hidden") || !state || !state.levelUp) return;
      closeBattle();
      openBattle();
      if (state && !state.finished) enableAuto();
    }, NEXT_LEVEL_DELAY_MS);
  }

  deathRestartCancel.addEventListener("click", cancelPendingAuto);

  // Zmiana klawiszy w Opcjach odświeża plakietki skrótów na kafelkach.
  Settings.subscribe(() => {
    updateAutoButtons();
    if (state && !refs.battleScreen.classList.contains("hidden")) UI.renderAbilities(refs, state, useAbility, useWeaponAbility);
  });

  // --- Arena ---
  let arenaTimer = null;

  function refreshArenaPanel() {
    const check = window.Arena.canEnter(window.player);
    refs.arenaStatus.textContent = check.ok ? "Wybierz poziom trudności." : check.message;
    refs.arenaPanel.querySelectorAll("[data-arena-difficulty]").forEach((button) => { button.disabled = !check.ok; });
    refs.arenaPanel.querySelectorAll("[data-arena-reward]").forEach((el) => {
      el.textContent = window.Arena.estimateReward(el.dataset.arenaReward);
    });
  }

  function openArenaPanel() {
    refs.arenaPanel.classList.remove("hidden");
    refreshArenaPanel();
    window.clearInterval(arenaTimer);
    arenaTimer = window.setInterval(refreshArenaPanel, 1000);
  }

  function closeArenaPanel() {
    window.clearInterval(arenaTimer);
    refs.arenaPanel.classList.add("hidden");
  }

  function openArenaBattle(difficultyId) {
    if (!window.Arena.canEnter(window.player).ok) { refreshArenaPanel(); return; }
    closeArenaPanel();
    window.SaveSystem.beginArena({ cooldownMs: window.Arena.COOLDOWN_MS });   // pełne HP/mana areny, kampania zapamiętana, cooldown od razu
    const bot = window.Arena.buildBot(difficultyId);             // po beginArena, liczy z maks. HP gracza
    state = window.BattleSystem.startArena(bot);
    showBattleScreen();
    window.Achievements?.onBattleStart({ arena: true });
    renderAll();
    showMessage(`Arena (${window.Arena.DIFFICULTIES[difficultyId].label}): wybierz akcję.`);
  }

  function finishArena() {
    const result = window.Arena.settle(state);
    // Zdrowie areny trzeba odczytać przed endArena(), bo ta przywraca stan kampanii.
    window.Achievements?.onArenaWin({
      difficulty: state.arenaEnemy?.arena?.difficulty,
      fullHp: window.player.healthPoints >= window.player.maxHealthPoints,
    });
    window.SaveSystem.endArena({ reward: result.reward, cooldownMs: window.Arena.COOLDOWN_MS });
    finish(`Arena ukończona! Obrażenia: ${result.taken} (oczekiwane ${Math.round(result.expectedLoss)}), tury: ${result.turns} (par ${result.parTurns.toFixed(1)}). Mnożnik wykonania ×${result.performance.toFixed(2)}. Nagroda: ${result.reward} $.`, "success");
  }

  // Shared by attack() and actionResult(): awards the kill reward, plays the
  // ~700ms "defeated" pause, then either ends the battle (level up) or opens
  // the next wave. `hideAbilitiesAndPotions` preserves the one real
  // difference between the two call sites: ability/potion kills also hide
  // those panels during the pause, while a plain attack kill does not.
  function resolveEnemyDefeated(message, hideAbilitiesAndPotions) {
    window.Achievements?.onEnemyDefeated(state);
    window.player.money += window.BattleState.enemyOf(state).reward;
    isTransitioning = true;
    refs.actions.classList.add("hidden");
    if (hideAbilitiesAndPotions) {
      refs.abilitiesPanel.classList.add("hidden");
      refs.potionsPanel.classList.add("hidden");
    }
    renderAll();
    showMessage(`${message} Pokonano przeciwnika!`, "success");

    window.setTimeout(() => {
      state = window.BattleSystem.nextWave(state);
      renderAll();
      isTransitioning = false;

      if (state.arenaWon) {
        finishArena();
      } else if (state.levelUp) {
        window.Achievements?.onLevelComplete(state);
        const continueAuto = autoOn && Settings.auto.keepAfterLevel;   // finish() wyłącza auto-walkę
        finish(`${message} ${state.message} Otrzymujesz nagrodę: ${state.reward} $.`, "success");
        // Ukończony 50. poziom (gracz ma teraz 51) — odblokowane pojedynki 1v1.
        if (window.DuelUI && window.player.level === window.DuelUI.MIN_LEVEL) window.DuelUI.showUnlockPrompt();
        if (continueAuto) scheduleNextLevel();
      } else {
        refs.actions.classList.remove("hidden");
        if (hideAbilitiesAndPotions) {
          refs.abilitiesPanel.classList.remove("hidden");
          refs.potionsPanel.classList.remove("hidden");
        }
        showMessage(`${message} ${state.message}${state.arena ? "" : ` Otrzymujesz ${state.reward} $.`}`, "success");
      }
    }, 700);
  }

  function attack() {
    if (!canAct()) return;
    const wasFocused = Boolean(state.focusMark);
    beginAction();
    const attackResult = window.BattleSystem.attack(state);
    state = attackResult;
    window.Achievements?.onAttack(attackResult, { focused: wasFocused });

    if (attackResult.enemyDefeated) {
      resolveEnemyDefeated(UI.formatPlayerAttack(attackResult), false);
      return;
    }

    renderAll();

    if (window.player.healthPoints <= 0) {
      showDeathPanel();
      return;
    }

    showMessage(`${UI.formatPlayerAttack(attackResult)} ${UI.formatEnemyAttack(attackResult)}`);
  }

  function actionResult(result, actionMessage) {
    state = result;

    if (result.enemyDefeated) {
      resolveEnemyDefeated(actionMessage || result.message, true);
      return;
    }

    renderAll();
    if (window.player.healthPoints <= 0) {
      showDeathPanel();
      return;
    }
    showMessage(actionMessage || result.message);
  }

  function useAbility(abilityId) {
    if (!canAct()) return;
    beginAction();
    const result = window.BattleSystem.useAbility(state, abilityId);
    window.Achievements?.onAbility(abilityId, result);
    actionResult(result, result.message);
  }

  function usePotion(potionId) {
    if (!canAct()) return;
    beginAction();
    const result = window.BattleSystem.usePotion(state, potionId);
    window.Achievements?.onPotion();
    state = result;
    renderAll();
    showMessage(result.message, "success");
  }

  // Umiejętność broni unikalnej (Spacja). Nie zajmuje tury, ale jeśli zabija
  // przeciwnika (Judgement Cut Yamato, pula Jhina), walka musi to rozliczyć
  // tak samo jak zwykłe zabójstwo: nagroda, pauza i następna fala.
  function useWeaponAbility(notReadyMessage) {
    if (!canAct()) return;
    // Klik w kafelek, gdy umiejętność niegotowa: sam komunikat, bez rozpoczynania akcji.
    if (notReadyMessage) {
      showMessage(notReadyMessage, "warning");
      return;
    }
    beginAction();
    const result = window.BattleSystem.useWeaponAbility(state);
    state = result;
    if (result.enemyDefeated) {
      resolveEnemyDefeated(result.message, true);
      return;
    }
    renderAll();
    showMessage(result.message);
  }

  // Skróty pochodzą z Opcji (GameSettings). Cztery „sloty” (domyślnie Q/W/E/R):
  // Mag ma pod nimi swoje 4 czary, pozostałe klasy: atak + 3 umiejętności.
  function handleBattleShortcut(event) {
    if (refs.battleScreen.classList.contains("hidden") || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
    if (optionsModal && !optionsModal.classList.contains("hidden")) return;

    const key = Settings.keyFromEvent(event);
    const action = key && Settings.actionForKey(key);
    if (!action) return;
    event.preventDefault();

    if (action === "weapon") {
      useWeaponAbility();
      return;
    }
    if (action === "auto") {
      toggleAuto();
      return;
    }

    const slot = Number(action.slice(4)) - 1;   // slot1..slot4 -> 0..3
    const classAbilities = window.classAbilities?.[window.player.classId]?.active || [];
    if (window.player.classId === "mage") {
      if (classAbilities[slot]) useAbility(classAbilities[slot].id);
      return;
    }
    if (slot === 0) {
      attack();
      return;
    }
    if (classAbilities[slot - 1]) useAbility(classAbilities[slot - 1].id);
  }

  function escape() {
    if (state.arena) {
      if (!canAct()) return;
      window.SaveSystem.endArena({ lockMs: window.Arena.ESCAPE_LOCK_MS });
      isTransitioning = true;
      state = { ...state, escaped: true, finished: true };
      finish("Uciekasz z areny. Postęp zresetowany, ponowne wejście za 30 s.", "warning");
      return;
    }
    const result = window.BattleSystem.escape();
    if (!result.allowed) {
      showMessage(result.message, "danger");
      return;
    }

    window.Achievements?.onEscape();
    isTransitioning = true;
    state = { ...state, escaped: true, finished: true };
    renderAll();
    finish(result.message, "warning");
  }

  function closeBattle() {
    cancelPendingAuto();
    stopAuto();
    stopBonusMana();
    if (window.SaveSystem.isArenaActive()) window.SaveSystem.endArena({ cooldownMs: window.Arena.COOLDOWN_MS });
    isTransitioning = false;
    refs.battleScreen.classList.add("hidden");
    refs.mainMenu.classList.remove("hidden");
    refs.deathPanel.classList.add("hidden");
    window.SaveSystem.clearBattleState();
    window.refreshMainMenu();
  }

  function restoreBeforeBattle() {
    window.SaveSystem.restoreBattleState();
    closeBattle();
  }

  refs.playButton.addEventListener("click", openBattle);
  refs.arenaButton.addEventListener("click", openArenaPanel);
  refs.arenaCloseButton.addEventListener("click", closeArenaPanel);
  refs.arenaPanel.querySelectorAll("[data-arena-difficulty]").forEach((button) => {
    button.addEventListener("click", () => openArenaBattle(button.dataset.arenaDifficulty));
  });
  document.addEventListener("keydown", handleBattleShortcut);
  refs.attackButton.addEventListener("click", attack);
  refs.escapeButton.addEventListener("click", escape);
  refs.backButton.addEventListener("click", closeBattle);
  refs.deathNewGameButton.addEventListener("click", () => {
    cancelPendingAuto();
    refs.battleScreen.classList.add("hidden");
    window.startNewGame();
  });
  refs.deathRestoreButton.addEventListener("click", restoreBeforeBattle);
})();

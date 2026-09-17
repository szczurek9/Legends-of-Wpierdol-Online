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
    playerWeapon: document.getElementById("battle-player-weapon"),
    playerMana: document.getElementById("battle-player-mana"),
    enemyName: document.getElementById("battle-enemy-name"),
    enemyModel: document.getElementById("battle-enemy-model"),
    enemyModelFallback: document.getElementById("enemy-model-fallback"),
    enemyHp: document.getElementById("battle-enemy-hp"),
    enemyHealthBar: document.getElementById("battle-enemy-health-bar"),
    enemyStats: document.getElementById("battle-enemy-stats"),
  };

  const UI = window.BattleUIRender;
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

  function showMessage(message, type) {
    window.setStatusMessage(refs.battleLog, message, "battle-log", type);
  }

  function renderAll() {
    UI.render(refs, state);
    UI.renderAbilities(refs, state, useAbility);
    UI.renderPotions(refs, state, usePotion);
  }

  function finish(message, type) {
    refs.actions.classList.add("hidden");
    refs.escapeButton.classList.add("hidden");
    refs.abilitiesPanel.classList.add("hidden");
    refs.potionsPanel.classList.add("hidden");
    refs.effectsPanel.classList.add("hidden");
    refs.backButton.classList.remove("hidden");
    showMessage(message, type);
  }

  function showDeathPanel() {
    refs.actions.classList.add("hidden");
    refs.escapeButton.classList.add("hidden");
    refs.abilitiesPanel.classList.add("hidden");
    refs.potionsPanel.classList.add("hidden");
    refs.effectsPanel.classList.add("hidden");
    refs.backButton.classList.add("hidden");
    refs.deathPanel.classList.remove("hidden");
    UI.renderPlayerModel(refs, true);
    showMessage("Przegrywasz walkę.", "danger");
  }

  function canAct() {
    return Boolean(state
      && !state.finished
      && !isTransitioning
      && window.player.healthPoints > 0
      && refs.deathPanel.classList.contains("hidden"));
  }

  function openBattle() {
    window.SaveSystem.captureBattleState();
    state = window.BattleSystem.start(window.player.level);
    refs.mainMenu.classList.add("hidden");
    refs.battleScreen.classList.remove("hidden");
    refs.actions.classList.remove("hidden");
    refs.escapeButton.classList.remove("hidden");
    refs.abilitiesPanel.classList.remove("hidden");
    refs.potionsPanel.classList.remove("hidden");
    refs.effectsPanel.classList.remove("hidden");
    refs.backButton.classList.add("hidden");
    refs.deathPanel.classList.add("hidden");

    if (state.finished) {
      refs.battleTitle.textContent = "Koniec gry";
      refs.battleWave.textContent = "UKONCZONO";
      finish(state.message, "success");
      return;
    }

    renderAll();
    showMessage("Wybierz akcje.");
  }

  // Shared by attack() and actionResult(): awards the kill reward, plays the
  // ~700ms "defeated" pause, then either ends the battle (level up) or opens
  // the next wave. `hideAbilitiesAndPotions` preserves the one real
  // difference between the two call sites: ability/potion kills also hide
  // those panels during the pause, while a plain attack kill does not.
  function resolveEnemyDefeated(message, hideAbilitiesAndPotions) {
    window.player.money += window.enemies[state.enemyIndex].reward;
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

      if (state.levelUp) {
        finish(`${message} ${state.message} Otrzymujesz nagrodę: ${state.reward} $.`, "success");
      } else {
        refs.actions.classList.remove("hidden");
        if (hideAbilitiesAndPotions) {
          refs.abilitiesPanel.classList.remove("hidden");
          refs.potionsPanel.classList.remove("hidden");
        }
        showMessage(`${message} ${state.message} Otrzymujesz ${state.reward} $.`, "success");
      }
    }, 700);
  }

  function attack() {
    if (!canAct()) return;
    const attackResult = window.BattleSystem.attack(state);
    state = attackResult;

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
    const result = window.BattleSystem.useAbility(state, abilityId);
    actionResult(result, result.message);
  }

  function usePotion(potionId) {
    if (!canAct()) return;
    const result = window.BattleSystem.usePotion(state, potionId);
    state = result;
    renderAll();
    showMessage(result.message, "success");
  }

  function handleBattleShortcut(event) {
    if (refs.battleScreen.classList.contains("hidden") || event.repeat) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;

    const key = event.key.toLowerCase();
    const classAbilities = window.classAbilities?.[window.player.classId]?.active || [];
    const keys = ["q", "w", "e", "r"];
    const abilityIndex = keys.indexOf(key);

    if (window.player.classId === "mage") {
      if (abilityIndex < 0 || !classAbilities[abilityIndex]) return;
      event.preventDefault();
      useAbility(classAbilities[abilityIndex].id);
      return;
    }

    if (key === "q") {
      event.preventDefault();
      attack();
      return;
    }
    if (abilityIndex > 0 && classAbilities[abilityIndex - 1]) {
      event.preventDefault();
      useAbility(classAbilities[abilityIndex - 1].id);
    }
  }

  function escape() {
    const result = window.BattleSystem.escape();
    if (!result.allowed) {
      showMessage(result.message, "danger");
      return;
    }

    isTransitioning = true;
    state = { ...state, escaped: true, finished: true };
    renderAll();
    finish(result.message, "warning");
  }

  function closeBattle() {
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
  document.addEventListener("keydown", handleBattleShortcut);
  refs.attackButton.addEventListener("click", attack);
  refs.escapeButton.addEventListener("click", escape);
  refs.backButton.addEventListener("click", closeBattle);
  refs.deathNewGameButton.addEventListener("click", () => {
    refs.battleScreen.classList.add("hidden");
    window.startNewGame();
  });
  refs.deathRestoreButton.addEventListener("click", restoreBeforeBattle);
})();

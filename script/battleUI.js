(function () {
  const mainMenu = document.getElementById("main-menu");
  const battleScreen = document.getElementById("battle-screen");
  const playButton = document.getElementById("play-btn");
  const attackButton = document.getElementById("attack-btn");
  const escapeButton = document.getElementById("escape-btn");
  const backButton = document.getElementById("battle-back-btn");
  const actions = document.getElementById("battle-actions");
  const battleLog = document.getElementById("battle-log");
  const deathPanel = document.getElementById("battle-death-panel");
  const deathNewGameButton = document.getElementById("death-new-game-btn");
  const deathRestoreButton = document.getElementById("death-restore-btn");
  const battleTitle = document.getElementById("battle-title");
  const battleWave = document.getElementById("battle-wave");
  const playerName = document.getElementById("battle-player-name");
  const playerHp = document.getElementById("battle-player-hp");
  const playerHealthBar = document.getElementById("battle-player-health-bar");
  const playerWeapon = document.getElementById("battle-player-weapon");
  const enemyName = document.getElementById("battle-enemy-name");
  const enemyModel = document.getElementById("battle-enemy-model");
  const enemyModelFallback = document.getElementById("enemy-model-fallback");
  const enemyHp = document.getElementById("battle-enemy-hp");
  const enemyHealthBar = document.getElementById("battle-enemy-health-bar");
  const enemyStats = document.getElementById("battle-enemy-stats");
  let state;
  let isTransitioning = false;

  function showMessage(message, type) {
    battleLog.textContent = message;
    battleLog.className = `battle-log ${type || ""}`.trim();
  }

  function setBar(element, value, max) {
    element.style.width = `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
  }

  function formatPlayerAttack(result) {
    let message = result.message;
    if (result.critical) message += " KRYTYK!";
    if (result.armorReduced > 0) message += ` Pancerz zmniejszył obrażenia o ${result.armorReduced}.`;
    if (result.heal > 0) message += ` Odzyskujesz ${result.heal} HP.`;
    if (result.secondWindHeal > 0) message += ` Drugie Tchnienie przywraca ${result.secondWindHeal} HP.`;
    return message;
  }

  function formatEnemyAttack(result) {
    let message = result.message;
    if (result.enemyCritical) message += " KRYTYK!";
    if (result.enemyArmorReduced > 0) message += ` Twój pancerz zmniejszył obrażenia o ${result.enemyArmorReduced}.`;
    return message;
  }

  function renderEnemyModel(enemy, dead) {
    const modelPath = dead ? enemy.modelDead : enemy.modelAlive;
    enemyModel.alt = dead ? `${enemy.name} — pokonany` : enemy.name;
    enemyModel.onload = () => {
      enemyModel.classList.remove("hidden");
      enemyModelFallback.classList.add("hidden");
    };
    enemyModel.onerror = () => {
      enemyModel.classList.add("hidden");
      enemyModelFallback.classList.remove("hidden");
    };
    enemyModel.src = modelPath;
  }

  function render() {
    const player = window.player;
    const enemy = window.enemies[state.enemyIndex];
    battleTitle.textContent = enemy.name;
    battleWave.textContent = `Fala ${state.currentWave} / ${state.totalWaves}`;
    playerName.textContent = player.nickname || "Gracz";
    playerHp.textContent = `${player.healthPoints} / ${player.maxHealthPoints}`;
    setBar(playerHealthBar, player.healthPoints, player.maxHealthPoints);
    playerWeapon.textContent = `Broń: ${player.weaponName} | ${player.weaponDmg} DMG | Crit: ${player.critChance}% | Pen: ${player.armorPenetration}`;
    enemyName.textContent = enemy.name;
    enemyHp.textContent = `${state.enemyHealth} / ${enemy.health}`;
    setBar(enemyHealthBar, state.enemyHealth, enemy.health);
    enemyStats.textContent = `DMG: ${enemy.damage} | Atak: ${enemy.attackChance}% | Crit: ${enemy.critChance}% | Pancerz: ${enemy.armorPoints} | Pen: ${enemy.armorPenetration}`;
    renderEnemyModel(enemy, state.enemyDefeated === true);
    escapeButton.disabled = player.usedEscape;
  }

  function finish(message, type) {
    actions.classList.add("hidden");
    backButton.classList.remove("hidden");
    showMessage(message, type);
  }

  function showDeathPanel() {
    actions.classList.add("hidden");
    backButton.classList.add("hidden");
    deathPanel.classList.remove("hidden");
    showMessage("Przegrywasz walkę.", "danger");
  }

  function openBattle() {
    window.SaveSystem.captureBattleState();
    state = window.BattleSystem.start(window.player.level);
    mainMenu.classList.add("hidden");
    battleScreen.classList.remove("hidden");
    actions.classList.remove("hidden");
    backButton.classList.add("hidden");
    deathPanel.classList.add("hidden");

    if (state.finished) {
      battleTitle.textContent = "Koniec gry";
      battleWave.textContent = "UKONCZONO";
      finish(state.message, "success");
      return;
    }

    render();
    showMessage("Wybierz akcje.");
  }

  function attack() {
    if (!state || state.finished || isTransitioning) return;
    const attackResult = window.BattleSystem.attack(state);
    state = attackResult;

    if (attackResult.enemyDefeated) {
      window.player.money += window.enemies[state.enemyIndex].reward;
      isTransitioning = true;
      actions.classList.add("hidden");
      render();
      showMessage(`${formatPlayerAttack(attackResult)} Pokonano przeciwnika!`, "success");

      window.setTimeout(() => {
        state = window.BattleSystem.nextWave(state);
        render();
        isTransitioning = false;

        if (state.levelUp) finish(`${formatPlayerAttack(attackResult)} ${state.message} Otrzymujesz nagrodę: ${state.reward} $.`, "success");
        else {
          actions.classList.remove("hidden");
          showMessage(`${formatPlayerAttack(attackResult)} ${state.message} Otrzymujesz ${state.reward} $.`, "success");
        }
      }, 700);
      return;
    }

    const enemyResult = window.BattleSystem.enemyTurn(state);
    state = enemyResult;
    render();

    if (window.player.healthPoints <= 0) {
      showDeathPanel();
      return;
    }

    showMessage(`${formatPlayerAttack(attackResult)} ${formatEnemyAttack(enemyResult)}`);
  }

  function escape() {
    const result = window.BattleSystem.escape();
    if (!result.allowed) {
      showMessage(result.message, "danger");
      return;
    }

    render();
    finish(result.message, "warning");
  }

  function closeBattle() {
    isTransitioning = false;
    battleScreen.classList.add("hidden");
    mainMenu.classList.remove("hidden");
    deathPanel.classList.add("hidden");
    window.SaveSystem.clearBattleState();
    window.refreshMainMenu();
  }

  function restoreBeforeBattle() {
    window.SaveSystem.restoreBattleState();
    closeBattle();
  }

  playButton.addEventListener("click", openBattle);
  attackButton.addEventListener("click", attack);
  escapeButton.addEventListener("click", escape);
  backButton.addEventListener("click", closeBattle);
  deathNewGameButton.addEventListener("click", () => {
    battleScreen.classList.add("hidden");
    window.startNewGame();
  });
  deathRestoreButton.addEventListener("click", restoreBeforeBattle);
})();

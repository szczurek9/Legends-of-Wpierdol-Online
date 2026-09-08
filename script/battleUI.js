(function () {
  const mainMenu = document.getElementById("main-menu");
  const battleScreen = document.getElementById("battle-screen");
  const playButton = document.getElementById("play-btn");
  const attackButton = document.getElementById("attack-btn");
  const escapeButton = document.getElementById("escape-btn");
  const backButton = document.getElementById("battle-back-btn");
  const actions = document.getElementById("battle-actions");
  const battleLog = document.getElementById("battle-log");
  const battleTitle = document.getElementById("battle-title");
  const battleWave = document.getElementById("battle-wave");
  const playerName = document.getElementById("battle-player-name");
  const playerHp = document.getElementById("battle-player-hp");
  const playerHealthBar = document.getElementById("battle-player-health-bar");
  const playerWeapon = document.getElementById("battle-player-weapon");
  const enemyName = document.getElementById("battle-enemy-name");
  const enemyHp = document.getElementById("battle-enemy-hp");
  const enemyHealthBar = document.getElementById("battle-enemy-health-bar");
  const enemyStats = document.getElementById("battle-enemy-stats");
  let state;

  function showMessage(message, type) {
    battleLog.textContent = message;
    battleLog.className = `battle-log ${type || ""}`.trim();
  }

  function setBar(element, value, max) {
    element.style.width = `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
  }

  function render() {
    const player = window.player;
    const enemy = window.enemies[state.enemyIndex];
    battleTitle.textContent = enemy.name;
    battleWave.textContent = `Fala ${state.currentWave} / ${state.totalWaves}`;
    playerName.textContent = player.nickname || "Gracz";
    playerHp.textContent = `${player.healthPoints} / ${player.maxHealthPoints}`;
    setBar(playerHealthBar, player.healthPoints, player.maxHealthPoints);
    playerWeapon.textContent = `Bron: ${player.weaponName} | ${player.weaponDmg} DMG`;
    enemyName.textContent = enemy.name;
    enemyHp.textContent = `${state.enemyHealth} / ${enemy.health}`;
    setBar(enemyHealthBar, state.enemyHealth, enemy.health);
    enemyStats.textContent = `DMG: ${enemy.damage} | Szansa ataku: ${enemy.attackChance}%`;
    escapeButton.disabled = player.usedEscape;
  }

  function finish(message, type) {
    actions.classList.add("hidden");
    backButton.classList.remove("hidden");
    showMessage(message, type);
  }

  function openBattle() {
    state = window.BattleSystem.start(window.player.level);
    mainMenu.classList.add("hidden");
    battleScreen.classList.remove("hidden");
    actions.classList.remove("hidden");
    backButton.classList.add("hidden");

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
    if (!state || state.finished) return;
    const attackResult = window.BattleSystem.attack(state);
    state = attackResult;

    if (attackResult.enemyDefeated) {
      window.player.money += window.enemies[state.enemyIndex].reward;
      state = window.BattleSystem.nextWave(state);
      render();

      if (state.levelUp) finish(`${state.message} Otrzymujesz nagrode: ${state.reward} $.`, "success");
      else showMessage(`${state.message} Otrzymujesz ${state.reward} $.`, "success");
      return;
    }

    const enemyResult = window.BattleSystem.enemyTurn(state);
    state = enemyResult;
    render();

    if (window.player.healthPoints <= 0) {
      finish("Przegrywasz walke.", "danger");
      return;
    }

    showMessage(`${attackResult.message} ${enemyResult.message}`);
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
    battleScreen.classList.add("hidden");
    mainMenu.classList.remove("hidden");
    window.refreshMainMenu();
  }

  playButton.addEventListener("click", openBattle);
  attackButton.addEventListener("click", attack);
  escapeButton.addEventListener("click", escape);
  backButton.addEventListener("click", closeBattle);
})();

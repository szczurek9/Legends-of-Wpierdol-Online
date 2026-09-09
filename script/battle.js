(function () {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function roll100() {
    return Math.floor(Math.random() * 100);
  }

  function updateBattleState(state) {
    window.battle.currentWave = state.currentWave;
    window.battle.totalWaves = state.totalWaves;
    window.battle.enemyHealth = state.enemyHealth;
    window.battle.enemyIndex = state.enemyIndex;
  }

  window.BattleSystem = {
    start(level) {
      const enemyIndex = level - 1;
      const enemy = window.enemies[enemyIndex];

      if (!enemy) return { finished: true, message: "Ukończyłeś wszystkie dostepne poziomy gry!" };

      const state = { finished: false, enemyIndex, currentWave: 1, totalWaves: enemy.waves, enemyHealth: enemy.health };
      updateBattleState(state);
      return state;
    },

    attack(state) {
      const player = window.player;
      const enemy = window.enemies[state.enemyIndex];
      const finalDodge = Math.max(0, enemy.dodgeChance - player.bonusAccuracy);

      if (roll100() < finalDodge) {
        return { ...state, enemyDefeated: false, damage: 0, heal: 0, message: "Przeciwnik uniknął twojego ataku!" };
      }

      const damage = Math.min(player.weaponDmg, state.enemyHealth);
      const nextHealth = state.enemyHealth - damage;
      const heal = Math.floor((damage * player.lifesteal) / 100);
      player.healthPoints = clamp(player.healthPoints + heal, 0, player.maxHealthPoints);

      return { ...state, enemyHealth: nextHealth, enemyDefeated: nextHealth <= 0, damage, heal, message: `Zadałeś ${damage} obrazeń!` };
    },

    enemyTurn(state) {
      const player = window.player;
      const enemy = window.enemies[state.enemyIndex];

      if (roll100() < enemy.attackChance) {
        player.healthPoints = clamp(player.healthPoints - enemy.damage, 0, player.maxHealthPoints);
        return { ...state, enemyHit: true, message: `Przeciwnik zadał Ci ${enemy.damage} obrazeń!` };
      }

      return { ...state, enemyHit: false, message: "Przeciwnik nie trafił!" };
    },

    nextWave(state) {
      const enemy = window.enemies[state.enemyIndex];
      const nextWave = state.currentWave + 1;

      if (nextWave > state.totalWaves) {
        window.player.level += 1;
        window.player.usedEscape = false;
        return { ...state, finished: true, levelUp: true, reward: enemy.reward, message: `Awansujesz na poziom ${window.player.level}!` };
      }

      const nextState = { ...state, currentWave: nextWave, enemyHealth: enemy.health, levelUp: false, reward: enemy.reward, message: "Przeciwnik pokonany! Nadchodzi następna fala." };
      updateBattleState(nextState);
      return nextState;
    },

    escape() {
      const player = window.player;
      if (player.usedEscape) return { allowed: false, message: "Możesz uciec tylko raz na poziom!" };

      const heal = Math.floor(player.maxHealthPoints / 2);
      player.healthPoints = clamp(player.healthPoints + heal, 0, player.maxHealthPoints);
      player.usedEscape = true;
      return { allowed: true, message: `Uciekasz z pola walki! Odzyskano ${heal} HP.` };
    },
  };
})();

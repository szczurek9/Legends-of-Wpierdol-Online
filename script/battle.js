(function () {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function roll100() {
    return Math.floor(Math.random() * 100);
  }

  function calculatePhysicalDamage(rawDamage, armor, armorPenetration) {
    const effectiveArmor = Math.max(0, armor - armorPenetration);
    const reduction = effectiveArmor / (effectiveArmor + 100);
    const damage = Math.max(1, Math.floor(rawDamage * (1 - reduction)));

    return {
      damage,
      armorReduced: rawDamage - damage,
      effectiveArmor,
    };
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
      const baseAccuracy = enemy.playerAttackChance ?? (100 - enemy.dodgeChance);
      const finalAccuracy = Math.min(100, baseAccuracy + player.bonusAccuracy);

      if (roll100() >= finalAccuracy) {
        return { ...state, enemyDefeated: false, damage: 0, heal: 0, message: "Przeciwnik uniknął twojego ataku!" };
      }

      const critical = roll100() < player.critChance;
      const rawDamage = critical ? Math.floor(player.weaponDmg * 1.5) : player.weaponDmg;
      const damageResult = calculatePhysicalDamage(
        rawDamage,
        enemy.armorPoints || 0,
        player.armorPenetration,
      );
      const damage = Math.min(damageResult.damage, state.enemyHealth);
      const nextHealth = state.enemyHealth - damage;
      const heal = Math.floor((damage * player.lifesteal) / 100);
      player.healthPoints = clamp(player.healthPoints + heal, 0, player.maxHealthPoints);

      const secondWindHeal = nextHealth <= 0 && player.secondWind
        ? Math.floor(player.maxHealthPoints * 0.25)
        : 0;
      player.healthPoints = clamp(player.healthPoints + secondWindHeal, 0, player.maxHealthPoints);

      return {
        ...state,
        enemyHealth: nextHealth,
        enemyDefeated: nextHealth <= 0,
        damage,
        rawDamage,
        heal,
        secondWindHeal,
        critical,
        armorReduced: damageResult.armorReduced,
        message: `Zadałeś ${damage} obrazeń!`,
      };
    },

    enemyTurn(state) {
      const player = window.player;
      const enemy = window.enemies[state.enemyIndex];

      if (roll100() < enemy.attackChance) {
        const critical = roll100() < enemy.critChance;
        const rawDamage = critical ? Math.floor(enemy.damage * 1.5) : enemy.damage;
        const damageResult = calculatePhysicalDamage(
          rawDamage,
          player.armorPoints,
          enemy.armorPenetration || 0,
        );
        player.healthPoints = clamp(player.healthPoints - damageResult.damage, 0, player.maxHealthPoints);
        return {
          ...state,
          enemyHit: true,
          enemyCritical: critical,
          enemyRawDamage: rawDamage,
          enemyArmorReduced: damageResult.armorReduced,
          enemyFinalDamage: damageResult.damage,
          message: `Przeciwnik zadał Ci ${damageResult.damage} obrażeń!`,
        };
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

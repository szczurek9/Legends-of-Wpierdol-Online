// Creates and advances the battle "state" object that flows through
// BattleSystem/BattleActions. Depends on window.BattleMath being loaded first.
(function () {
  function startState(enemy, enemyIndex) {
    return {
      finished: false,
      enemyIndex,
      currentWave: 1,
      totalWaves: enemy.waves,
      enemyHealth: enemy.health,
      enemyMaxHealth: enemy.health,
      enemyDamage: enemy.damage,
      enemyArmor: enemy.armorPoints || 0,
      enemyMagicResistance: enemy.magicResistance || 0,
      enemyAttackChance: enemy.attackChance,
      cooldowns: {},
      effects: {},
      senMode: "boei",
      senAttackCount: 0,
      weaponAttackCount: 0,
      yamatoJudgementStacks: 0,
      jhinPool: 0,
      jhinAttackCount: 0,
      rage: 0,
      guaranteedCrit: false,
      enemyDefeated: false,
    };
  }

  function setCooldown(state, ability, value) {
    const cooldowns = { ...state.cooldowns, [ability.id]: value };
    return { ...state, cooldowns };
  }

  // Ticks all ability cooldowns down by one, and decrements/expires timed
  // battle effects. A handful of "counter" style keys (bastion armor stacks,
  // accuracy modifiers) are managed by their own duration keys instead of
  // decrementing directly, so they're skipped here.
  function tickCooldowns(state) {
    const cooldowns = Object.fromEntries(Object.entries(state.cooldowns).map(([id, value]) => [id, Math.max(0, value - 1)]));
    const effects = { ...state.effects };

    Object.keys(effects).forEach((key) => {
      if (["bastionArmor", "bastionTurns", "accuracy", "enemyAccuracy", "accuracyTurns", "enemyAccuracyTurns"].includes(key)) return;
      effects[key] -= 1;
      if (effects[key] <= 0) {
        if (key === "potionLifesteal") window.player.lifesteal = Math.max(0, window.player.lifesteal - 10);
        delete effects[key];
      }
    });

    if (effects.bastionTurns) {
      effects.bastionArmor = (effects.bastionArmor || 0) + 2;
      effects.bastionTurns -= 1;
      if (effects.bastionTurns <= 0) {
        delete effects.bastionTurns;
        delete effects.bastionArmor;
      }
    }

    ["accuracy", "enemyAccuracy"].forEach((key) => {
      const durationKey = `${key}Turns`;
      if (!effects[durationKey]) return;
      effects[durationKey] -= 1;
      if (effects[durationKey] <= 0) {
        delete effects[key];
        delete effects[durationKey];
      }
    });

    return { ...state, cooldowns, effects };
  }

  window.BattleState = {
    startState,
    setCooldown,
    tickCooldowns,
  };
})();

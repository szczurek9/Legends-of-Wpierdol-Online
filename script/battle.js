// Public battle interface consumed by battleUI.js. The actual math, state
// handling, and turn logic live in battleMath.js / battleState.js /
// battleActions.js (loaded before this file); this just assembles them.
(function () {
  const M = window.BattleMath;
  const S = window.BattleState;
  const A = window.BattleActions;

  window.BattleSystem = {
    getEffectiveAbilityPower: M.effectiveAbilityPower,

    start(level) {
      const enemyIndex = level - 1;
      const enemy = window.enemies[enemyIndex];
      if (!enemy) return { finished: true, message: "Ukończyłeś wszystkie dostępne poziomy gry!" };
      const state = S.startState(enemy, enemyIndex);
      S.updateBattleState(state);
      return state;
    },

    attack(state) {
      const next = A.playerAttack(state, { forceCritical: state.guaranteedCrit ? (state.guaranteedCrit === "double" ? "double" : true) : false });
      next.guaranteedCrit = false;
      return next.enemyDefeated ? next : A.finishPlayerAction(next, next.message);
    },

    useAbility: A.useAbility,
    usePotion: A.usePotion,
    enemyTurn: A.enemyTurn,

    nextWave(state) {
      const enemy = window.enemies[state.enemyIndex];
      const nextWave = state.currentWave + 1;

      if (nextWave > state.totalWaves) {
        window.player.level += 1;
        window.player.skinPoints += 1;
        window.player.usedEscape = false;
        return {
          ...state,
          finished: true,
          levelUp: true,
          reward: enemy.reward,
          skinPointReward: 1,
          message: `Awansujesz na poziom ${window.player.level}! Otrzymujesz 1 SP.`,
        };
      }

      const scale = enemy.isBoss ? 1.25 : 1;
      const next = {
        ...state,
        currentWave: nextWave,
        enemyHealth: Math.floor(state.enemyMaxHealth * scale),
        enemyMaxHealth: Math.floor(state.enemyMaxHealth * scale),
        enemyDamage: enemy.isBoss ? Math.floor(state.enemyDamage * 1.15) : state.enemyDamage,
        enemyDefeated: false,
        reward: enemy.reward,
        message: "Przeciwnik pokonany! Nadchodzi następna fala.",
      };
      S.updateBattleState(next);
      return next;
    },

    escape() {
      const player = window.player;
      if (player.usedEscape) return { allowed: false, message: "Możesz uciec tylko raz na poziom!" };

      const hp = Math.floor(player.maxHealthPoints / 2);
      const mana = Math.floor(player.maxManaPoints / 2);
      player.healthPoints = M.clamp(player.healthPoints + hp, 0, player.maxHealthPoints);
      player.manaPoints = M.clamp(player.manaPoints + mana, 0, player.maxManaPoints);
      player.usedEscape = true;
      return { allowed: true, message: `Uciekasz! Odzyskano ${hp} HP i ${mana} many.` };
    },
  };
})();

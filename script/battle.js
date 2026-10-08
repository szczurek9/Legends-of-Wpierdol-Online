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
      return state;
    },

    // Arena: bot z Arena.buildBot(), enemyIndex = -1.
    startArena(bot) {
      return { ...S.startState(bot, -1), arena: true, arenaTurns: 0, arenaDamageTaken: 0 };
    },

    attack(state) {
      const focused = Boolean(state.focusMark);
      const next = A.playerAttack(state, { forceCritical: Boolean(state.guaranteedCrit), focusStrike: focused });
      next.guaranteedCrit = false;
      next.focusMark = false;
      return next.enemyDefeated ? { ...next, arenaTurns: (next.arenaTurns || 0) + 1 } : A.finishPlayerAction(next, next.message);
    },

    useAbility: A.useAbility,
    useWeaponAbility: A.useWeaponAbility,
    usePotion: A.usePotion,
    enemyTurn: A.enemyTurn,

    nextWave(state) {
      const enemy = S.enemyOf(state);
      const nextWave = state.currentWave + 1;

      if (nextWave > state.totalWaves) {
        if (state.arena) {
          return { ...state, finished: true, arenaWon: true, reward: 0, message: "Arena ukończona!" };
        }
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

      const hpScale = enemy.isBoss ? (enemy.hpScale ?? 1.25) : 1;
      const dmgScale = enemy.isBoss ? (enemy.dmgScale ?? 1.15) : 1;
      const next = {
        ...state,
        currentWave: nextWave,
        enemyHealth: Math.floor(state.enemyMaxHealth * hpScale),
        enemyMaxHealth: Math.floor(state.enemyMaxHealth * hpScale),
        enemyDamage: enemy.isBoss ? Math.floor(state.enemyDamage * dmgScale) : state.enemyDamage,
        weaponAttackCount: 0,
        yamatoJudgementStacks: 0,
        jhinPool: 0,
        jhinAttackCount: 0,
        focusMark: false,
        enemyDefeated: false,
        reward: enemy.reward,
        message: "Przeciwnik pokonany! Nadchodzi następna fala.",
      };
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

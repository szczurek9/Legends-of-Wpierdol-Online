// Player/enemy turn resolution and ability/potion effects.
(function () {
  const M = window.BattleMath;
  const S = window.BattleState;

  function playerAttack(state, options = {}) {
    const player = window.player;
    const enemy = window.enemies[state.enemyIndex];
    const accuracyBonus = (state.effects.accuracy || 0) + (state.effects.potionAccuracy || 0);
    const accuracy = M.clamp((enemy.playerAttackChance ?? (100 - enemy.dodgeChance)) + player.bonusAccuracy + accuracyBonus, 0, 100);

    if (M.roll() >= accuracy) {
      const missMessage = "Przeciwnik uniknął twojego ataku!";
      return { ...state, enemyDefeated: false, damage: 0, heal: 0, missed: true, playerMessage: missMessage, message: missMessage };
    }

    let multiplier = 1;
    if (M.classId() === "assassin") multiplier += 0.10;
    if (M.classId() === "samurai") multiplier += 0.15;
    if (M.classId() === "tank" && player.weaponDmg > 500) multiplier -= state.effects.ironTaunt ? 0.20 : 0.25;
    if (state.senMode === "chikara") multiplier += 0.075;

    // Samurai's "Sen no Kata" defensive stance: every third attack while in
    // Bōei mode is a weak (10% damage) strike that also stuns the enemy.
    let senBōeiAttack = false;
    let nextSenAttackCount = state.senAttackCount;
    if (M.classId() === "samurai" && state.senMode === "boei") {
      nextSenAttackCount += 1;
      if (nextSenAttackCount >= 3) {
        senBōeiAttack = true;
        nextSenAttackCount = 0;
      }
    }

    const naturalCritical = M.roll() < player.critChance;
    const critical = Boolean(options.forceCritical) || naturalCritical;
    const superCritical = Boolean(options.forceCritical && naturalCritical);
    if (critical) multiplier *= superCritical ? 2.25 : 1.5;

    const rawDamage = Math.max(1, Math.floor(player.weaponDmg * multiplier * (senBōeiAttack ? 0.1 : 1)));
    const primalReady = M.classId() === "assassin" && player.overkillPool >= state.enemyMaxHealth * 0.5;
    const armorPen = player.armorPenetration;
    const damage = M.physicalDamage(rawDamage, state.enemyArmor * (primalReady ? 0.2 : 1), armorPen);
    const result = M.applyDamageToEnemy(state, damage);
    const heal = M.damageHeal(result.dealt, false);

    const overkillHeal = M.classId() === "assassin" && player.overkillPool > 0
      ? Math.floor(player.overkillPool * (5 + Math.floor(player.armorPenetration / 0.7) + Math.floor(player.armorPoints / 0.8)) / 100)
      : 0;
    if (overkillHeal > 0) player.healthPoints = M.clamp(player.healthPoints + overkillHeal, 0, player.maxHealthPoints);
    if (primalReady) player.overkillPool = 0;

    const playerMessage = `Zadałeś ${result.dealt} obrażeń!`;
    const nextState = {
      ...result.state,
      senAttackCount: nextSenAttackCount,
      damage: result.dealt,
      rawDamage,
      heal: heal + overkillHeal,
      critical,
      superCritical,
      overkill: result.overkill,
      overkillArmorBreak: primalReady,
      playerMessage,
      message: playerMessage,
    };
    if (senBōeiAttack) nextState.effects = { ...nextState.effects, stun: 1 };
    return nextState;
  }

  function enemyTurn(state) {
    const player = window.player;
    const enemy = window.enemies[state.enemyIndex];
    if (state.enemyDefeated) return state;

    let next = state;
    let effectMessage = "";

    if (state.effects.vines > 0) {
      const vineDamage = M.magicDamage(10 + M.effectiveAbilityPower() * 0.10, state.enemyMagicResistance, player.magicPenetration);
      const vineResult = M.applyDamageToEnemy(next, vineDamage);
      next = vineResult.state;
      effectMessage = ` Pnącza zadają ${vineResult.dealt} magicznych obrażeń.`;
      if (next.enemyDefeated) return { ...next, enemyHit: false, message: effectMessage.trim() };
    }

    if (next.effects.stun > 0) {
      const stunMessage = `Przeciwnik jest ogłuszony!${effectMessage}`;
      return { ...next, enemyHit: false, enemyMessage: stunMessage, message: stunMessage };
    }

    const chance = M.clamp((next.enemyAttackChance || enemy.attackChance) + (next.effects.enemyAccuracy || 0) - player.bonusDodge, 0, 100);
    if (M.roll() >= chance) {
      const missMessage = `Przeciwnik nie trafił!${effectMessage}`;
      return { ...next, enemyHit: false, enemyMessage: missMessage, message: missMessage };
    }

    const critical = M.roll() < enemy.critChance;
    let rawDamage = critical ? Math.floor(next.enemyDamage * 1.5) : next.enemyDamage;
    if (next.effects.mushin) rawDamage = Math.floor(rawDamage * 0.7);
    if (next.senMode === "chikara") rawDamage = Math.floor(rawDamage * 1.045);

    const baseArmor = Math.min(player.armorPoints, player.armorCap) + player.bonusArmor + (next.effects.rageArmor || 0);
    const armor = baseArmor * (1 + (next.effects.bastionArmor || 0) / 100);
    const unmitigatedDamage = M.physicalDamage(rawDamage, armor, enemy.armorPenetration || 0);

    // "Deadly Mirror" blocks a fraction of the hit and reflects it back; if
    // the unmitigated hit would have been fatal, it blocks almost all of it
    // and reflects a smaller share, at the cost of consuming the effect.
    const mirrorActive = Boolean(next.effects.mirror);
    const mirrorFatal = mirrorActive && unmitigatedDamage >= player.healthPoints;
    const blockedDamage = mirrorFatal ? Math.floor(unmitigatedDamage * 0.99) : mirrorActive ? Math.floor(unmitigatedDamage * 0.10) : 0;
    const finalDamage = Math.max(1, unmitigatedDamage - blockedDamage);
    player.healthPoints = M.clamp(player.healthPoints - finalDamage, 0, player.maxHealthPoints);

    const rage = next.rage + finalDamage;
    const enemyMessage = `Przeciwnik zadał Ci ${finalDamage} obrażeń!${effectMessage}`;
    let nextState = {
      ...next,
      enemyHit: true,
      enemyCritical: critical,
      enemyRawDamage: rawDamage,
      enemyFinalDamage: finalDamage,
      reflected: 0,
      rage,
      enemyMessage,
      message: enemyMessage,
    };

    if (mirrorActive) {
      const reflected = Math.floor(blockedDamage * (mirrorFatal ? 0.05 : 0.20));
      nextState.enemyHealth = Math.max(0, nextState.enemyHealth - reflected);
      nextState.enemyDefeated = nextState.enemyHealth <= 0;
      nextState.reflected = reflected;
      if (mirrorFatal) player.healthPoints = M.clamp(player.healthPoints + Math.floor(blockedDamage * 0.15), 0, player.maxHealthPoints);
      delete nextState.effects.mirror;
      delete nextState.effects.mirrorFatal;
    }

    // Tank's passive: once accumulated rage crosses a threshold, it
    // automatically detonates for bonus true-ish damage and self-heal.
    if (M.classId() === "tank" && rage >= player.weaponDmg * 1.5) {
      const rageDamage = M.physicalDamage(rage * 0.70, nextState.enemyArmor, player.armorPenetration);
      nextState.enemyHealth = Math.max(0, nextState.enemyHealth - rageDamage);
      player.healthPoints = M.clamp(player.healthPoints + Math.floor(rage * 0.35), 0, player.maxHealthPoints);
      nextState.effects.rageArmor = Math.floor(rage * 0.0005);
      nextState.rage = 0;
      nextState.enemyDefeated = nextState.enemyHealth <= 0;
      nextState.message += ` Skumulowany Gniew automatycznie zadaje ${rageDamage} obrażeń i leczy ${Math.floor(rage * 0.35)} HP.`;
    }
    if (next.effects.rageArmor) delete nextState.effects.rageArmor;
    return nextState;
  }

  // Wraps up a player action (basic attack or ability): records spell-cast
  // stacks if relevant, regenerates mana, lets the enemy respond, ticks
  // cooldowns/effects, and applies the ability's own cooldown if any.
  function finishPlayerAction(state, message, cooldownAbility, isSpell = false) {
    let next = { ...state, message };
    if (isSpell) M.recordSpellCast();
    const manaRestored = M.regenMana();
    next = enemyTurn(next);
    next = S.tickCooldowns(next);
    next.manaRestored = manaRestored;
    if (cooldownAbility) next = S.setCooldown(next, cooldownAbility, cooldownAbility.cooldown || 0);
    return next;
  }

  function useAbility(state, abilityId) {
    const ability = M.abilitiesForPlayer().find((item) => item.id === abilityId);
    if (!ability) return { ...state, message: "Nieznana umiejętność." };
    if (state.cooldowns[ability.id] > 0) return { ...state, message: `Umiejętność gotowa za ${state.cooldowns[ability.id]} tur.` };

    if (ability.id === "senNoKata") {
      const mode = state.senMode === "boei" ? "chikara" : "boei";
      return { ...state, senMode: mode, message: `Sen no Kata: ${mode === "boei" ? "Bōei" : "Chikara"}.` };
    }

    if (!M.payMana(window.player, ability.cost)) return { ...state, message: "Za mało many." };

    let next = state;
    let message = `${ability.name} aktywowane.`;
    const ap = M.effectiveAbilityPower();

    if (ability.id === "primalStrike") {
      next = { ...state, guaranteedCrit: true };
    } else if (ability.id === "undodgeableSpeed") {
      next = { ...state, effects: { ...state.effects, accuracy: 25, accuracyTurns: 3, enemyAccuracy: -30, enemyAccuracyTurns: 3 } };
    } else if (ability.id === "slayerOfTheSlowest") {
      const enemy = window.enemies[state.enemyIndex];
      const accuracy = (enemy.playerAttackChance || 0) + window.player.bonusAccuracy + (state.effects.accuracy || 0);
      if (accuracy <= state.enemyAttackChance) {
        window.player.manaPoints += ability.cost;
        return { ...state, message: "Twoja celność nie jest większa od celności wroga." };
      }
      const damage = M.magicDamage(state.enemyMaxHealth * (0.01 + (window.player.weaponDmg / 750) * 0.008), state.enemyMagicResistance, window.player.magicPenetration);
      const result = M.applyDamageToEnemy(state, damage);
      next = result.state;
      message = `Slayer of the Slowest zadaje ${result.dealt} magicznych obrażeń.`;
      M.damageHeal(result.dealt, true);
    } else if (ability.id === "stormBreeze" || ability.id === "starStrike") {
      const raw = ability.id === "stormBreeze" ? 15 + ap * 0.25 : 60 + ap * 0.9;
      const result = M.applyDamageToEnemy(state, M.magicDamage(raw, state.enemyMagicResistance, window.player.magicPenetration));
      next = result.state;
      message = `${ability.name} zadaje ${result.dealt} magicznych obrażeń.`;
      M.damageHeal(result.dealt, true);
    } else if (ability.id === "deadlyVines") {
      next = { ...state, effects: { ...state.effects, stun: 3, vines: 3 } };
    } else if (ability.id === "deadlyMirror") {
      next = { ...state, effects: { ...state.effects, mirror: true, mirrorFatal: state.enemyHealth <= window.player.maxHealthPoints } };
    } else if (ability.id === "stoneBastion") {
      next = { ...state, effects: { ...state.effects, stun: 2, bastionTurns: 5, bastionArmor: 0 } };
    } else if (ability.id === "accumulatedRage") {
      const damage = M.magicDamage(state.rage * 0.25, state.enemyMagicResistance, window.player.magicPenetration);
      const result = M.applyDamageToEnemy(state, damage);
      next = result.state;
      window.player.healthPoints = M.clamp(window.player.healthPoints + Math.floor(state.rage * 0.3), 0, window.player.maxHealthPoints);
      next.rage = 0;
      message = `Skumulowany Gniew zadaje ${result.dealt} magicznych obrażeń.`;
    } else if (ability.id === "ironTaunt") {
      next = { ...state, effects: { ...state.effects, ironTaunt: 2, accuracy: 25, accuracyTurns: 2 } };
    } else if (ability.id === "mushin") {
      const heal = Math.floor(window.player.maxHealthPoints * (0.02 + ap * 0.005));
      window.player.healthPoints = M.clamp(window.player.healthPoints + heal, 0, window.player.maxHealthPoints);
      next = { ...state, effects: { ...state.effects, mushin: true } };
      message = `Mushin przywraca ${heal} HP.`;
    } else if (ability.id === "kōgeki") {
      next = playerAttack(state);
      if (!next.missed && !next.enemyDefeated) {
        const bonus = M.magicDamage(window.player.weaponDmg * 0.5, state.enemyMagicResistance, window.player.magicPenetration);
        const result = M.applyDamageToEnemy(next, bonus);
        next = result.state;
        M.damageHeal(result.dealt, true);
        message = `Kōgeki zadaje łącznie obrażenia fizyczne i ${result.dealt} magicznych.`;
      } else if (next.missed) {
        message = "Kōgeki nie trafiło.";
      }
    }

    return finishPlayerAction(next, message, ability, true);
  }

  function usePotion(state, potionId) {
    const index = window.player.potionInventory.indexOf(potionId);
    const potion = window.shopPotions?.find((item) => item.id === potionId);
    if (index < 0 || !potion) return { ...state, message: "Nie posiadasz tej mikstury." };

    window.player.potionInventory.splice(index, 1);

    if (potion.effect === "healthPotion") {
      const heal = Math.min(250, potion.value + Math.floor(window.player.maxHealthPoints * 0.07));
      window.player.healthPoints = M.clamp(window.player.healthPoints + heal, 0, window.player.maxHealthPoints);
      return { ...state, potionUsed: true, message: `Mikstura leczy ${heal} HP.` };
    }

    const key = potion.effect === "accuracyPotion" ? "potionAccuracy" : "potionLifesteal";
    if (key === "potionLifesteal") window.player.lifesteal += potion.value;
    return { ...state, effects: { ...state.effects, [key]: potion.duration }, potionUsed: true, message: `${potion.name} aktywowany na ${potion.duration} tur.` };
  }

  window.BattleActions = {
    playerAttack,
    enemyTurn,
    finishPlayerAction,
    useAbility,
    usePotion,
  };
})();

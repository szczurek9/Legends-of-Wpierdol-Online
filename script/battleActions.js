// Player/enemy turn resolution and ability/potion effects.
(function () {
  const M = window.BattleMath;
  const S = window.BattleState;

  function playerAttack(state, options = {}) {
    const player = window.player;
    const enemy = window.enemies[state.enemyIndex];
    const accuracyBonus = (state.effects.accuracy || 0) + (state.effects.potionAccuracy || 0);
    const accuracy = M.clamp((enemy.playerAttackChance ?? (100 - enemy.dodgeChance)) + player.bonusAccuracy + accuracyBonus, 0, 100);
    const nextWeaponAttackCount = (state.weaponAttackCount || 0) + 1;
    const fourthJhinAttack = player.weaponId === "jhinPistol" && nextWeaponAttackCount % 4 === 0;
    const nextJhinPool = player.weaponId === "jhinPistol" && fourthJhinAttack
      ? (state.jhinPool || 0) + Math.floor(44 + player.ad * 0.044)
      : state.jhinPool || 0;
    const nextYamatoStacks = player.weaponId === "yamato" && nextWeaponAttackCount % 6 === 0
      ? (state.yamatoJudgementStacks || 0) + 1
      : state.yamatoJudgementStacks || 0;
    const equippedAd = (player.adItemInventory || []).filter((item) => item.equipped);
    const hasAdItem = (id) => equippedAd.some((item) => item.id === id);
    const snakePoisonAttack = hasAdItem("snakeFang") && nextWeaponAttackCount % 5 === 0;

    if (!fourthJhinAttack && M.roll() >= accuracy) {
      const missMessage = "Przeciwnik uniknął twojego ataku!";
      return { ...state, enemyDefeated: false, heal: 0, missed: true, playerMessage: missMessage, message: missMessage };
    }

    let multiplier = 1;
    if (M.classId() === "assassin") multiplier += 0.10;
    if (M.classId() === "samurai") multiplier += 0.15;
    const weaponDamage = Math.max(1, Math.floor((player.weaponBaseDamage || player.weaponDmg) + player.ad * (player.weaponAdScaling || 0)));
    if (M.classId() === "tank" && weaponDamage > 500) multiplier -= state.effects.ironTaunt ? 0.20 : 0.25;
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
    const jhinFourCrit = player.weaponId === "jhinPistol" && M.roll() < 4;
    const critical = Boolean(options.forceCritical) || naturalCritical || jhinFourCrit;
    const superCritical = Boolean(options.forceCritical && naturalCritical);
    if (critical) {
      const baseCritMultiplier = M.classId() === "samurai" ? 1.2 : 1.5;
      multiplier *= jhinFourCrit ? 4 : (options.critMultiplierOverride ?? (superCritical ? 2.25 : baseCritMultiplier));
    }
    if (hasAdItem("shadowArrows") && critical && nextWeaponAttackCount % 2 === 0) multiplier *= 1.8;
    if (hasAdItem("assassinCloakAd") && state.enemyHealth <= state.enemyMaxHealth * 0.30) multiplier *= 1.2;

    const wolfCount = equippedAd.filter((item) => item.id === "wolfGrip").length;
    const rawDamage = Math.max(1, Math.floor((weaponDamage * multiplier + wolfCount * (10 + player.ad * 0.10)) * (senBōeiAttack ? 0.1 : 1)));
    let extraMagicDamage = 0;
    if (player.weaponId === "jhinPistol" && fourthJhinAttack) extraMagicDamage = Math.floor(player.ad * 0.44 * (critical ? 1.2 : 1));
    if (player.weaponId === "yamato") extraMagicDamage = Math.floor(150 + player.abilityPower * 0.60);
    const primalReady = M.classId() === "assassin" && player.overkillPool >= state.enemyMaxHealth * 0.5;
    const armorPen = player.armorPenetration;
    const damage = M.physicalDamage(rawDamage, state.enemyArmor * (primalReady ? 0.2 : 1), armorPen, player.armorPenetrationPercent || 0);
    let result = M.applyDamageToEnemy(state, damage);
    if (hasAdItem("nightPower") && nextWeaponAttackCount % 5 === 0 && !result.state.enemyDefeated) {
      const trueDamage = Math.floor(10 + player.ad * 0.10);
      const trueResult = M.applyDamageToEnemy(result.state, trueDamage);
      result = { ...trueResult, dealt: result.dealt + trueResult.dealt, overkill: result.overkill + trueResult.overkill };
    }
    if (extraMagicDamage > 0 && !result.state.enemyDefeated) {
      const magicResult = M.applyDamageToEnemy(result.state, M.magicDamage(extraMagicDamage, result.state.enemyMagicResistance, player.magicPenetration));
      result = { ...magicResult, dealt: result.dealt + magicResult.dealt, overkill: result.overkill + magicResult.overkill };
    }
    const heal = M.damageHeal(result.dealt, false);

    const overkillHeal = M.classId() === "assassin" && player.overkillPool > 0
      ? Math.floor(player.overkillPool * (5 + Math.floor(player.armorPenetration / 0.7) + Math.floor(player.armorPoints / 0.8)) / 100)
      : 0;
    if (overkillHeal > 0) player.healthPoints = M.clamp(player.healthPoints + overkillHeal, 0, player.maxHealthPoints);
    if (primalReady) player.overkillPool = 0;

    const playerMessage = `Zadałeś ${result.dealt} obrażeń!`;
    const nextState = {
      ...result.state,
      weaponAttackCount: nextWeaponAttackCount,
      jhinPool: nextJhinPool,
      yamatoJudgementStacks: nextYamatoStacks,
      effects: snakePoisonAttack ? { ...result.state.effects, poison: 2 } : result.state.effects,
      senAttackCount: nextSenAttackCount,
      heal: heal + overkillHeal,
      critical,
      superCritical,
      overkill: result.overkill,
      overkillArmorBreak: primalReady,
      playerMessage: `${playerMessage}${fourthJhinAttack ? " Czwarty atak Jhina!" : ""}`,
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

    if (state.effects.poison > 0) {
      const poisonDamage = M.magicDamage(30 + player.ad * 0.25, state.enemyMagicResistance, player.magicPenetration);
      const poisonResult = M.applyDamageToEnemy(next, poisonDamage);
      next = poisonResult.state;
      effectMessage += ` Zatrucie zadaje ${poisonResult.dealt} magicznych obrażeń.`;
      if (next.enemyDefeated) return { ...next, enemyMessage: effectMessage.trim(), message: effectMessage.trim() };
    }
    if (state.effects.vines > 0) {
      const vineDamage = M.magicDamage(10 + M.effectiveAbilityPower() * 0.10, state.enemyMagicResistance, player.magicPenetration);
      const vineResult = M.applyDamageToEnemy(next, vineDamage);
      next = vineResult.state;
      effectMessage = ` Pnącza zadają ${vineResult.dealt} magicznych obrażeń.`;
      if (next.enemyDefeated) return { ...next, message: effectMessage.trim() };
    }

    if (next.effects.stun > 0) {
      const stunMessage = `Przeciwnik jest ogłuszony!${effectMessage}`;
      return { ...next, enemyMessage: stunMessage, message: stunMessage };
    }

    const chance = M.clamp((next.enemyAttackChance || enemy.attackChance) + (next.effects.enemyAccuracy || 0) - player.bonusDodge - (next.effects.poison > 0 ? 10 : 0), 0, 100);
    if (M.roll() >= chance) {
      const missMessage = `Przeciwnik nie trafił!${effectMessage}`;
      return { ...next, enemyMessage: missMessage, message: missMessage };
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
      enemyCritical: critical,
      rage,
      enemyMessage,
      message: enemyMessage,
    };

    if (mirrorActive) {
      const reflected = Math.floor(blockedDamage * (mirrorFatal ? 0.05 : 0.20));
      nextState.enemyHealth = Math.max(0, nextState.enemyHealth - reflected);
      nextState.enemyDefeated = nextState.enemyHealth <= 0;
      if (mirrorFatal) player.healthPoints = M.clamp(player.healthPoints + Math.floor(blockedDamage * 0.15), 0, player.maxHealthPoints);
      delete nextState.effects.mirror;
    }

    // Tank's passive: once accumulated rage crosses a threshold, it
    // automatically detonates for bonus true-ish damage and self-heal.
    if (M.classId() === "tank" && rage >= M.currentWeaponDamage() * 1.5) {
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
  //
  // enemyTurn() always overwrites `.message` with its own text (counter-
  // attack, stun, dodge...). Without keeping the action's own message under
  // its own key, that overwrite would silently erase it whenever the enemy
  // survives — exactly what was happening to every damage-dealing ability.
  function finishPlayerAction(state, message, cooldownAbility, isSpell = false) {
    let next = { ...state, message, actionMessage: message };
    if (isSpell) M.recordSpellCast();
    M.regenMana();
    next = enemyTurn(next);
    next = S.tickCooldowns(next);
    if (cooldownAbility) next = S.setCooldown(next, cooldownAbility, cooldownAbility.cooldown || 0);
    if (!next.enemyDefeated && next.message !== next.actionMessage) {
      next.message = `${next.actionMessage} ${next.message}`;
    }
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
    } else if (ability.id === "overkillRelease") {
      if (window.player.overkillPool <= 0) {
        window.player.manaPoints += ability.cost;
        return { ...state, message: "Nie posiadasz zgromadzonego Overkill." };
      }
      const damage = M.physicalDamage(window.player.overkillPool, state.enemyArmor * 0.2, window.player.armorPenetration);
      const result = M.applyDamageToEnemy(state, damage);
      next = result.state;
      window.player.overkillPool = 0;
      message = `Overkill Release zadaje ${result.dealt} obrażeń, ignorując 80% pancerza wroga.`;
    } else if (ability.id === "stormBreeze" || ability.id === "starStrike") {
      const raw = ability.id === "stormBreeze" ? 15 + ap * 0.25 : 60 + ap * 0.9;
      const result = M.applyDamageToEnemy(state, M.magicDamage(raw, state.enemyMagicResistance, window.player.magicPenetration));
      next = result.state;
      message = `${ability.name} zadaje ${result.dealt} magicznych obrażeń.`;
      M.damageHeal(result.dealt, true);
    } else if (ability.id === "deadlyVines") {
      next = { ...state, effects: { ...state.effects, stun: 3, vines: 3 } };
    } else if (ability.id === "deadlyMirror") {
      next = { ...state, effects: { ...state.effects, mirror: true } };
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
      const healPercent = Math.min(0.10, 0.03 + window.player.armorPenetration * 0.001);
      const heal = Math.floor(window.player.maxHealthPoints * healPercent);
      window.player.healthPoints = M.clamp(window.player.healthPoints + heal, 0, window.player.maxHealthPoints);
      next = { ...state, effects: { ...state.effects, mushin: 3 } };
      message = `Mushin przywraca ${heal} HP.`;
    } else if (ability.id === "kōgeki") {
      next = playerAttack(state, { forceCritical: true, critMultiplierOverride: 1.5 });
      const physicalMessage = next.playerMessage;
      if (next.missed) {
        message = "Kōgeki nie trafiło.";
      } else if (next.enemyDefeated) {
        message = `${physicalMessage} KRYTYK!`;
      } else {
        const bonusPercent = 0.5 + window.player.armorPenetration * 0.002;
      const bonus = M.magicDamage(M.currentWeaponDamage() * bonusPercent, state.enemyMagicResistance, window.player.magicPenetration);
        const result = M.applyDamageToEnemy(next, bonus);
        next = result.state;
        M.damageHeal(result.dealt, true);
        message = `${physicalMessage} KRYTYK! Dodatkowo ${result.dealt} magicznych obrażeń.`;
      }
    }

    return finishPlayerAction(next, message, ability, true);
  }

  function useWeaponAbility(state) {
    const player = window.player;
    if (player.weaponId === "yamato") {
      const threshold = Math.min(100, (player.yamatoExecuteCap || 5) + (state.yamatoJudgementStacks || 0));
      if (state.enemyHealth > state.enemyMaxHealth * threshold / 100) {
        return { ...state, message: `Judgement Cut wymaga celu poniżej ${threshold}% HP.` };
      }
      player.yamatoExecuteCap = Math.min(100, (player.yamatoExecuteCap || 5) + 1);
      return { ...state, enemyHealth: 0, enemyDefeated: true, message: "Judgement Cut! Przeciwnik został natychmiast pokonany!", weaponAbilityUsed: true };
    }
    if (player.weaponId === "jhinPistol") {
      if (!(state.jhinPool > 0)) return { ...state, message: "Pula Pistoletu Jhina jest pusta." };
      const damage = M.applyDamageToEnemy(state, M.physicalDamage(state.jhinPool, state.enemyArmor, player.armorPenetration, player.armorPenetrationPercent || 0));
      return { ...damage.state, jhinPool: 0, weaponAbilityUsed: true, message: `Pistolet Jhina uwalnia ${damage.dealt} obrażeń z puli.` };
    }
    return { ...state, message: "Ta broń nie ma aktywnej umiejętności." };
  }

  function usePotion(state, potionId) {
    const index = window.player.potionInventory.indexOf(potionId);
    const potion = window.shopPotions?.find((item) => item.id === potionId);
    if (index < 0 || !potion) return { ...state, message: "Nie posiadasz tej mikstury." };

    window.player.potionInventory.splice(index, 1);

    if (potion.effect === "healthPotion") {
      const heal = Math.min(250, potion.value + Math.floor(window.player.maxHealthPoints * 0.07));
      window.player.healthPoints = M.clamp(window.player.healthPoints + heal, 0, window.player.maxHealthPoints);
      return { ...state, message: `Mikstura leczy ${heal} HP.` };
    }

    const key = potion.effect === "accuracyPotion" ? "potionAccuracy" : "potionLifesteal";
    if (key === "potionLifesteal") window.player.lifesteal += potion.value;
    return { ...state, effects: { ...state.effects, [key]: potion.duration }, message: `${potion.name} aktywowany na ${potion.duration} tur.` };
  }

  window.BattleActions = {
    playerAttack,
    enemyTurn,
    finishPlayerAction,
    useAbility,
    useWeaponAbility,
    usePotion,
  };
})();

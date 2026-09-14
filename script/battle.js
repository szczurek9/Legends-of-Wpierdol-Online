(function () {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const roll = () => Math.floor(Math.random() * 100);
  const classId = () => window.player.classId || "assassin";
  const abilitiesForPlayer = () => window.classAbilities?.[classId()] || [];
  const magicEffects = (item) => item.effects || window.magicItems?.find((definition) => definition.id === item.id)?.effects || {};
  const isMagicEquipped = (item) => Boolean(item.equipped
    || (window.player.equippedMagicItems || []).includes(item.uid)
    || (window.player.equippedMagicItems || []).includes(item.id));
  const effectiveAbilityPower = () => {
    let power = window.player.abilityPower + window.player.adeptBookStacks;
    const amplifiers = (window.player.magicInventory || []).filter((item) => magicEffects(item).abilityPowerMultiplier && isMagicEquipped(item));
    const multiplier = amplifiers.reduce((total, item) => total + Number(magicEffects(item).abilityPowerMultiplier || 0) / 100, 0);
    power *= 1 + multiplier;
    return power;
  };

  function physicalDamage(rawDamage, armor, penetration) {
    const effectiveArmor = Math.max(0, armor - penetration);
    const reduction = effectiveArmor / (effectiveArmor + 100);
    return Math.max(1, Math.floor(rawDamage * (1 - reduction)));
  }

  function magicDamage(rawDamage, resistance, penetration) {
    const effectiveResistance = Math.max(0, resistance - penetration);
    const reduction = effectiveResistance / (effectiveResistance + 100);
    return Math.max(1, Math.floor(rawDamage * (1 - reduction)));
  }

  function regenMana() {
    const player = window.player;
    const maxMana = Math.max(0, Number(player.maxManaPoints) || 0);
    const bonus = 1 + Math.max(0, Number(player.manaRegenPercent) || 0) / 100;
    const restored = Math.floor(maxMana * 0.03 * bonus);
    player.manaPoints = clamp((Number(player.manaPoints) || 0) + restored, 0, maxMana);
    return restored;
  }

  function startState(enemy, enemyIndex) {
    return {
      finished: false, enemyIndex, currentWave: 1, totalWaves: enemy.waves,
      enemyHealth: enemy.health, enemyMaxHealth: enemy.health, enemyDamage: enemy.damage,
      enemyArmor: enemy.armorPoints || 0, enemyMagicResistance: enemy.magicResistance || 0,
      enemyAttackChance: enemy.attackChance, cooldowns: {}, effects: {}, senMode: "boei",
      senAttackCount: 0, rage: 0, guaranteedCrit: false, enemyDefeated: false,
    };
  }

  function updateBattleState(state) {
    window.battle.currentWave = state.currentWave;
    window.battle.totalWaves = state.totalWaves;
    window.battle.enemyHealth = state.enemyHealth;
    window.battle.enemyIndex = state.enemyIndex;
  }

  function setCooldown(state, ability, value) {
    const cooldowns = { ...state.cooldowns, [ability.id]: value };
    return { ...state, cooldowns };
  }

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
      if (effects.bastionTurns <= 0) { delete effects.bastionTurns; delete effects.bastionArmor; }
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

  function payMana(player, amount) {
    if (player.manaPoints < amount) return false;
    player.manaPoints -= amount;
    return true;
  }

  function recordSpellCast() {
    const player = window.player;
    const hasBook = (player.magicInventory || []).some((item) => magicEffects(item).adeptBook && isMagicEquipped(item));
    if (hasBook) player.adeptBookStacks = Math.min(player.adeptBookStackLimit, player.adeptBookStacks + (classId() === "mage" ? 5 : 3));
  }

  function applyDamageToEnemy(state, damage) {
    const dealt = Math.min(damage, state.enemyHealth);
    const overkill = Math.max(0, damage - state.enemyHealth);
    window.player.overkillPool += overkill;
    const nextHealth = state.enemyHealth - dealt;
    if (nextHealth <= 0) {
      if (classId() === "assassin") window.player.manaPoints = clamp(window.player.manaPoints + Math.floor(window.player.maxManaPoints * 0.10), 0, window.player.maxManaPoints);
      if (window.player.secondWind) {
        window.player.healthPoints = clamp(window.player.healthPoints + Math.floor(window.player.maxHealthPoints * 0.25), 0, window.player.maxHealthPoints);
        window.player.manaPoints = clamp(window.player.manaPoints + Math.floor(window.player.maxManaPoints * 0.25), 0, window.player.maxManaPoints);
      }
    }
    return { state: { ...state, enemyHealth: nextHealth, enemyDefeated: nextHealth <= 0 }, dealt, overkill };
  }

  function damageHeal(amount, magic) {
    const player = window.player;
    const percentage = magic ? player.magicLifesteal : player.lifesteal + (classId() === "assassin" ? player.bonusLifesteal : 0);
    const restored = Math.floor(amount * percentage / 100);
    player.healthPoints = clamp(player.healthPoints + restored, 0, player.maxHealthPoints);
    return restored;
  }

  function playerAttack(state, options = {}) {
    const player = window.player;
    const enemy = window.enemies[state.enemyIndex];
    const accuracyBonus = (state.effects.accuracy || 0) + (state.effects.potionAccuracy || 0);
    const accuracy = clamp((enemy.playerAttackChance ?? (100 - enemy.dodgeChance)) + player.bonusAccuracy + accuracyBonus, 0, 100);
    if (roll() >= accuracy) return { ...state, enemyDefeated: false, damage: 0, heal: 0, missed: true, message: "Przeciwnik uniknął twojego ataku!" };
    let multiplier = 1;
    if (classId() === "assassin") multiplier += 0.10;
    if (classId() === "samurai") multiplier += 0.15;
    if (classId() === "tank" && player.weaponDmg > 500) multiplier -= state.effects.ironTaunt ? 0.20 : 0.25;
    if (state.senMode === "chikara") multiplier += 0.075;
    let senBōeiAttack = false;
    let nextSenAttackCount = state.senAttackCount;
    if (classId() === "samurai" && state.senMode === "boei") {
      nextSenAttackCount += 1;
      if (nextSenAttackCount >= 3) {
        senBōeiAttack = true;
        nextSenAttackCount = 0;
      }
    }
    const naturalCritical = roll() < player.critChance;
    const critical = Boolean(options.forceCritical) || naturalCritical;
    if (critical) multiplier *= options.forceCritical && naturalCritical ? 2.25 : 1.5;
    const rawDamage = Math.max(1, Math.floor(player.weaponDmg * multiplier * (senBōeiAttack ? 0.1 : 1)));
    const primalReady = classId() === "assassin" && player.overkillPool >= state.enemyMaxHealth * 0.5;
    const armorPen = player.armorPenetration;
    const damage = physicalDamage(rawDamage, state.enemyArmor * (primalReady ? 0.2 : 1), armorPen);
    const result = applyDamageToEnemy(state, damage);
    const heal = damageHeal(result.dealt, false);
    const overkillHeal = classId() === "assassin" && player.overkillPool > 0
      ? Math.floor(player.overkillPool * (5 + Math.floor(player.armorPenetration / 0.7) + Math.floor(player.armorPoints / 0.8)) / 100)
      : 0;
    if (overkillHeal > 0) player.healthPoints = clamp(player.healthPoints + overkillHeal, 0, player.maxHealthPoints);
    if (primalReady) player.overkillPool = 0;
    const nextState = { ...result.state, senAttackCount: nextSenAttackCount, damage: result.dealt, rawDamage, heal: heal + overkillHeal, critical, overkill: result.overkill, message: `Zadałeś ${result.dealt} obrażeń!` };
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
      const vineDamage = magicDamage(10 + effectiveAbilityPower() * 0.10, state.enemyMagicResistance, player.magicPenetration);
      const vineResult = applyDamageToEnemy(next, vineDamage);
      next = vineResult.state;
      effectMessage = ` Pnącza zadają ${vineResult.dealt} magicznych obrażeń.`;
      if (next.enemyDefeated) return { ...next, enemyHit: false, message: effectMessage.trim() };
    }
    if (next.effects.stun > 0) return { ...next, enemyHit: false, message: `Przeciwnik jest ogłuszony!${effectMessage}` };
    const chance = clamp((next.enemyAttackChance || enemy.attackChance) + (next.effects.enemyAccuracy || 0) - player.bonusDodge, 0, 100);
    if (roll() >= chance) return { ...next, enemyHit: false, message: `Przeciwnik nie trafił!${effectMessage}` };
    const critical = roll() < enemy.critChance;
    let rawDamage = critical ? Math.floor(next.enemyDamage * 1.5) : next.enemyDamage;
    if (next.effects.mushin) rawDamage = Math.floor(rawDamage * 0.7);
    if (next.senMode === "chikara") rawDamage = Math.floor(rawDamage * 1.045);
    const baseArmor = Math.min(player.armorPoints, player.armorCap) + player.bonusArmor + (next.effects.rageArmor || 0);
    const armor = baseArmor * (1 + (next.effects.bastionArmor || 0) / 100);
    const unmitigatedDamage = physicalDamage(rawDamage, armor, enemy.armorPenetration || 0);
    const mirrorActive = Boolean(next.effects.mirror);
    const mirrorFatal = mirrorActive && unmitigatedDamage >= player.healthPoints;
    const blockedDamage = mirrorFatal ? Math.floor(unmitigatedDamage * 0.99) : mirrorActive ? Math.floor(unmitigatedDamage * 0.10) : 0;
    const finalDamage = Math.max(1, unmitigatedDamage - blockedDamage);
    player.healthPoints = clamp(player.healthPoints - finalDamage, 0, player.maxHealthPoints);
    const rage = next.rage + finalDamage;
    let nextState = { ...next, enemyHit: true, enemyCritical: critical, enemyRawDamage: rawDamage, enemyFinalDamage: finalDamage, reflected: 0, rage, message: `Przeciwnik zadał Ci ${finalDamage} obrażeń!${effectMessage}` };

    if (next.effects.bastionTurns) { delete nextState.effects.bastionTurns; delete nextState.effects.bastionArmor; }
    if (mirrorActive) {
      const reflected = Math.floor(blockedDamage * (mirrorFatal ? 0.05 : 0.20));
      nextState.enemyHealth = Math.max(0, nextState.enemyHealth - reflected);
      nextState.enemyDefeated = nextState.enemyHealth <= 0;
      nextState.reflected = reflected;
      if (mirrorFatal) player.healthPoints = clamp(player.healthPoints + Math.floor(blockedDamage * 0.15), 0, player.maxHealthPoints);
      delete nextState.effects.mirror;
      delete nextState.effects.mirrorFatal;
    }

    if (classId() === "tank" && rage >= player.weaponDmg * 1.5) {
      const rageDamage = physicalDamage(rage * 0.70, nextState.enemyArmor, player.armorPenetration);
      nextState.enemyHealth = Math.max(0, nextState.enemyHealth - rageDamage);
      player.healthPoints = clamp(player.healthPoints + Math.floor(rage * 0.35), 0, player.maxHealthPoints);
      nextState.effects.rageArmor = Math.floor(rage * 0.0005);
      nextState.rage = 0;
      nextState.enemyDefeated = nextState.enemyHealth <= 0;
      nextState.message += ` Skumulowany Gniew automatycznie zadaje ${rageDamage} obrażeń i leczy ${Math.floor(rage * 0.35)} HP.`;
    }
    if (next.effects.rageArmor) delete nextState.effects.rageArmor;
    return nextState;
  }

  function finishPlayerAction(state, message, cooldownAbility, isSpell = false) {
    let next = { ...state, message };
    if (isSpell) recordSpellCast();
    const manaRestored = regenMana();
    next = enemyTurn(next);
    next = tickCooldowns(next);
    next.manaRestored = manaRestored;
    if (cooldownAbility) next = setCooldown(next, cooldownAbility, cooldownAbility.cooldown || 0);
    return next;
  }

  function useAbility(state, abilityId) {
    const ability = abilitiesForPlayer().find((item) => item.id === abilityId);
    if (!ability) return { ...state, message: "Nieznana umiejętność." };
    if (state.cooldowns[ability.id] > 0) return { ...state, message: `Umiejętność gotowa za ${state.cooldowns[ability.id]} tur.` };
    if (ability.id === "senNoKata") {
      const mode = state.senMode === "boei" ? "chikara" : "boei";
      return { ...state, senMode: mode, message: `Sen no Kata: ${mode === "boei" ? "Bōei" : "Chikara"}.` };
    }
    if (!payMana(window.player, ability.cost)) return { ...state, message: "Za mało many." };
    let next = state;
    let message = `${ability.name} aktywowane.`;
    const ap = effectiveAbilityPower();
    if (ability.id === "primalStrike") next = { ...state, guaranteedCrit: true };
    else if (ability.id === "undodgeableSpeed") next = { ...state, effects: { ...state.effects, accuracy: 25, accuracyTurns: 3, enemyAccuracy: -30, enemyAccuracyTurns: 3 } };
    else if (ability.id === "slayerOfTheSlowest") {
      const enemy = window.enemies[state.enemyIndex];
      const accuracy = (enemy.playerAttackChance || 0) + window.player.bonusAccuracy + (state.effects.accuracy || 0);
      if (accuracy <= state.enemyAttackChance) {
        window.player.manaPoints += ability.cost;
        return { ...state, message: "Twoja celność nie jest większa od celności wroga." };
      }
      const damage = magicDamage(state.enemyMaxHealth * (0.01 + (window.player.weaponDmg / 750) * 0.008), state.enemyMagicResistance, window.player.magicPenetration);
      const result = applyDamageToEnemy(state, damage); next = result.state; message = `Slayer of the Slowest zadaje ${result.dealt} magicznych obrażeń.`; damageHeal(result.dealt, true);
    } else if (ability.id === "stormBreeze" || ability.id === "starStrike") {
      const raw = ability.id === "stormBreeze" ? 15 + ap * 0.25 : 60 + ap * 0.9;
      const result = applyDamageToEnemy(state, magicDamage(raw, state.enemyMagicResistance, window.player.magicPenetration)); next = result.state; message = `${ability.name} zadaje ${result.dealt} magicznych obrażeń.`; damageHeal(result.dealt, true);
    } else if (ability.id === "deadlyVines") next = { ...state, effects: { ...state.effects, stun: 3, vines: 3 } };
    else if (ability.id === "deadlyMirror") next = { ...state, effects: { ...state.effects, mirror: true, mirrorFatal: state.enemyHealth <= window.player.maxHealthPoints } };
    else if (ability.id === "stoneBastion") next = { ...state, effects: { ...state.effects, stun: 2, bastionTurns: 5, bastionArmor: 0 } };
    else if (ability.id === "accumulatedRage") {
      const damage = magicDamage(state.rage * 0.25, state.enemyMagicResistance, window.player.magicPenetration); const result = applyDamageToEnemy(state, damage); next = result.state; window.player.healthPoints = clamp(window.player.healthPoints + Math.floor(state.rage * 0.3), 0, window.player.maxHealthPoints); next.rage = 0; message = `Skumulowany Gniew zadaje ${result.dealt} magicznych obrażeń.`;
    } else if (ability.id === "ironTaunt") next = { ...state, effects: { ...state.effects, ironTaunt: 2, accuracy: 25, accuracyTurns: 2 } };
    else if (ability.id === "mushin") { const heal = Math.floor(window.player.maxHealthPoints * (0.02 + ap * 0.005)); window.player.healthPoints = clamp(window.player.healthPoints + heal, 0, window.player.maxHealthPoints); next = { ...state, effects: { ...state.effects, mushin: true } }; message = `Mushin przywraca ${heal} HP.`; }
    else if (ability.id === "kōgeki") {
      next = playerAttack(state);
      if (!next.missed && !next.enemyDefeated) {
        const bonus = magicDamage(window.player.weaponDmg * 0.5, state.enemyMagicResistance, window.player.magicPenetration);
        const result = applyDamageToEnemy(next, bonus); next = result.state; damageHeal(result.dealt, true); message = `Kōgeki zadaje łącznie obrażenia fizyczne i ${result.dealt} magicznych.`;
      } else if (next.missed) message = "Kōgeki nie trafiło.";
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
      window.player.healthPoints = clamp(window.player.healthPoints + heal, 0, window.player.maxHealthPoints);
      return { ...state, potionUsed: true, message: `Mikstura leczy ${heal} HP.` };
    }
    const key = potion.effect === "accuracyPotion" ? "potionAccuracy" : "potionLifesteal";
    if (key === "potionLifesteal") window.player.lifesteal += potion.value;
    return { ...state, effects: { ...state.effects, [key]: potion.duration }, potionUsed: true, message: `${potion.name} aktywowany na ${potion.duration} tur.` };
  }

  window.BattleSystem = {
    getEffectiveAbilityPower: effectiveAbilityPower,
    start(level) {
      const enemyIndex = level - 1; const enemy = window.enemies[enemyIndex];
      if (!enemy) return { finished: true, message: "Ukończyłeś wszystkie dostępne poziomy gry!" };
      const state = startState(enemy, enemyIndex); updateBattleState(state); return state;
    },
    attack(state) {
      const next = playerAttack(state, { forceCritical: state.guaranteedCrit ? (state.guaranteedCrit === "double" ? "double" : true) : false });
      next.guaranteedCrit = false;
      const result = next.enemyDefeated ? next : finishPlayerAction(next, next.message);
      return result;
    },
    useAbility,
    usePotion,
    enemyTurn,
    nextWave(state) {
      const enemy = window.enemies[state.enemyIndex]; const nextWave = state.currentWave + 1;
      if (nextWave > state.totalWaves) { window.player.level += 1; window.player.skinPoints += 1; window.player.usedEscape = false; return { ...state, finished: true, levelUp: true, reward: enemy.reward, skinPointReward: 1, message: `Awansujesz na poziom ${window.player.level}! Otrzymujesz 1 SP.` }; }
      const next = { ...state, currentWave: nextWave, enemyHealth: Math.floor(state.enemyMaxHealth * (enemy.isBoss ? 1.25 : 1)), enemyMaxHealth: Math.floor(state.enemyMaxHealth * (enemy.isBoss ? 1.25 : 1)), enemyDamage: enemy.isBoss ? Math.floor(state.enemyDamage * 1.15) : state.enemyDamage, enemyDefeated: false, reward: enemy.reward, message: "Przeciwnik pokonany! Nadchodzi następna fala." };
      updateBattleState(next); return next;
    },
    escape() { const player = window.player; if (player.usedEscape) return { allowed: false, message: "Możesz uciec tylko raz na poziom!" }; const hp = Math.floor(player.maxHealthPoints / 2); const mana = Math.floor(player.maxManaPoints / 2); player.healthPoints = clamp(player.healthPoints + hp, 0, player.maxHealthPoints); player.manaPoints = clamp(player.manaPoints + mana, 0, player.maxManaPoints); player.usedEscape = true; return { allowed: true, message: `Uciekasz! Odzyskano ${hp} HP i ${mana} many.` }; },
  };
})();

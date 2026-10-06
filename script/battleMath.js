// Low-level combat math and player/magic-item helpers used throughout the
// battle system. No battle "state" object lives here — just pure formulas
// and small helpers that read/write window.player directly.
(function () {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const roll = () => Math.floor(Math.random() * 100);
  const classId = () => window.player.classId || "assassin";
  const abilitiesForPlayer = () => window.classAbilities?.[classId()]?.active || [];

  const magicEffects = (item) => item.effects
    || window.magicItems?.find((definition) => definition.id === item.id)?.effects
    || {};

  const isMagicEquipped = (item) => Boolean(item.equipped
    || (window.player.equippedMagicItems || []).includes(item.uid)
    || (window.player.equippedMagicItems || []).includes(item.id));

  function effectiveAbilityPower() {
    let power = window.player.abilityPower + window.player.adeptBookStacks;
    const amplifiers = (window.player.magicInventory || [])
      .filter((item) => magicEffects(item).abilityPowerMultiplier && isMagicEquipped(item));
    const multiplier = amplifiers.reduce((total, item) => total + Number(magicEffects(item).abilityPowerMultiplier || 0) / 100, 0);
    power *= 1 + multiplier;
    return power;
  }

  function physicalDamage(rawDamage, armor, penetration, penetrationPercent = 0) {
    const percentReducedArmor = armor * (1 - penetrationPercent / 100);
    const effectiveArmor = Math.max(0, percentReducedArmor - penetration);
    const reduction = effectiveArmor / (effectiveArmor + 100);
    return Math.max(1, Math.floor(rawDamage * (1 - reduction)));
  }

  function magicDamage(rawDamage, resistance, penetration) {
    const effectiveResistance = Math.max(0, resistance - penetration);
    const reduction = effectiveResistance / (effectiveResistance + 100);
    return Math.max(1, Math.floor(rawDamage * (1 - reduction)));
  }

  // Mana regen tuning.
  // - Base regen is 3% of the class's *starting* mana (320 mage / 100 others),
  //   NOT of max mana, so mana from items only grows the pool, not the regen.
  // - manaRegenPercent (R) has diminishing returns, like armor: the effective
  //   bonus is REGEN_MAX_BONUS * R / (R + REGEN_HALF_POINT), see manaRegenBonus().
  const REGEN_BASE_RATE = 0.03;
  const REGEN_MAX_BONUS = 3.25;   // asymptote: regen can never exceed base * (1 + 3.25)
  const REGEN_HALF_POINT = 200;   // raw % at which you get half of REGEN_MAX_BONUS

  function baseManaForClass() {
    return classId() === "mage" ? 320 : 100;
  }

  // Returns the effective regen multiplier bonus (e.g. 1.25 = +125%).
  function manaRegenBonus(rawPercent) {
    const raw = Math.max(0, Number(rawPercent) || 0);
    return REGEN_MAX_BONUS * raw / (raw + REGEN_HALF_POINT);
  }

  // Mana restored per turn for a given raw manaRegenPercent (defaults to the player's).
  function manaRegenAmount(rawPercent = window.player.manaRegenPercent) {
    return Math.floor(baseManaForClass() * REGEN_BASE_RATE * (1 + manaRegenBonus(rawPercent)));
  }

  function regenMana() {
    const player = window.player;
    const maxMana = Math.max(0, Number(player.maxManaPoints) || 0);
    const restored = manaRegenAmount(player.manaRegenPercent);
    player.manaPoints = clamp((Number(player.manaPoints) || 0) + restored, 0, maxMana);
    return restored;
  }

  function currentWeaponDamage() {
    const p = window.player;
    return Math.max(1, Math.floor((p.weaponBaseDamage || p.weaponDmg || 0) + (p.ad || 0) * (p.weaponAdScaling || 0)));
  }

  // Looks up the equipped weapon's own data-file entry (for flat bonuses
  // like Yamato's accuracy, rather than duplicating them onto the player
  // object where they'd need manual equip/unequip bookkeeping).
  function currentWeaponData() {
    return (window.shopWeapons || []).find((weapon) => weapon.id === window.player.weaponId) || null;
  }

  function weaponAccuracyBonus() {
    return Number(currentWeaponData()?.accuracyBonus || 0);
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

  function damageHeal(amount, magic) {
    const player = window.player;
    const percentage = magic ? player.magicLifesteal : player.lifesteal + (classId() === "assassin" ? player.bonusLifesteal : 0);
    const restored = Math.floor(amount * percentage / 100);
    player.healthPoints = clamp(player.healthPoints + restored, 0, player.maxHealthPoints);
    return restored;
  }

  // Applies damage to the current enemy, tracking overkill into the
  // assassin's overkill pool and handling the on-kill mana/HP refunds.
  // noOverkill lets a caller opt a specific damage instance out of feeding
  // the overkill pool (Jhin's stored-pool release is explicitly excluded).
  function applyDamageToEnemy(state, damage, options = {}) {
    const dealt = Math.min(damage, state.enemyHealth);
    const overkill = classId() === "assassin" && !options.noOverkill ? Math.max(0, damage - state.enemyHealth) : 0;
    if (overkill > 0) window.player.overkillPool += overkill;
    const nextHealth = state.enemyHealth - dealt;

    if (nextHealth <= 0) {
      if (classId() === "assassin") {
        window.player.manaPoints = clamp(window.player.manaPoints + Math.floor(window.player.maxManaPoints * 0.10), 0, window.player.maxManaPoints);
      }
      if (window.player.secondWind) {
        window.player.healthPoints = clamp(window.player.healthPoints + Math.floor(window.player.maxHealthPoints * 0.25), 0, window.player.maxHealthPoints);
        window.player.manaPoints = clamp(window.player.manaPoints + Math.floor(window.player.maxManaPoints * 0.25), 0, window.player.maxManaPoints);
      }
    }

    return {
      state: { ...state, enemyHealth: nextHealth, enemyDefeated: nextHealth <= 0 },
      dealt,
      overkill,
    };
  }

  window.BattleMath = {
    clamp,
    roll,
    classId,
    abilitiesForPlayer,
    magicEffects,
    isMagicEquipped,
    effectiveAbilityPower,
    physicalDamage,
    magicDamage,
    regenMana,
    manaRegenAmount,
    manaRegenBonus,
    currentWeaponDamage,
    currentWeaponData,
    weaponAccuracyBonus,
    payMana,
    recordSpellCast,
    damageHeal,
    applyDamageToEnemy,
  };
})();

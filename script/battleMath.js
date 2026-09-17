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
  function applyDamageToEnemy(state, damage) {
    const dealt = Math.min(damage, state.enemyHealth);
    const overkill = Math.max(0, damage - state.enemyHealth);
    window.player.overkillPool += overkill;
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
    payMana,
    recordSpellCast,
    damageHeal,
    applyDamageToEnemy,
  };
})();

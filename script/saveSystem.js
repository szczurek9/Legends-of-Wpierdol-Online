(function () {
  const SAVE_VERSION = 1;
  let battleSnapshot = null;

  function isValidPlayer(player) {
    if (!player || typeof player !== "object") return false;

    const numericFields = [
      "money", "skinPoints", "level", "weaponDmg", "healthPoints", "maxHealthPoints",
      "armorPoints", "bonusArmor", "magicResistance", "critChance", "armorPenetration", "magicPenetration",
      "manaPoints", "maxManaPoints", "manaRegenPercent", "abilityPower", "magicAbilityPower",
      "lifesteal", "bonusLifesteal", "magicLifesteal", "bonusAccuracy", "bonusDodge", "armorCap", "overkillPool",
      "adeptBookStacks", "adeptBookStackLimit",
    ];

    return typeof player.nickname === "string"
      && typeof player.weaponName === "string"
      && typeof player.classId === "string"
      && ["prism", "night", "neon", "nature"].includes(player.theme)
      && typeof player.skinName === "string"
      && Array.isArray(player.skinInventory)
      && player.skinInventory.every((skinId) => typeof skinId === "string")
      && Array.isArray(player.inventory)
      && player.inventory.every((weapon) => weapon
        && typeof weapon.name === "string"
        && Number.isFinite(weapon.damage)
        && Number.isFinite(weapon.price)
        && weapon.damage >= 0
        && weapon.price >= 0)
      && Array.isArray(player.magicInventory)
      && player.magicInventory.every((item) => item && typeof item.id === "string")
      && Array.isArray(player.equippedMagicItems)
      && player.equippedMagicItems.every((id) => typeof id === "string")
      && Array.isArray(player.potionInventory)
      && player.potionInventory.every((id) => typeof id === "string")
      && typeof player.usedEscape === "boolean"
      && typeof player.secondWind === "boolean"
      && numericFields.every((field) => Number.isFinite(player[field]) && player[field] >= 0)
      && player.maxHealthPoints > 0
      && player.healthPoints <= player.maxHealthPoints
      && player.lifesteal <= 20
      && player.bonusAccuracy <= 30
      && player.critChance <= 100
      && player.skinPoints >= 0;
  }

  function copyPlayer(player) {
    return JSON.parse(JSON.stringify(player));
  }

  function applyPlayer(player) {
    if (!isValidPlayer(player)) return false;
    Object.assign(window.player, copyPlayer(player));
    return true;
  }

  function createSaveCode() {
    return window.SaveCodec.encode(JSON.stringify({
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      player: copyPlayer(window.player),
    }));
  }

  // Older save codes may predate fields that were added later. This backfills
  // any missing/invalid fields with sensible defaults so old saves keep
  // working, in the same order the checks always ran in.
  function migrateLoadedPlayer(player) {
    if (!Array.isArray(player.inventory)) player.inventory = [];
    if (!["assassin", "mage", "tank", "samurai"].includes(player.classId)) player.classId = "assassin";
    if (!Array.isArray(player.magicInventory)) player.magicInventory = [];
    if (!Array.isArray(player.equippedMagicItems)) player.equippedMagicItems = [];

    player.magicInventory.forEach((item) => {
      if (item && (player.equippedMagicItems.includes(item.uid) || player.equippedMagicItems.includes(item.id))) {
        item.equipped = true;
      }
    });

    if (!Array.isArray(player.potionInventory)) player.potionInventory = [];
    player.magicItemSlots = player.classId === "mage" ? 8 : 4;

    if (player.classId === "assassin" && typeof player.armorCap !== "number") player.armorCap = 60;
    if (typeof player.magicResistance !== "number") player.magicResistance = 0;
    if (typeof player.bonusArmor !== "number") player.bonusArmor = player.classId === "tank" ? 20 : 0;
    if (typeof player.magicPenetration !== "number") player.magicPenetration = 0;
    if (typeof player.maxManaPoints !== "number") player.maxManaPoints = 100;

    if (player.classId === "mage" && player.maxManaPoints < 320) {
      const manaIncrease = 320 - player.maxManaPoints;
      player.maxManaPoints = 320;
      player.manaPoints += manaIncrease;
    }

    if (typeof player.manaRegenPercent !== "number") player.manaRegenPercent = 0;
    if (typeof player.magicAbilityPower !== "number") player.magicAbilityPower = 0;
    if (typeof player.magicLifesteal !== "number") player.magicLifesteal = 0;
    if (typeof player.bonusLifesteal !== "number") player.bonusLifesteal = player.classId === "assassin" ? 5 : 0;
    if (typeof player.bonusDodge !== "number") player.bonusDodge = 0;
    if (typeof player.armorCap !== "number") player.armorCap = 90;
    if (typeof player.overkillPool !== "number") player.overkillPool = 0;
    if (typeof player.adeptBookStacks !== "number") player.adeptBookStacks = 0;
    if (typeof player.adeptBookStackLimit !== "number") player.adeptBookStackLimit = 30;

    const hasEquippedAdeptUpgrade = player.magicInventory.some((item) => item
      && item.id === "adeptsBookUpgrade"
      && (item.equipped || player.equippedMagicItems.includes(item.uid) || player.equippedMagicItems.includes(item.id)));
    if (hasEquippedAdeptUpgrade) player.adeptBookStackLimit = 150;

    if (typeof player.secondWind !== "boolean") player.secondWind = false;
    if (typeof player.skinPoints !== "number") player.skinPoints = 1;
    if (!["prism", "night", "neon", "nature"].includes(player.theme)) player.theme = "prism";
    if (typeof player.skinName !== "string") player.skinName = "default";
    if (!Array.isArray(player.skinInventory)) player.skinInventory = ["default"];
    if (!player.skinInventory.includes("default")) player.skinInventory.push("default");

    return player;
  }

  function loadSaveCode(code) {
    try {
      const save = JSON.parse(window.SaveCodec.decode(code));
      if (!save.player) return false;

      migrateLoadedPlayer(save.player);
      if (save.version !== SAVE_VERSION || !isValidPlayer(save.player)) return false;
      return applyPlayer(save.player);
    } catch (error) {
      return false;
    }
  }

  function resetPlayer() {
    Object.assign(window.player, window.createDefaultPlayer());
    battleSnapshot = null;
  }

  window.SaveSystem = {
    createSaveCode,
    loadSaveCode,
    resetPlayer,
    captureBattleState() {
      battleSnapshot = copyPlayer(window.player);
    },
    restoreBattleState() {
      if (!battleSnapshot) return false;
      const restored = applyPlayer(battleSnapshot);
      battleSnapshot = null;
      return restored;
    },
    clearBattleState() {
      battleSnapshot = null;
    },
  };
})();

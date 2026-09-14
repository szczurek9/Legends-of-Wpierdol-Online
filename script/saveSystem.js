(function () {
  const SAVE_VERSION = 1;
  let battleSnapshot = null;

  function encode(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function decode(code) {
    const binary = atob(code.trim());
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

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
    return encode(JSON.stringify({
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      player: copyPlayer(window.player),
    }));
  }

  function loadSaveCode(code) {
    try {
      const save = JSON.parse(decode(code));
      if (save.player && !Array.isArray(save.player.inventory)) save.player.inventory = [];
      if (save.player && !["assassin", "mage", "tank", "samurai"].includes(save.player.classId)) save.player.classId = "assassin";
      if (save.player && !Array.isArray(save.player.magicInventory)) save.player.magicInventory = [];
      if (save.player && !Array.isArray(save.player.equippedMagicItems)) save.player.equippedMagicItems = [];
      if (save.player) {
        save.player.magicInventory.forEach((item) => {
          if (item && (save.player.equippedMagicItems.includes(item.uid) || save.player.equippedMagicItems.includes(item.id))) item.equipped = true;
        });
      }
      if (save.player && !Array.isArray(save.player.potionInventory)) save.player.potionInventory = [];
      if (save.player) save.player.magicItemSlots = save.player.classId === "mage" ? 8 : 4;
      if (save.player && save.player.classId === "assassin" && typeof save.player.armorCap !== "number") save.player.armorCap = 60;
      if (save.player && typeof save.player.magicResistance !== "number") save.player.magicResistance = 0;
      if (save.player && typeof save.player.bonusArmor !== "number") save.player.bonusArmor = save.player.classId === "tank" ? 20 : 0;
      if (save.player && typeof save.player.magicPenetration !== "number") save.player.magicPenetration = 0;
      if (save.player && typeof save.player.maxManaPoints !== "number") save.player.maxManaPoints = 100;
      if (save.player && save.player.classId === "mage" && save.player.maxManaPoints < 320) {
        const manaIncrease = 320 - save.player.maxManaPoints;
        save.player.maxManaPoints = 320;
        save.player.manaPoints += manaIncrease;
      }
      if (save.player && typeof save.player.manaRegenPercent !== "number") save.player.manaRegenPercent = 0;
      if (save.player && typeof save.player.magicAbilityPower !== "number") save.player.magicAbilityPower = 0;
      if (save.player && typeof save.player.magicLifesteal !== "number") save.player.magicLifesteal = 0;
      if (save.player && typeof save.player.bonusLifesteal !== "number") save.player.bonusLifesteal = save.player.classId === "assassin" ? 5 : 0;
      if (save.player && typeof save.player.bonusDodge !== "number") save.player.bonusDodge = 0;
      if (save.player && typeof save.player.armorCap !== "number") save.player.armorCap = 90;
      if (save.player && typeof save.player.overkillPool !== "number") save.player.overkillPool = 0;
      if (save.player && typeof save.player.adeptBookStacks !== "number") save.player.adeptBookStacks = 0;
      if (save.player && typeof save.player.adeptBookStackLimit !== "number") save.player.adeptBookStackLimit = 30;
      if (save.player && save.player.magicInventory.some((item) => item
        && item.id === "adeptsBookUpgrade"
        && (item.equipped || save.player.equippedMagicItems.includes(item.uid) || save.player.equippedMagicItems.includes(item.id)))) {
        save.player.adeptBookStackLimit = 150;
      }
      if (save.player && typeof save.player.secondWind !== "boolean") save.player.secondWind = false;
      if (save.player && typeof save.player.skinPoints !== "number") save.player.skinPoints = 1;
      if (save.player && !["prism", "night", "neon", "nature"].includes(save.player.theme)) save.player.theme = "prism";
      if (save.player && typeof save.player.skinName !== "string") save.player.skinName = "default";
      if (save.player && !Array.isArray(save.player.skinInventory)) save.player.skinInventory = ["default"];
      if (save.player && !save.player.skinInventory.includes("default")) save.player.skinInventory.push("default");
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

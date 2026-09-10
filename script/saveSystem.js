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
      "money", "level", "weaponDmg", "healthPoints", "maxHealthPoints",
      "armorPoints", "critChance", "armorPenetration", "manaPoints",
      "abilityPower", "lifesteal", "bonusAccuracy",
    ];

    return typeof player.nickname === "string"
      && typeof player.weaponName === "string"
      && Array.isArray(player.inventory)
      && player.inventory.every((weapon) => weapon
        && typeof weapon.name === "string"
        && Number.isFinite(weapon.damage)
        && Number.isFinite(weapon.price)
        && weapon.damage >= 0
        && weapon.price >= 0)
      && typeof player.usedEscape === "boolean"
      && typeof player.secondWind === "boolean"
      && numericFields.every((field) => Number.isFinite(player[field]) && player[field] >= 0)
      && player.maxHealthPoints > 0
      && player.healthPoints <= player.maxHealthPoints
      && player.lifesteal <= 20
      && player.bonusAccuracy <= 30
      && player.critChance <= 100;
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
      if (save.player && typeof save.player.secondWind !== "boolean") save.player.secondWind = false;
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

(function () {
  const SAVE_VERSION = 1;
  let battleSnapshot = null;
  let arenaSnapshot = null;
  let arenaPrevCooldown = 0;   // cooldown sprzed wejścia do areny (przywracany po ucieczce)

  // Kopia cooldownu areny poza kodem zapisu: bez niej odświeżenie strony w trakcie walki
  // i wczytanie starszego kodu pozwalałoby ominąć cooldown.
  const ARENA_COOLDOWN_KEY = "arenaCooldownUntil";
  function storeArenaCooldown(timestamp) {
    try { window.localStorage.setItem(ARENA_COOLDOWN_KEY, String(Number(timestamp) || 0)); } catch (error) { /* brak dostępu do storage */ }
  }
  function readStoredArenaCooldown() {
    try { return Number(window.localStorage.getItem(ARENA_COOLDOWN_KEY)) || 0; } catch (error) { return 0; }
  }

  function isValidPlayer(player) {
    if (!player || typeof player !== "object") return false;

    const numericFields = [
      "money", "skinPoints", "level", "weaponDmg", "weaponBaseDamage", "weaponAdScaling", "ad", "adItemSlots", "armorPenetrationPercent", "yamatoExecuteCap", "healthPoints", "maxHealthPoints",
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
      && player.inventory.every((weapon) => weapon && typeof weapon.name === "string" && Number.isFinite(weapon.price))
      && Array.isArray(player.adItemInventory)
      && Array.isArray(player.equippedAdItems)
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
      player: copyPlayer(arenaSnapshot || window.player),
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
    player.magicItemSlots = player.classId === "mage" ? 8 : 2;
    player.adItemSlots = player.classId === "mage" ? 0 : 6;
    if (!Array.isArray(player.adItemInventory)) player.adItemInventory = [];
    if (!Array.isArray(player.equippedAdItems)) player.equippedAdItems = [];
    if (typeof player.ad !== "number") player.ad = 0;
    if (typeof player.armorPenetrationPercent !== "number") player.armorPenetrationPercent = 0;
    if (typeof player.yamatoExecuteCap !== "number") player.yamatoExecuteCap = 5;

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

    if (typeof player.arenaCooldownUntil !== "number") player.arenaCooldownUntil = 0;
    if (typeof player.arenaEscapeLockUntil !== "number") player.arenaEscapeLockUntil = 0;

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
    arenaSnapshot = null;
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
    // Arena: osobna pula HP/many. Zapamiętuje cały stan i daje pełne HP/manę areny.
    // cooldownMs: cooldown naliczany od razu przy wejściu (trafia do migawki, więc zapis zrobiony
    // w trakcie areny, oraz kopia w przeglądarce, już go zawierają). Ucieczka go cofa.
    beginArena({ cooldownMs = 0 } = {}) {
      arenaSnapshot = copyPlayer(window.player);
      arenaPrevCooldown = arenaSnapshot.arenaCooldownUntil || 0;
      if (cooldownMs) {
        arenaSnapshot.arenaCooldownUntil = Date.now() + cooldownMs;
        storeArenaCooldown(arenaSnapshot.arenaCooldownUntil);
      }
      window.player.healthPoints = window.player.maxHealthPoints;
      window.player.manaPoints = window.player.maxManaPoints;
    },
    // Koniec areny (wygrana, zgon, ucieczka): wraca stan kampanii (HP, mana, lifesteal z mikstur,
    // Drugi Oddech itd.). Zużyte mikstury zostają zużyte. Dodaje nagrodę i ustawia znaczniki czasu.
    endArena({ reward = 0, cooldownMs = 0, lockMs = 0 } = {}) {
      if (!arenaSnapshot) return false;
      const potionsLeft = window.player.potionInventory.slice();
      const snapshot = arenaSnapshot;
      arenaSnapshot = null;
      if (!applyPlayer(snapshot)) return false;
      window.player.potionInventory = potionsLeft;
      window.player.money += reward;
      if (cooldownMs) {
        window.player.arenaCooldownUntil = Date.now() + cooldownMs;   // licząc od końca walki
      } else {
        window.player.arenaCooldownUntil = arenaPrevCooldown;         // ucieczka: bez cooldownu z wejścia
      }
      storeArenaCooldown(window.player.arenaCooldownUntil);
      if (lockMs) window.player.arenaEscapeLockUntil = Date.now() + lockMs;
      return true;
    },
    getStoredArenaCooldown: readStoredArenaCooldown,
    isArenaActive() {
      return arenaSnapshot !== null;
    },
  };
})();

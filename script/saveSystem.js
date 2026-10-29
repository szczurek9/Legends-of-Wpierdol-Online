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
      && window.isKnownTheme(player.theme)
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

  // Opisy przedmiotow to tekst z katalogow gry (data/*.json), wiec nie ida do zapisu:
  // wracaja z katalogu przy wczytywaniu (i przy okazji sa zawsze aktualne).
  // Liczby (ad, critChance, paidPrice...) zostaja w instancjach, bo zdjecie/sprzedaz
  // przedmiotu odejmuje dokladnie to, co zostalo dodane.
  const DEFINITION_LISTS = [
    ["inventory", "shopWeapons"],
    ["adItemInventory", "adItems"],
    ["magicInventory", "magicItems"],
  ];

  function slimPlayer(player) {
    DEFINITION_LISTS.forEach(([listKey]) => {
      (player[listKey] || []).forEach((item) => {
        if (item && typeof item === "object") delete item.description;
      });
    });
    return player;
  }

  function hydrateDescriptions(player) {
    DEFINITION_LISTS.forEach(([listKey, catalogKey]) => {
      const byId = new Map((window[catalogKey] || []).map((definition) => [definition.id, definition]));
      (player[listKey] || []).forEach((item) => {
        if (!item || typeof item !== "object") return;
        const definition = byId.get(item.id);
        if (definition && typeof definition.description === "string") item.description = definition.description;
        else if (typeof item.description !== "string") item.description = "";
      });
    });
  }

  function applyPlayer(player) {
    if (!isValidPlayer(player)) return false;
    Object.assign(window.player, copyPlayer(player));
    return true;
  }

  async function createSaveCode() {
    return window.SaveCodec.encodePacked(JSON.stringify({
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      player: slimPlayer(copyPlayer(arenaSnapshot || window.player)),
    }));
  }

  // Nazwa pliku: nick_klasa_data_godzina.low, np. Szczurek9_assassin_2026-10-28_09-26.low
  function saveFileName(player) {
    const pad = (value) => String(value).padStart(2, "0");
    const now = new Date();
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}-${pad(now.getMinutes())}`;
    const nick = String(player.nickname || "").trim().replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_-]+/gu, "").slice(0, 24) || "gracz";
    const classId = String(player.classId || "postac").replace(/[^a-z0-9_-]/gi, "") || "postac";
    return `${nick}_${classId}_${date}_${time}.low`;
  }

  async function createSaveFile() {
    return { filename: saveFileName(arenaSnapshot || window.player), text: await createSaveCode() };
  }

  // Older save codes may predate fields that were added later. This backfills
  // any missing/invalid fields with sensible defaults so old saves keep
  // working, in the same order the checks always ran in.
  function migrateLoadedPlayer(player) {
    if (!Array.isArray(player.inventory)) player.inventory = [];
    if (!["assassin", "mage", "tank", "samurai", "archer"].includes(player.classId)) player.classId = "assassin";
    if (!Array.isArray(player.magicInventory)) player.magicInventory = [];
    if (!Array.isArray(player.equippedMagicItems)) player.equippedMagicItems = [];

    player.magicInventory.forEach((item) => {
      if (item && (player.equippedMagicItems.includes(item.uid) || player.equippedMagicItems.includes(item.id))) {
        item.equipped = true;
      }
    });

    if (!Array.isArray(player.potionInventory)) player.potionInventory = [];
    const classSlots = window.itemSlotsForClass(player.classId);
    player.magicItemSlots = classSlots.magic;
    player.adItemSlots = classSlots.ad;
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
    player.theme = window.normalizeTheme(player.theme);
    if (typeof player.skinName !== "string") player.skinName = "default";
    if (!Array.isArray(player.skinInventory)) player.skinInventory = ["default"];
    if (!player.skinInventory.includes("default")) player.skinInventory.push("default");

    if (typeof player.arenaCooldownUntil !== "number") player.arenaCooldownUntil = 0;
    if (typeof player.arenaEscapeLockUntil !== "number") player.arenaEscapeLockUntil = 0;

    // Osiągnięcia: starsze zapisy ich nie mają i ich nie zdobywają (trzeba założyć nową grę po zalogowaniu).
    if (typeof player.achievementsEnabled !== "boolean") player.achievementsEnabled = false;
    if (typeof player.achievementSpGranted !== "number" || !(player.achievementSpGranted >= 0)) player.achievementSpGranted = 0;
    const defaultRun = window.createAchievementRun();
    if (!player.achRun || typeof player.achRun !== "object") player.achRun = defaultRun;
    if (typeof player.achRun.fistsOnly !== "boolean") player.achRun.fistsOnly = defaultRun.fistsOnly;
    if (typeof player.achRun.noItems !== "boolean") player.achRun.noItems = defaultRun.noItems;
    if (typeof player.achRun.escapes !== "number" || !(player.achRun.escapes >= 0)) player.achRun.escapes = 0;
    if (typeof player.achRun.potionFreeLevels !== "number" || !(player.achRun.potionFreeLevels >= 0)) player.achRun.potionFreeLevels = 0;

    // Dawna Katana (60 obr., +70% AD) została przemianowana na Maczetę (id "machete"). Nowa Katana (100 obr., +100% AD)
    // ma stare id "katana", więc stare egzemplarze rozpoznajemy po statystykach i przepisujemy na Maczetę.
    // Bez tego dawna Katana podszywałaby się pod nową (ekwipunek rozpoznaje broń po nazwie).
    const isOldKatana = (weapon) => weapon && weapon.id === "katana" && weapon.baseDamage === 60;
    player.inventory.forEach((weapon) => {
      if (isOldKatana(weapon)) { weapon.id = "machete"; weapon.name = "Maczeta"; }
    });
    if (player.weaponId === "katana" && player.weaponBaseDamage === 60) { player.weaponId = "machete"; player.weaponName = "Maczeta"; }

    hydrateDescriptions(player);

    return player;
  }

  async function loadSaveCode(code) {
    try {
      // Opisy wracaja z katalogow, wiec dane gry musza byc juz wczytane.
      if (window.gameDataReady) await window.gameDataReady;
      const save = JSON.parse(await window.SaveCodec.decodeAny(code));
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
    createSaveFile,
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

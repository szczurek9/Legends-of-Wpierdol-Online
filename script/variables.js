// Wersja gry — zmieniaj tylko tutaj (pokazuje się w stopce strony).
window.GAME_VERSION = "1.0.0";
(function showGameVersion() {
  const element = document.getElementById("game-version");
  if (element) element.textContent = `v${window.GAME_VERSION}`;
})();

// Motywy interfejsu. Stare identyfikatory (z zapisów sprzed zmiany motywów) mapujemy na nowe,
// dzięki czemu wcześniejsze zapisy nadal się wczytują.
window.THEME_IDS = ["noc", "dzien", "kontrast", "las"];
window.DEFAULT_THEME = "noc";
window.LEGACY_THEMES = { prism: "noc", night: "noc", neon: "kontrast", nature: "las" };
window.isKnownTheme = function (theme) {
  return window.THEME_IDS.includes(theme) || Object.prototype.hasOwnProperty.call(window.LEGACY_THEMES, theme);
};
window.normalizeTheme = function (theme) {
  if (window.THEME_IDS.includes(theme)) return theme;
  return window.LEGACY_THEMES[theme] || window.DEFAULT_THEME;
};

window.createDefaultPlayer = function () {
  return {
    nickname: "",
    money: 5,
    theme: window.DEFAULT_THEME,
    skinPoints: 1,
    level: 1,
    skinName: "default",
    skinInventory: ["default"],
    weaponName: "Pięści",
    weaponId: "fists",
    weaponDmg: 3,
    weaponBaseDamage: 3,
    weaponAdScaling: 0.01,
    weaponType: "M",
    ad: 0,
    adItemInventory: [],
    equippedAdItems: [],
    adItemSlots: 6,
    armorPenetrationPercent: 0,
    yamatoExecuteCap: 5,
    inventory: [],
    classId: "",
    magicInventory: [],
    equippedMagicItems: [],
    potionInventory: [],
    magicItemSlots: 2,
    healthPoints: 100,
    maxHealthPoints: 100,
    armorPoints: 0,
    bonusArmor: 0,
    magicResistance: 0,
    critChance: 0,
    armorPenetration: 0,
    magicPenetration: 0,
    manaPoints: 100,
    maxManaPoints: 100,
    manaRegenPercent: 0,
    abilityPower: 0,
    magicAbilityPower: 0,
    lifesteal: 0,
    bonusLifesteal: 0,
    magicLifesteal: 0,
    bonusAccuracy: 0,
    bonusDodge: 0,
    armorCap: 90,
    overkillPool: 0,
    adeptBookStacks: 0,
    adeptBookStackLimit: 30,
    secondWind: false,
    usedEscape: false,
    arenaCooldownUntil: 0,     // ms (Date.now()) do kiedy trwa cooldown areny
    arenaEscapeLockUntil: 0,   // ms do kiedy trwa blokada po ucieczce
  };
};

window.player = window.createDefaultPlayer();

// Sloty przedmiotów zależne od klasy. Łucznik ma 8 dynamicznych slotów wspólnych
// dla przedmiotów AD i magicznych (każdy slot to albo AD, albo AP) — limity ad/magic
// są u niego tylko górnymi granicami, a łączny limit pilnuje hasFreeItemSlot().
window.ARCHER_ITEM_SLOTS = 8;
window.itemSlotsForClass = function (classId) {
  if (classId === "mage") return { ad: 0, magic: 8 };
  if (classId === "archer") return { ad: window.ARCHER_ITEM_SLOTS, magic: window.ARCHER_ITEM_SLOTS };
  return { ad: 6, magic: 2 };
};

window.countEquippedItems = function () {
  const p = window.player;
  const equippedIds = p.equippedMagicItems || [];
  const magic = (p.magicInventory || []).filter((item) => item.equipped
    || equippedIds.includes(item.uid)
    || equippedIds.includes(item.id)).length;
  return { ad: (p.equippedAdItems || []).length, magic };
};

// kind: "ad" albo "magic".
window.hasFreeItemSlot = function (kind) {
  const p = window.player;
  const used = window.countEquippedItems();
  if (p.classId === "archer") return used.ad + used.magic < window.ARCHER_ITEM_SLOTS;
  return kind === "ad" ? used.ad < p.adItemSlots : used.magic < p.magicItemSlots;
};

// Ekwipunek: jedna lista przedmiotów, a nad nią ile slotów AD i AP zostało wolnych.
// Łucznik ma sloty wspólne, więc wolne AD i wolne AP to ta sama pula.
window.freeSlotsLabel = function () {
  const p = window.player;
  const used = window.countEquippedItems();
  if (p.classId === "archer") {
    const free = window.ARCHER_ITEM_SLOTS - used.ad - used.magic;
    return `Wolne sloty — AD: ${free} | AP: ${free}`;
  }
  const magicFree = p.magicItemSlots - used.magic;
  return p.adItemSlots > 0
    ? `Wolne sloty — AD: ${p.adItemSlots - used.ad} | AP: ${magicFree}`
    : `Wolne sloty — AP: ${magicFree}`;
};

window.itemSlotLabel = function (kind) {
  const p = window.player;
  const used = window.countEquippedItems();
  if (p.classId === "archer") return `Sloty: ${used.ad + used.magic}/${window.ARCHER_ITEM_SLOTS} (AD: ${used.ad}, AP: ${used.magic})`;
  return kind === "ad" ? `Sloty: ${used.ad}/${p.adItemSlots}` : `Sloty: ${used.magic}/${p.magicItemSlots}`;
};

// Shared by every screen's status/message line: sets the text and applies
// the status class (success/warning/danger/etc.) alongside the element's
// base class. Used by shop.js, inventory.js, skins.js, mainMenu.js and
// battleUI.js instead of each repeating the same two lines.
window.setStatusMessage = function (element, text, baseClass, type) {
  element.textContent = text;
  element.className = `${baseClass} ${type || ""}`.trim();
};

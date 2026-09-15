
window.createDefaultPlayer = function () {
  return {
    nickname: "",
    money: 5,
    theme: "prism",
    skinPoints: 1,
    level: 1,
    skinName: "default",
    skinInventory: ["default"],
    weaponName: "Pięści",
    weaponDmg: 3,
    inventory: [],
    classId: "",
    magicInventory: [],
    equippedMagicItems: [],
    potionInventory: [],
    magicItemSlots: 4,
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
  };
};

window.player = window.createDefaultPlayer();

// Shared by every screen's status/message line: sets the text and applies
// the status class (success/warning/danger/etc.) alongside the element's
// base class. Used by shop.js, inventory.js, skins.js, mainMenu.js and
// battleUI.js instead of each repeating the same two lines.
window.setStatusMessage = function (element, text, baseClass, type) {
  element.textContent = text;
  element.className = `${baseClass} ${type || ""}`.trim();
};

window.battle = {
  currentWave: 0,
  totalWaves: 0,
  enemyHealth: 0,
  enemyIndex: 0,
};

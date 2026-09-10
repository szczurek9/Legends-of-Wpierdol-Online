
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
    healthPoints: 100,
    maxHealthPoints: 100,
    armorPoints: 0,
    critChance: 0,
    armorPenetration: 0,
    manaPoints: 90,
    abilityPower: 0,
    lifesteal: 0,
    bonusAccuracy: 0,
    secondWind: false,
    usedEscape: false,
  };
};

window.player = window.createDefaultPlayer();

window.battle = {
  currentWave: 0,
  totalWaves: 0,
  enemyHealth: 0,
  enemyIndex: 0,
};

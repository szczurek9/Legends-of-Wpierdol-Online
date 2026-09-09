
window.createDefaultPlayer = function () {
  return {
    nickname: "",
    money: 5,
    level: 1,
    weaponName: "Pięści",
    weaponDmg: 3,
    healthPoints: 100,
    maxHealthPoints: 100,
    armorPoints: 0,
    critChance: 0,
    armorPenetration: 0,
    manaPoints: 90,
    abilityPower: 0,
    lifesteal: 0,
    bonusAccuracy: 0,
    usedEscape: false,
  };
};

window.player = window.createDefaultPlayer();

window.shopSkills = [
  { name: "Wampiryczne Ostrze", price: 600, description: "Leczy za 10% zadanych obrażeń (maksymalnie 20%)." },
  { name: "Skała Zdrowia", price: 200, description: "+50 maksymalnego HP." },
  { name: "Woda Życia", price: 800, description: "+210 maksymalnego HP." },
  { name: "Kryształ Skupienia", price: 450, description: "15% mniejsza szansa na uniknięcie ataku (maksymalnie 30%)." },
];

window.battle = {
  currentWave: 0,
  totalWaves: 0,
  enemyHealth: 0,
  enemyIndex: 0,
};

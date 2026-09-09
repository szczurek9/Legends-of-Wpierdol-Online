// Jeden wspolny stan gry. Menu i walka korzystaja z tego samego obiektu player.
window.player = {
  nickname: "",
  money: 5,
  level: 1,
  weaponName: "Pięści",
  weaponDmg: 1,
  healthPoints: 100,
  maxHealthPoints: 100,
  armorPoints: 0,
  critChance: 0,
  armorPenetration: 0,
  manaPoints: 90,
  abilityPower: 0,
  lifestealPercent: 0,
  bonusAccuracy: 0,
  usedEscape: false,
};

// Na czas testow lista zawiera tylko kilka pierwszych poziomow.
window.enemies = [
  { level: 1, name: "Menel spod Zabki", health: 30, damage: 3, attackChance: 25, dodgeChance: 5, waves: 1, reward: 5 },
  { level: 2, name: "Sebix z osiedla", health: 40, damage: 4, attackChance: 28, dodgeChance: 6, waves: 1, reward: 10 },
  { level: 3, name: "Dresiarz", health: 55, damage: 5, attackChance: 30, dodgeChance: 8, waves: 1, reward: 12 },
  { level: 4, name: "Sasiad", health: 75, damage: 7, attackChance: 32, dodgeChance: 10, waves: 1, reward: 21 },
  { level: 5, name: "Kierownik Zabki", health: 110, damage: 10, attackChance: 38, dodgeChance: 12, waves: 1, reward: 100 },
];

window.battle = {
  currentWave: 0,
  totalWaves: 0,
  enemyHealth: 0,
  enemyIndex: 0,
};

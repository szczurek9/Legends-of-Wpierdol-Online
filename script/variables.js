
window.player = {
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

// Na czas testow lista zawiera tylko kilka pierwszych poziomow.
window.enemies = [
  { level: 1, name: "Menel spod Zabki", health: 30, damage: 3, attackChance: 25, dodgeChance: 5, waves: 1, reward: 5 },
  { level: 2, name: "Sebix z osiedla", health: 40, damage: 4, attackChance: 28, dodgeChance: 6, waves: 1, reward: 10 },
  { level: 3, name: "Dresiarz", health: 55, damage: 5, attackChance: 30, dodgeChance: 8, waves: 1, reward: 12 },
  { level: 4, name: "Sasiad", health: 75, damage: 7, attackChance: 32, dodgeChance: 10, waves: 1, reward: 21 },
  { level: 5, name: "Kierownik Zabki", health: 110, damage: 10, attackChance: 38, dodgeChance: 12, waves: 1, reward: 100 },
];

window.shopWeapons = [
  { name: "Patyk", price: 3, damage: 3 },
  { name: "Trzon od siekiery", price: 10, damage: 6 },
  { name: "Zardzewiała Rura", price: 15, damage: 8 },
  { name: "Gazrurka", price: 20, damage: 10 },
  { name: "Nóż kuchenny", price: 50, damage: 15 },
  { name: "Maczeta", price: 70, damage: 26 },
  { name: "Zardzewiała Katana", price: 120, damage: 50 },
  { name: "Żelazny Miecz", price: 200, damage: 71 },
  { name: "Baseball z gwoździami", price: 260, damage: 86 },
  { name: "Katana", price: 320, damage: 120 },
  { name: "Pistolet Jhin'a", price: 444, damage: 224 },
  { name: "Latarnia Thresha", price: 667, damage: 306 },
  { name: "Miecze Yone", price: 850, damage: 390 },
  { name: "Młot Mordekaisera", price: 1200, damage: 475 },
  { name: "Shurikeny Akali", price: 1600, damage: 527 },
  { name: "Red Queen", price: 2300, damage: 700 },
  { name: "Ebony & Ivory", price: 5000, damage: 820 },
  { name: "Mantis Blades", price: 6500, damage: 930 },
  { name: "Malorian 3516", price: 10000, damage: 1000 },
  { name: "GTX 1080 TI", price: 18000, damage: 1881 },
  { name: "Nokia 3310", price: 33100, damage: 3331 },
];

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

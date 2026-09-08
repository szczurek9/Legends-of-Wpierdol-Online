function refreshMainMenu() {
  mainNickname.textContent = `💭 Nick: ${window.player.nickname}`;
  mainMoney.textContent = `💸 Hajs: ${window.player.money} $`;
  mainLevel.textContent = `⚡ LVL: ${window.player.level}`;
  mainWeapon.textContent = `🔫 Broń ${window.player.weaponName} | ${window.player.weaponDmg} DMG`;
  mainDefenseStats.textContent = `❤️ HP: ${window.player.healthPoints} | 🛡️ Pancerz: ${window.player.armorPoints}`;
  mainOffenseStats.textContent = `💥 Crit: ${window.player.critChance}% | 🗡️ Armor Pen: ${window.player.armorPenetration}`;
  mainMagicStats.textContent = `🔷 Mana: ${window.player.manaPoints} | ⭐ Moc umiejętności: ${window.player.abilityPower}`;
}

window.refreshMainMenu = refreshMainMenu;

button.addEventListener('click', () => {
  const enteredName = input.value.trim();

  if (!enteredName) return alert("Najpierw wpisz swój nick!");

  // 1. Zapisujemy nick gracza
  window.player.nickname = enteredName;

  // 2. Personalizujemy nagłówek w menu głównym
  refreshMainMenu();

  // 3. Przełączamy ekrany (ukrywamy logowanie, pokazujemy menu)
  loginScreen.classList.add('hidden');
  mainMenu.classList.remove('hidden');
  mainPlayerModel.classList.remove('hidden');
});

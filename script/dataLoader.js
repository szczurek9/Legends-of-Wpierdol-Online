(function () {
  const startButton = document.getElementById("start-game");
  const gameplayButtons = [
    startButton,
    document.getElementById("play-btn"),
    document.getElementById("shop-btn"),
    document.getElementById("inventory-btn"),
    document.getElementById("change-playerModel"),
  ].filter(Boolean);

  gameplayButtons.forEach((button) => { button.disabled = true; });
  if (startButton) startButton.textContent = "Ładowanie danych...";

  window.gameDataReady = Promise.all([
    fetch("data/weapons.json").then((response) => {
      if (!response.ok) throw new Error(`Nie udało się wczytać broni: ${response.status}`);
      return response.json();
    }),
    fetch("data/enemies.json").then((response) => {
      if (!response.ok) throw new Error(`Nie udało się wczytać przeciwników: ${response.status}`);
      return response.json();
    }),
    fetch("data/skills.json").then((response) => {
      if (!response.ok) throw new Error(`Nie udało się wczytać umiejętności: ${response.status}`);
      return response.json();
    }),
    fetch("data/skins.json").then((response) => {
      if (!response.ok) throw new Error(`Nie udało się wczytać skinów: ${response.status}`);
      return response.json();
    }),
    fetch("data/classes.json").then((response) => response.json()),
    fetch("data/magic-items.json").then((response) => response.json()),
    fetch("data/potions.json").then((response) => response.json()),
    fetch("data/abilities.json").then((response) => response.json()),
    fetch("data/ad-items.json").then((response) => response.json()),
  ])
    .then(([weapons, enemies, skills, skins, classes, magicItems, potions, abilities, adItems]) => {
      window.shopWeapons = weapons;
      window.enemies = enemies;
      window.shopSkills = skills;
      window.skinCatalog = skins;
      window.gameClasses = classes;
      window.magicItems = magicItems;
      window.shopPotions = potions;
      window.classAbilities = abilities;
      window.adItems = adItems;

      gameplayButtons.forEach((button) => { button.disabled = false; });
      if (startButton) startButton.textContent = "Graj";
    })
    .catch((error) => {
      console.error(error);
      if (startButton) startButton.textContent = "Błąd danych";
      return null;
    });
})();

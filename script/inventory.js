(function () {
  const mainMenu = document.getElementById("main-menu");
  const inventoryScreen = document.getElementById("inventory-screen");
  const inventoryButton = document.getElementById("inventory-btn");
  const backButton = document.getElementById("inventory-back-btn");
  const sellButton = document.getElementById("inventory-sell-btn");
  const money = document.getElementById("inventory-money");
  const currentName = document.getElementById("inventory-current-name");
  const currentStats = document.getElementById("inventory-current-stats");
  const currentNote = document.getElementById("inventory-current-note");
  const weapons = document.getElementById("inventory-weapons");
  const message = document.getElementById("inventory-message");
  let selectedIndex = null;

  function showMessage(text, type) {
    message.textContent = text;
    message.className = `shop-message ${type || ""}`.trim();
  }

  function getSelectedWeapon() {
    if (selectedIndex === null) return null;
    return window.player.inventory[selectedIndex] || null;
  }

  function equipWeapon(index) {
    const weapon = window.player.inventory[index];
    if (!weapon) return;

    window.player.weaponName = weapon.name;
    window.player.weaponDmg = weapon.damage;
    selectedIndex = index;
    refresh();
    showMessage(`Wyposażono: ${weapon.name}.`, "success");
  }

  function createWeaponCard(weapon, index) {
    const card = document.createElement("article");
    card.className = "shop-item inventory-item";
    if (weapon.name === window.player.weaponName) card.classList.add("inventory-item-equipped");
    if (index === selectedIndex) card.classList.add("inventory-item-selected");

    const title = document.createElement("h4");
    title.textContent = weapon.name;
    card.appendChild(title);

    const details = document.createElement("p");
    const salePrice = Math.round(weapon.price * 0.4);
    details.textContent = `${weapon.damage} DMG | Sprzedaż: ${salePrice} $`;
    card.appendChild(details);

    const status = document.createElement("p");
    status.className = "shop-description";
    status.textContent = weapon.name === window.player.weaponName ? "Aktualnie wyposażona" : "W ekwipunku";
    card.appendChild(status);

    const equipButton = document.createElement("button");
    equipButton.type = "button";
    equipButton.textContent = weapon.name === window.player.weaponName ? "Wyposażona" : "Wyposaż";
    equipButton.disabled = weapon.name === window.player.weaponName;
    equipButton.addEventListener("click", (event) => {
      event.stopPropagation();
      equipWeapon(index);
    });
    card.appendChild(equipButton);

    card.addEventListener("click", () => {
      selectedIndex = index;
      refresh();
      showMessage(`Wybrano: ${weapon.name}.`);
    });
    return card;
  }

  function refresh() {
    const player = window.player;
    money.textContent = `💸 Hajs: ${player.money} $`;
    currentName.textContent = player.weaponName;
    currentStats.textContent = `${player.weaponDmg} DMG`;
    currentNote.textContent = player.weaponName === "Pięści"
      ? "Broń domyślna — niezbywalna"
      : "Aktualnie wyposażona";

    if (selectedIndex !== null && !player.inventory[selectedIndex]) selectedIndex = null;
    weapons.replaceChildren(...player.inventory.map(createWeaponCard));
    sellButton.disabled = selectedIndex === null;
    window.refreshMainMenu();
  }

  function sellSelectedWeapon() {
    const weapon = getSelectedWeapon();
    if (!weapon) {
      showMessage("Najpierw wybierz broń do sprzedaży.", "warning");
      return;
    }

    if (weapon.name === "Pięści") {
      showMessage("Pięści są bronią domyślną i nie można ich sprzedać.", "warning");
      return;
    }

    const salePrice = Math.round(weapon.price * 0.4);
    const wasEquipped = weapon.name === window.player.weaponName;
    window.player.inventory.splice(selectedIndex, 1);
    window.player.money += salePrice;
    selectedIndex = null;

    if (wasEquipped) {
      window.player.weaponName = "Pięści";
      window.player.weaponDmg = 3;
    }

    refresh();
    showMessage(`Sprzedano ${weapon.name} za ${salePrice} $.`, "success");
  }

  function openInventory() {
    selectedIndex = null;
    refresh();
    mainMenu.classList.add("hidden");
    inventoryScreen.classList.remove("hidden");
    showMessage("Wybierz broń.");
  }

  function closeInventory() {
    inventoryScreen.classList.add("hidden");
    mainMenu.classList.remove("hidden");
    window.refreshMainMenu();
  }

  window.refreshInventory = refresh;
  inventoryButton.addEventListener("click", openInventory);
  backButton.addEventListener("click", closeInventory);
  sellButton.addEventListener("click", sellSelectedWeapon);
})();

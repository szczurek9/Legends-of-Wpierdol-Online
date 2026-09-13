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
  const magicItems = document.getElementById("inventory-magic-items");
  const abilities = document.getElementById("inventory-abilities");
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

  function createMagicCard(item, index) {
    const card = document.createElement("article");
    card.className = "shop-item inventory-item";
    if (item.equipped) card.classList.add("inventory-item-equipped");
    const title = document.createElement("h4"); title.textContent = item.name; card.appendChild(title);
    const details = document.createElement("p"); details.textContent = `${item.equipped ? "Wyposażony" : "W torbie"} | Sprzedaż: ${Math.round((item.paidPrice || item.price) * 0.4)} $`; card.appendChild(details);
    const description = document.createElement("p"); description.className = "shop-description"; description.textContent = item.description; card.appendChild(description);
    const equip = document.createElement("button"); equip.type = "button"; equip.textContent = item.equipped ? "Zdejmij" : "Wyposaż";
    equip.addEventListener("click", (event) => { event.stopPropagation(); toggleMagicItem(index); }); card.appendChild(equip);
    const sell = document.createElement("button"); sell.type = "button"; sell.textContent = `Sprzedaj (${Math.round((item.paidPrice || item.price) * 0.4)} $)`;
    sell.addEventListener("click", (event) => { event.stopPropagation(); sellMagicItem(index); }); card.appendChild(sell);
    return card;
  }

  function toggleMagicItem(index) {
    const item = window.player.magicInventory[index];
    if (!item) return;
    if (item.equipped) {
      item.equipped = false;
      window.player.equippedMagicItems = window.player.equippedMagicItems.filter((uid) => uid !== item.uid);
      window.adjustMagicEffects(item, -1);
      showMessage(`Zdjęto: ${item.name}.`, "success");
    } else if (window.player.equippedMagicItems.length >= window.player.magicItemSlots) {
      showMessage("Brak wolnego slotu magicznego.", "warning");
      return;
    } else {
      item.equipped = true;
      window.player.equippedMagicItems.push(item.uid);
      window.adjustMagicEffects(item, 1);
      showMessage(`Wyposażono: ${item.name}.`, "success");
    }
    refresh();
  }

  function sellMagicItem(index) {
    const item = window.player.magicInventory[index];
    if (!item) return;
    if (item.equipped) window.adjustMagicEffects(item, -1);
    window.player.equippedMagicItems = window.player.equippedMagicItems.filter((uid) => uid !== item.uid);
    window.player.magicInventory.splice(index, 1);
    const salePrice = Math.round((item.paidPrice || item.price) * 0.4);
    window.player.money += salePrice;
    refresh();
    showMessage(`Sprzedano ${item.name} za ${salePrice} $.`, "success");
  }

  function createAbilityCard(ability) {
    const card = document.createElement("article"); card.className = "shop-item inventory-ability-card";
    const image = document.createElement("img"); image.className = "ability-icon"; const folder = window.player.classId === "assassin" ? "assasin" : window.player.classId; image.src = `res/abilities/${folder}/${ability.icon}`; image.alt = ability.name;
    image.onerror = () => { image.onerror = null; image.src = "res/img/background.png"; }; card.appendChild(image);
    const title = document.createElement("h4"); title.textContent = ability.name; card.appendChild(title);
    const description = document.createElement("p"); description.className = "shop-description"; description.textContent = `${ability.description} Koszt: ${ability.cost} many${ability.cooldown ? ` | CD: ${ability.cooldown} tur` : ""}.`; card.appendChild(description);
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
    magicItems.replaceChildren(...(player.magicInventory || []).map(createMagicCard));
    const classAbilities = window.classAbilities?.[player.classId] || [];
    abilities.replaceChildren(...classAbilities.map(createAbilityCard));
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

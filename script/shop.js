(function () {
  const mainMenu = document.getElementById("main-menu");
  const shopScreen = document.getElementById("shop-screen");
  const shopButton = document.getElementById("shop-btn");
  const backButton = document.getElementById("shop-back-btn");
  const money = document.getElementById("shop-money");
  const currentWeapon = document.getElementById("shop-current-weapon-value");
  const weapons = document.getElementById("shop-weapons");
  const skills = document.getElementById("shop-skills");
  const message = document.getElementById("shop-message");

  function showMessage(text, type) {
    message.textContent = text;
    message.className = `shop-message ${type || ""}`.trim();
  }

  function refreshInventoryIfOpen() {
    if (window.refreshInventory) window.refreshInventory();
  }

  function buyWeapon(index) {
    const weapon = window.shopWeapons[index];
    const player = window.player;

    const alreadyOwned = player.inventory.some((ownedWeapon) => ownedWeapon.name === weapon.name);
    if (alreadyOwned) {
      player.weaponName = weapon.name;
      player.weaponDmg = weapon.damage;
      refresh();
      refreshInventoryIfOpen();
      showMessage(`Wyposażono: ${weapon.name}.`, "success");
      return;
    }

    if (player.money < weapon.price) {
      showMessage("Za mało hajsu!", "danger");
      return;
    }

    if (player.weaponName !== "Pięści" && !player.inventory.some((ownedWeapon) => ownedWeapon.name === player.weaponName)) {
      const previousWeapon = window.shopWeapons.find((ownedWeapon) => ownedWeapon.name === player.weaponName);
      if (previousWeapon) player.inventory.push({ ...previousWeapon });
    }

    player.money -= weapon.price;
    player.inventory.push({ ...weapon });
    player.weaponName = weapon.name;
    player.weaponDmg = weapon.damage;
    refresh();
    refreshInventoryIfOpen();
    showMessage(`Kupiono: ${weapon.name}!`, "success");
  }

  function buySkill(index) {
    const skill = window.shopSkills[index];
    const player = window.player;

    if (player.money < skill.price) {
      showMessage("Za mało hajsu!", "danger");
      return;
    }

    if (skill.effect === "maxHealth") {
      player.maxHealthPoints += skill.value;
      player.healthPoints += skill.value;
    } else if (skill.effect === "armor") {
      player.armorPoints += skill.value;
    } else if (skill.effect === "armorPenetration") {
      if (player.armorPenetration >= skill.maxValue) {
        showMessage("Osiągnięto maksymalny poziom przebicia pancerza.", "warning");
        return;
      }
      player.armorPenetration = Math.min(skill.maxValue, player.armorPenetration + skill.value);
    } else if (skill.effect === "lifesteal") {
      if (player.lifesteal >= skill.maxValue) {
        showMessage("Osiągnięto maksymalny poziom Wampirycznego Ostrza.", "warning");
        return;
      }
      player.lifesteal = Math.min(skill.maxValue, player.lifesteal + skill.value);
    } else if (skill.effect === "accuracy") {
      if (player.bonusAccuracy >= skill.maxValue) {
        showMessage("Osiągnięto maksymalną ilość Kryształów Skupienia.", "warning");
        return;
      }
      player.bonusAccuracy = Math.min(skill.maxValue, player.bonusAccuracy + skill.value);
    } else if (skill.effect === "critChance") {
      if (player.critChance >= skill.maxValue) {
        showMessage("Osiągnięto maksymalny poziom szansy krytycznej.", "warning");
        return;
      }
      player.critChance = Math.min(skill.maxValue, player.critChance + skill.value);
    } else if (skill.effect === "critChanceAbove50") {
      if (player.critChance < 50) {
        showMessage("Najpierw zwiększ szansę krytyczną Pierścieniem Zabójcy do 50%.", "warning");
        return;
      }
      if (player.critChance >= 100) {
        showMessage("Osiągnięto maksymalną szansę krytyczną.", "warning");
        return;
      }
      player.critChance = Math.min(100, player.critChance + skill.value);
    } else if (skill.effect === "secondWind") {
      if (player.secondWind) {
        showMessage("Drugie Tchnienie zostało już kupione.", "warning");
        return;
      }
      player.secondWind = true;
    }

    player.money -= skill.price;
    refresh();
    showMessage(`Kupiono: ${skill.name}!`, "success");
  }

  function createItem(item, index, kind) {
    const card = document.createElement("article");
    card.className = "shop-item";

    const title = document.createElement("h4");
    title.textContent = item.name;
    card.appendChild(title);

    const details = document.createElement("p");
    details.textContent = kind === "weapon"
      ? `${item.damage} DMG | ${item.price} $`
      : `${item.price} $`;
    card.appendChild(details);

    if (kind === "skill") {
      const description = document.createElement("p");
      description.className = "shop-description";
      description.textContent = item.description;
      card.appendChild(description);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Kup";
    button.addEventListener("click", () => kind === "weapon" ? buyWeapon(index) : buySkill(index));
    card.appendChild(button);
    return card;
  }

  function refresh() {
    const player = window.player;
    money.textContent = `💸 Hajs: ${player.money} $`;
    currentWeapon.textContent = `${player.weaponName} | ${player.weaponDmg} DMG`;
    weapons.replaceChildren(...window.shopWeapons.map((item, index) => createItem(item, index, "weapon")));
    skills.replaceChildren(...window.shopSkills.map((item, index) => createItem(item, index, "skill")));
    window.refreshMainMenu();
  }

  function openShop() {
    refresh();
    mainMenu.classList.add("hidden");
    shopScreen.classList.remove("hidden");
    showMessage("Wybierz przedmiot.");
  }

  function closeShop() {
    shopScreen.classList.add("hidden");
    mainMenu.classList.remove("hidden");
    window.refreshMainMenu();
  }

  shopButton.addEventListener("click", openShop);
  backButton.addEventListener("click", closeShop);
})();

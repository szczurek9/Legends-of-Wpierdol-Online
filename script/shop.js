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

  function buyWeapon(index) {
    const weapon = window.shopWeapons[index];
    const player = window.player;

    if (player.money < weapon.price) {
      showMessage("Za mało hajsu!", "danger");
      return;
    }

    player.money -= weapon.price;
    player.weaponName = weapon.name;
    player.weaponDmg = weapon.damage;
    refresh();
    showMessage(`Kupiono: ${weapon.name}!`, "success");
  }

  function buySkill(index) {
    const skill = window.shopSkills[index];
    const player = window.player;

    if (player.money < skill.price) {
      showMessage("Za mało hajsu!", "danger");
      return;
    }

    if (index === 0) {
      if (player.lifesteal >= 20) {
        showMessage("Osiągnięto maksymalny poziom Wampirycznego Ostrza.", "warning");
        return;
      }
      player.lifesteal = Math.min(20, player.lifesteal + 10);
    } else if (index === 1) {
      player.maxHealthPoints += 50;
      player.healthPoints += 50;
    } else if (index === 2) {
      player.maxHealthPoints += 210;
      player.healthPoints += 210;
    } else if (index === 3) {
      if (player.bonusAccuracy >= 30) {
        showMessage("Osiągnięto maksymalną ilość Kryształów Skupienia.", "warning");
        return;
      }
      player.bonusAccuracy = Math.min(30, player.bonusAccuracy + 15);
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

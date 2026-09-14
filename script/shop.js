(function () {
  const mainMenu = document.getElementById("main-menu");
  const shopScreen = document.getElementById("shop-screen");
  const shopButton = document.getElementById("shop-btn");
  const backButton = document.getElementById("shop-back-btn");
  const money = document.getElementById("shop-money");
  const currentWeapon = document.getElementById("shop-current-weapon-value");
  const search = document.getElementById("shop-search");
  const weapons = document.getElementById("shop-weapons");
  const skills = document.getElementById("shop-skills");
  const magicItems = document.getElementById("shop-magic-items");
  const abilities = document.getElementById("shop-abilities");
  const potions = document.getElementById("shop-potions");
  const allItems = document.getElementById("shop-all-items");
  const message = document.getElementById("shop-message");
  const tabs = [...document.querySelectorAll(".shop-category")];
  const sections = {
    all: document.getElementById("shop-all-section"),
    weapons: document.getElementById("shop-weapons-section"),
    skills: document.getElementById("shop-skills-section"),
    magic: document.getElementById("shop-magic-section"),
    abilities: document.getElementById("shop-abilities-section"),
    potions: document.getElementById("shop-potions-section"),
  };
  let category = "weapons";

  function showMessage(text, type) { message.textContent = text; message.className = `shop-message ${type || ""}`.trim(); }
  function currentClass() { return window.player.classId || "assassin"; }
  function magicPrice(item) { return currentClass() === "mage" && !item.noMageDiscount ? Math.round(item.price * 0.75) : item.price; }
  function isMagicEquipped(item) {
    return Boolean(item.equipped
      || window.player.equippedMagicItems.includes(item.uid)
      || window.player.equippedMagicItems.includes(item.id));
  }

  function magicSlotsUsed() {
    return window.player.magicInventory.filter(isMagicEquipped).length;
  }

  function adjustMagicEffects(item, direction) {
    const effects = item.effects || {};
    const player = window.player;
    const amount = (value) => Number(value || 0) * direction;
    player.maxManaPoints += amount(effects.mana);
    player.manaPoints = Math.max(0, Math.min(player.maxManaPoints, player.manaPoints + amount(effects.mana)));
    player.abilityPower += amount(effects.abilityPower);
    player.magicPenetration += amount(effects.magicPenetration);
    player.magicResistance += amount(effects.magicResistance);
    player.manaRegenPercent += amount(effects.manaRegenPercent);
    player.magicLifesteal = Math.max(0, Math.min(30, player.magicLifesteal + amount(effects.magicLifesteal)));
    if (effects.adeptBook && direction > 0) {
      const hasUpgrade = player.magicInventory.some((owned) => owned.id === "adeptsBookUpgrade" && isMagicEquipped(owned));
      player.adeptBookStackLimit = hasUpgrade ? 150 : Math.max(player.adeptBookStackLimit, 30);
    }
    if (effects.adeptBookUpgrade && direction > 0) player.adeptBookStackLimit = 150;
  }

  function buyWeapon(index) {
    const weapon = window.shopWeapons[index];
    const player = window.player;
    if (player.inventory.some((ownedWeapon) => ownedWeapon.name === weapon.name)) {
      player.weaponName = weapon.name; player.weaponDmg = weapon.damage; refresh();
      if (window.refreshInventory) window.refreshInventory();
      return showMessage(`Wyposażono: ${weapon.name}.`, "success");
    }
    if (player.money < weapon.price) return showMessage("Za mało hajsu!", "danger");
    if (player.weaponName !== "Pięści" && !player.inventory.some((item) => item.name === player.weaponName)) {
      const previous = window.shopWeapons.find((item) => item.name === player.weaponName);
      if (previous) player.inventory.push({ ...previous });
    }
    player.money -= weapon.price; player.inventory.push({ ...weapon });
    player.weaponName = weapon.name; player.weaponDmg = weapon.damage;
    refresh(); if (window.refreshInventory) window.refreshInventory();
    showMessage(`Kupiono: ${weapon.name}!`, "success");
  }

  function buySkill(index) {
    const skill = window.shopSkills[index];
    const player = window.player;
    if (skillBlocked(skill)) return showMessage("Nie można kupić tego ulepszenia przy aktualnych limitach.", "warning");
    if (player.money < skill.price) return showMessage("Za mało hajsu!", "danger");
    if (skill.effect === "armorPenetration" && player.armorPenetration >= skill.maxValue) return showMessage("Osiągnięto maksymalny poziom przebicia pancerza.", "warning");
    if (skill.effect === "lifesteal" && player.lifesteal >= skill.maxValue) return showMessage("Osiągnięto maksymalny poziom lifestealu.", "warning");
    if (skill.effect === "accuracy" && player.bonusAccuracy >= skill.maxValue) return showMessage("Osiągnięto maksymalną celność.", "warning");
    if (skill.effect === "critChance" && player.critChance >= skill.maxValue) return showMessage("Osiągnięto maksymalną szansę krytyczną.", "warning");
    if (skill.effect === "critChanceAbove50" && player.critChance >= 100) return showMessage("Osiągnięto maksymalną szansę krytyczną.", "warning");
    if (skill.effect === "secondWind" && player.secondWind) return showMessage("Drugie Tchnienie jest już kupione.", "warning");
    if (skill.effect === "maxHealth") { player.maxHealthPoints += skill.value; player.healthPoints += skill.value; }
    else if (skill.effect === "armor") player.armorPoints = Math.min(player.armorCap, player.armorPoints + skill.value);
    else if (skill.effect === "armorPenetration") player.armorPenetration = Math.min(skill.maxValue, player.armorPenetration + skill.value);
    else if (skill.effect === "lifesteal") player.lifesteal = Math.min(skill.maxValue, player.lifesteal + skill.value);
    else if (skill.effect === "accuracy") player.bonusAccuracy = Math.min(skill.maxValue, player.bonusAccuracy + skill.value);
    else if (skill.effect === "critChance") player.critChance = Math.min(skill.maxValue, player.critChance + skill.value);
    else if (skill.effect === "critChanceAbove50") { if (player.critChance < 50) return showMessage("Najpierw zwiększ krytyki do 50%.", "warning"); player.critChance = Math.min(100, player.critChance + skill.value); }
    else if (skill.effect === "secondWind") player.secondWind = true;
    player.money -= skill.price; refresh(); showMessage(`Kupiono: ${skill.name}!`, "success");
  }

  function skillBlocked(skill) {
    const player = window.player;
    if (skill.effect === "armor") return player.armorPoints + skill.value > player.armorCap;
    if (skill.effect === "armorPenetration") return player.armorPenetration >= skill.maxValue;
    if (skill.effect === "lifesteal") return player.lifesteal >= skill.maxValue;
    if (skill.effect === "accuracy") return player.bonusAccuracy >= skill.maxValue;
    if (skill.effect === "critChance") return player.critChance >= skill.maxValue;
    if (skill.effect === "critChanceAbove50") return player.critChance < 50 || player.critChance >= 100;
    if (skill.effect === "secondWind") return player.secondWind;
    return false;
  }

  function buyMagicItem(index) {
    const item = window.magicItems[index];
    const player = window.player;
    if (item.id === "adeptsBookUpgrade" && !player.magicInventory.some((owned) => owned.id === "adeptsBook")) {
      return showMessage("Najpierw kup Księgę Adeptów.", "warning");
    }
    if (item.unique && player.magicInventory.some((owned) => owned.id === item.id)) return showMessage("Ten przedmiot można posiadać tylko raz.", "warning");
    const price = magicPrice(item);
    if (player.money < price) return showMessage("Za mało hajsu!", "danger");
    player.money -= price;
    const instance = { ...item, uid: `${item.id}-${Date.now()}-${Math.random()}`, equipped: false, paidPrice: price };
    if (magicSlotsUsed() < player.magicItemSlots) { instance.equipped = true; player.equippedMagicItems.push(instance.uid); adjustMagicEffects(instance, 1); }
    player.magicInventory.push(instance); refresh(); if (window.refreshInventory) window.refreshInventory();
    showMessage(instance.equipped ? `Kupiono i wyposażono: ${item.name}.` : `Kupiono: ${item.name}. Brak wolnego slotu.`, "success");
  }

  function buyPotion(index) {
    const item = window.shopPotions[index];
    if (window.player.money < item.price) return showMessage("Za mało hajsu!", "danger");
    window.player.money -= item.price; window.player.potionInventory.push(item.id);
    refresh(); if (window.refreshInventory) window.refreshInventory(); showMessage(`Kupiono miksturę: ${item.name}.`, "success");
  }

  function createItem(item, index, kind) {
    const card = document.createElement("article"); card.className = "shop-item";
    const title = document.createElement("h4"); title.textContent = item.name; card.appendChild(title);
    const details = document.createElement("p"); details.textContent = kind === "weapon" ? `${item.damage} DMG | ${item.price} $` : `${kind === "magic" ? magicPrice(item) : item.price} $`; card.appendChild(details);
    const description = document.createElement("p"); description.className = "shop-description"; description.textContent = item.description || ""; card.appendChild(description);
    const button = document.createElement("button"); button.type = "button";
    const blocked = kind === "skill" && skillBlocked(item);
    button.textContent = kind === "ability" ? "Dostępne" : blocked ? "Limit osiągnięty" : "Kup";
    button.disabled = kind === "ability" || blocked;
    button.addEventListener("click", () => { if (kind === "weapon") buyWeapon(index); if (kind === "skill") buySkill(index); if (kind === "magic") buyMagicItem(index); if (kind === "potion") buyPotion(index); });
    card.appendChild(button); return card;
  }

  function visible(items) { const term = search.value.trim().toLowerCase(); return items.filter((item) => item.name.toLowerCase().includes(term)); }

  function createAbilityItem(ability, index) {
    const item = { ...ability, price: 0, description: `${ability.description} Koszt: ${ability.cost} many${ability.cooldown ? ` | CD: ${ability.cooldown} tur` : ""}.` };
    const card = createItem(item, index, "ability"); const image = document.createElement("img"); image.className = "ability-icon shop-ability-icon"; const folder = currentClass() === "assassin" ? "assasin" : currentClass(); image.src = `res/abilities/${folder}/${ability.icon}`; image.alt = ability.name;
    image.onerror = () => { image.onerror = null; image.src = "res/img/background.png"; }; card.prepend(image); return card;
  }

  function refresh() {
    const player = window.player; money.textContent = `💸 Hajs: ${player.money} $`; currentWeapon.textContent = `${player.weaponName} | ${player.weaponDmg} DMG`;
    player.magicItemSlots = player.classId === "mage" ? 8 : 4;
    weapons.replaceChildren(...visible(window.shopWeapons).map((item) => createItem(item, window.shopWeapons.indexOf(item), "weapon")));
    skills.replaceChildren(...visible(window.shopSkills).map((item) => createItem(item, window.shopSkills.indexOf(item), "skill")));
    magicItems.replaceChildren(...visible(window.magicItems).map((item) => createItem(item, window.magicItems.indexOf(item), "magic")));
    potions.replaceChildren(...visible(window.shopPotions).map((item) => createItem(item, window.shopPotions.indexOf(item), "potion")));
    const classSkills = window.classAbilities?.[currentClass()] || []; abilities.replaceChildren(...visible(classSkills).map(createAbilityItem));
    const combinedItems = [
      ...window.shopWeapons.map((item, index) => ({ item, index, kind: "weapon" })),
      ...window.magicItems.map((item, index) => ({ item, index, kind: "magic" })),
      ...window.shopSkills.map((item, index) => ({ item, index, kind: "skill" })),
      ...window.shopPotions.map((item, index) => ({ item, index, kind: "potion" })),
    ].filter(({ item }) => item.name.toLowerCase().includes(search.value.trim().toLowerCase()));
    allItems.replaceChildren(...combinedItems.map(({ item, index, kind }) => createItem(item, index, kind)));
    window.refreshMainMenu();
  }

  function selectCategory(nextCategory) {
    category = nextCategory;
    tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.category === category));
    Object.entries(sections).forEach(([key, section]) => {
      const showSection = key === category;
      section.classList.toggle("hidden", !showSection);
    });
    refresh();
  }
  function openShop() { refresh(); selectCategory(category); mainMenu.classList.add("hidden"); shopScreen.classList.remove("hidden"); showMessage("Wybierz przedmiot."); }
  function closeShop() { shopScreen.classList.add("hidden"); mainMenu.classList.remove("hidden"); window.refreshMainMenu(); }
  tabs.forEach((tab) => tab.addEventListener("click", () => selectCategory(tab.dataset.category)));
  search.addEventListener("input", refresh); shopButton.addEventListener("click", openShop); backButton.addEventListener("click", closeShop);
  window.adjustMagicEffects = adjustMagicEffects;
  window.refreshShop = refresh;
})();

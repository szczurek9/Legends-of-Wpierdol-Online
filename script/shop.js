(function () {
  const mainMenu = document.getElementById("main-menu");
  const shopScreen = document.getElementById("shop-screen");
  const shopButton = document.getElementById("shop-btn");
  const backButton = document.getElementById("shop-back-btn");
  const money = document.getElementById("shop-money");
  const currentWeapon = document.getElementById("shop-current-weapon-value");
  const search = document.getElementById("shop-search");
  const weapons = document.getElementById("shop-weapons");
  const adItems = document.getElementById("shop-ad-items");
  const skills = document.getElementById("shop-skills");
  const magicItems = document.getElementById("shop-magic-items");
  const abilities = document.getElementById("shop-abilities");
  const potions = document.getElementById("shop-potions");
  const allItems = document.getElementById("shop-all-items");
  const sortSelect = document.getElementById("shop-sort");
  const tabs = [...document.querySelectorAll(".shop-category")];
  const sections = {
    all: document.getElementById("shop-all-section"),
    weapons: document.getElementById("shop-weapons-section"),
    ad: document.getElementById("shop-ad-section"),
    skills: document.getElementById("shop-skills-section"),
    magic: document.getElementById("shop-magic-section"),
    abilities: document.getElementById("shop-abilities-section"),
    potions: document.getElementById("shop-potions-section"),
  };
  let category = "weapons";
  let sortMode = "default";

  // Komunikaty sklepu to toasty — pojawiają się na widoku, a nie na dole długiej strony.
  function showMessage(text, type) {
    window.showToast(text, type);
  }

  function currentClass() {
    return window.player.classId || "assassin";
  }

  function skillMaxValue(skill) {
    if (skill.effect === "accuracy") {
      const classAccuracy = currentClass() === "samurai" ? 15 : currentClass() === "archer" ? 30 : currentClass() === "assassin" ? 10 : 0;
      return skill.maxValue + classAccuracy;
    }
    return skill.maxValue;
  }

  function magicPrice(item) {
    return currentClass() === "mage" && !item.noMageDiscount ? Math.round(item.price * 0.75) : item.price;
  }

  function isMagicEquipped(item) {
    return Boolean(item.equipped
      || window.player.equippedMagicItems.includes(item.uid)
      || window.player.equippedMagicItems.includes(item.id));
  }

  function magicSlotsUsed() {
    return window.player.magicInventory.filter(isMagicEquipped).length;
  }

  function weaponDamage(weapon) {
    return Math.floor((weapon.baseDamage ?? weapon.damage ?? 0) + (window.player.ad || 0) * (weapon.adScaling || 0));
  }

  function adjustAdEffects(item, direction) {
    const p = window.player;
    const amount = (key) => Number(item[key] || 0) * direction;
    p.ad += amount("ad"); p.armorPenetration += amount("armorPenetration");
    p.armorPenetrationPercent += amount("armorPenetrationPercent");
    p.critChance += amount("critChance"); p.bonusAccuracy += amount("accuracy"); p.lifesteal += amount("lifesteal");
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
    if (effects.magicLifesteal) player.magicLifesteal = window.SaveCodec.magicLifestealWith(player, item, direction);

    if (effects.adeptBook && direction > 0) {
      const hasUpgrade = player.magicInventory.some((owned) => owned.id === "adeptsBookUpgrade" && isMagicEquipped(owned));
      player.adeptBookStackLimit = hasUpgrade ? 150 : Math.max(player.adeptBookStackLimit, 30);
    }
    if (effects.adeptBookUpgrade && direction > 0) player.adeptBookStackLimit = 150;
  }

  function buyWeapon(index) {
    const weapon = window.shopWeapons[index];
    const player = window.player;
    if (player.classId === "mage") return showMessage("Mag nie może korzystać z broni.", "warning");
    if (weapon.unique) return showMessage("Unikalne bronie można zdobyć wyłącznie z lootboxa.", "warning");
    if (weapon.lootbox === "uniqueWeapon") {
      const available = window.shopWeapons.filter((item) => item.unique && !player.inventory.some((owned) => owned.id === item.id));
      if (!available.length) return showMessage("Posiadasz już wszystkie unikalne bronie.", "warning");
      if (player.money < weapon.price) return showMessage("Za mało hajsu!", "danger");
      const reward = available[Math.floor(Math.random() * available.length)];
      player.money -= weapon.price; player.inventory.push({ ...reward });
      refresh(); if (window.refreshInventory) window.refreshInventory();
      return showMessage(`Lootbox zawierał: ${reward.name}!`, "success");
    }

    if (player.inventory.some((ownedWeapon) => ownedWeapon.name === weapon.name)) {
      player.weaponName = weapon.name;
      player.weaponId = weapon.id; player.weaponDmg = weaponDamage(weapon); player.weaponBaseDamage = weapon.baseDamage; player.weaponAdScaling = weapon.adScaling; player.weaponType = weapon.type;
      refresh();
      if (window.refreshInventory) window.refreshInventory();
      return showMessage(`Wyposażono: ${weapon.name}.`, "success");
    }

    if (player.money < weapon.price) return showMessage("Za mało hajsu!", "danger");

    if (player.weaponName !== "Pięści" && !player.inventory.some((item) => item.name === player.weaponName)) {
      const previous = window.shopWeapons.find((item) => item.name === player.weaponName);
      if (previous) player.inventory.push({ ...previous });
    }

    player.money -= weapon.price;
    player.inventory.push({ ...weapon });
    player.weaponName = weapon.name;
    player.weaponId = weapon.id; player.weaponDmg = weaponDamage(weapon); player.weaponBaseDamage = weapon.baseDamage; player.weaponAdScaling = weapon.adScaling; player.weaponType = weapon.type;
    refresh();
    if (window.refreshInventory) window.refreshInventory();
    showMessage(`Kupiono: ${weapon.name}!`, "success");
  }

  function buyAdItem(index) {
    const item = window.adItems[index];
    const p = window.player;
    if (p.classId === "mage") return showMessage("Mag nie może korzystać z przedmiotów AD.", "warning");
    if (item.unique && p.adItemInventory.some((owned) => owned.id === item.id)) return showMessage("Ten przedmiot jest unikalny.", "warning");
    if (p.money < item.price) return showMessage("Za mało hajsu!", "danger");
    p.money -= item.price;
    const instance = { ...item, uid: `${item.id}-${Date.now()}-${Math.random()}`, equipped: false };
    if (window.hasFreeItemSlot("ad")) { instance.equipped = true; p.equippedAdItems.push(instance.uid); adjustAdEffects(instance, 1); }
    p.adItemInventory.push(instance); refresh(); if (window.refreshInventory) window.refreshInventory();
    showMessage(instance.equipped ? `Kupiono i wyposażono: ${item.name}.` : `Kupiono: ${item.name}. Brak wolnego slotu.`, "success");
  }

  function uniqueWeaponLootboxExhausted() {
    const player = window.player;
    return window.shopWeapons.every((item) => !item.unique || player.inventory.some((owned) => owned.id === item.id));
  }

  function skillBlocked(skill) {
    const player = window.player;
    if (skill.effect === "armor") return player.armorPoints + skill.value > player.armorCap;
    if (skill.effect === "armorPenetration") return player.armorPenetration >= skill.maxValue;
    if (skill.effect === "lifesteal") return player.lifesteal >= skill.maxValue;
    if (skill.effect === "accuracy") return player.bonusAccuracy >= skillMaxValue(skill);
    if (skill.effect === "critChance") return player.critChance >= skill.maxValue;
    if (skill.effect === "critChanceAbove50") return player.critChance < 50 || player.critChance >= 100;
    if (skill.effect === "secondWind") return player.secondWind;
    return false;
  }

  function buySkill(index) {
    const skill = window.shopSkills[index];
    const player = window.player;

    if (skillBlocked(skill)) return showMessage("Nie można kupić tego ulepszenia przy aktualnych limitach.", "warning");
    if (player.money < skill.price) return showMessage("Za mało hajsu!", "danger");
    if (skill.effect === "armorPenetration" && player.armorPenetration >= skill.maxValue) return showMessage("Osiągnięto maksymalny poziom przebicia pancerza.", "warning");
    if (skill.effect === "lifesteal" && player.lifesteal >= skill.maxValue) return showMessage("Osiągnięto maksymalny poziom lifestealu.", "warning");
    if (skill.effect === "accuracy" && player.bonusAccuracy >= skillMaxValue(skill)) return showMessage("Osiągnięto maksymalną celność.", "warning");
    if (skill.effect === "critChance" && player.critChance >= skill.maxValue) return showMessage("Osiągnięto maksymalną szansę krytyczną.", "warning");
    if (skill.effect === "critChanceAbove50" && player.critChance >= 100) return showMessage("Osiągnięto maksymalną szansę krytyczną.", "warning");
    if (skill.effect === "secondWind" && player.secondWind) return showMessage("Drugie Tchnienie jest już kupione.", "warning");

    if (skill.effect === "maxHealth") {
      player.maxHealthPoints += skill.value;
      player.healthPoints += skill.value;
    } else if (skill.effect === "armor") {
      player.armorPoints = Math.min(player.armorCap, player.armorPoints + skill.value);
    } else if (skill.effect === "armorPenetration") {
      player.armorPenetration = Math.min(skill.maxValue, player.armorPenetration + skill.value);
    } else if (skill.effect === "lifesteal") {
      player.lifesteal = Math.min(skill.maxValue, player.lifesteal + skill.value);
    } else if (skill.effect === "accuracy") {
      player.bonusAccuracy = Math.min(skillMaxValue(skill), player.bonusAccuracy + skill.value);
    } else if (skill.effect === "critChance") {
      player.critChance = Math.min(skill.maxValue, player.critChance + skill.value);
    } else if (skill.effect === "critChanceAbove50") {
      if (player.critChance < 50) return showMessage("Najpierw zwiększ krytyki do 50%.", "warning");
      player.critChance = Math.min(100, player.critChance + skill.value);
    } else if (skill.effect === "secondWind") {
      player.secondWind = true;
    }

    player.money -= skill.price;
    refresh();
    showMessage(`Kupiono: ${skill.name}!`, "success");
  }

  function buyMagicItem(index) {
    const item = window.magicItems[index];
    const player = window.player;

    if (item.id === "adeptsBookUpgrade" && !player.magicInventory.some((owned) => owned.id === "adeptsBook")) {
      return showMessage("Najpierw kup Księgę Adeptów.", "warning");
    }
    if (item.unique && player.magicInventory.some((owned) => owned.id === item.id)) {
      return showMessage("Ten przedmiot można posiadać tylko raz.", "warning");
    }
    if (item.maxOwned && player.magicInventory.filter((owned) => owned.id === item.id).length >= item.maxOwned) {
      return showMessage(`Ten przedmiot można posiadać maksymalnie ${item.maxOwned} razy.`, "warning");
    }

    const price = magicPrice(item);
    if (player.money < price) return showMessage("Za mało hajsu!", "danger");

    player.money -= price;
    const instance = { ...item, uid: `${item.id}-${Date.now()}-${Math.random()}`, equipped: false, paidPrice: price };
    if (window.hasFreeItemSlot("magic")) {
      instance.equipped = true;
      player.equippedMagicItems.push(instance.uid);
      adjustMagicEffects(instance, 1);
    }
    player.magicInventory.push(instance);
    refresh();
    if (window.refreshInventory) window.refreshInventory();
    showMessage(instance.equipped ? `Kupiono i wyposażono: ${item.name}.` : `Kupiono: ${item.name}. Brak wolnego slotu.`, "success");
  }

  function buyPotion(index) {
    const item = window.shopPotions[index];
    if (window.player.money < item.price) return showMessage("Za mało hajsu!", "danger");

    window.player.money -= item.price;
    window.player.potionInventory.push(item.id);
    refresh();
    if (window.refreshInventory) window.refreshInventory();
    showMessage(`Kupiono miksturę: ${item.name}.`, "success");
  }

  function priceOf(item, kind) {
    return kind === "magic" ? magicPrice(item) : (item.price || 0);
  }

  function ownsWeapon(weapon) {
    return Boolean(weapon.default) || window.player.inventory.some((owned) => owned.name === weapon.name);
  }

  function currentWeaponDamage() {
    const p = window.player;
    return weaponDamage({ baseDamage: p.weaponBaseDamage || p.weaponDmg, adScaling: p.weaponAdScaling || 0 });
  }

  // Statystyki przedmiotu jako chipy z ikonami (np. +65 AD, +10% krytyka).
  function statChips(item, kind) {
    const chips = [];
    const add = (stat, value, suffix = "", label) => {
      if (value) chips.push(window.GameIcons.chip(stat, `${value > 0 ? "+" : ""}${value}${suffix}`, label));
    };
    if (kind === "ad") {
      add("ad", item.ad);
      add("armorPen", item.armorPenetration);
      add("armorPen", item.armorPenetrationPercent, "%", "Penetracja pancerza (%)");
      add("crit", item.critChance, "%");
      add("accuracy", item.accuracy, "%");
      add("lifesteal", item.lifesteal, "%");
    } else if (kind === "magic") {
      const fx = item.effects || {};
      add("mana", fx.mana);
      add("ap", fx.abilityPower);
      add("magicPen", fx.magicPenetration);
      add("mr", fx.magicResistance);
      add("manaRegen", fx.manaRegenPercent, "%", "Regeneracja many (bazowa)");
      add("lifesteal", fx.magicLifesteal, "%", "Magiczny lifesteal");
    } else if (kind === "skill") {
      const effectStat = {
        maxHealth: ["hp", ""], armor: ["armor", ""], armorPenetration: ["armorPen", ""],
        lifesteal: ["lifesteal", "%"], accuracy: ["accuracy", "%"], critChance: ["crit", "%"], critChanceAbove50: ["crit", "%"],
      }[item.effect];
      if (effectStat) add(effectStat[0], item.value, effectStat[1]);
    }
    return chips;
  }

  function createItem(item, index, kind) {
    const player = window.player;
    const card = document.createElement("article");
    card.className = "shop-item";

    const title = document.createElement("h4");
    title.textContent = item.name;
    card.appendChild(title);

    const typeLabel = { M: "Melee", R: "Ranged", H: "Hybrid" }[item.type] || item.type;
    const weaponUniquePreview = kind === "weapon" && item.unique && !item.lootbox;
    const lootboxExhausted = kind === "weapon" && item.lootbox === "uniqueWeapon" && uniqueWeaponLootboxExhausted();
    const isWeapon = kind === "weapon";
    const isRealWeapon = isWeapon && !item.lootbox;
    const owned = isRealWeapon && ownsWeapon(item);
    const equipped = isRealWeapon && player.weaponName === item.name;

    // Statystyki: dla broni obrażenia + różnica względem wyposażonej, dla reszty „co dostajesz”.
    const stats = document.createElement("div");
    stats.className = "stat-chips shop-stats";
    if (isRealWeapon) {
      const dmg = weaponDamage(item);
      stats.appendChild(window.GameIcons.chip("damage", dmg, `Obrażenia (${item.baseDamage} +${Math.round(item.adScaling * 100)}% AD)`));
      if (!equipped) {
        const delta = dmg - currentWeaponDamage();
        const tag = document.createElement("span");
        tag.className = `delta ${delta > 0 ? "up" : delta < 0 ? "down" : "same"}`;
        tag.textContent = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "tyle samo";
        tag.title = "W porównaniu z aktualnie wyposażoną bronią";
        stats.appendChild(tag);
      }
    } else {
      statChips(item, kind).forEach((chip) => stats.appendChild(chip));
    }
    if (stats.children.length) card.appendChild(stats);

    const details = document.createElement("p");
    details.className = "shop-meta";
    if (isWeapon) {
      details.textContent = item.lootbox
        ? "Losowa unikalna broń"
        : `${typeLabel}${weaponUniquePreview ? " | Tylko z lootboxa" : ""}${equipped ? " | Wyposażona" : owned ? " | Posiadana" : ""}`;
    } else if (kind === "ad" || kind === "magic") {
      details.textContent = window.hasFreeItemSlot(kind) ? "Zostanie od razu wyposażony" : "Brak wolnego slotu — trafi do ekwipunku";
    }
    if (details.textContent) card.appendChild(details);

    const description = document.createElement("p");
    description.className = "shop-description";
    description.textContent = item.description || "";
    card.appendChild(description);

    // Cena + przycisk, z informacją czy stać gracza.
    const price = priceOf(item, kind);
    const affordable = player.money >= price;
    const blocked = (kind === "skill" && skillBlocked(item)) || lootboxExhausted;
    const alreadyOwnedWeapon = owned || equipped;

    if (kind !== "ability" && !weaponUniquePreview && !alreadyOwnedWeapon) {
      const priceLine = document.createElement("p");
      priceLine.className = `shop-price${affordable ? "" : " is-short"}`;
      priceLine.textContent = `${price} $`;
      card.appendChild(priceLine);
    }

    const button = document.createElement("button");
    button.type = "button";
    if (kind === "ability") button.textContent = "Dostępne";
    else if (weaponUniquePreview) button.textContent = "Tylko z lootboxa";
    else if (blocked) button.textContent = "Limit osiągnięty";
    else if (equipped) button.textContent = "Wyposażona";
    else if (owned) button.textContent = "Wyposaż";
    else if (!affordable) button.textContent = `Brakuje ${price - player.money} $`;
    else button.textContent = "Kup";
    button.disabled = kind === "ability" || weaponUniquePreview || blocked || equipped || (!owned && !affordable);
    if (!affordable && !alreadyOwnedWeapon && !blocked && kind !== "ability" && !weaponUniquePreview) card.classList.add("is-unaffordable");
    button.addEventListener("click", () => {
      if (kind === "weapon") buyWeapon(index);
      if (kind === "ad") buyAdItem(index);
      if (kind === "skill") buySkill(index);
      if (kind === "magic") buyMagicItem(index);
      if (kind === "potion") buyPotion(index);
    });
    card.appendChild(button);
    return card;
  }

  function sortItems(list, getPrice, getName = (entry) => entry.name) {
    if (sortMode === "price-asc") list.sort((x, y) => getPrice(x) - getPrice(y));
    else if (sortMode === "price-desc") list.sort((x, y) => getPrice(y) - getPrice(x));
    else if (sortMode === "name") list.sort((x, y) => getName(x).localeCompare(getName(y), "pl"));
    return list;
  }

  function visible(items, getPrice = (item) => item.price || 0) {
    const term = search.value.trim().toLowerCase();
    return sortItems(items.filter((item) => item.name.toLowerCase().includes(term)), getPrice);
  }

  function createAbilityItem(ability, index) {
    const item = { ...ability, price: 0, description: `${ability.description} Koszt: ${ability.cost} many${ability.cooldown ? ` | CD: ${ability.cooldown} tur` : ""}.` };
    const card = createItem(item, index, "ability");

    const image = document.createElement("img");
    image.className = "ability-icon shop-ability-icon";
    image.src = `res/abilities/${currentClass()}/${ability.icon}`;
    image.alt = ability.name;
    image.onerror = () => {
      image.onerror = null;
      image.src = "res/img/background.png";
    };
    card.prepend(image);
    return card;
  }

  function createPassiveCard(passive) {
    const card = document.createElement("article");
    card.className = "shop-item";

    const title = document.createElement("h4");
    title.textContent = `${passive.name} (Pasywna)`;
    card.appendChild(title);

    const description = document.createElement("p");
    description.className = "shop-description";
    description.textContent = passive.description;
    card.appendChild(description);

    return card;
  }

  function refresh() {
    const player = window.player;
    // Po zakupie lista rysuje się od nowa — zapamiętujemy przewinięcie, żeby nie skakała na górę.
    const scrollPositions = [...shopScreen.querySelectorAll(".shop-items")].map((list) => list.scrollTop);
    money.textContent = `💸 Hajs: ${player.money} $`;
    currentWeapon.textContent = `${player.weaponName} | ${weaponDamage({ baseDamage: player.weaponBaseDamage || player.weaponDmg, adScaling: player.weaponAdScaling || 0 })} DMG | ${player.weaponType || "M"}`;
    const slots = window.itemSlotsForClass(player.classId);
    player.magicItemSlots = slots.magic;
    player.adItemSlots = slots.ad;
    tabs.forEach((tab) => {
      tab.classList.toggle("hidden", player.classId === "mage" && ["weapons", "ad"].includes(tab.dataset.category));
    });

    document.getElementById("shop-ad-slots").textContent = window.itemSlotLabel("ad");
    document.getElementById("shop-magic-slots").textContent = window.itemSlotLabel("magic");

    weapons.replaceChildren(...(player.classId === "mage" ? [] : visible(window.shopWeapons).map((item) => createItem(item, window.shopWeapons.indexOf(item), "weapon"))));
    adItems.replaceChildren(...(player.classId === "mage" ? [] : visible(window.adItems || []).map((item) => createItem(item, window.adItems.indexOf(item), "ad"))));
    skills.replaceChildren(...visible(window.shopSkills).map((item) => createItem(item, window.shopSkills.indexOf(item), "skill")));
    magicItems.replaceChildren(...visible(window.magicItems, magicPrice).map((item) => createItem(item, window.magicItems.indexOf(item), "magic")));
    potions.replaceChildren(...visible(window.shopPotions).map((item) => createItem(item, window.shopPotions.indexOf(item), "potion")));

    const classData = window.classAbilities?.[currentClass()] || {};
    const passiveCard = classData.passive ? createPassiveCard(classData.passive) : null;
    abilities.replaceChildren(...(passiveCard ? [passiveCard] : []), ...visible(classData.active || [], () => 0).map(createAbilityItem));

    const searchTerm = search.value.trim().toLowerCase();
    const combinedItems = [
      ...(window.player.classId === "mage" ? [] : window.shopWeapons.map((item) => ({ item, index: window.shopWeapons.indexOf(item), kind: "weapon" }))),
      ...(window.player.classId === "mage" ? [] : (window.adItems || []).map((item, index) => ({ item, index, kind: "ad" }))),
      ...window.magicItems.map((item, index) => ({ item, index, kind: "magic" })),
      ...window.shopSkills.map((item, index) => ({ item, index, kind: "skill" })),
      ...window.shopPotions.map((item, index) => ({ item, index, kind: "potion" })),
    ].filter(({ item }) => item.name.toLowerCase().includes(searchTerm));
    sortItems(combinedItems, (entry) => priceOf(entry.item, entry.kind), (entry) => entry.item.name);
    allItems.replaceChildren(...combinedItems.map(({ item, index, kind }) => createItem(item, index, kind)));

    [...shopScreen.querySelectorAll(".shop-items")].forEach((list, position) => { list.scrollTop = scrollPositions[position] || 0; });

    window.refreshMainMenu();
  }

  // Mag nie ma zakładek Bronie/AD, więc nie może zostać na żadnej z nich (inaczej pusta sekcja).
  function availableCategory(requested) {
    return currentClass() === "mage" && ["weapons", "ad"].includes(requested) ? "magic" : requested;
  }

  function selectCategory(nextCategory) {
    category = availableCategory(nextCategory);
    tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.category === category));
    Object.entries(sections).forEach(([key, section]) => {
      section.classList.toggle("hidden", key !== category);
    });
    refresh();
  }

  function openShop() {
    refresh();
    selectCategory(category);
    mainMenu.classList.add("hidden");
    shopScreen.classList.remove("hidden");
  }

  function closeShop() {
    shopScreen.classList.add("hidden");
    mainMenu.classList.remove("hidden");
    window.refreshMainMenu();
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => selectCategory(tab.dataset.category)));
  search.addEventListener("input", refresh);
  sortSelect.addEventListener("change", () => { sortMode = sortSelect.value; refresh(); });
  shopButton.addEventListener("click", openShop);
  backButton.addEventListener("click", closeShop);

  window.adjustMagicEffects = adjustMagicEffects;
  window.adjustAdEffects = adjustAdEffects;
  window.refreshShop = refresh;
})();

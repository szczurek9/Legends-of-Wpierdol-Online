(function () {
  const mainMenu = document.getElementById("main-menu");
  const shopScreen = document.getElementById("shop-screen");
  const shopButton = document.getElementById("shop-btn");
  const backButton = document.getElementById("shop-back-btn");
  const money = document.getElementById("shop-money");
  const currentWeapon = document.getElementById("shop-current-weapon-value");
  const search = document.getElementById("shop-search");
  const sortSelect = document.getElementById("shop-sort");
  const list = document.getElementById("shop-list");
  const message = document.getElementById("shop-message");
  const layout = document.querySelector(".shop-store-layout");
  const backdrop = document.getElementById("shop-backdrop");
  const details = document.getElementById("shop-details");
  const detailsClose = document.getElementById("shop-details-close");
  const detailsName = document.getElementById("shop-details-name");
  const detailsKind = document.getElementById("shop-details-kind");
  const detailsBody = document.getElementById("shop-details-body");
  const actions = document.getElementById("shop-actions");
  const filters = [...document.querySelectorAll(".shop-filter")];

  // Kolejność kategorii jak w filtrach: Bronie, AD, AP, Wzmocnienia, Mikstury, Umiejętności.
  const CATEGORY_ORDER = ["weapons", "ad", "magic", "skills", "potions", "abilities"];
  const CATEGORY_LABELS = {
    weapons: "Bronie",
    ad: "Przedmioty AD",
    magic: "Przedmioty AP",
    skills: "Wzmocnienia",
    potions: "Mikstury",
    abilities: "Umiejętności",
  };
  const KIND_BY_CATEGORY = { weapons: "weapon", ad: "ad", magic: "magic", skills: "skill", potions: "potion", abilities: "ability" };
  // Wzmocnienia (skille) -> pole gracza, które zmieniają.
  const SKILL_STAT = {
    maxHealth: "maxHealthPoints",
    armor: "armorPoints",
    armorPenetration: "armorPenetration",
    lifesteal: "lifesteal",
    accuracy: "bonusAccuracy",
    critChance: "critChance",
    critChanceAbove50: "critChance",
  };
  const DEFAULT_FISTS = { name: "Pięści", id: "fists", baseDamage: 3, adScaling: 0.01, type: "M" };
  const LOG_LIMIT = 100;

  let category = "all";
  let sortMode = "default";
  let selectedKey = null;

  // Historia zakupów z tej sesji — z niej działa „Cofnij zakup”. Nie trafia do zapisu gry.
  const purchaseLog = [];
  let purchaseLogOwner = "";

  // Komunikaty sklepu to toasty — pojawiają się na widoku, a nie na dole długiej strony.
  function showMessage(text, type) {
    window.setStatusMessage(message, text, "shop-message", type);
    window.showToast(text, type);
  }

  function fail(text, type) {
    showMessage(text, type);
    return false;
  }

  function currentClass() {
    return window.player.classId || "assassin";
  }

  // Na telefonie podgląd jest oknem nad listą; na desktopie ta klasa nic nie zmienia.
  function isModalOpen() {
    return layout.classList.contains("shop-modal-open");
  }

  function openModal() {
    layout.classList.add("shop-modal-open");
  }

  function closeModal() {
    layout.classList.remove("shop-modal-open");
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

  // ad — opcjonalnie inna wartość AD (do podglądu „co będzie po zakupie”).
  function weaponDamage(weapon, ad = window.player.ad || 0) {
    return Math.floor((weapon.baseDamage ?? weapon.damage ?? 0) + ad * (weapon.adScaling || 0));
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

  function currentWeaponDamage() {
    const p = window.player;
    return weaponDamage({ baseDamage: p.weaponBaseDamage || p.weaponDmg, adScaling: p.weaponAdScaling || 0 });
  }

  // Część magiczna broni (np. Yamato: 150 + 60% AP) — dla innych broni 0.
  function weaponApDamage(weapon, ap = window.player.abilityPower || 0) {
    return weapon && weapon.apDamage ? Math.floor(weapon.apDamage + ap * (weapon.apScaling || 0)) : 0;
  }

  function equippedWeaponData() {
    return window.shopWeapons.find((weapon) => weapon.id === window.player.weaponId);
  }

  function setWeapon(weapon) {
    const player = window.player;
    player.weaponName = weapon.name;
    player.weaponId = weapon.id; player.weaponDmg = weaponDamage(weapon); player.weaponBaseDamage = weapon.baseDamage; player.weaponAdScaling = weapon.adScaling; player.weaponType = weapon.type;
  }

  function snapshotWeapon() {
    const p = window.player;
    return { name: p.weaponName, id: p.weaponId, baseDamage: p.weaponBaseDamage, adScaling: p.weaponAdScaling, type: p.weaponType };
  }

  function ownsWeapon(weapon) {
    return Boolean(weapon.default) || window.player.inventory.some((owned) => owned.name === weapon.name);
  }

  function uniqueWeaponLootboxExhausted() {
    const player = window.player;
    return window.shopWeapons.every((item) => !item.unique || player.inventory.some((owned) => owned.id === item.id));
  }

  function skillBlockReason(skill) {
    const player = window.player;
    if (skill.effect === "armor") return player.armorPoints + skill.value > player.armorCap ? "Limit pancerza" : null;
    if (skill.effect === "armorPenetration") return player.armorPenetration >= skill.maxValue ? "Limit osiągnięty" : null;
    if (skill.effect === "lifesteal") return player.lifesteal >= skill.maxValue ? "Limit osiągnięty" : null;
    if (skill.effect === "accuracy") return player.bonusAccuracy >= skillMaxValue(skill) ? "Limit osiągnięty" : null;
    if (skill.effect === "critChance") return player.critChance >= skill.maxValue ? "Limit osiągnięty" : null;
    if (skill.effect === "critChanceAbove50") {
      if (player.critChance < 50) return "Najpierw 50% krytyka";
      return player.critChance >= 100 ? "Limit osiągnięty" : null;
    }
    if (skill.effect === "secondWind") return player.secondWind ? "Posiadane" : null;
    return null;
  }

  // ---------------------------------------------------------------------------
  // Katalog: wpisy sklepu (rodzaj + dane przedmiotu) i ich stan dla gracza.
  // ---------------------------------------------------------------------------

  function entriesOfCategory(categoryId) {
    const kind = KIND_BY_CATEGORY[categoryId];
    // Mag nie ma zakładek Bronie/AD, więc nie widzi też ich przedmiotów.
    if (currentClass() === "mage" && ["weapons", "ad"].includes(categoryId)) return [];

    let items = [];
    if (categoryId === "weapons") items = window.shopWeapons || [];
    else if (categoryId === "ad") items = window.adItems || [];
    else if (categoryId === "magic") items = window.magicItems || [];
    else if (categoryId === "skills") items = window.shopSkills || [];
    else if (categoryId === "potions") items = window.shopPotions || [];
    else if (categoryId === "abilities") {
      const classData = window.classAbilities?.[currentClass()] || {};
      const passive = classData.passive
        ? [{ id: "__passive", name: `${classData.passive.name} (Pasywna)`, description: classData.passive.description, passive: true }]
        : [];
      const active = (classData.active || []).map((ability) => ({
        ...ability,
        description: `${ability.description} Koszt: ${ability.cost} many${ability.cooldown ? ` | CD: ${ability.cooldown} tur` : ""}.`,
      }));
      items = [...passive, ...active];
    }
    return items.map((item) => ({ kind, item, category: categoryId, key: `${kind}:${item.id}` }));
  }

  function priceOf(entry) {
    if (entry.kind === "ability") return 0;
    return entry.kind === "magic" ? magicPrice(entry.item) : (entry.item.price || 0);
  }

  // Stan wpisu: cena (gdy da się kupić), akcja (kup / wyposaż / brak) i powód blokady.
  function stateOf(entry) {
    const { kind, item } = entry;
    const player = window.player;
    const price = priceOf(entry);
    const buy = { price, action: "buy", blocked: null, badge: "" };

    if (kind === "ability") return { price: null, action: null, blocked: null, badge: item.passive ? "Pasywna" : "Umiejętność klasowa" };

    if (kind === "weapon") {
      if (item.lootbox) return uniqueWeaponLootboxExhausted() ? { ...buy, blocked: "Wszystkie zdobyte" } : buy;
      if (player.weaponName === item.name) return { price: null, action: null, blocked: null, badge: "Wyposażona" };
      if (ownsWeapon(item)) return { price: null, action: "equip", blocked: null, badge: "Posiadana" };
      if (item.unique) return { price: null, action: null, blocked: null, badge: "Tylko z lootboxa" };
      return buy;
    }

    if (kind === "ad") {
      if (item.unique && player.adItemInventory.some((owned) => owned.id === item.id)) return { ...buy, blocked: "Posiadany" };
      return buy;
    }

    if (kind === "magic") {
      if (item.id === "adeptsBookUpgrade" && !player.magicInventory.some((owned) => owned.id === "adeptsBook")) return { ...buy, blocked: "Wymaga Księgi Adeptów" };
      if (item.unique && player.magicInventory.some((owned) => owned.id === item.id)) return { ...buy, blocked: "Posiadany" };
      if (item.maxOwned && player.magicInventory.filter((owned) => owned.id === item.id).length >= item.maxOwned) return { ...buy, blocked: "Limit osiągnięty" };
      return buy;
    }

    if (kind === "skill") {
      const reason = skillBlockReason(item);
      return reason ? { ...buy, blocked: reason } : buy;
    }

    return buy;
  }

  // ---------------------------------------------------------------------------
  // Zakupy. Każda funkcja zwraca true, gdy zmieniła stan gracza.
  // ---------------------------------------------------------------------------

  function logPurchase(record) {
    purchaseLog.push(record);
    while (purchaseLog.length > LOG_LIMIT) purchaseLog.shift();
  }

  function buyWeapon(weapon) {
    const player = window.player;
    if (player.classId === "mage") return fail("Mag nie może korzystać z broni.", "warning");
    if (weapon.lootbox === "uniqueWeapon") {
      const available = window.shopWeapons.filter((item) => item.unique && !player.inventory.some((owned) => owned.id === item.id));
      if (!available.length) return fail("Posiadasz już wszystkie unikalne bronie.", "warning");
      if (player.money < weapon.price) return fail("Za mało hajsu!", "danger");
      const reward = available[Math.floor(Math.random() * available.length)];
      const previousWeapon = snapshotWeapon();
      player.money -= weapon.price; player.inventory.push({ ...reward });
      logPurchase({ key: `weapon:${weapon.id}`, kind: "weapon", price: weapon.price, granted: reward.name, previousWeapon });
      refresh(); if (window.refreshInventory) window.refreshInventory();
      showMessage(`Lootbox zawierał: ${reward.name}!`, "success");
      return true;
    }

    if (player.inventory.some((ownedWeapon) => ownedWeapon.name === weapon.name) || weapon.default) {
      setWeapon(weapon);
      refresh();
      if (window.refreshInventory) window.refreshInventory();
      showMessage(`Wyposażono: ${weapon.name}.`, "success");
      return true;
    }

    if (weapon.unique) return fail("Unikalne bronie można zdobyć wyłącznie z lootboxa.", "warning");
    if (player.money < weapon.price) return fail("Za mało hajsu!", "danger");

    const previousWeapon = snapshotWeapon();
    if (player.weaponName !== "Pięści" && !player.inventory.some((item) => item.name === player.weaponName)) {
      const previous = window.shopWeapons.find((item) => item.name === player.weaponName);
      if (previous) player.inventory.push({ ...previous });
    }

    player.money -= weapon.price;
    player.inventory.push({ ...weapon });
    setWeapon(weapon);
    logPurchase({ key: `weapon:${weapon.id}`, kind: "weapon", price: weapon.price, granted: weapon.name, previousWeapon });
    refresh();
    if (window.refreshInventory) window.refreshInventory();
    showMessage(`Kupiono: ${weapon.name}!`, "success");
    return true;
  }

  function buyAdItem(item) {
    const p = window.player;
    if (p.classId === "mage") return fail("Mag nie może korzystać z przedmiotów AD.", "warning");
    if (item.unique && p.adItemInventory.some((owned) => owned.id === item.id)) return fail("Ten przedmiot jest unikalny.", "warning");
    if (p.money < item.price) return fail("Za mało hajsu!", "danger");
    p.money -= item.price;
    const instance = { ...item, uid: `${item.id}-${Date.now()}-${Math.random()}`, equipped: false, paidPrice: item.price };
    if (window.hasFreeItemSlot("ad")) { instance.equipped = true; p.equippedAdItems.push(instance.uid); adjustAdEffects(instance, 1); }
    p.adItemInventory.push(instance);
    logPurchase({ key: `ad:${item.id}`, kind: "ad", price: item.price, uid: instance.uid });
    refresh(); if (window.refreshInventory) window.refreshInventory();
    showMessage(instance.equipped ? `Kupiono i wyposażono: ${item.name}.` : `Kupiono: ${item.name}. Brak wolnego slotu.`, "success");
    return true;
  }

  function buySkill(skill) {
    const player = window.player;

    const reason = skillBlockReason(skill);
    if (reason) return fail(reason === "Najpierw 50% krytyka" ? "Najpierw zwiększ krytyki do 50%." : "Nie można kupić tego ulepszenia przy aktualnych limitach.", "warning");
    if (player.money < skill.price) return fail("Za mało hajsu!", "danger");

    // Zapamiętujemy, o ile naprawdę wzrosła statystyka (limity mogą ją ściąć) — to potrzebne do cofnięcia.
    const stat = SKILL_STAT[skill.effect];
    const before = stat ? player[stat] : 0;

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
      player.critChance = Math.min(100, player.critChance + skill.value);
    } else if (skill.effect === "secondWind") {
      player.secondWind = true;
    }

    player.money -= skill.price;
    logPurchase({
      key: `skill:${skill.id}`, kind: "skill", price: skill.price,
      stat: stat || "secondWind", applied: stat ? player[stat] - before : 0,
    });
    refresh();
    showMessage(`Kupiono: ${skill.name}!`, "success");
    return true;
  }

  function buyMagicItem(item) {
    const player = window.player;

    if (item.id === "adeptsBookUpgrade" && !player.magicInventory.some((owned) => owned.id === "adeptsBook")) {
      return fail("Najpierw kup Księgę Adeptów.", "warning");
    }
    if (item.unique && player.magicInventory.some((owned) => owned.id === item.id)) {
      return fail("Ten przedmiot można posiadać tylko raz.", "warning");
    }
    if (item.maxOwned && player.magicInventory.filter((owned) => owned.id === item.id).length >= item.maxOwned) {
      return fail(`Ten przedmiot można posiadać maksymalnie ${item.maxOwned} razy.`, "warning");
    }

    const price = magicPrice(item);
    if (player.money < price) return fail("Za mało hajsu!", "danger");

    player.money -= price;
    const instance = { ...item, uid: `${item.id}-${Date.now()}-${Math.random()}`, equipped: false, paidPrice: price };
    if (window.hasFreeItemSlot("magic")) {
      instance.equipped = true;
      player.equippedMagicItems.push(instance.uid);
      adjustMagicEffects(instance, 1);
    }
    player.magicInventory.push(instance);
    logPurchase({ key: `magic:${item.id}`, kind: "magic", price, uid: instance.uid });
    refresh();
    if (window.refreshInventory) window.refreshInventory();
    showMessage(instance.equipped ? `Kupiono i wyposażono: ${item.name}.` : `Kupiono: ${item.name}. Brak wolnego slotu.`, "success");
    return true;
  }

  function buyPotion(item) {
    if (window.player.money < item.price) return fail("Za mało hajsu!", "danger");

    window.player.money -= item.price;
    window.player.potionInventory.push(item.id);
    logPurchase({ key: `potion:${item.id}`, kind: "potion", price: item.price, potionId: item.id });
    refresh();
    if (window.refreshInventory) window.refreshInventory();
    showMessage(`Kupiono miksturę: ${item.name}.`, "success");
    return true;
  }

  function buy(entry) {
    if (entry.kind === "weapon") return buyWeapon(entry.item);
    if (entry.kind === "ad") return buyAdItem(entry.item);
    if (entry.kind === "skill") return buySkill(entry.item);
    if (entry.kind === "magic") return buyMagicItem(entry.item);
    if (entry.kind === "potion") return buyPotion(entry.item);
    return false;
  }

  // ---------------------------------------------------------------------------
  // Cofanie zakupu: oddaje pełną cenę i odwraca efekt ostatniego zakupu tego przedmiotu.
  // ---------------------------------------------------------------------------

  // Historia dotyczy jednej postaci — po wczytaniu innego zapisu albo nowej grze jest czyszczona.
  function syncPurchaseLog() {
    const owner = `${window.player.nickname}|${window.player.classId}`;
    if (owner !== purchaseLogOwner) {
      purchaseLog.length = 0;
      purchaseLogOwner = owner;
    }
  }

  function lastPurchaseIndex(key) {
    for (let index = purchaseLog.length - 1; index >= 0; index -= 1) {
      if (purchaseLog[index].key === key) return index;
    }
    return -1;
  }

  // Zwraca null, gdy zakup da się cofnąć, albo powód, dla którego nie.
  function undoProblem(record) {
    const p = window.player;
    if (record.kind === "weapon") {
      return p.inventory.some((weapon) => weapon.name === record.granted) ? null : "Tej broni nie ma już w ekwipunku.";
    }
    if (record.kind === "ad") {
      return p.adItemInventory.some((item) => item.uid === record.uid) ? null : "Tego przedmiotu nie ma już w ekwipunku.";
    }
    if (record.kind === "magic") {
      const item = p.magicInventory.find((owned) => owned.uid === record.uid);
      if (!item) return "Tego przedmiotu nie ma już w ekwipunku.";
      if (item.id === "adeptsBook" && p.magicInventory.some((owned) => owned.id === "adeptsBookUpgrade")) {
        return "Najpierw cofnij lub sprzedaj Ulepszenie Księgi Adeptów.";
      }
      return null;
    }
    if (record.kind === "potion") {
      return p.potionInventory.includes(record.potionId) ? null : "Ta mikstura została już zużyta.";
    }
    if (record.kind === "skill") {
      if (record.stat === "secondWind") return p.secondWind ? null : "Tego ulepszenia już nie masz.";
      return p[record.stat] >= record.applied ? null : "Statystyka jest już niższa niż po zakupie.";
    }
    return "Tego zakupu nie można cofnąć.";
  }

  function fallbackWeapon(previousWeapon) {
    const inBag = previousWeapon && window.player.inventory.some((weapon) => weapon.name === previousWeapon.name);
    return previousWeapon && (previousWeapon.name === DEFAULT_FISTS.name || inBag) ? previousWeapon : DEFAULT_FISTS;
  }

  function undoPurchase(entry) {
    const index = lastPurchaseIndex(entry.key);
    if (index < 0) return fail("Nie ma zakupu do cofnięcia.", "warning");
    const record = purchaseLog[index];
    const problem = undoProblem(record);
    if (problem) {
      // Zakupu i tak nie da się już cofnąć, więc nie zostaje w historii.
      purchaseLog.splice(index, 1);
      refresh();
      return fail(`Nie można cofnąć zakupu. ${problem}`, "warning");
    }

    const p = window.player;
    if (record.kind === "weapon") {
      p.inventory.splice(p.inventory.findIndex((weapon) => weapon.name === record.granted), 1);
      if (p.weaponName === record.granted) setWeapon(fallbackWeapon(record.previousWeapon));
    } else if (record.kind === "ad") {
      const at = p.adItemInventory.findIndex((item) => item.uid === record.uid);
      const item = p.adItemInventory[at];
      if (item.equipped || p.equippedAdItems.includes(item.uid)) adjustAdEffects(item, -1);
      p.equippedAdItems = p.equippedAdItems.filter((uid) => uid !== item.uid);
      p.adItemInventory.splice(at, 1);
    } else if (record.kind === "magic") {
      const at = p.magicInventory.findIndex((owned) => owned.uid === record.uid);
      const item = p.magicInventory[at];
      if (isMagicEquipped(item)) adjustMagicEffects(item, -1);
      p.equippedMagicItems = p.equippedMagicItems.filter((uid) => uid !== item.uid && uid !== item.id);
      p.magicInventory.splice(at, 1);
      if (item.effects?.adeptBookUpgrade) {
        const stillUpgraded = p.magicInventory.some((owned) => owned.id === "adeptsBookUpgrade" && isMagicEquipped(owned));
        if (!stillUpgraded) p.adeptBookStackLimit = 30;
        p.adeptBookStacks = Math.min(p.adeptBookStacks, p.adeptBookStackLimit);
      }
      if (item.effects?.adeptBook) p.adeptBookStacks = 0;
    } else if (record.kind === "potion") {
      p.potionInventory.splice(p.potionInventory.lastIndexOf(record.potionId), 1);
    } else if (record.kind === "skill") {
      if (record.stat === "secondWind") {
        p.secondWind = false;
      } else {
        p[record.stat] -= record.applied;
        if (record.stat === "maxHealthPoints") p.healthPoints = Math.max(1, Math.min(p.healthPoints - record.applied, p.maxHealthPoints));
      }
    }

    p.money += record.price;
    purchaseLog.splice(index, 1);
    refresh();
    if (window.refreshInventory) window.refreshInventory();
    showMessage(`Cofnięto zakup: ${entry.item.name} (zwrot ${record.price} $).`, "success");
    return true;
  }

  // ---------------------------------------------------------------------------
  // Podgląd: co robi przedmiot i jak zmienią się statystyki.
  // ---------------------------------------------------------------------------

  const row = (stat, label, from, to, suffix = "") => ({ stat, label, from, to, suffix });
  const info = (stat, label, text) => ({ stat, label, text });

  // Wiersze „przed → po” dla wpisu (liczone dla aktualnego stanu gracza).
  function previewRows(entry) {
    const { kind, item } = entry;
    const p = window.player;
    const rows = [];

    if (kind === "weapon" && !item.lootbox) {
      const equipped = p.weaponName === item.name;
      const damage = weaponDamage(item);
      rows.push(row("damage", "Obrażenia (z Twoim AD)", equipped ? damage : currentWeaponDamage(), damage));
      if (item.apDamage) {
        const ap = weaponApDamage(item);
        rows.push(row("ap", "Obrażenia magiczne (z Twoim AP)", equipped ? ap : weaponApDamage(equippedWeaponData()), ap));
      }
      if (item.accuracyBonus) rows.push(info("accuracy", "Celność", `+${item.accuracyBonus}%`));
    } else if (kind === "ad") {
      const newAd = (p.ad || 0) + (item.ad || 0);
      if (item.ad) rows.push(row("ad", "Siła ataku (AD)", p.ad || 0, newAd));
      rows.push(row("damage", "Obrażenia bronią", currentWeaponDamage(), weaponDamage({ baseDamage: p.weaponBaseDamage || p.weaponDmg, adScaling: p.weaponAdScaling || 0 }, newAd)));
      if (item.armorPenetration) rows.push(row("armorPen", "Penetracja pancerza", p.armorPenetration, p.armorPenetration + item.armorPenetration));
      if (item.armorPenetrationPercent) rows.push(row("armorPen", "Penetracja pancerza (%)", p.armorPenetrationPercent, p.armorPenetrationPercent + item.armorPenetrationPercent, "%"));
      if (item.critChance) rows.push(row("crit", "Szansa na krytyka", p.critChance, p.critChance + item.critChance, "%"));
      if (item.accuracy) rows.push(row("accuracy", "Celność", p.bonusAccuracy, p.bonusAccuracy + item.accuracy, "%"));
      if (item.lifesteal) rows.push(row("lifesteal", "Lifesteal", p.lifesteal, p.lifesteal + item.lifesteal, "%"));
      if (item.bonusDamage) {
        const perHit = Math.floor(item.bonusDamage + (item.bonusDamageAdScaling || 0) * newAd);
        rows.push(info("damage", "Dodatkowe obrażenia na trafienie", `+${perHit}`));
      }
    } else if (kind === "magic") {
      const fx = item.effects || {};
      if (fx.mana) rows.push(row("mana", "Maksymalna mana", p.maxManaPoints, p.maxManaPoints + fx.mana));
      if (fx.abilityPower) rows.push(row("ap", "Moc umiejętności (AP)", p.abilityPower, p.abilityPower + fx.abilityPower));
      if (fx.magicPenetration) rows.push(row("magicPen", "Penetracja magii", p.magicPenetration, p.magicPenetration + fx.magicPenetration));
      if (fx.magicResistance) rows.push(row("mr", "Odporność magiczna", p.magicResistance, p.magicResistance + fx.magicResistance));
      if (fx.manaRegenPercent) rows.push(row("manaRegen", "Regeneracja many (bazowa)", p.manaRegenPercent, p.manaRegenPercent + fx.manaRegenPercent, "%"));
      if (fx.magicLifesteal) rows.push(row("lifesteal", "Magiczny lifesteal", p.magicLifesteal, window.SaveCodec.magicLifestealWith(p, item, 1), "%"));
    } else if (kind === "skill") {
      if (item.effect === "maxHealth") rows.push(row("hp", "Maksymalne zdrowie", p.maxHealthPoints, p.maxHealthPoints + item.value));
      if (item.effect === "armor") rows.push(row("armor", "Pancerz", p.armorPoints, Math.min(p.armorCap, p.armorPoints + item.value)));
      if (item.effect === "armorPenetration") rows.push(row("armorPen", "Penetracja pancerza", p.armorPenetration, Math.min(item.maxValue, p.armorPenetration + item.value)));
      if (item.effect === "lifesteal") rows.push(row("lifesteal", "Lifesteal", p.lifesteal, Math.min(item.maxValue, p.lifesteal + item.value), "%"));
      if (item.effect === "accuracy") rows.push(row("accuracy", "Celność", p.bonusAccuracy, Math.min(skillMaxValue(item), p.bonusAccuracy + item.value), "%"));
      if (item.effect === "critChance") rows.push(row("crit", "Szansa na krytyka", p.critChance, Math.min(item.maxValue, p.critChance + item.value), "%"));
      if (item.effect === "critChanceAbove50") rows.push(row("crit", "Szansa na krytyka", p.critChance, Math.min(100, p.critChance + item.value), "%"));
      if (item.effect === "secondWind") rows.push(info("hp", "Leczenie po zabójstwie", `${item.value}% maks. HP`));
    } else if (kind === "potion") {
      if (item.effect === "healthPotion") rows.push(info("hp", "Leczenie", `+${Math.min(250, item.value + Math.floor(p.maxHealthPoints * 0.07))} HP`));
      if (item.effect === "accuracyPotion") rows.push(info("accuracy", "Celność", `+${item.value}% na ${item.duration} tur`));
      if (item.effect === "lifestealPotion") rows.push(info("lifesteal", "Lifesteal", `+${item.value}% na ${item.duration} tur`));
      rows.push(info("hp", "W torbie", `${p.potionInventory.filter((id) => id === item.id).length} szt.`));
    } else if (kind === "ability" && !item.passive) {
      rows.push(info("mana", "Koszt", `${item.cost} many`));
      if (item.cooldown) rows.push(info("manaRegen", "Odnowienie", `${item.cooldown} tur`));
    }
    return rows;
  }

  function previewNotes(entry) {
    const notes = [];
    const { kind, item } = entry;
    if (kind === "ad" || kind === "magic") {
      notes.push(window.hasFreeItemSlot(kind)
        ? "Zostanie od razu wyposażony. Statystyki powyżej są liczone po wyposażeniu."
        : "Brak wolnego slotu — trafi do ekwipunku, a bonusy zadziałają dopiero po wyposażeniu.");
    }
    if (kind === "weapon" && item.lootbox) notes.push("Losowa unikalna broń.");
    if (kind === "ability") notes.push(item.passive ? "Pasywa działa automatycznie." : "Umiejętności klasowe masz od początku — nie kupuje się ich w sklepie.");
    return notes;
  }

  const formatValue = (value) => String(Math.round(value * 10) / 10);

  function createStatRow(spec) {
    const element = document.createElement("div");
    element.className = "shop-stat-row";
    element.appendChild(window.GameIcons.stat(spec.stat, "shop-stat-row-icon"));

    const label = document.createElement("span");
    label.className = "shop-stat-label";
    label.textContent = spec.label;
    element.appendChild(label);

    const value = document.createElement("span");
    value.className = "shop-stat-value";
    if (spec.text !== undefined) {
      value.textContent = spec.text;
      element.appendChild(value);
      return element;
    }

    value.textContent = `${formatValue(spec.from)}${spec.suffix} → ${formatValue(spec.to)}${spec.suffix}`;
    element.appendChild(value);

    const difference = Math.round((spec.to - spec.from) * 10) / 10;
    const tag = document.createElement("span");
    tag.className = `delta ${difference > 0 ? "up" : difference < 0 ? "down" : "same"}`;
    tag.textContent = difference > 0 ? `+${formatValue(difference)}${spec.suffix}` : difference < 0 ? `${formatValue(difference)}${spec.suffix}` : "bez zmian";
    element.appendChild(tag);
    return element;
  }

  // Każdy przedmiot ma ikonę (plik w res/icons/..., a bez pliku emotka ℹ️); umiejętności klas są większe.
  function entryIcon(entry, className) {
    const { kind, item } = entry;
    if (kind === "potion") return window.GameIcons.potionIcon(item.id, className);
    if (kind === "ability") {
      const large = `${className} is-large`;
      return item.passive
        ? window.GameIcons.itemIcon("passives", currentClass(), large)
        : window.GameIcons.abilityIcon(currentClass(), item, large);
    }
    const group = { weapon: "weapons", ad: "ad-items", magic: "magic-items", skill: "skills" }[kind];
    return window.GameIcons.itemIcon(group, item.id, className);
  }

  function kindLine(entry) {
    const typeLabel = { M: "Melee", R: "Ranged", H: "Hybrid" }[entry.item.type];
    const parts = [CATEGORY_LABELS[entry.category]];
    if (entry.kind === "weapon" && typeLabel && !entry.item.lootbox) parts.push(typeLabel);
    if (entry.item.unique) parts.push("Unikat");
    return parts.join(" | ");
  }

  // Blok ceny: ile kosztuje i ile brakuje (albo status, gdy kupić się nie da).
  function createPriceBox(entry, state) {
    const box = document.createElement("div");
    box.className = "shop-price-box";
    const player = window.player;

    if (state.price !== null && !state.blocked) {
      const price = document.createElement("span");
      price.className = "shop-price-value";
      price.textContent = `Cena: ${state.price} $`;
      box.appendChild(price);

      const missing = Math.max(0, state.price - player.money);
      const status = document.createElement("span");
      status.className = `shop-price-missing${missing > 0 ? " is-short" : ""}`;
      status.textContent = missing > 0 ? `Brakuje ${missing} $` : "Stać Cię";
      box.appendChild(status);
    } else {
      const status = document.createElement("span");
      status.className = "shop-price-value";
      status.textContent = state.blocked || state.badge;
      box.appendChild(status);
    }
    return box;
  }

  function createActionButton(text, disabled, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.disabled = disabled;
    button.addEventListener("click", onClick);
    return button;
  }

  // Przyciski kup / wyposaż / cofnij są tylko w podglądzie wybranego przedmiotu.
  function renderActions(entry, state) {
    const player = window.player;
    const buttons = [];

    if (state.action === "buy") {
      const affordable = player.money >= state.price;
      const text = state.blocked || (affordable ? `Kup za ${state.price} $` : `Brakuje ${state.price - player.money} $`);
      buttons.push(createActionButton(text, Boolean(state.blocked) || !affordable, () => buy(entry)));
    } else if (state.action === "equip") {
      buttons.push(createActionButton("Wyposaż", false, () => buy(entry)));
    } else if (entry.kind !== "ability") {
      buttons.push(createActionButton(state.badge, true, () => {}));
    }

    if (entry.kind !== "ability") {
      const index = lastPurchaseIndex(entry.key);
      const text = index >= 0 ? `Cofnij zakup (zwrot ${purchaseLog[index].price} $)` : "Cofnij zakup";
      buttons.push(createActionButton(text, index < 0, () => undoPurchase(entry)));
    }

    actions.replaceChildren(...buttons);
  }

  function renderDetails(entry) {
    const state = stateOf(entry);
    detailsName.textContent = entry.item.name;
    detailsKind.textContent = kindLine(entry);

    const nodes = [];
    const icon = entryIcon(entry, "shop-details-icon");
    if (icon) nodes.push(icon);
    if (entry.kind !== "ability") nodes.push(createPriceBox(entry, state));

    const rows = previewRows(entry);
    if (rows.length) {
      const statRows = document.createElement("div");
      statRows.className = "shop-stat-rows";
      statRows.append(...rows.map(createStatRow));
      nodes.push(statRows);
    }

    const description = document.createElement("p");
    description.className = "shop-details-description";
    description.textContent = entry.item.description || "";
    nodes.push(description);

    previewNotes(entry).forEach((text) => {
      const note = document.createElement("p");
      note.className = "shop-details-note";
      note.textContent = text;
      nodes.push(note);
    });

    detailsBody.replaceChildren(...nodes);
    renderActions(entry, state);
    document.querySelectorAll(".shop-card").forEach((card) => {
      card.classList.toggle("shop-card-selected", card.dataset.shopKey === entry.key);
    });
  }

  function clearDetails() {
    selectedKey = null;
    detailsName.textContent = "Kliknij przedmiot, aby zobaczyć podgląd.";
    detailsKind.textContent = "";
    detailsBody.replaceChildren();
    actions.replaceChildren();
    closeModal();
  }

  function selectEntry(entry) {
    selectedKey = entry.key;
    renderDetails(entry);
    openModal();
  }

  // ---------------------------------------------------------------------------
  // Lista: grupy kategorii jak rzadkości w skinach.
  // ---------------------------------------------------------------------------

  function sortEntries(entries) {
    if (sortMode === "price-asc") entries.sort((x, y) => priceOf(x) - priceOf(y));
    else if (sortMode === "price-desc") entries.sort((x, y) => priceOf(y) - priceOf(x));
    else if (sortMode === "name") entries.sort((x, y) => x.item.name.localeCompare(y.item.name, "pl"));
    return entries;
  }

  function visibleEntries(categoryId) {
    const term = search.value.trim().toLowerCase();
    return sortEntries(entriesOfCategory(categoryId).filter((entry) => entry.item.name.toLowerCase().includes(term)));
  }

  function createCard(entry) {
    const player = window.player;
    const state = stateOf(entry);
    const card = document.createElement("article");
    card.className = "shop-card";
    card.dataset.shopKey = entry.key;
    card.tabIndex = 0;
    card.addEventListener("click", () => selectEntry(entry));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectEntry(entry);
      }
    });
    if (entry.key === selectedKey) card.classList.add("shop-card-selected");

    const title = document.createElement("h4");
    title.textContent = entry.item.name;
    card.appendChild(title);

    if (state.price !== null && !state.blocked) {
      const missing = Math.max(0, state.price - player.money);
      // Cena i braki w jednej linii: „25 $ | Brakuje 20 $”.
      const line = document.createElement("p");
      line.className = "shop-card-priceline";
      const price = document.createElement("b");
      price.className = "shop-card-price";
      price.textContent = `${state.price} $`;
      const short = document.createElement("span");
      short.className = `shop-card-missing${missing > 0 ? " is-short" : ""}`;
      short.textContent = missing > 0 ? `Brakuje ${missing} $` : "Stać Cię";
      line.append(price, " | ", short);
      card.appendChild(line);
      if (missing > 0) card.classList.add("shop-card-unaffordable");
    } else {
      const status = document.createElement("p");
      status.className = "shop-card-status";
      status.textContent = state.blocked || state.badge;
      card.appendChild(status);
      if (state.action === null || state.blocked) card.classList.add("shop-card-locked");
    }
    if (state.badge === "Wyposażona") card.classList.add("shop-card-equipped");

    // Ikona w prawym dolnym rogu karty.
    const icon = entryIcon(entry, "shop-card-icon");
    if (icon) card.appendChild(icon);
    return card;
  }

  function createGrid(entries) {
    const grid = document.createElement("div");
    grid.className = "shop-grid";
    grid.append(...entries.map(createCard));
    return grid;
  }

  function createCategorySection(categoryId, entries) {
    const section = document.createElement("section");
    section.className = "shop-group";

    const title = document.createElement("h3");
    title.className = "shop-group-title";
    const name = document.createElement("span");
    name.textContent = CATEGORY_LABELS[categoryId];
    title.appendChild(name);
    if (categoryId === "ad" || categoryId === "magic") {
      const slots = document.createElement("span");
      slots.className = "slot-counter";
      slots.textContent = window.itemSlotLabel(categoryId);
      title.appendChild(slots);
    }
    section.appendChild(title);

    section.appendChild(createGrid(entries));
    return section;
  }

  // Mag nie ma Broni/AD, więc filtr ich nie pokazujemy i nie zostajemy na nich (inaczej pusta lista).
  function availableCategory(requested) {
    return currentClass() === "mage" && ["weapons", "ad"].includes(requested) ? "all" : requested;
  }

  function refresh() {
    const player = window.player;
    syncPurchaseLog();
    category = availableCategory(category);

    // Po zakupie lista rysuje się od nowa — zapamiętujemy przewinięcie, żeby nie skakała na górę.
    const listScroll = list.scrollTop;
    const rowScrolls = [...list.querySelectorAll(".shop-grid")].map((grid) => grid.scrollLeft);

    money.textContent = `💸 Hajs: ${player.money} $`;
    currentWeapon.textContent = `${player.weaponName} | ${currentWeaponDamage()} DMG | ${player.weaponType || "M"}`;
    const slots = window.itemSlotsForClass(player.classId);
    player.magicItemSlots = slots.magic;
    player.adItemSlots = slots.ad;

    let total = 0;
    filters.forEach((filter) => {
      const id = filter.dataset.category;
      const count = id === "all"
        ? CATEGORY_ORDER.reduce((sum, key) => sum + entriesOfCategory(key).length, 0)
        : entriesOfCategory(id).length;
      if (id === "all") total = count;
      filter.querySelector(".shop-filter-count").textContent = String(count);
      const slotsLabel = filter.querySelector(".shop-filter-slots");
      if (slotsLabel) slotsLabel.textContent = window.itemSlotLabel(id);
      const active = id === category;
      filter.classList.toggle("active", active);
      filter.setAttribute("aria-pressed", String(active));
      filter.classList.toggle("hidden", player.classId === "mage" && ["weapons", "ad"].includes(id));
    });

    const filtered = category !== "all";
    list.classList.toggle("shop-list-filtered", filtered);
    const shownCategories = filtered ? [category] : CATEGORY_ORDER;
    const groups = shownCategories
      .map((id) => [id, visibleEntries(id)])
      .filter(([, entries]) => entries.length > 0);

    if (groups.length === 0) {
      const empty = document.createElement("p");
      empty.className = "shop-empty";
      empty.textContent = total === 0 ? "Brak przedmiotów w sklepie." : "Brak przedmiotów pasujących do wyszukiwania.";
      list.replaceChildren(empty);
    } else if (filtered) {
      // Po wciśnięciu filtra: tylko wybrana kategoria, w jednej siatce bez nagłówków.
      list.replaceChildren(createGrid(groups[0][1]));
    } else {
      // Widok ogólny: po jednym przewijanym rzędzie na kategorię; puste sekcje się chowają.
      list.replaceChildren(...groups.map(([id, entries]) => createCategorySection(id, entries)));
    }

    list.scrollTop = listScroll;
    [...list.querySelectorAll(".shop-grid")].forEach((grid, position) => { grid.scrollLeft = rowScrolls[position] || 0; });

    const selectedEntry = selectedKey
      ? groups.flatMap(([, entries]) => entries).find((entry) => entry.key === selectedKey)
      : null;
    if (selectedEntry) renderDetails(selectedEntry);
    else clearDetails();

    window.refreshMainMenu();
  }

  function selectCategory(nextCategory) {
    // Ponowne kliknięcie aktywnego filtra wraca do widoku ogólnego.
    category = category === nextCategory ? "all" : availableCategory(nextCategory);
    refresh();
    list.scrollTop = 0;
  }

  function openShop() {
    closeModal();
    selectedKey = null;
    refresh();
    mainMenu.classList.add("hidden");
    shopScreen.classList.remove("hidden");
    showMessage("Wybierz przedmiot.");
  }

  function closeShop() {
    closeModal();
    shopScreen.classList.add("hidden");
    mainMenu.classList.remove("hidden");
    window.refreshMainMenu();
  }

  filters.forEach((filter) => filter.addEventListener("click", () => selectCategory(filter.dataset.category)));
  search.addEventListener("input", refresh);
  sortSelect.addEventListener("change", () => { sortMode = sortSelect.value; refresh(); });
  detailsClose.addEventListener("click", closeModal);
  backdrop.addEventListener("click", closeModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isModalOpen()) closeModal();
  });
  // Ikony mikstur i umiejętności dołączają po wczytaniu plików — odświeżamy widoczny sklep.
  document.addEventListener("gameicons:ready", () => {
    if (!shopScreen.classList.contains("hidden")) refresh();
  });
  shopButton.addEventListener("click", openShop);
  backButton.addEventListener("click", closeShop);

  window.adjustMagicEffects = adjustMagicEffects;
  window.adjustAdEffects = adjustAdEffects;
  window.refreshShop = refresh;
})();

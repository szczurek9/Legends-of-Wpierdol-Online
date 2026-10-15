(function () {
  const mainMenu = document.getElementById("main-menu");
  const inventoryScreen = document.getElementById("inventory-screen");
  const inventoryButton = document.getElementById("inventory-btn");
  const backButton = document.getElementById("inventory-back-btn");
  const money = document.getElementById("inventory-money");
  const currentIcon = document.getElementById("inventory-current-icon");
  const currentName = document.getElementById("inventory-current-name");
  const currentChips = document.getElementById("inventory-current-chips");
  const currentNote = document.getElementById("inventory-current-note");
  const weapons = document.getElementById("inventory-weapons");
  const weaponCount = document.getElementById("inventory-weapon-count");
  const message = document.getElementById("inventory-message");
  const magicItems = document.getElementById("inventory-magic-items");
  const slotMeter = document.getElementById("inventory-slot-meter");
  const filterBar = document.getElementById("inventory-filter");
  const bulkBar = document.getElementById("inventory-bulk");
  const searchInput = document.getElementById("inventory-search");
  const sortSelect = document.getElementById("inventory-sort");

  const SELL_RATE = 0.4;
  const CONFIRM_MS = 3500;
  const TYPE_LABELS = { M: "Melee", R: "Ranged", H: "Hybrid" };
  const FILTERS = [
    { id: "all", label: "Wszystkie" },
    { id: "equipped", label: "Wyposażone" },
    { id: "bag", label: "W torbie" },
  ];

  let filter = "all";
  let searchTerm = "";
  let sortMode = "default";
  let pendingSell = null;      // klucz przedmiotu czekającego na potwierdzenie sprzedaży
  let pendingTimer = 0;
  const openDescriptions = new Set(); // rozwinięte opisy przetrwają odświeżenie listy

  function showMessage(text, type) {
    window.setStatusMessage(message, text, "shop-message", type);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function clearPending() {
    pendingSell = null;
    window.clearTimeout(pendingTimer);
  }

  function armSell(key, name) {
    clearPending();
    pendingSell = key;
    pendingTimer = window.setTimeout(() => {
      pendingSell = null;
      refresh();
    }, CONFIRM_MS);
    refresh();
    showMessage(`Kliknij „Potwierdź”, aby sprzedać: ${name}.`, "warning");
  }

  // ---- Obliczenia -----------------------------------------------------------

  const weaponSalePrice = (weapon) => Math.round(weapon.price * SELL_RATE);
  const itemSalePrice = (item) => Math.round((item.paidPrice || item.price) * SELL_RATE);
  const isEquippedWeapon = (weapon) => weapon.name === window.player.weaponName;
  const weaponDamageFor = (weapon) => Math.floor(weapon.baseDamage + (window.player.ad || 0) * weapon.adScaling);

  function equippedWeaponDamage() {
    const player = window.player;
    return Math.floor((player.weaponBaseDamage || player.weaponDmg) + (player.ad || 0) * (player.weaponAdScaling || 0));
  }

  // ---- Elementy wspólne -----------------------------------------------------

  function tag(text, modifier) {
    return el("span", `inv-tag${modifier ? ` ${modifier}` : ""}`, text);
  }

  function actionButton(text, className, focusKey, onClick) {
    const button = el("button", className, text);
    button.type = "button";
    button.dataset.focusKey = focusKey;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  // Sprzedaż w dwóch krokach: pierwsze kliknięcie uzbraja przycisk, drugie sprzedaje.
  function sellButton(key, name, price, onConfirm, label = "Sprzedaj") {
    const armed = pendingSell === key;
    const button = actionButton(
      armed ? `Potwierdź (${price} $)` : `${label} (${price} $)`,
      `inv-sell${armed ? " is-confirm" : ""}`,
      `sell:${key}`,
      () => {
        if (pendingSell === key) {
          clearPending();
          onConfirm();
        } else {
          armSell(key, name);
        }
      },
    );
    return button;
  }

  const formatValue = (value) => String(Math.round(value * 10) / 10);

  // Wiersz podglądu: ikona, etykieta, "przed → po" i różnica (te same klasy co w sklepie).
  function buildStatRow(row) {
    const element = el("div", "shop-stat-row");
    element.appendChild(window.GameIcons.stat(row.stat, "shop-stat-row-icon"));
    element.appendChild(el("span", "shop-stat-label", row.label));
    element.appendChild(el("span", "shop-stat-value", `${formatValue(row.from)}${row.suffix} → ${formatValue(row.to)}${row.suffix}`));
    const difference = Math.round((row.to - row.from) * 10) / 10;
    const tagClass = difference > 0 ? "up" : difference < 0 ? "down" : "same";
    const text = difference > 0 ? `+${formatValue(difference)}${row.suffix}` : difference < 0 ? `${formatValue(difference)}${row.suffix}` : "bez zmian";
    element.appendChild(el("span", `delta ${tagClass}`, text));
    return element;
  }

  // Jak zmienią się statystyki po wyposażeniu (direction 1) albo zdjęciu (direction -1) przedmiotu.
  function itemPreviewRows(kind, item, direction) {
    const p = window.player;
    const rows = [];
    const add = (stat, label, current, value, suffix, cap) => {
      if (!value) return;
      let next = current + direction * value;
      if (cap !== undefined) next = Math.max(0, Math.min(cap, next));
      rows.push({ stat, label, from: current, to: next, suffix: suffix || "" });
    };

    if (kind === "ad") {
      add("ad", "Siła ataku (AD)", p.ad || 0, item.ad);
      if (item.ad) {
        const base = p.weaponBaseDamage || p.weaponDmg;
        const next = Math.floor(base + ((p.ad || 0) + direction * item.ad) * (p.weaponAdScaling || 0));
        rows.push({ stat: "damage", label: "Obrażenia bronią", from: equippedWeaponDamage(), to: next, suffix: "" });
      }
      // Krytyk z przedmiotu nie przekracza 100%; przy zdejmowaniu odejmujemy tyle, ile naprawdę dodano.
      const crit = direction > 0 ? item.critChance : Number(item.critApplied ?? item.critChance ?? 0);
      add("crit", "Szansa na krytyka", p.critChance || 0, crit, "%", 100);
      add("accuracy", "Celność", p.bonusAccuracy || 0, item.accuracy, "%");
      add("lifesteal", "Lifesteal", p.lifesteal || 0, item.lifesteal, "%");
      add("armorPen", "Penetracja pancerza", p.armorPenetration || 0, item.armorPenetration);
      add("armorPen", "Penetracja pancerza (%)", p.armorPenetrationPercent || 0, item.armorPenetrationPercent, "%");
    } else {
      const fx = item.effects || {};
      add("mana", "Maksymalna mana", p.maxManaPoints || 0, fx.mana);
      add("ap", "Moc umiejętności (AP)", p.abilityPower || 0, fx.abilityPower);
      add("magicPen", "Penetracja magii", p.magicPenetration || 0, fx.magicPenetration);
      add("mr", "Odporność magiczna", p.magicResistance || 0, fx.magicResistance);
      add("manaRegen", "Regeneracja many (bazowa)", p.manaRegenPercent || 0, fx.manaRegenPercent, "%");
      if (fx.magicLifesteal) {
        rows.push({ stat: "lifesteal", label: "Magiczny lifesteal", from: p.magicLifesteal || 0, to: window.SaveCodec.magicLifestealWith(p, item, direction), suffix: "%" });
      }
    }
    return rows;
  }

  function weaponPreviewRows(weapon) {
    if (isEquippedWeapon(weapon)) return [];
    return [{ stat: "damage", label: "Obrażenia bronią", from: equippedWeaponDamage(), to: weaponDamageFor(weapon), suffix: "" }];
  }

  // Rozwijane "Szczegóły": podgląd zmiany statystyk, uwaga o slotach i opis. Stan rozwinięcia zapamiętujemy.
  function createDetails(key, { title, rows, note, text }) {
    const details = el("details", "inv-desc");
    details.open = openDescriptions.has(key);
    details.appendChild(el("summary", "", "Szczegóły"));
    if (rows && rows.length) {
      details.appendChild(el("p", "inv-details-title", title));
      const list = el("div", "shop-stat-rows");
      rows.forEach((row) => list.appendChild(buildStatRow(row)));
      details.appendChild(list);
    }
    if (note) details.appendChild(el("p", "inv-details-note", note));
    if (text) details.appendChild(el("p", "", text));
    details.addEventListener("toggle", () => {
      if (details.open) openDescriptions.add(key);
      else openDescriptions.delete(key);
    });
    return details;
  }

  function iconSlot(group, id, large) {
    return window.GameIcons.itemIcon(group, id, `inv-card-icon${large ? " is-large" : ""}`);
  }

  function chipsRow(chips) {
    const row = el("div", "stat-chips");
    chips.filter(Boolean).forEach((chip) => row.appendChild(chip));
    return row;
  }

  function buildCard({ icon, title, badge, tags, chips, description, actions, equipped }) {
    const card = el("article", "inv-card");
    if (equipped) card.classList.add("is-equipped");

    card.appendChild(icon);

    const main = el("div", "inv-card-main");
    const head = el("div", "inv-card-head");
    head.appendChild(el("h4", "", title));
    if (badge) head.appendChild(el("span", "inv-badge", badge));
    main.appendChild(head);
    if (tags && tags.length) {
      const tagRow = el("div", "inv-tags");
      tags.forEach((item) => tagRow.appendChild(item));
      main.appendChild(tagRow);
    }
    if (chips) main.appendChild(chips);
    if (description) main.appendChild(description);
    card.appendChild(main);

    if (actions && actions.length) {
      const bar = el("div", "inv-card-actions");
      actions.forEach((button) => bar.appendChild(button));
      card.appendChild(bar);
    }
    return card;
  }

  // ---- Bronie ---------------------------------------------------------------

  function equipWeapon(index) {
    const weapon = window.player.inventory[index];
    if (!weapon) return;
    clearPending();

    window.player.weaponName = weapon.name;
    window.player.weaponBaseDamage = weapon.baseDamage;
    window.player.weaponId = weapon.id;
    window.player.weaponAdScaling = weapon.adScaling;
    window.player.weaponType = weapon.type;
    window.player.weaponDmg = Math.floor(weapon.baseDamage + window.player.ad * weapon.adScaling);
    refresh();
    showMessage(`Wyposażono: ${weapon.name}.`, "success");
  }

  function sellWeapon(index) {
    const weapon = window.player.inventory[index];
    if (!weapon) return;

    if (weapon.name === "Pięści") {
      showMessage("Pięści są bronią domyślną i nie można ich sprzedać.", "warning");
      return;
    }
    if (weapon.unique) {
      showMessage("Unikalnych broni nie można sprzedawać.", "warning");
      return;
    }

    const salePrice = weaponSalePrice(weapon);
    const wasEquipped = isEquippedWeapon(weapon);
    window.player.inventory.splice(index, 1);
    window.player.money += salePrice;

    if (wasEquipped) {
      window.player.weaponName = "Pięści";
      window.player.weaponId = "fists";
      window.player.weaponDmg = 3;
      window.player.weaponBaseDamage = 3;
      window.player.weaponAdScaling = 0.01;
      window.player.weaponType = "M";
    }

    refresh();
    showMessage(`Sprzedano ${weapon.name} za ${salePrice} $.`, "success");
  }

  function weaponChips(weapon, { withDelta }) {
    const chips = [
      window.GameIcons.chip("damage", weaponDamageFor(weapon), "Obrażenia przy Twoim AD"),
      window.GameIcons.chip("ad", `+${Math.round(weapon.adScaling * 100)}%`, "Skalowanie z AD"),
    ];
    if (weapon.apDamage) {
      chips.push(window.GameIcons.chip("ap", weapon.apDamage, `Obrażenia magiczne (+${Math.round((weapon.apScaling || 0) * 100)}% AP)`));
    }
    if (weapon.accuracyBonus) chips.push(window.GameIcons.chip("accuracy", `+${weapon.accuracyBonus}%`, "Bonus do celności"));

    if (withDelta) {
      const difference = weaponDamageFor(weapon) - equippedWeaponDamage();
      if (difference !== 0) {
        const delta = el("span", `delta ${difference > 0 ? "up" : "down"}`, `${difference > 0 ? "+" : ""}${difference}`);
        delta.title = "Różnica obrażeń względem wyposażonej broni";
        delta.setAttribute("aria-label", `${difference > 0 ? "Więcej" : "Mniej"} obrażeń o ${Math.abs(difference)} niż wyposażona broń`);
        chips.push(delta);
      }
    }
    return chipsRow(chips);
  }

  function createWeaponCard(weapon, index) {
    const equipped = isEquippedWeapon(weapon);
    const tags = [];
    if (TYPE_LABELS[weapon.type]) tags.push(tag(TYPE_LABELS[weapon.type]));
    if (weapon.unique) tags.push(tag("Unikat", "is-unique"));

    const actions = [];
    const equip = actionButton(equipped ? "Wyposażona" : "Wyposaż", equipped ? "inv-equip is-active" : "inv-equip", `eq:w${index}`, () => equipWeapon(index));
    equip.disabled = equipped;
    actions.push(equip);

    if (weapon.name === "Pięści") {
      actions.push(tag("Niezbywalna", "is-note"));
    } else if (weapon.unique) {
      actions.push(tag("Nie do sprzedania", "is-note"));
    } else {
      actions.push(sellButton(`w:${index}`, weapon.name, weaponSalePrice(weapon), () => sellWeapon(index)));
    }

    return buildCard({
      icon: iconSlot("weapons", weapon.id),
      title: weapon.name,
      badge: equipped ? "Wyposażona" : "",
      tags,
      chips: weaponChips(weapon, { withDelta: !equipped }),
      description: createDetails(`w:${weapon.id}`, { title: "Po wyposażeniu:", rows: weaponPreviewRows(weapon), text: weapon.description }),
      actions,
      equipped,
    });
  }

  function renderWeapons() {
    const player = window.player;
    const entries = player.inventory.map((weapon, index) => ({ weapon, index }));
    // Od najsilniejszej (tylko kolejność wyświetlania). Wyposażenie nie przestawia kart.
    entries.sort((a, b) => weaponDamageFor(b.weapon) - weaponDamageFor(a.weapon));
    weapons.replaceChildren(...entries.map(({ weapon, index }) => createWeaponCard(weapon, index)));
    weaponCount.textContent = `(${player.inventory.length})`;
  }

  function renderCurrentWeapon() {
    const player = window.player;
    currentIcon.replaceChildren(window.GameIcons.itemIcon("weapons", player.weaponId || "fists", "inv-card-icon is-large"));
    currentName.textContent = player.weaponName;

    const chips = [
      window.GameIcons.chip("damage", equippedWeaponDamage(), "Obrażenia przy Twoim AD"),
      window.GameIcons.chip("ad", `+${Math.round((player.weaponAdScaling || 0) * 100)}%`, "Skalowanie z AD"),
      window.GameIcons.chip("ad", player.ad || 0, "Twoja siła ataku (AD)"),
    ];
    currentChips.replaceChildren(...chips);
    const typeLabel = TYPE_LABELS[player.weaponType || "M"];
    currentNote.textContent = player.weaponName === "Pięści"
      ? `${typeLabel} — broń domyślna, niezbywalna`
      : `${typeLabel} — aktualnie wyposażona`;
  }

  // ---- Przedmioty AD / AP ---------------------------------------------------

  function toggleItem(kind, index) {
    const isAd = kind === "ad";
    const list = isAd ? window.player.adItemInventory : window.player.magicInventory;
    const equippedKey = isAd ? "equippedAdItems" : "equippedMagicItems";
    const adjust = isAd ? window.adjustAdEffects : window.adjustMagicEffects;
    const item = list[index];
    if (!item) return;
    clearPending();

    if (item.equipped) {
      item.equipped = false;
      window.player[equippedKey] = window.player[equippedKey].filter((uid) => uid !== item.uid);
      adjust(item, -1);
      refresh();
      showMessage(`Zdjęto: ${item.name}.`, "success");
      return;
    }
    if (!window.hasFreeItemSlot(kind)) {
      showMessage(`Brak wolnego slotu ${isAd ? "AD" : "AP"}.`, "warning");
      return;
    }
    item.equipped = true;
    window.player[equippedKey].push(item.uid);
    adjust(item, 1);
    refresh();
    showMessage(`Wyposażono: ${item.name}.`, "success");
  }

  function sellItem(kind, index) {
    const isAd = kind === "ad";
    const list = isAd ? window.player.adItemInventory : window.player.magicInventory;
    const equippedKey = isAd ? "equippedAdItems" : "equippedMagicItems";
    const adjust = isAd ? window.adjustAdEffects : window.adjustMagicEffects;
    const item = list[index];
    if (!item) return;

    if (item.equipped) adjust(item, -1);
    window.player[equippedKey] = window.player[equippedKey].filter((uid) => uid !== item.uid);
    list.splice(index, 1);

    const salePrice = itemSalePrice(item);
    window.player.money += salePrice;
    refresh();
    showMessage(`Sprzedano ${item.name} za ${salePrice} $.`, "success");
  }

  function unequipAll() {
    clearPending();
    const p = window.player;
    let count = 0;
    (p.adItemInventory || []).forEach((item) => {
      if (!item.equipped) return;
      item.equipped = false;
      p.equippedAdItems = p.equippedAdItems.filter((uid) => uid !== item.uid);
      window.adjustAdEffects(item, -1);
      count += 1;
    });
    // Po kolei: magiczny lifesteal liczy sumę względem pozostałych wyposażonych przedmiotów.
    (p.magicInventory || []).forEach((item) => {
      if (!item.equipped) return;
      item.equipped = false;
      p.equippedMagicItems = p.equippedMagicItems.filter((uid) => uid !== item.uid);
      window.adjustMagicEffects(item, -1);
      count += 1;
    });
    refresh();
    showMessage(count ? `Zdjęto przedmioty: ${count}.` : "Nic nie jest wyposażone.", count ? "success" : "warning");
  }

  function sellUnequipped() {
    const p = window.player;
    const adSold = (p.adItemInventory || []).filter((item) => !item.equipped);
    const magicSold = (p.magicInventory || []).filter((item) => !item.equipped);
    const total = [...adSold, ...magicSold].reduce((sum, item) => sum + itemSalePrice(item), 0);
    const count = adSold.length + magicSold.length;
    if (!count) return;
    p.adItemInventory = p.adItemInventory.filter((item) => item.equipped);
    p.magicInventory = p.magicInventory.filter((item) => item.equipped);
    p.money += total;
    refresh();
    showMessage(`Sprzedano przedmioty: ${count} za ${total} $.`, "success");
  }

  function renderBulk(all) {
    const bag = all.filter((entry) => !entry.item.equipped);
    const bagValue = bag.reduce((sum, entry) => sum + itemSalePrice(entry.item), 0);

    const unequip = actionButton("Zdejmij wszystko", "inv-bulk-btn", "bulk:unequip", unequipAll);
    unequip.disabled = all.length === bag.length;

    const sell = sellButton("bulk:sell", `wszystkie niewyposażone (${bag.length})`, bagValue, sellUnequipped, "Sprzedaj z torby");
    sell.classList.add("inv-bulk-btn");
    sell.disabled = !bag.length;
    bulkBar.replaceChildren(unequip, sell);
  }

  function itemChips(kind, item) {
    const icons = window.GameIcons;
    if (kind === "ad") {
      return chipsRow([
        item.ad ? icons.chip("ad", `+${item.ad}`, "Siła ataku (AD)") : null,
        item.critChance ? icons.chip("crit", `+${item.critChance}%`, "Szansa na krytyka") : null,
        item.accuracy ? icons.chip("accuracy", `+${item.accuracy}%`, "Celność") : null,
        item.lifesteal ? icons.chip("lifesteal", `+${item.lifesteal}%`, "Lifesteal") : null,
        item.armorPenetration ? icons.chip("armorPen", `+${item.armorPenetration}`, "Penetracja pancerza") : null,
        item.armorPenetrationPercent ? icons.chip("armorPen", `+${item.armorPenetrationPercent}%`, "Penetracja pancerza (%)") : null,
        item.bonusDamage ? icons.chip("damage", `+${item.bonusDamage}`, "Dodatkowe obrażenia na trafienie") : null,
      ]);
    }
    const fx = item.effects || {};
    return chipsRow([
      fx.abilityPower ? icons.chip("ap", `+${fx.abilityPower}`, "Moc umiejętności (AP)") : null,
      fx.mana ? icons.chip("mana", `+${fx.mana}`, "Maksymalna mana") : null,
      fx.manaRegenPercent ? icons.chip("manaRegen", `+${fx.manaRegenPercent}%`, "Regeneracja many (bazowa)") : null,
      fx.magicPenetration ? icons.chip("magicPen", `+${fx.magicPenetration}`, "Penetracja magii") : null,
      fx.magicResistance ? icons.chip("mr", `+${fx.magicResistance}`, "Odporność magiczna") : null,
      fx.magicLifesteal ? icons.chip("lifesteal", `+${fx.magicLifesteal}%`, "Magiczny lifesteal") : null,
    ]);
  }

  function createItemCard({ kind, item, index }) {
    const isAd = kind === "ad";
    const key = `${kind}:${item.uid || item.id}`;
    const tags = [tag(isAd ? "AD" : "AP", isAd ? "is-ad" : "is-ap")];
    if (item.unique) tags.push(tag("Unikat", "is-unique"));

    const equip = actionButton(item.equipped ? "Zdejmij" : "Wyposaż", "inv-equip", `eq:${key}`, () => toggleItem(kind, index));
    const sell = sellButton(key, item.name, itemSalePrice(item), () => sellItem(kind, index));

    return buildCard({
      icon: iconSlot(isAd ? "ad-items" : "magic-items", item.id),
      title: item.name,
      badge: item.equipped ? "Wyposażony" : "",
      tags,
      chips: itemChips(kind, item),
      description: createDetails(key, {
        title: item.equipped ? "Po zdjęciu:" : "Po wyposażeniu:",
        rows: itemPreviewRows(kind, item, item.equipped ? -1 : 1),
        note: !item.equipped && !window.hasFreeItemSlot(kind) ? `Brak wolnego slotu ${isAd ? "AD" : "AP"} — najpierw zdejmij inny przedmiot.` : "",
        text: item.description,
      }),
      actions: [equip, sell],
      equipped: item.equipped,
    });
  }

  function collectItems() {
    const player = window.player;
    const ad = (player.adItemInventory || []).map((item, index) => ({ kind: "ad", item, index }));
    const magic = (player.magicInventory || []).map((item, index) => ({ kind: "magic", item, index }));
    return [...ad, ...magic];
  }

  function renderFilter(all) {
    const counts = {
      all: all.length,
      equipped: all.filter((entry) => entry.item.equipped).length,
      bag: all.filter((entry) => !entry.item.equipped).length,
    };
    filterBar.replaceChildren(...FILTERS.map(({ id, label }) => {
      const button = el("button", `inv-filter-btn${filter === id ? " active" : ""}`);
      button.type = "button";
      button.setAttribute("aria-pressed", String(filter === id));
      button.dataset.focusKey = `filter:${id}`;
      button.appendChild(el("span", "", label));
      button.appendChild(el("span", "inv-filter-count", String(counts[id])));
      button.addEventListener("click", () => {
        filter = id;
        clearPending();
        refresh();
      });
      return button;
    }));
  }

  function renderItems() {
    const all = collectItems();
    renderFilter(all);
    renderBulk(all);

    const term = searchTerm.trim().toLowerCase();
    const visible = all
      .filter((entry) => filter === "all" || (filter === "equipped") === Boolean(entry.item.equipped))
      .filter((entry) => !term || entry.item.name.toLowerCase().includes(term));

    // Domyślnie stała kolejność (AD, potem AP), żeby karty nie skakały po wyposażeniu.
    if (sortMode === "price-asc") visible.sort((x, y) => itemSalePrice(x.item) - itemSalePrice(y.item));
    else if (sortMode === "price-desc") visible.sort((x, y) => itemSalePrice(y.item) - itemSalePrice(x.item));
    else if (sortMode === "name") visible.sort((x, y) => x.item.name.localeCompare(y.item.name, "pl"));

    if (!visible.length) {
      const empty = el("p", "inv-empty", all.length
        ? "Brak przedmiotów pasujących do filtrów."
        : "Nie masz jeszcze przedmiotów. Kup je w sklepie.");
      magicItems.replaceChildren(empty);
      return;
    }
    magicItems.replaceChildren(...visible.map(createItemCard));
  }

  // ---- Sloty ----------------------------------------------------------------

  function slotRow(label, total, pips, ariaLabel) {
    const row = el("div", "slot-row");
    row.setAttribute("role", "img");
    row.setAttribute("aria-label", ariaLabel);
    row.appendChild(el("span", "slot-label", label));
    const track = el("span", "slot-pips");
    pips.forEach((type) => track.appendChild(el("span", `slot-pip${type ? ` is-${type}` : ""}`)));
    row.appendChild(track);
    row.appendChild(el("span", "slot-count", `${pips.filter(Boolean).length}/${total}`));
    return row;
  }

  function renderSlots() {
    const player = window.player;
    const used = window.countEquippedItems();
    const rows = [];

    if (player.classId === "archer") {
      // Sloty łucznika są wspólne: każdy zajęty slot jest albo AD, albo AP.
      const total = window.ARCHER_ITEM_SLOTS;
      const pips = [
        ...Array(used.ad).fill("ad"),
        ...Array(used.magic).fill("ap"),
      ].slice(0, total);
      while (pips.length < total) pips.push("");
      rows.push(slotRow("AD/AP", total, pips, `Sloty wspólne: zajęte ${used.ad + used.magic} z ${total} (AD: ${used.ad}, AP: ${used.magic})`));
    } else {
      if (player.adItemSlots > 0) {
        const pips = Array.from({ length: player.adItemSlots }, (_, i) => (i < used.ad ? "ad" : ""));
        rows.push(slotRow("AD", player.adItemSlots, pips, `Sloty AD: zajęte ${used.ad} z ${player.adItemSlots}`));
      }
      const pips = Array.from({ length: player.magicItemSlots }, (_, i) => (i < used.magic ? "ap" : ""));
      rows.push(slotRow("AP", player.magicItemSlots, pips, `Sloty AP: zajęte ${used.magic} z ${player.magicItemSlots}`));
    }
    slotMeter.replaceChildren(...rows);
  }

  // ---- Odświeżanie ----------------------------------------------------------

  function refresh() {
    const player = window.player;
    // Odświeżenie podmienia przyciski, więc zapamiętujemy fokus klawiatury i go przywracamy.
    const focusKey = inventoryScreen.contains(document.activeElement) ? document.activeElement.dataset?.focusKey : null;

    money.textContent = `💸 Hajs: ${player.money} $`;
    renderCurrentWeapon();
    renderWeapons();
    renderSlots();
    renderItems();

    if (focusKey) {
      const target = [...inventoryScreen.querySelectorAll("[data-focus-key]")].find((node) => node.dataset.focusKey === focusKey && !node.disabled);
      if (target) target.focus({ preventScroll: true });
    }
    window.refreshMainMenu();
  }

  function openInventory() {
    clearPending();
    filter = "all";
    searchTerm = "";
    searchInput.value = "";
    refresh();
    mainMenu.classList.add("hidden");
    inventoryScreen.classList.remove("hidden");
    // Na ekranie dotykowym nie ma najechania, więc podpowiadamy, jak zobaczyć nazwę statystyki.
    const touch = window.matchMedia("(hover: none)").matches;
    showMessage(touch ? "Dotknij ikony statystyki, aby zobaczyć jej nazwę. Pełny podgląd zmian jest w „Szczegóły”." : "Wybierz broń lub przedmiot.");
  }

  function closeInventory() {
    clearPending();
    inventoryScreen.classList.add("hidden");
    mainMenu.classList.remove("hidden");
    window.refreshMainMenu();
  }

  window.refreshInventory = refresh;
  inventoryButton.addEventListener("click", openInventory);
  backButton.addEventListener("click", closeInventory);
  searchInput.addEventListener("input", () => {
    searchTerm = searchInput.value;
    clearPending();
    renderItems();
  });
  sortSelect.addEventListener("change", () => {
    sortMode = sortSelect.value;
    clearPending();
    renderItems();
  });
})();

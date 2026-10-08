(function () {
  const mainMenu = document.getElementById("main-menu");
  const skinScreen = document.getElementById("skin-screen");
  const openButton = document.getElementById("change-playerModel");
  const backButton = document.getElementById("skin-back-btn");
  const points = document.getElementById("skin-points");
  const search = document.getElementById("skin-search");
  const list = document.getElementById("skin-list");
  const message = document.getElementById("skin-message");
  const layout = document.querySelector(".skin-layout");
  const backdrop = document.getElementById("skin-backdrop");
  const details = document.getElementById("skin-details");
  const detailsClose = document.getElementById("skin-details-close");
  const detailsName = document.getElementById("skin-details-name");
  const detailsRarity = document.getElementById("skin-details-rarity");
  const variants = document.getElementById("skin-variants");
  const alivePreview = document.getElementById("skin-alive-preview");
  const deadPreview = document.getElementById("skin-dead-preview");
  const actions = document.getElementById("skin-actions");
  const filters = [...document.querySelectorAll(".skin-filter")];
  const rarityOrder = ["ultimate", "legendary", "mythic", "epic", "rare", "basic"];
  let selectedRarity = null;
  let selectedSkinId = null;

  // Na telefonie podgląd jest oknem nad siatką; na desktopie ta klasa nic nie zmienia.
  function isModalOpen() {
    return layout.classList.contains("skin-modal-open");
  }

  function openModal() {
    layout.classList.add("skin-modal-open");
  }

  function closeModal() {
    layout.classList.remove("skin-modal-open");
  }

  function showMessage(text, type) {
    window.setStatusMessage(message, text, "shop-message", type);
    // Komunikat pod siatką jest zasłonięty przez okno podglądu, więc dodatkowo toast.
    if (isModalOpen() && window.showToast) window.showToast(text, type);
  }

  function getSkin(id) {
    return window.skinCatalog.find((skin) => skin.id === id);
  }

  function isOwned(id) {
    return window.player.skinInventory.includes(id);
  }

  function rarityCount(rarity) {
    const skins = window.skinCatalog.filter((skin) => skin.rarity === rarity);
    const owned = skins.filter((skin) => isOwned(skin.id)).length;
    return `${owned}/${skins.length}`;
  }

  function setModelPreview(image, skin) {
    image.alt = skin.name;
    image.onerror = () => {
      image.onerror = null;
      image.src = "res/skins/player_model.png";
    };
    image.src = skin.modelAlive;
  }

  function setVariantPreview(image, path, fallback, alt) {
    image.alt = alt;
    image.onerror = () => {
      image.onerror = null;
      image.src = fallback;
    };
    image.src = path || fallback;
  }

  function skinBadgeText(skin) {
    const attributes = skin.id === "default"
      ? "Basic | Darmowy"
      : `${skin.rarity} | ${skin.cost} SP`;
    return skin.collection && skin.collection !== "no"
      ? `Kolekcja: ${skin.collection} | ${attributes}`
      : attributes;
  }

  function skinStatusText(skin) {
    if (skin.id === window.player.skinName) return "Wyposażony";
    if (isOwned(skin.id)) return "Posiadany";
    return `${skin.cost} SP`;
  }

  function equipSkin(skin) {
    window.player.skinName = skin.id;
    refresh();
    window.refreshMainMenu();
    showMessage(`Wyposażono skina: ${skin.name}.`, "success");
  }

  function buySkin(skin) {
    if (window.player.skinPoints < skin.cost) {
      showMessage("Za mało Skin Points!", "danger");
      return;
    }

    window.player.skinPoints -= skin.cost;
    window.player.skinInventory.push(skin.id);
    window.player.skinName = skin.id;
    refresh();
    window.refreshMainMenu();
    showMessage(`Kupiono i wyposażono skina: ${skin.name}!`, "success");
  }

  function sellSkin(skin) {
    if (!skin.sellable || skin.id === "default") {
      showMessage("Domyślnego skina nie można sprzedać.", "warning");
      return;
    }
    if (window.player.skinName === skin.id) {
      showMessage("Najpierw wyposaż innego skina.", "warning");
      return;
    }

    const salePrice = Math.round(skin.cost * 0.5);
    window.player.skinPoints += salePrice;
    window.player.skinInventory = window.player.skinInventory.filter((id) => id !== skin.id);
    refresh();
    showMessage(`Sprzedano skina ${skin.name} za ${salePrice} SP.`, "success");
  }

  function createActionButton(text, disabled, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.disabled = disabled;
    button.addEventListener("click", onClick);
    return button;
  }

  // Przyciski kup / wyposaż / sprzedaj są tylko w podglądzie wybranego skina.
  function renderActions(skin) {
    const equipped = skin.id === window.player.skinName;
    const buttons = [];

    if (isOwned(skin.id)) {
      buttons.push(createActionButton(equipped ? "Wyposażony" : "Wyposaż", equipped, () => equipSkin(skin)));
      if (skin.sellable && skin.id !== "default") {
        buttons.push(createActionButton(
          `Sprzedaj (${Math.round(skin.cost * 0.5)} SP)`,
          equipped,
          () => sellSkin(skin)
        ));
      }
    } else {
      buttons.push(createActionButton(`Kup za ${skin.cost} SP`, false, () => buySkin(skin)));
    }

    actions.replaceChildren(...buttons);
  }

  function renderDetails(skin) {
    details.classList.remove("hidden");
    variants.classList.remove("hidden");
    detailsName.textContent = skin.name;
    detailsRarity.textContent = skinBadgeText(skin);
    detailsRarity.className = `skin-rarity skin-rarity-${skin.rarity}`;
    setVariantPreview(alivePreview, skin.modelAlive, "res/skins/player_model.png", `${skin.name} — żywy`);
    setVariantPreview(deadPreview, skin.modelDead, "res/skins/player_model.png", `${skin.name} — martwy`);
    renderActions(skin);
    document.querySelectorAll(".skin-card").forEach((card) => {
      card.classList.toggle("skin-card-selected", card.dataset.skinId === skin.id);
    });
  }

  function selectSkin(skin) {
    selectedSkinId = skin.id;
    renderDetails(skin);
    openModal();
  }

  function clearSelectedSkin() {
    selectedSkinId = null;
    details.classList.remove("hidden");
    detailsName.textContent = "Kliknij skina, aby zobaczyć podgląd.";
    detailsRarity.textContent = "";
    detailsRarity.className = "";
    variants.classList.add("hidden");
    actions.replaceChildren();
    closeModal();
  }

  function createSkinCard(skin) {
    const card = document.createElement("article");
    card.className = "skin-card";
    card.dataset.skinId = skin.id;
    card.tabIndex = 0;
    card.addEventListener("click", () => selectSkin(skin));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectSkin(skin);
      }
    });
    if (skin.id === window.player.skinName) card.classList.add("skin-card-equipped");
    if (skin.id === selectedSkinId) card.classList.add("skin-card-selected");
    if (!isOwned(skin.id)) card.classList.add("skin-card-locked");

    const preview = document.createElement("img");
    preview.className = "skin-preview";
    setModelPreview(preview, skin);
    card.appendChild(preview);

    const title = document.createElement("h3");
    title.textContent = skin.name;
    card.appendChild(title);

    const status = document.createElement("p");
    status.className = "skin-card-status";
    status.textContent = skinStatusText(skin);
    card.appendChild(status);

    return card;
  }

  function createSkinGrid(skins) {
    const grid = document.createElement("div");
    grid.className = "skin-grid";
    grid.append(...skins.map(createSkinCard));
    return grid;
  }

  function createRaritySection(rarity, skins) {
    const section = document.createElement("section");
    section.className = "skin-group";

    const title = document.createElement("h3");
    title.className = `skin-group-title skin-rarity-${rarity}`;
    const name = document.createElement("span");
    name.textContent = rarity;
    const count = document.createElement("span");
    count.className = "skin-group-count";
    count.textContent = rarityCount(rarity);
    title.append(name, count);
    section.appendChild(title);

    section.appendChild(createSkinGrid(skins));
    return section;
  }

  function refresh() {
    const searchTerm = search.value.trim().toLowerCase();
    points.textContent = `🎨 SP: ${window.player.skinPoints}`;
    filters.forEach((filter) => {
      filter.querySelector(".skin-filter-count").textContent = rarityCount(filter.dataset.rarity);
    });

    const visibleSkins = window.skinCatalog.filter((skin) => {
      const matchesRarity = !selectedRarity || skin.rarity === selectedRarity;
      const matchesSearch = skin.name.toLowerCase().includes(searchTerm);
      return matchesRarity && matchesSearch;
    });

    list.classList.toggle("skin-list-filtered", Boolean(selectedRarity));
    if (visibleSkins.length === 0) {
      const empty = document.createElement("p");
      empty.className = "skin-empty";
      empty.textContent = "Brak skinów pasujących do wyszukiwania.";
      list.replaceChildren(empty);
    } else if (selectedRarity) {
      // Po wciśnięciu filtra: tylko wybrana rzadkość, w jednej siatce bez nagłówków.
      list.replaceChildren(createSkinGrid(visibleSkins));
    } else {
      // Widok ogólny: po jednym przewijanym rzędzie na rzadkość; puste sekcje się chowają.
      const known = new Set(rarityOrder);
      const order = [...rarityOrder, ...new Set(visibleSkins.map((skin) => skin.rarity).filter((r) => !known.has(r)))];
      const sections = order
        .map((rarity) => [rarity, visibleSkins.filter((skin) => skin.rarity === rarity)])
        .filter(([, skins]) => skins.length > 0)
        .map(([rarity, skins]) => createRaritySection(rarity, skins));
      list.replaceChildren(...sections);
    }

    const selectedSkin = selectedSkinId ? getSkin(selectedSkinId) : null;
    if (selectedSkin && visibleSkins.some((skin) => skin.id === selectedSkinId)) {
      renderDetails(selectedSkin);
    } else {
      clearSelectedSkin();
    }
  }

  function openSkins() {
    closeModal();
    refresh();
    mainMenu.classList.add("hidden");
    skinScreen.classList.remove("hidden");
    showMessage("Wybierz skina.");
  }

  function closeSkins() {
    closeModal();
    skinScreen.classList.add("hidden");
    mainMenu.classList.remove("hidden");
    window.refreshMainMenu();
  }

  filters.forEach((filter) => {
    filter.addEventListener("click", () => {
      // Ponowne kliknięcie aktywnego filtra wraca do widoku ogólnego.
      selectedRarity = selectedRarity === filter.dataset.rarity ? null : filter.dataset.rarity;
      filters.forEach((item) => {
        const active = item.dataset.rarity === selectedRarity;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      refresh();
      list.scrollTop = 0;
    });
  });

  search.addEventListener("input", refresh);
  detailsClose.addEventListener("click", closeModal);
  backdrop.addEventListener("click", closeModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isModalOpen()) closeModal();
  });
  openButton.addEventListener("click", openSkins);
  backButton.addEventListener("click", closeSkins);
  window.refreshSkins = refresh;
})();

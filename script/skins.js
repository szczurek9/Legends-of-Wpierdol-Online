(function () {
  const mainMenu = document.getElementById("main-menu");
  const skinScreen = document.getElementById("skin-screen");
  const openButton = document.getElementById("change-playerModel");
  const backButton = document.getElementById("skin-back-btn");
  const points = document.getElementById("skin-points");
  const search = document.getElementById("skin-search");
  const list = document.getElementById("skin-list");
  const message = document.getElementById("skin-message");
  const details = document.getElementById("skin-details");
  const detailsName = document.getElementById("skin-details-name");
  const detailsRarity = document.getElementById("skin-details-rarity");
  const variants = document.getElementById("skin-variants");
  const alivePreview = document.getElementById("skin-alive-preview");
  const deadPreview = document.getElementById("skin-dead-preview");
  const filters = [...document.querySelectorAll(".skin-filter")];
  let selectedRarity = "all";
  let selectedSkinId = null;

  function showMessage(text, type) {
    message.textContent = text;
    message.className = `shop-message ${type || ""}`.trim();
  }

  function getSkin(id) {
    return window.skinCatalog.find((skin) => skin.id === id);
  }

  function isOwned(id) {
    return window.player.skinInventory.includes(id);
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

  function selectSkin(skin) {
    selectedSkinId = skin.id;
    details.classList.remove("hidden");
    variants.classList.remove("hidden");
    detailsName.textContent = skin.name;
    detailsRarity.textContent = skin.id === "default"
      ? "Basic | Darmowy"
      : `${skin.rarity} | ${skin.cost} SP`;
    detailsRarity.className = `skin-rarity skin-rarity-${skin.rarity}`;
    setVariantPreview(alivePreview, skin.modelAlive, "res/skins/player_model.png", `${skin.name} — żywy`);
    setVariantPreview(deadPreview, skin.modelDead, "res/skins/player_model.png", `${skin.name} — martwy`);
    document.querySelectorAll(".skin-card").forEach((card) => {
      card.classList.toggle("skin-card-selected", card.dataset.skinId === skin.id);
    });
  }

  function clearSelectedSkin() {
    selectedSkinId = null;
    details.classList.remove("hidden");
    detailsName.textContent = "Kliknij skina, aby zobaczyć podgląd.";
    detailsRarity.textContent = "";
    detailsRarity.className = "";
    variants.classList.add("hidden");
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

    const preview = document.createElement("img");
    preview.className = "skin-preview";
    setModelPreview(preview, skin);
    card.appendChild(preview);

    const title = document.createElement("h3");
    title.textContent = skin.name;
    card.appendChild(title);

    const rarity = document.createElement("p");
    rarity.textContent = skin.id === "default"
      ? "Basic | Darmowy"
      : `${skin.rarity} | ${skin.cost} SP`;
    rarity.className = `skin-rarity skin-rarity-${skin.rarity}`;
    card.appendChild(rarity);

    const actions = document.createElement("div");
    actions.className = "skin-card-actions";

    if (isOwned(skin.id)) {
      const equipButton = document.createElement("button");
      equipButton.type = "button";
      equipButton.textContent = skin.id === window.player.skinName ? "Wyposażony" : "Wyposaż";
      equipButton.disabled = skin.id === window.player.skinName;
      equipButton.addEventListener("click", () => equipSkin(skin));
      actions.appendChild(equipButton);

      if (skin.sellable && skin.id !== "default") {
        const sellButton = document.createElement("button");
        sellButton.type = "button";
        sellButton.textContent = `Sprzedaj (${Math.round(skin.cost * 0.5)} SP)`;
        sellButton.disabled = skin.id === window.player.skinName;
        sellButton.addEventListener("click", () => sellSkin(skin));
        actions.appendChild(sellButton);
      }
    } else {
      const buyButton = document.createElement("button");
      buyButton.type = "button";
      buyButton.textContent = `Kup za ${skin.cost} SP`;
      buyButton.addEventListener("click", () => buySkin(skin));
      actions.appendChild(buyButton);
    }

    card.appendChild(actions);
    return card;
  }

  function refresh() {
    const searchTerm = search.value.trim().toLowerCase();
    points.textContent = `🎨 SP: ${window.player.skinPoints}`;
    const visibleSkins = window.skinCatalog.filter((skin) => {
      const matchesRarity = selectedRarity === "all" || skin.rarity === selectedRarity;
      const matchesSearch = skin.name.toLowerCase().includes(searchTerm);
      return matchesRarity && matchesSearch;
    });
    list.replaceChildren(...visibleSkins.map(createSkinCard));
    if (selectedSkinId) {
      const selectedSkin = getSkin(selectedSkinId);
      if (selectedSkin && visibleSkins.some((skin) => skin.id === selectedSkinId)) {
        selectSkin(selectedSkin);
      } else {
        clearSelectedSkin();
      }
    } else {
      clearSelectedSkin();
    }
  }

  function openSkins() {
    refresh();
    mainMenu.classList.add("hidden");
    skinScreen.classList.remove("hidden");
    showMessage("Wybierz skina.");
  }

  function closeSkins() {
    skinScreen.classList.add("hidden");
    mainMenu.classList.remove("hidden");
    window.refreshMainMenu();
  }

  filters.forEach((filter) => {
    filter.addEventListener("click", () => {
      selectedRarity = filter.dataset.rarity;
      filters.forEach((item) => item.classList.toggle("active", item === filter));
      refresh();
    });
  });

  search.addEventListener("input", refresh);
  openButton.addEventListener("click", openSkins);
  backButton.addEventListener("click", closeSkins);
  window.refreshSkins = refresh;
})();

const startScreen = document.getElementById("start-screen");
const loginScreen = document.getElementById("login-screen");
const mainMenu = document.getElementById("main-menu");
const mainPlayerModelImage = document.querySelector("#main-playerModel img");
const input = document.getElementById("nickname");
const classSelect = document.getElementById("class-select");
const classDescription = document.getElementById("class-description");
const classCards = document.getElementById("class-cards");
const startButton = document.getElementById("start-game");
const startMessage = document.getElementById("start-message");
const optionsModal = document.getElementById("options-modal");
const saveCode = document.getElementById("save-code");
const optionsMessage = document.getElementById("options-message");

function refreshMainMenu() {
  const formatNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString("pl-PL") : String(value ?? 0);
  };
  mainNickname.textContent = window.player.nickname || "Gracz";
  mainLevel.textContent = formatNumber(window.player.level);
  mainMoney.textContent = `${formatNumber(window.player.money)} $`;
  mainSP.textContent = formatNumber(window.player.skinPoints);
  const currentWeaponDamage = Math.floor((window.player.weaponBaseDamage || window.player.weaponDmg) + (window.player.ad || 0) * (window.player.weaponAdScaling || 0));
  mainWeaponName.textContent = window.player.weaponName;
  mainWeaponDmg.textContent = formatNumber(currentWeaponDamage);
  mainWeaponAd.textContent = formatNumber(window.player.ad || 0);
  mainHp.textContent = formatNumber(window.player.healthPoints);
  mainArmor.textContent = formatNumber(window.player.armorPoints);
  mainCrit.textContent = `${formatNumber(window.player.critChance)}%`;
  mainArmorPen.textContent = formatNumber(window.player.armorPenetration);
  mainMana.textContent = formatNumber(window.player.manaPoints);
  mainAp.textContent = formatNumber(window.player.abilityPower);

  const currentSkin = window.skinCatalog?.find((skin) => skin.id === window.player.skinName);
  if (currentSkin) {
    mainPlayerModelImage.onerror = () => {
      mainPlayerModelImage.onerror = null;
      mainPlayerModelImage.src = "res/skins/player_model.png";
    };
    mainPlayerModelImage.src = currentSkin.modelAlive;
    mainPlayerModelImage.alt = currentSkin.name;
  }

  const arenaBtn = document.getElementById("arena-btn");
  if (arenaBtn) arenaBtn.classList.toggle("hidden", window.player.level < (window.Arena?.UNLOCK_LEVEL ?? 30));
}

function showMainMenu() {
  startScreen.classList.add("hidden");
  loginScreen.classList.add("hidden");
  mainMenu.classList.remove("hidden");
  if (window.applyInterfaceTheme) window.applyInterfaceTheme(window.player.theme);
  refreshMainMenu();
}

function showNewGameLogin() {
  window.SaveSystem.resetPlayer();
  if (window.applyInterfaceTheme) window.applyInterfaceTheme(window.player.theme);
  input.value = "";
  classSelect.value = "assassin";
  renderClassCards();
  updateClassDescription();
  startMessage.textContent = "";
  startScreen.classList.add("hidden");
  mainMenu.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  input.focus();
}

function updateClassDescription() {
  const selected = window.gameClasses?.find((item) => item.id === classSelect.value);
  classDescription.textContent = selected ? selected.description : "Wybierz klasę.";
  syncClassCards();
}

// --- Karty wyboru klasy (zamiast listy rozwijanej) ---
function syncClassCards() {
  classCards.querySelectorAll(".class-card").forEach((card) => {
    const selected = card.dataset.classId === classSelect.value;
    card.classList.toggle("is-selected", selected);
    card.setAttribute("aria-checked", String(selected));
    card.tabIndex = selected ? 0 : -1;
  });
}

function selectClass(classId) {
  classSelect.value = classId;
  classSelect.dispatchEvent(new Event("change"));
}

function renderClassCards() {
  if (!window.gameClasses) {
    // Dane jeszcze się ładują — narysujemy karty, gdy będą gotowe.
    window.gameDataReady?.then(renderClassCards);
    return;
  }
  const icons = window.GameIcons;
  classCards.replaceChildren();
  window.gameClasses.forEach((gameClass) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "class-card";
    card.dataset.classId = gameClass.id;
    card.setAttribute("role", "radio");

    card.appendChild(icons.classIcon(gameClass.id, "class-card-icon"));

    const head = document.createElement("span");
    head.className = "class-card-head";
    const name = document.createElement("span");
    name.className = "class-card-name";
    name.textContent = gameClass.name;
    head.append(name, icons.stars(gameClass.difficulty || 1));
    card.appendChild(head);

    const role = document.createElement("span");
    role.className = "class-card-role";
    role.textContent = gameClass.role || "";
    card.appendChild(role);

    // Podgląd umiejętności aktywnych tej klasy.
    const abilities = window.classAbilities?.[gameClass.id]?.active || [];
    const strip = document.createElement("span");
    strip.className = "class-card-abilities";
    abilities.forEach((ability) => {
      const holder = icons.abilityIcon(gameClass.id, ability, "class-ability-icon");
      holder.title = ability.name;
      strip.appendChild(holder);
    });
    card.appendChild(strip);

    card.addEventListener("click", () => selectClass(gameClass.id));
    classCards.appendChild(card);
  });
  syncClassCards();
}

// Strzałki przełączają klasę (jak w grupie radio).
classCards.addEventListener("keydown", (event) => {
  const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  if (!(event.key in keys)) return;
  const cards = [...classCards.querySelectorAll(".class-card")];
  const current = cards.findIndex((card) => card.dataset.classId === classSelect.value);
  const next = cards[(current + keys[event.key] + cards.length) % cards.length];
  if (!next) return;
  event.preventDefault();
  selectClass(next.dataset.classId);
  next.focus();
});

// Gdy dojdą pliki ikon, odśwież karty (tylko jeśli ekran wyboru jest widoczny).
document.addEventListener("gameicons:ready", () => {
  if (!loginScreen.classList.contains("hidden")) renderClassCards();
});

function showOptionsMessage(text, type) {
  window.setStatusMessage(optionsMessage, text, "screen-message", type);
}

function openOptions() {
  saveCode.value = "";
  showOptionsMessage("");
  optionsModal.classList.remove("hidden");
  saveCode.focus();
}

function closeOptions() {
  optionsModal.classList.add("hidden");
}

function loadCode(code) {
  if (!code || !window.SaveSystem.loadSaveCode(code)) {
    return false;
  }

  showMainMenu();
  return true;
}

function loadFromPrompt() {
  const code = window.prompt("Wklej kod zapisu gry:");
  if (code === null) return;

  if (!loadCode(code)) {
    startMessage.textContent = "Nieprawidłowy lub uszkodzony zapis gry.";
  }
}

document.querySelectorAll("[data-open-wiki]").forEach((button) => {
  button.addEventListener("click", () => window.open("wiki.html", "_blank", "noopener"));
});

window.refreshMainMenu = refreshMainMenu;
window.showMainMenu = showMainMenu;
window.startNewGame = showNewGameLogin;

document.getElementById("new-game-btn").addEventListener("click", showNewGameLogin);
document.getElementById("load-game-btn").addEventListener("click", loadFromPrompt);
classSelect.addEventListener("change", updateClassDescription);

startButton.addEventListener("click", () => {
  const enteredName = input.value.trim();
  if (!enteredName) {
    alert("Najpierw wpisz swój nick!");
    return;
  }

  window.player.nickname = enteredName;
  window.player.classId = classSelect.value;
  const selectedClass = window.gameClasses?.find((item) => item.id === window.player.classId);
  window.player.armorCap = selectedClass?.armorCap || 90;
  const classSlots = window.itemSlotsForClass(window.player.classId);
  window.player.magicItemSlots = classSlots.magic;
  window.player.adItemSlots = classSlots.ad;
  if (window.player.classId === "mage") {
    window.player.maxManaPoints = 320;
    window.player.manaPoints = 320;
    window.player.manaRegenPercent = 125;
    window.player.magicPenetration = 5;
    window.player.armorPoints = 15;
  } else if (window.player.classId === "tank") {
    window.player.maxHealthPoints += 200;
    window.player.healthPoints += 200;
    window.player.bonusArmor = 20;
  } else if (window.player.classId === "assassin") {
    window.player.bonusAccuracy = 10;
    window.player.bonusLifesteal = 5;
  } else if (window.player.classId === "samurai") {
    window.player.bonusAccuracy = 15;
    window.player.bonusDodge = 10;
    window.player.armorPoints = 5;
  } else if (window.player.classId === "archer") {
    window.player.bonusAccuracy = 30;
    window.player.bonusLifesteal = 5;
    window.player.maxManaPoints = 200;
    window.player.manaPoints = 200;
  }
  showMainMenu();
});

document.getElementById("options-btn").addEventListener("click", openOptions);
document.getElementById("close-options-btn").addEventListener("click", closeOptions);

document.getElementById("save-game-btn").addEventListener("click", () => {
  saveCode.value = window.SaveSystem.createSaveCode();
  saveCode.select();
  showOptionsMessage("Zapis gry został wygenerowany.", "success");
});

document.getElementById("copy-save-btn").addEventListener("click", async () => {
  if (!saveCode.value) saveCode.value = window.SaveSystem.createSaveCode();

  try {
    await navigator.clipboard.writeText(saveCode.value);
    showOptionsMessage("Kod zapisu skopiowany do schowka.", "success");
  } catch (error) {
    saveCode.select();
    showOptionsMessage("Zaznaczono kod — skopiuj go ręcznie.", "warning");
  }
});

document.getElementById("load-save-btn").addEventListener("click", () => {
  const code = saveCode.value.trim() || window.prompt("Wklej kod zapisu gry:");
  if (code === null) return;

  if (loadCode(code)) {
    closeOptions();
    showOptionsMessage("Gra została wczytana.", "success");
  } else {
    showOptionsMessage("Nieprawidłowy lub uszkodzony zapis gry.", "danger");
  }
});

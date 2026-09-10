const startScreen = document.getElementById("start-screen");
const loginScreen = document.getElementById("login-screen");
const mainMenu = document.getElementById("main-menu");
const mainSkinPoints = document.getElementById("mainSkinPoints");
const mainPlayerModelImage = document.querySelector("#main-playerModel img");
const input = document.getElementById("nickname");
const startButton = document.getElementById("start-game");
const startMessage = document.getElementById("start-message");
const optionsModal = document.getElementById("options-modal");
const saveCode = document.getElementById("save-code");
const optionsMessage = document.getElementById("options-message");

function refreshMainMenu() {
  mainNickname.textContent = `💭 Nick: ${window.player.nickname}`;
  mainMoney.textContent = `💸 Hajs: ${window.player.money} $`;
  mainLevel.textContent = `⚡ LVL: ${window.player.level}`;
  mainSkinPoints.textContent = `🎨 SP: ${window.player.skinPoints}`;
  mainWeapon.textContent = `⚔️ Broń: ${window.player.weaponName} | ${window.player.weaponDmg} DMG`;
  mainDefenseStats.textContent = `❤️ HP: ${window.player.healthPoints} | 🛡️ Pancerz: ${window.player.armorPoints}`;
  mainOffenseStats.textContent = `💥 Crit: ${window.player.critChance}% | 🗡️ Armor Pen: ${window.player.armorPenetration}`;
  mainMagicStats.textContent = `🔷 Mana: ${window.player.manaPoints} | ⭐ Moc umiejętności: ${window.player.abilityPower}`;

  const currentSkin = window.skinCatalog?.find((skin) => skin.id === window.player.skinName);
  if (currentSkin) {
    mainPlayerModelImage.onerror = () => {
      mainPlayerModelImage.onerror = null;
      mainPlayerModelImage.src = "res/skins/player_model.png";
    };
    mainPlayerModelImage.src = currentSkin.modelAlive;
    mainPlayerModelImage.alt = currentSkin.name;
  }
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
  startMessage.textContent = "";
  startScreen.classList.add("hidden");
  mainMenu.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  input.focus();
}

function showOptionsMessage(text, type) {
  optionsMessage.textContent = text;
  optionsMessage.className = `screen-message ${type || ""}`.trim();
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

window.refreshMainMenu = refreshMainMenu;
window.showMainMenu = showMainMenu;
window.startNewGame = showNewGameLogin;

document.getElementById("new-game-btn").addEventListener("click", showNewGameLogin);
document.getElementById("load-game-btn").addEventListener("click", loadFromPrompt);

startButton.addEventListener("click", () => {
  const enteredName = input.value.trim();
  if (!enteredName) {
    alert("Najpierw wpisz swój nick!");
    return;
  }

  window.player.nickname = enteredName;
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

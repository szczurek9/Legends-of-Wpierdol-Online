// Okno Opcji: zakładki (Zapis / Wygląd), wybór motywu jako kafelki i rozmiar interfejsu
// jako przełącznik. Ukryte <select>y #theme-select i #ui-size-select nadal są źródłem
// prawdy dla themes.js — kafelki tylko ustawiają ich wartość i wysyłają "change".
(function () {
  const modal = document.getElementById("options-modal");
  if (!modal) return;

  const tabs = Array.from(modal.querySelectorAll("[data-opt-tab]"));
  const panels = {
    save: modal.querySelector("#opt-panel-save"),
    look: modal.querySelector("#opt-panel-look"),
    combat: modal.querySelector("#opt-panel-combat"),
  };
  const themeSelect = document.getElementById("theme-select");
  const sizeSelect = document.getElementById("ui-size-select");
  const swatches = Array.from(modal.querySelectorAll("[data-theme-id]"));
  const sizeButtons = Array.from(modal.querySelectorAll("[data-size]"));

  function selectTab(name, focus) {
    tabs.forEach((tab) => {
      const active = tab.dataset.optTab === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    });
    Object.entries(panels).forEach(([key, panel]) => panel.classList.toggle("hidden", key !== name));
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab.dataset.optTab));
    tab.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      selectTab(tabs[(index + step + tabs.length) % tabs.length].dataset.optTab, true);
    });
  });

  // Zaznaczenie kafelków zawsze odzwierciedla aktualną wartość selectów.
  function syncAppearance() {
    swatches.forEach((swatch) => {
      const checked = swatch.dataset.themeId === themeSelect.value;
      swatch.setAttribute("aria-checked", String(checked));
      swatch.classList.toggle("is-selected", checked);
    });
    sizeButtons.forEach((button) => {
      const checked = button.dataset.size === sizeSelect.value;
      button.setAttribute("aria-checked", String(checked));
      button.classList.toggle("is-selected", checked);
    });
  }

  function choose(select, value) {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    syncAppearance();
  }

  swatches.forEach((swatch) => swatch.addEventListener("click", () => choose(themeSelect, swatch.dataset.themeId)));
  sizeButtons.forEach((button) => button.addEventListener("click", () => choose(sizeSelect, button.dataset.size)));

  // --- Zakładka Walka: sterowanie i auto-walka (dane trzyma window.GameSettings) ---
  const Settings = window.GameSettings;
  const bindButtons = Array.from(modal.querySelectorAll("[data-bind]"));
  const keysStatus = modal.querySelector("#opt-keys-status");
  const autoInputs = {
    noPause: modal.querySelector("#opt-auto-no-pause"),
    usePotions: modal.querySelector("#opt-auto-potions"),
    keepAfterLevel: modal.querySelector("#opt-auto-keep"),
    restartOnDeath: modal.querySelector("#opt-auto-restart"),
  };
  const delayInput = modal.querySelector("#opt-auto-delay");
  const delayValue = modal.querySelector("#opt-auto-delay-value");
  const delayRow = modal.querySelector("#opt-auto-delay-row");
  const ACTION_NAMES = {
    slot1: "Atak",
    slot2: "Umiejętność 1",
    slot3: "Umiejętność 2",
    slot4: "Umiejętność 3",
    weapon: "Umiejętność broni",
    auto: "Auto-walka",
  };

  let capturing = null;          // { action, button } podczas oczekiwania na klawisz
  let suppressClickUntil = 0;    // Spacja potwierdzona na przycisku odpala jeszcze „click” po keyup

  function renderCombat() {
    bindButtons.forEach((button) => {
      const isCapturing = capturing && capturing.button === button;
      button.textContent = isCapturing ? "Naciśnij klawisz…" : Settings.label(button.dataset.bind);
      button.classList.toggle("is-capturing", Boolean(isCapturing));
      button.setAttribute("aria-label", `${ACTION_NAMES[button.dataset.bind]}: klawisz ${Settings.label(button.dataset.bind)}. Kliknij, aby zmienić.`);
    });
    const auto = Settings.auto;
    Object.entries(autoInputs).forEach(([name, input]) => { input.checked = auto[name]; });
    delayInput.value = String(auto.restartDelay);
    delayValue.textContent = `${auto.restartDelay} s`;
    delayInput.disabled = !auto.restartOnDeath;
    delayRow.classList.toggle("is-disabled", !auto.restartOnDeath);
  }

  function stopCapture() {
    capturing = null;
    document.removeEventListener("keydown", onCaptureKey, true);
    renderCombat();
  }

  function onCaptureKey(event) {
    if (!capturing) return;
    // Przechwytujemy klawisz wcześniej niż walka i samouczek, żeby nie odpalił akcji.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === "Escape") {
      keysStatus.textContent = "";
      stopCapture();
      return;
    }
    if (event.repeat || ["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock"].includes(event.key)) return;
    const key = Settings.keyFromEvent(event);
    if (!key || event.ctrlKey || event.metaKey || event.altKey) {
      keysStatus.textContent = "Tego klawisza nie można użyć. Wybierz literę, cyfrę, znak, strzałkę albo Spację.";
      return;
    }
    const { action } = capturing;
    const swapped = Settings.setKey(action, key);
    suppressClickUntil = Date.now() + 400;
    keysStatus.textContent = swapped
      ? `${Settings.label(action)} → ${ACTION_NAMES[action]}. Klawisz był zajęty, więc „${ACTION_NAMES[swapped]}” dostał ${Settings.label(swapped)}.`
      : `${ACTION_NAMES[action]}: ${Settings.label(action)}.`;
    stopCapture();
    focusBinding(action);
  }

  function focusBinding(action) {
    bindButtons.find((button) => button.dataset.bind === action)?.focus();
  }

  bindButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      if (event.detail === 0 && Date.now() < suppressClickUntil) return;   // echo Spacji z poprzedniego przypisania
      if (capturing && capturing.button === button) {   // drugi klik = anuluj
        stopCapture();
        return;
      }
      if (capturing) stopCapture();
      capturing = { action: button.dataset.bind, button };
      keysStatus.textContent = "";
      document.addEventListener("keydown", onCaptureKey, true);
      renderCombat();
    });
    // Zmiana fokusu na inny element kończy oczekiwanie na klawisz.
    button.addEventListener("blur", () => {
      if (capturing && capturing.button === button) stopCapture();
    });
  });

  Object.entries(autoInputs).forEach(([name, input]) => {
    input.addEventListener("change", () => Settings.setAuto(name, input.checked));
  });
  delayInput.addEventListener("input", () => Settings.setAuto("restartDelay", delayInput.value));

  modal.querySelector("#opt-keys-reset-btn").addEventListener("click", () => {
    Settings.resetKeys();
    keysStatus.textContent = "Przywrócono domyślne klawisze.";
  });
  modal.querySelector("#opt-auto-reset-btn").addEventListener("click", () => Settings.resetAuto());

  // Odświeżamy po każdej zmianie ustawień (także tej zrobionej z innego miejsca).
  Settings.subscribe(renderCombat);

  // Okno otwierają różne miejsca (menu, panel chmury), więc reagujemy na samo pokazanie:
  // zawsze startuje na zakładce Zapis ze świeżym stanem kafelków.
  let wasHidden = modal.classList.contains("hidden");
  new MutationObserver(() => {
    const hidden = modal.classList.contains("hidden");
    if (!wasHidden && hidden && capturing) stopCapture();
    if (wasHidden && !hidden) {
      selectTab("save");
      syncAppearance();
      renderCombat();
      keysStatus.textContent = "";
    }
    wasHidden = hidden;
  }).observe(modal, { attributes: true, attributeFilter: ["class"] });

  // Esc i kliknięcie w tło zamykają okno.
  const closeButton = document.getElementById("close-options-btn");
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden") && !capturing) closeButton.click();
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeButton.click();
  });

  syncAppearance();
  renderCombat();
})();

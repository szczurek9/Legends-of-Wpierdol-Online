// Okno Opcji: zakładki (Zapis / Wygląd), wybór motywu jako kafelki i rozmiar interfejsu
// jako przełącznik. Ukryte <select>y #theme-select i #ui-size-select nadal są źródłem
// prawdy dla themes.js — kafelki tylko ustawiają ich wartość i wysyłają "change".
(function () {
  const modal = document.getElementById("options-modal");
  if (!modal) return;

  const tabs = Array.from(modal.querySelectorAll("[data-opt-tab]"));
  const panels = { save: modal.querySelector("#opt-panel-save"), look: modal.querySelector("#opt-panel-look") };
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

  // Okno otwierają różne miejsca (menu, panel chmury), więc reagujemy na samo pokazanie:
  // zawsze startuje na zakładce Zapis ze świeżym stanem kafelków.
  let wasHidden = modal.classList.contains("hidden");
  new MutationObserver(() => {
    const hidden = modal.classList.contains("hidden");
    if (wasHidden && !hidden) {
      selectTab("save");
      syncAppearance();
    }
    wasHidden = hidden;
  }).observe(modal, { attributes: true, attributeFilter: ["class"] });

  // Esc i kliknięcie w tło zamykają okno.
  const closeButton = document.getElementById("close-options-btn");
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) closeButton.click();
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeButton.click();
  });

  syncAppearance();
})();

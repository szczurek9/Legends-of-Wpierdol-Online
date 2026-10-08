(function () {
  const themeSelect = document.getElementById("theme-select");
  const sizeSelect = document.getElementById("ui-size-select");

  function applyTheme(theme) {
    const selectedTheme = window.normalizeTheme(theme);
    document.body.dataset.theme = selectedTheme;
    window.player.theme = selectedTheme;
    themeSelect.value = selectedTheme;
  }

  themeSelect.addEventListener("change", () => {
    applyTheme(themeSelect.value);
  });

  // Rozmiar interfejsu: zapamiętywany w przeglądarce (nie w zapisie gry), pusta wartość = domyślny.
  function applyUiSize(size) {
    const root = document.documentElement;
    if (size) root.style.setProperty("--ui-font-size", `${size}px`);
    else root.style.removeProperty("--ui-font-size");
  }

  function readStoredUiSize() {
    try { return localStorage.getItem("low-ui-size") || ""; } catch (error) { return ""; }
  }

  function storeUiSize(size) {
    try {
      if (size) localStorage.setItem("low-ui-size", size);
      else localStorage.removeItem("low-ui-size");
    } catch (error) { /* brak dostępu do localStorage - rozmiar działa do końca sesji */ }
  }

  if (sizeSelect) {
    sizeSelect.value = readStoredUiSize();
    if (sizeSelect.value !== readStoredUiSize()) sizeSelect.value = "";
    sizeSelect.addEventListener("change", () => {
      applyUiSize(sizeSelect.value);
      storeUiSize(sizeSelect.value);
    });
  }

  window.applyInterfaceTheme = applyTheme;
  applyTheme(window.player.theme || window.DEFAULT_THEME);
})();

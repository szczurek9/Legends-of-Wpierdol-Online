(function () {
  const themeSelect = document.getElementById("theme-select");
  const themes = ["prism", "night", "neon", "nature"];

  function applyTheme(theme) {
    const selectedTheme = themes.includes(theme) ? theme : "prism";
    document.body.dataset.theme = selectedTheme;
    window.player.theme = selectedTheme;
    themeSelect.value = selectedTheme;
  }

  themeSelect.addEventListener("change", () => {
    applyTheme(themeSelect.value);
  });

  window.applyInterfaceTheme = applyTheme;
  applyTheme(window.player.theme || "prism");
})();

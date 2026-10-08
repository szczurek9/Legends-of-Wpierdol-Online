// Ikony statystyk, klas, mikstur i umiejętności.
//
// Każda ikona ma dwie warstwy: obrazek PNG (opcjonalny) i emotkę zastępczą.
// Jeśli pliku nie ma w res/icons/..., wyświetla się emotka — dzięki temu
// ikony można dorysowywać po kolei, bez ruszania kodu.
//
//   res/icons/stats/<plik>.png     64x64   (lista poniżej w STATS)
//   res/icons/classes/<id>.png     96x96   (jak ikony umiejętności)
//   res/icons/potions/<id>.png     64x64
//   res/abilities/<klasa>/abilityN.png      (już istniejące, 96x96)
(function () {
  const STATS = {
    hp:        { file: "hp",         glyph: "❤️", label: "Zdrowie (HP)" },
    mana:      { file: "mana",       glyph: "🔷", label: "Mana" },
    damage:    { file: "damage",     glyph: "⚔️", label: "Obrażenia" },
    ad:        { file: "ad",         glyph: "AD", label: "Siła ataku (AD)", text: true },
    crit:      { file: "crit",       glyph: "💥", label: "Szansa na krytyka" },
    armorPen:  { file: "armor-pen",  glyph: "🗡️", label: "Penetracja pancerza" },
    ap:        { file: "ap",         glyph: "⭐", label: "Moc umiejętności (AP)" },
    manaRegen: { file: "mana-regen", glyph: "🔷", label: "Regeneracja many na turę" },
    armor:     { file: "armor",      glyph: "🛡️", label: "Pancerz" },
    mr:        { file: "mr",         glyph: "MR", label: "Odporność magiczna", text: true },
    accuracy:  { file: "accuracy",   glyph: "🎯", label: "Celność" },
    lifesteal: { file: "lifesteal",  glyph: "🩸", label: "Kradzież życia (lifesteal)" },
    magicPen:  { file: "magic-pen",  glyph: "🪄", label: "Penetracja magii" },
  };

  const CLASS_GLYPHS = { assassin: "🥷", mage: "🧙", tank: "🛡️", samurai: "⚔️", archer: "🏹" };
  const ABILITY_GLYPHS = { physical: "⚔️", magic: "🔮", utility: "✨", hybrid: "⚡", toggle: "🔄" };
  const POTION_GLYPH = "🧪";

  // Które adresy obrazków istnieją (wiemy dopiero po próbnym załadowaniu).
  const known = new Map(); // url -> true | false | Promise
  function probe(url) {
    if (known.has(url)) return Promise.resolve(known.get(url));
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => { known.set(url, true); resolve(true); };
      image.onerror = () => { known.set(url, false); resolve(false); };
      image.src = url;
    });
  }
  const exists = (url) => known.get(url) === true;

  const statUrl = (key) => `res/icons/stats/${STATS[key].file}.png`;
  const classUrl = (id) => `res/icons/classes/${id}.png`;
  const potionUrl = (id) => `res/icons/potions/${id}.png`;
  const abilityUrl = (classId, ability) => `res/abilities/${classId}/${ability.icon}`;

  // Element ikony: <img> jeśli plik istnieje, w przeciwnym razie emotka.
  function make(url, glyph, className, isText) {
    const holder = document.createElement("span");
    holder.className = `game-icon ${className || ""}`.trim();
    holder.setAttribute("aria-hidden", "true");
    const showGlyph = () => {
      const span = document.createElement("span");
      span.className = `game-icon-glyph${isText ? " is-text" : ""}`;
      span.textContent = glyph;
      holder.replaceChildren(span);
    };
    if (url && exists(url)) {
      const image = new Image();
      image.alt = "";
      image.draggable = false;
      image.addEventListener("error", showGlyph, { once: true });
      image.src = url;
      holder.appendChild(image);
    } else {
      showGlyph();
      if (url && !known.has(url)) probe(url); // następne renderowanie już zobaczy obrazek
    }
    return holder;
  }

  function stat(key, className) {
    const def = STATS[key];
    if (!def) return make(null, "•", className);
    return make(statUrl(key), def.glyph, className, def.text);
  }

  // Chip „ikona + wartość”. Etykieta pokazuje się po najechaniu, fokusie albo dotknięciu.
  function chip(key, value, label) {
    const def = STATS[key] || { label: key };
    const text = label || def.label;
    const element = document.createElement("span");
    element.className = "stat-chip";
    element.dataset.stat = key;
    element.dataset.label = text;
    element.tabIndex = 0;
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", `${text}: ${value}`);
    element.appendChild(stat(key));
    const number = document.createElement("b");
    number.textContent = value;
    element.appendChild(number);
    return element;
  }

  function classIcon(classId, className) {
    return make(classUrl(classId), CLASS_GLYPHS[classId] || "❔", className);
  }

  function potionIcon(potionId, className) {
    return make(potionUrl(potionId), POTION_GLYPH, className);
  }

  function abilityIcon(classId, ability, className) {
    return make(abilityUrl(classId, ability), ABILITY_GLYPHS[ability.type] || "✨", className);
  }

  // Gwiazdki trudności, np. stars(2) → ★★☆
  function stars(count, max = 3, label = "Poziom trudności") {
    const element = document.createElement("span");
    element.className = "class-stars";
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", `${label}: ${count} z ${max}`);
    element.title = `${label}: ${count}/${max}`;
    element.textContent = "★".repeat(count) + "☆".repeat(Math.max(0, max - count));
    return element;
  }

  // Statyczne miejsca w HTML: <span data-stat-icon="hp"></span>
  function hydrate(root = document) {
    root.querySelectorAll("[data-stat-icon]").forEach((holder) => {
      holder.replaceChildren(stat(holder.dataset.statIcon));
    });
  }

  // Wstępne sprawdzenie, które pliki istnieją.
  const initial = [
    ...Object.keys(STATS).map(statUrl),
    ...Object.keys(CLASS_GLYPHS).map(classUrl),
  ];
  const ready = Promise.all(initial.map(probe)).then(() => {
    hydrate();
    document.dispatchEvent(new CustomEvent("gameicons:ready"));
  });

  // Mikstury i ikony umiejętności znamy dopiero po wczytaniu danych gry.
  if (window.gameDataReady) {
    window.gameDataReady.then(() => {
      const urls = [];
      (window.shopPotions || []).forEach((potion) => urls.push(potionUrl(potion.id)));
      Object.entries(window.classAbilities || {}).forEach(([classId, data]) => {
        (data.active || []).forEach((ability) => urls.push(abilityUrl(classId, ability)));
      });
      return Promise.all(urls.map(probe));
    }).then(() => document.dispatchEvent(new CustomEvent("gameicons:ready")));
  }

  // Dotknięcie chipa (telefon) pokazuje jego etykietę; dotknięcie gdzie indziej ją chowa.
  document.addEventListener("click", (event) => {
    const target = event.target.closest?.(".stat-chip");
    document.querySelectorAll(".stat-chip.show-label").forEach((open) => {
      if (open !== target) open.classList.remove("show-label");
    });
    if (target) target.classList.toggle("show-label");
  });

  hydrate();

  window.GameIcons = { STATS, ready, probe, stat, chip, classIcon, potionIcon, abilityIcon, stars, hydrate };
})();

// Telefon: karty przesuwane palcem i rozwijane listy statystyk.
//
// Karty to zwykły poziomy scroll-snap z CSS (style/mobileCards.css) — tutaj
// dodajemy tylko pasek zakładek, który pokazuje aktywną kartę i pozwala na nią
// przeskoczyć. Kontener: .swipe-cards[data-swipe-titles="Nazwa 1|Nazwa 2"],
// karty: elementy .swipe-pane w kolejności zakładek. Opcjonalne data-swipe-default
// (numer od 0) wskazuje kartę, od której ekran się zaczyna.
(function () {
  const mobile = window.matchMedia("(max-width: 760px)");

  // Ostatnio oglądana karta każdego ekranu (klucz = data-swipe-key) wraca po zmianie ekranu i po odświeżeniu strony.
  const STORAGE_PREFIX = "low-card:";
  function loadCard(key) {
    if (!key) return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
      return raw === null ? null : Number(raw);
    } catch (error) { return null; }
  }
  function saveCard(key, index) {
    if (!key) return;
    try { window.localStorage.setItem(STORAGE_PREFIX + key, String(index)); } catch (error) { /* brak storage — karta działa do końca sesji */ }
  }

  function initSwipeCards(container) {
    let current = 0;
    const titles = (container.dataset.swipeTitles || "").split("|");
    const panes = [...container.querySelectorAll(".swipe-pane")];
    if (!panes.length) return;

    const tabs = document.createElement("div");
    tabs.className = "swipe-tabs";
    tabs.setAttribute("role", "tablist");
    const key = container.dataset.swipeKey || "";
    const buttons = panes.map((pane, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "swipe-tab";
      button.setAttribute("role", "tab");
      button.textContent = titles[index] || `Karta ${index + 1}`;
      button.addEventListener("click", () => {
        current = index;
        saveCard(key, index);
        container.scrollTo({ left: panes[index].offsetLeft, behavior: "smooth" });
      });
      tabs.appendChild(button);
      return button;
    });
    container.parentNode.insertBefore(tabs, container);

    // Karta startowa: przy pokazaniu ekranu (wcześniej display:none) przewijamy od razu na nią.
    const clampIndex = (value) => Math.min(Math.max(Number(value) || 0, 0), panes.length - 1);
    const defaultIndex = clampIndex(container.dataset.swipeDefault);
    const saved = loadCard(key);
    current = saved === null || !Number.isFinite(saved) ? defaultIndex : clampIndex(saved);
    // Wraca na ostatnio oglądaną kartę (a przy pierwszym uruchomieniu na startową).
    function showDefault() {
      if (mobile.matches && container.offsetWidth > 0) container.scrollLeft = panes[current].offsetLeft;
    }

    // Aktywna karta = ta, której początek jest najbliżej lewej krawędzi widoku.
    function sync() {
      let active = 0;
      if (mobile.matches) {
        let best = Infinity;
        panes.forEach((pane, index) => {
          const distance = Math.abs(pane.offsetLeft - container.scrollLeft);
          if (distance < best) { best = distance; active = index; }
        });
      }
      // Zapamiętujemy tylko widoczny ekran na telefonie — ukryty ekran ma scrollLeft 0 i nadpisałby zapis.
      if (mobile.matches && container.offsetWidth > 0) {
        if (active !== current) saveCard(key, active);
        current = active;
      }
      buttons.forEach((button, index) => {
        button.classList.toggle("active", index === active);
        button.setAttribute("aria-selected", String(index === active));
      });
    }

    let frame = 0;
    container.addEventListener("scroll", () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    }, { passive: true });
    // Zmiany rozmiaru tylko odświeżają zakładki; powrót z display:none dodatkowo wraca na kartę startową.
    let wasVisible = container.offsetWidth > 0;
    if (window.ResizeObserver) {
      new ResizeObserver(() => {
        const visible = container.offsetWidth > 0;
        if (visible && !wasVisible) showDefault();
        wasVisible = visible;
        sync();
      }).observe(container);
    }
    mobile.addEventListener("change", () => { showDefault(); sync(); });
    showDefault();
    sync();
  }

  // Statystyki w walce na telefonie są schowane pod przyciskiem.
  function initCollapsible(element, label) {
    if (!element) return;
    element.classList.add("stats-collapsible");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stats-toggle";
    button.setAttribute("aria-expanded", "false");
    const render = (open) => {
      button.setAttribute("aria-expanded", String(open));
      button.textContent = `${label} ${open ? "▴" : "▾"}`;
    };
    render(false);
    button.addEventListener("click", () => render(element.classList.toggle("is-open")));
    element.parentNode.insertBefore(button, element);
  }

  document.querySelectorAll(".swipe-cards[data-swipe-titles]").forEach(initSwipeCards);
  initCollapsible(document.getElementById("battle-player-chips"), "Statystyki");
  initCollapsible(document.getElementById("battle-enemy-stats"), "Statystyki");
})();

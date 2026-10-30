// Preferencje walki: sterowanie (klawisze) i opcje auto-walki.
// Zapisywane w przeglądarce (localStorage), a nie w kodzie zapisu gry — sterowanie
// i wygoda to ustawienia urządzenia, tak jak rozmiar interfejsu.
//
// Akcje klawiszy:
//   slot1..slot4  cztery „sloty” pod Q/W/E/R. Dla Maga to jego 4 czary,
//                 dla pozostałych klas: slot1 = zwykły atak, slot2..4 = umiejętności 1–3.
//   weapon        umiejętność broni unikalnej (domyślnie Spacja)
//   auto          włączenie/wyłączenie auto-walki
(function () {
  const STORAGE_KEY = "low-combat-settings";

  const ACTIONS = ["slot1", "slot2", "slot3", "slot4", "weapon", "auto"];

  const DEFAULT_KEYS = Object.freeze({
    slot1: "q",
    slot2: "w",
    slot3: "e",
    slot4: "r",
    weapon: "space",
    auto: "a",
  });

  const DEFAULT_AUTO = Object.freeze({
    noPause: false,          // nie zatrzymuj auto-walki przy niskim HP / manie / braku mikstur
    restartOnDeath: false,   // po śmierci cofnij stan sprzed walki i zacznij ją od nowa
    restartDelay: 5,         // sekundy do restartu
    usePotions: true,        // auto-walka może pić mikstury
    keepAfterLevel: false,   // po przejściu poziomu zacznij następny z włączoną auto-walką
  });

  const RESTART_DELAY_MIN = 3;
  const RESTART_DELAY_MAX = 10;

  const ARROWS = { arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→" };

  let keys = { ...DEFAULT_KEYS };
  let auto = { ...DEFAULT_AUTO };
  const listeners = new Set();

  // Klawisz z eventu -> znormalizowana nazwa ("q", "space", "arrowup") albo null,
  // jeśli klawisz nie może być skrótem (Enter, Tab, Esc, modyfikatory, F1–F12...).
  function keyFromEvent(event) {
    const raw = event.key;
    if (raw === " ") return "space";
    if (typeof raw !== "string") return null;
    const key = raw.toLowerCase();
    if (key.length === 1) return key;
    if (Object.prototype.hasOwnProperty.call(ARROWS, key)) return key;
    return null;
  }

  function isValidKey(key) {
    return typeof key === "string"
      && (key === "space" || key.length === 1 || Object.prototype.hasOwnProperty.call(ARROWS, key));
  }

  function clampDelay(value) {
    const number = Math.round(Number(value));
    if (!Number.isFinite(number)) return DEFAULT_AUTO.restartDelay;
    return Math.min(RESTART_DELAY_MAX, Math.max(RESTART_DELAY_MIN, number));
  }

  function load() {
    let stored = null;
    try { stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null"); } catch (error) { stored = null; }
    if (!stored || typeof stored !== "object") return;

    // Klawisze przyjmujemy tylko jako kompletny, bezkonfliktowy zestaw.
    const candidate = { ...DEFAULT_KEYS, ...(stored.keys || {}) };
    const values = ACTIONS.map((action) => candidate[action]);
    if (values.every(isValidKey) && new Set(values).size === values.length) keys = candidate;

    const saved = stored.auto || {};
    Object.keys(DEFAULT_AUTO).forEach((name) => {
      if (name === "restartDelay") auto.restartDelay = clampDelay(saved.restartDelay ?? DEFAULT_AUTO.restartDelay);
      else if (typeof saved[name] === "boolean") auto[name] = saved[name];
    });
  }

  function save() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ keys, auto })); } catch (error) { /* brak storage — ustawienia działają do końca sesji */ }
  }

  function emit() {
    save();
    listeners.forEach((listener) => {
      try { listener(); } catch (error) { /* słuchacz nie może psuć zapisu ustawień */ }
    });
  }

  // Nazwa klawisza do pokazania graczowi. short = napis na plakietce kafelka (mała).
  function keyLabel(key, short) {
    if (key === "space") return short ? "Spc" : "Spacja";
    if (Object.prototype.hasOwnProperty.call(ARROWS, key)) return ARROWS[key];
    return String(key).toUpperCase();
  }

  // Akcja przypisana do klawisza (albo null).
  function actionForKey(key) {
    return ACTIONS.find((action) => keys[action] === key) || null;
  }

  // Slot klawisza dla umiejętności klasy o danym indeksie (0 = pierwsza).
  function abilityAction(classId, abilityIndex) {
    return `slot${abilityIndex + (classId === "mage" ? 1 : 2)}`;
  }

  window.GameSettings = {
    ACTIONS,
    DEFAULT_KEYS,
    DEFAULT_AUTO,
    RESTART_DELAY_MIN,
    RESTART_DELAY_MAX,

    keyFromEvent,

    key: (action) => keys[action],
    label: (action, short) => keyLabel(keys[action], short),
    keyLabel,
    actionForKey,
    abilityAction,

    // Przypisuje klawisz. Gdy jest zajęty, obie akcje zamieniają się klawiszami.
    // Zwraca akcję, z którą zamieniono klawisz (albo null).
    setKey(action, key) {
      if (!ACTIONS.includes(action) || !isValidKey(key)) return null;
      const previous = keys[action];
      const other = actionForKey(key);
      keys = { ...keys, [action]: key };
      if (other && other !== action) keys[other] = previous;
      emit();
      return other && other !== action ? other : null;
    },

    resetKeys() {
      keys = { ...DEFAULT_KEYS };
      emit();
    },

    // Kopia — nikt poza tym modułem nie zmienia ustawień wprost.
    get auto() { return { ...auto }; },

    setAuto(name, value) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_AUTO, name)) return;
      if (name === "restartDelay") auto.restartDelay = clampDelay(value);
      else auto[name] = Boolean(value);
      emit();
    },

    resetAuto() {
      auto = { ...DEFAULT_AUTO };
      emit();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  load();
})();

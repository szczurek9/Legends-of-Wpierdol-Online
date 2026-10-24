// Reguły osiągnięć po stronie serwera. Lista ID musi zgadzać się z data/achievements.json
// (klient pobiera stamtąd nazwy i opisy; serwer decyduje, co jest odblokowane).
//
// Rodzaje osiągnięć:
//   {}                       — zdarzenie: klient zgłasza je w polu "unlock".
//   { counter: [nazwa, cel] } — odblokowuje się samo, gdy licznik osiągnie cel.
//   { set: [nazwa, cel] }     — odblokowuje się samo, gdy zbiór ma tyle elementów.
//   { all: true }             — platyna: wszystkie pozostałe osiągnięcia.
//
// Walka toczy się w przeglądarce, więc serwer nie jest w stanie sprawdzić, czy zdarzenie
// naprawdę zaszło. Dlatego nagrody za osiągnięcia powinny zostać kosmetyczne.

export const ACHIEVEMENTS = {
  firstBlood: {},
  legendBegins: {},
  crabWinner: {},
  versatile: { set: ["classesCleared", 5] },

  fistfighter: {},
  noFear: {},
  noPotions: {},
  untouchable: {},
  edgerunner: {},
  oneTap: {},
  lazy: { counter: ["autoLevels", 5] },
  shame: {},
  waitingInLine: {},
  hardcore: {},

  assassinOverkill: { counter: ["overkillProcs", 10] },
  mageMana: {},
  tankRage: {},
  samuraiStreak: {},
  archerFocus: {},

  arenaFirst: {},
  threeCrowns: { set: ["arenaDifficulties", 3] },
  gladiator: {},

  gambler: {},
  uniqueCollector: {},
  wardrobe: {},
  masterGooner: {},

  legend: { all: true },
};

// Liczniki: nazwa -> górna granica wartości.
export const COUNTERS = {
  overkillProcs: 100000,
  autoLevels: 100000,
};

// Zbiory: nazwa -> dozwolone wartości.
export const SETS = {
  classesCleared: ["assassin", "mage", "tank", "samurai", "archer"],
  arenaDifficulties: ["easy", "medium", "hard"],
};

// Ile jednorazowo można dodać do licznika w jednym żądaniu.
export const MAX_COUNTER_DELTA = 20;

export const PLATINUM_ID = "legend";

export function isEventAchievement(id) {
  const rule = Object.prototype.hasOwnProperty.call(ACHIEVEMENTS, id) ? ACHIEVEMENTS[id] : null;
  return Boolean(rule) && !rule.counter && !rule.set && !rule.all;
}

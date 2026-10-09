// Generator nicków: [przymiotnik]-[rzeczownik][00-99], np. "ognisty-kebab42".
// Przycisk 🎲 na ekranie wyboru klasy wpisuje wylosowany nick w pole #nickname.
(function () {
  const PART1 = [
    "zajebisty", "niesamowity", "crazy", "pojebany", "bojowy", "latajacy", "ognisty",
    "smaczny", "glosny", "wybuchowy", "ciekawy", "slepy", "glupi", "ciemny", "jasny",
    "zielony", "bombowy", "elektryczny", "czerwony", "chillujacy",
  ];
  const PART2 = [
    "kebab", "arbuz", "glosnik", "banan", "lodzik", "samochod", "telefon", "helikopter",
    "miguel", "bomber", "tryhard", "ragequitter", "pies", "kot", "szczur", "dewolaj",
    "baran", "widelec", "byk", "monsterek", "dzik", "snajper",
  ];

  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  function generateNickname() {
    const number = String(Math.floor(Math.random() * 100)).padStart(2, "0");
    return `${pick(PART1)}-${pick(PART2)}${number}`;
  }

  window.generateNickname = generateNickname;

  const input = document.getElementById("nickname");
  const button = document.getElementById("nick-random");
  if (!input || !button) return;
  button.addEventListener("click", () => {
    input.value = generateNickname();
    input.focus();
  });
})();

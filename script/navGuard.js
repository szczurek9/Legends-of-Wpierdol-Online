// Zabezpieczenie przed przypadkowym wyjściem z gry (przycisk „wstecz”, gest cofania, zamknięcie karty).
//
// Gra to jedna strona, więc „wstecz” w przeglądarce od razu wyrzuca gracza z niezapisanym postępem.
// Dokładamy jeden wpis do historii i przy cofnięciu pytamy, czy na pewno wyjść.
// Wpis dodajemy dopiero po pierwszym kliknięciu/dotknięciu — przeglądarki pomijają wpisy dodane bez interakcji.
(function () {
  const MESSAGE = "Na pewno wyjść z gry? Niezapisany postęp zniknie. Najpierw skopiuj kod zapisu albo zapisz w chmurze.";
  const startScreen = document.getElementById("start-screen");
  const loginScreen = document.getElementById("login-screen");
  let armed = false;
  let leaving = false;

  // Gra trwa, gdy gracz minął ekran startowy i wybór klasy.
  function gameIsRunning() {
    return Boolean(startScreen && loginScreen
      && startScreen.classList.contains("hidden")
      && loginScreen.classList.contains("hidden"));
  }

  function arm() {
    if (armed) return;
    armed = true;
    window.history.pushState({ lowGuard: true }, "", window.location.href);
  }

  ["pointerdown", "keydown", "touchstart"].forEach((type) => {
    window.addEventListener(type, arm, { once: true, passive: true });
  });

  window.addEventListener("popstate", () => {
    if (!armed || leaving) return;
    if (!gameIsRunning() || window.confirm(MESSAGE)) {
      // Wyjście potwierdzone (albo nie ma czego tracić) — cofamy się jeszcze raz, już poza naszym wpisem.
      leaving = true;
      window.history.back();
    } else {
      // Zostajemy w grze: przywracamy wpis, który właśnie zużyło cofnięcie.
      window.history.pushState({ lowGuard: true }, "", window.location.href);
    }
  });

  // Odświeżenie, zamknięcie karty lub wpisanie innego adresu.
  window.addEventListener("beforeunload", (event) => {
    if (leaving || !gameIsRunning()) return;
    event.preventDefault();
    event.returnValue = "";
  });

  // Dla kodu, który sam przeładowuje stronę po własnym potwierdzeniu (np. logowanie przez Discord).
  window.LowNavGuard = { allowLeave() { leaving = true; } };
})();

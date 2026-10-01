// Zapis w chmurze + logowanie przez Discord.
// Backend: functions/api/*. Chmura przechowuje ten sam kod zapisu (base64),
// który gracz może skopiować ręcznie — save-editor.html dalej działa tak samo.
(function () {
  const optionsModal = document.getElementById("options-modal");
  const mainMenuScreen = document.getElementById("main-menu");
  const message = document.getElementById("options-message");
  const statusText = document.getElementById("cloud-status");
  const openBtn = document.getElementById("cloud-open-btn");
  const startMessage = document.getElementById("start-message");
  const guestBtn = document.getElementById("entry-guest-btn");
  const discordBtn = document.getElementById("entry-discord-btn");
  const newGameBtn = document.getElementById("new-game-btn");
  const loadGameBtn = document.getElementById("load-game-btn");
  const loginBtn = document.getElementById("cloud-login-btn");
  const saveBtn = document.getElementById("cloud-save-btn");
  const loadBtn = document.getElementById("cloud-load-btn");
  const deleteBtn = document.getElementById("cloud-delete-btn");

  let me = { loggedIn: false };
  let gameButtonsShown = false;

  function say(text, type) {
    window.setStatusMessage(message, text, "screen-message", type);
  }

  function formatDate(iso) {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("pl-PL");
  }

  // Menu główne widoczne = gra jest rozpoczęta lub wczytana.
  function gameIsRunning() {
    return !mainMenuScreen.classList.contains("hidden");
  }

  // Ekran wejścia: [Zagraj jako gość | Logowanie przez Discord].
  // Po wyborze znikają, a pojawiają się dotychczasowe przyciski: Nowa gra i Wczytaj grę.
  function showGameButtons() {
    gameButtonsShown = true;
    guestBtn.classList.add("hidden");
    discordBtn.classList.add("hidden");
    newGameBtn.classList.remove("hidden");
    loadGameBtn.classList.remove("hidden");
    startMessage.textContent = "";
    render();
  }

  function openCloudPanel() {
    say("");
    optionsModal.classList.remove("hidden");
    refresh();
  }

  function render() {
    guestBtn.textContent = me.loggedIn ? "🎮 Zagraj" : "🎮 Zagraj jako gość";
    discordBtn.textContent = me.loggedIn ? "☁️ Chmura (Discord)" : "🔑 Logowanie przez Discord";
    // Przycisk chmury na ekranie startowym widzą tylko zalogowani (goście mają 2 przyciski).
    openBtn.classList.toggle("hidden", !(gameButtonsShown && me.loggedIn));
    saveBtn.disabled = !me.loggedIn;
    loadBtn.disabled = !me.loggedIn || !me.hasSave;
    deleteBtn.disabled = !me.loggedIn || !me.hasSave;
    loginBtn.textContent = me.loggedIn ? "🚪 Wyloguj" : "🔑 Zaloguj";

    if (!me.loggedIn) {
      statusText.textContent = "Chmura: niezalogowany.";
      return;
    }
    statusText.textContent = `Chmura: ${me.username} · ${me.hasSave ? `zapis z ${formatDate(me.updatedAt)}` : "brak zapisu"}`;
  }

  async function refresh() {
    try {
      const response = await fetch("/api/me", { credentials: "same-origin" });
      me = response.ok ? await response.json() : { loggedIn: false };
    } catch (error) {
      me = { loggedIn: false };
    }
    render();
  }

  async function handleExpiredSession() {
    await refresh();
    say("Sesja wygasła — zaloguj się ponownie.", "warning");
  }

  guestBtn.addEventListener("click", showGameButtons);

  discordBtn.addEventListener("click", () => {
    if (!me.loggedIn) {
      window.location.href = "/api/auth/login";
      return;
    }
    showGameButtons();
    openCloudPanel();
  });

  openBtn.addEventListener("click", openCloudPanel);

  document.getElementById("options-btn").addEventListener("click", refresh);

  loginBtn.addEventListener("click", async () => {
    if (!me.loggedIn) {
      // Logowanie przeładowuje stronę, więc niezapisany postęp by zniknął.
      if (gameIsRunning() && !window.confirm("Logowanie przeładuje stronę — niezapisany postęp zniknie. Najpierw skopiuj kod zapisu. Kontynuować?")) return;
      window.location.href = "/api/auth/login";
      return;
    }

    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch (error) {
      // ciasteczko i tak wygaśnie samo
    }
    await refresh();
    say("Wylogowano.", "success");
  });

  saveBtn.addEventListener("click", async () => {
    if (!gameIsRunning()) {
      say("Najpierw wczytaj lub rozpocznij grę.", "warning");
      return;
    }
    if (me.hasSave && !window.confirm(`Nadpisać zapis w chmurze z ${formatDate(me.updatedAt)}?`)) return;

    saveBtn.disabled = true;
    try {
      const response = await fetch("/api/save", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: window.SaveSystem.createSaveCode() }),
      });

      if (response.status === 401) {
        await handleExpiredSession();
        return;
      }
      if (!response.ok) throw new Error(String(response.status));

      await refresh();
      say("Zapis wysłany do chmury.", "success");
    } catch (error) {
      say("Nie udało się zapisać w chmurze.", "danger");
    } finally {
      render();
    }
  });

  loadBtn.addEventListener("click", async () => {
    if (gameIsRunning() && !window.confirm("Wczytanie zapisu z chmury zastąpi aktualną postać. Kontynuować?")) return;

    try {
      const response = await fetch("/api/save", { credentials: "same-origin" });
      if (response.status === 401) {
        await handleExpiredSession();
        return;
      }
      if (!response.ok) throw new Error(String(response.status));

      const { code } = await response.json();
      if (!window.SaveSystem.loadSaveCode(code)) {
        say("Zapis z chmury jest nieprawidłowy lub uszkodzony.", "danger");
        return;
      }

      window.showMainMenu();
      optionsModal.classList.add("hidden");
    } catch (error) {
      say("Nie udało się pobrać zapisu z chmury.", "danger");
    }
  });

  deleteBtn.addEventListener("click", async () => {
    if (!window.confirm("Trwale usunąć z chmury Twój zapis oraz dane konta (ID i nazwa z Discorda) i wylogować? Tej operacji nie można cofnąć. Zapis na tym urządzeniu (kod) nie zostanie zmieniony.")) return;

    deleteBtn.disabled = true;
    try {
      const response = await fetch("/api/save", { method: "DELETE", credentials: "same-origin" });
      if (response.status === 401) {
        await handleExpiredSession();
        return;
      }
      if (!response.ok) throw new Error(String(response.status));

      await refresh();
      say("Dane usunięte z chmury. Wylogowano.", "success");
    } catch (error) {
      say("Nie udało się usunąć danych z chmury.", "danger");
    } finally {
      render();
    }
  });

  // Powrót z logowania Discord: /?login=ok | denied | error
  const loginResult = new URLSearchParams(window.location.search).get("login");
  const loginMessages = {
    ok: ["Zalogowano przez Discord.", "success"],
    denied: ["Logowanie anulowane.", "warning"],
    error: ["Logowanie nie powiodło się. Spróbuj ponownie.", "danger"],
  };
  if (loginResult !== null) {
    window.history.replaceState(null, "", window.location.pathname);
    const entry = Object.prototype.hasOwnProperty.call(loginMessages, loginResult) ? loginMessages[loginResult] : null;
    if (entry && loginResult === "ok") {
      showGameButtons();
      optionsModal.classList.remove("hidden");
      say(entry[0], entry[1]);
    } else if (entry) {
      window.setStatusMessage(startMessage, entry[0], "screen-message", entry[1]);
    }
  }

  refresh().then(() => {
    if (loginResult === "ok" && !me.loggedIn) {
      say("Nie udało się utrzymać sesji — sprawdź, czy przeglądarka nie blokuje ciasteczek.", "danger");
    }
  });
})();

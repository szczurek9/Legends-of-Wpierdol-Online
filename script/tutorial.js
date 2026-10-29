// Samouczek „pierwszy raz”.
//
// 1) Przy tworzeniu nowej postaci (po kliknięciu „Graj” na ekranie wyboru klasy) pytamy,
//    czy gracz zna grę. „Nie” uruchamia samouczek, „Tak” zapamiętuje wybór i pyta już nie będzie.
// 2) Samouczek to ciąg kroków podświetlających PRAWDZIWE elementy interfejsu (menu, sklep,
//    ekwipunek, walka). Kroki typu „kliknij” czekają, aż gracz sam to zrobi — albo robią to za niego.
// 3) Powtórkę można uruchomić w Opcjach (przycisk #tutorial-start-btn).
//
// Moduł niczego nie zmienia w stanie gry (hajs, ekwipunek, zapis) — poza tym, co gracz sam kliknie.
(function () {
  "use strict";

  const STORAGE_KEY = "low-tutorial";

  const byId = (id) => document.getElementById(id);
  const qs = (selector, root = document) => root.querySelector(selector);

  // ---------------------------------------------------------------- pomocniki

  function readFlag() {
    try { return window.localStorage.getItem(STORAGE_KEY); } catch (error) { return null; }
  }

  function writeFlag(value) {
    try { window.localStorage.setItem(STORAGE_KEY, value); } catch (error) { /* brak storage — zapytamy ponownie */ }
  }

  function esc(text) {
    return String(text ?? "").replace(/[&<>"']/g, (char) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]
    ));
  }

  const kbd = (key) => `<kbd class="tut-key">${esc(key)}</kbd>`;

  function visible(element) {
    if (!element || element.getClientRects().length === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function screenOpen(id) {
    const element = byId(id);
    return Boolean(element) && !element.classList.contains("hidden");
  }

  const deathVisible = () => screenOpen("battle-death-panel");

  // 1 tura, 2–4 tury, 5+ tur.
  function turns(count) {
    if (count === 1) return "1 tura";
    const last = count % 10;
    const teen = count % 100 >= 12 && count % 100 <= 14;
    return `${count} ${last >= 2 && last <= 4 && !teen ? "tury" : "tur"}`;
  }

  function safe(fn) {
    try { return Boolean(fn()); } catch (error) { return false; }
  }

  // ------------------------------------------------------------ treść klas

  const CLASS_INFO = {
    assassin: {
      text: "<p><b>Pasywka Overkill:</b> nadwyżka obrażeń z zabitego wroga ładuje pulę, która leczy Cię przy atakach. "
        + "Gdy pula sięgnie połowy HP wroga, Twój następny atak przebija większość jego pancerza.</p>"
        + "<p><b>Uwaga:</b> Primal Strike kosztuje 200 many, a startujesz ze 100 — odblokujesz go dopiero z przedmiotami dającymi manę.</p>",
    },
    mage: {
      text: "<p>Mag <b>nie używa broni</b> ani przedmiotów AD — całą siłę czerpie z czarów i <b>AP</b> (mocy umiejętności). "
        + "Ma 320 many, bardzo szybką regenerację many, 8 slotów na przedmioty AP i 25% zniżki na przedmioty magiczne.</p>",
    },
    tank: {
      text: "<p><b>Pasywka Skumulowany Gniew:</b> każdy otrzymany cios ładuje pulę Gniewu, która sama eksploduje — zadaje obrażenia i leczy Cię. "
        + "Masz dużo HP i pancerza, więc to najspokojniejszy start.</p>",
    },
    samurai: {
      text: "<p><b>Pasywka Opanowanie:</b> Twoje krytyki są słabsze (x1,2 zamiast x1,5), ale masz więcej celności i uników. Z bronią białą (Melee) bijesz o 10% mocniej i leczysz się o dodatkowe 5% zadanych obrażeń. "
        + "<b>Sen no Kata</b> przełącza styl walki i nie zużywa tury.</p>",
    },
    archer: {
      text: "<p><b>Pasywka Eagle Sight:</b> +10% obrażeń zwykłego ataku bronią dystansową (Łuk, Rewolwer, Karabin). "
        + "Masz 8 slotów na przedmioty — każdy to AD <i>albo</i> AP, proporcje wybierasz sam.</p>",
    },
  };

  function classStepBody() {
    const classId = window.player.classId;
    const isMage = classId === "mage";
    const info = CLASS_INFO[classId] || { text: "" };
    const wrap = document.createElement("div");
    wrap.innerHTML = info.text;

    const list = document.createElement("ul");
    list.className = "tut-abilities";

    function row(iconNode, nameHtml, meta) {
      const item = document.createElement("li");
      item.appendChild(iconNode);
      const text = document.createElement("span");
      text.innerHTML = `${nameHtml}<small>${meta}</small>`;
      item.appendChild(text);
      list.appendChild(item);
    }

    const icons = window.GameIcons;
    if (!isMage && icons) {
      row(icons.stat("damage", "class-ability-icon"), `<b>Atakuj</b> ${kbd("Q")}`, "zwykły atak bronią");
    }
    const abilities = window.classAbilities?.[classId]?.active || [];
    abilities.forEach((ability, index) => {
      const key = (isMage ? ["Q", "W", "E", "R"] : ["W", "E", "R"])[index];
      const meta = [
        ability.cost ? `${ability.cost} many` : "bez kosztu",
        ability.cooldown ? `odnowienie: ${turns(ability.cooldown)}` : null,
      ].filter(Boolean).join(" · ");
      const icon = icons ? icons.abilityIcon(classId, ability, "class-ability-icon") : document.createElement("span");
      row(icon, `<b>${esc(ability.name)}</b> ${key ? kbd(key) : ""}`, meta);
    });
    if (list.children.length) wrap.appendChild(list);
    return wrap;
  }

  function slotsText() {
    const classId = window.player.classId;
    if (classId === "mage") return "Jako Mag masz 8 slotów na przedmioty AP.";
    if (classId === "archer") return "Łucznik ma 8 wspólnych slotów — każdy to przedmiot AD albo AP.";
    return "Masz 6 slotów na przedmioty AD i 2 na przedmioty AP.";
  }

  // ------------------------------------------------------------------ kroki

  // mode: "info"  — opis + „Dalej”
  //       "click" — gracz ma kliknąć podświetlony element (until / clickSel kończą krok, auto robi to za niego)
  //       "wait"  — samouczek chowa się i czeka, aż until() zwróci true
  function buildSteps() {
    const p = window.player;
    const isMage = p.classId === "mage";
    const className = window.gameClasses?.find((item) => item.id === p.classId)?.name || "postać";
    // Prawdziwą walkę prowadzimy tylko na poziomie 1 — przy powtórce na wyższym poziomie
    // nie ma sensu wrzucać gracza w walkę z mocniejszym przeciwnikiem.
    const live = p.level <= 1;
    let battleLevel = p.level;
    const steps = [];

    const info = (step) => steps.push({ mode: "info", ...step });
    const click = (step) => steps.push({ mode: "click", ...step });

    info({
      id: "welcome",
      center: true,
      title: "Zaczynamy! 🥊",
      body: `<p>Cześć, <b>${esc(p.nickname || "Wojowniku")}</b>! Gra jest <b>turowa</b>: wybierasz akcję, a potem odpowiada przeciwnik.</p>`
        + "<p>Pokażę Ci menu, sklep, ekwipunek i pierwszą walkę — to kilka minut. Możesz przerwać w każdej chwili, "
        + "a samouczek odpalisz ponownie w <b>⚙️ Opcjach</b>.</p>",
      nextLabel: "Jedziemy! ›",
    });

    // --- Menu główne ---
    info({
      id: "hero",
      target: "#main-playerModel",
      title: "Twoja postać",
      body: "<p>Tu widzisz swój <b>nick</b> i <b>poziom</b>. Poziom rośnie za każdego pokonanego przeciwnika — w grze czeka ich <b>50</b>.</p>"
        + "<p>Przycisk <b>Zmień skina</b> otwiera kosmetykę. Skiny nie zmieniają statystyk.</p>",
    });

    info({
      id: "resources",
      target: ".menu-resources",
      title: "Dwie waluty",
      body: "<p>💸 <b>Hajs</b> to główna waluta: zarabiasz go za pokonanych wrogów, wydajesz w sklepie. Startujesz z 5 $.</p>"
        + "<p>🎨 <b>Punkty skinów</b> dostajesz po 1 za każdy nowy poziom i wymieniasz na skiny.</p>",
    });

    info({
      id: "weapon",
      target: ".weapon-card",
      title: isMage ? "Broń? Nie dla Maga" : "Twoja broń",
      body: isMage
        ? "<p>Ten panel pokazuje broń, ale jako <b>Mag</b> z niej nie korzystasz. Obrażenia robisz czarami, "
          + "które rosną z <b>AP</b> (mocą umiejętności).</p>"
        : "<p>Na start walczysz <b>Pięściami</b> (3 obrażeń) — to naprawdę mało, więc pierwsze zakupy robią ogromną różnicę.</p>"
          + "<p>Obrażenia broni rosną też z <b>AD</b> (siłą ataku), którą dają przedmioty.</p>",
    });

    info({
      id: "stats",
      target: "#main-playerStats",
      title: "Statystyki",
      body: "<ul class=\"tut-list\">"
        + "<li><b>Zdrowie</b> — gdy spadnie do 0, przegrywasz walkę.</li>"
        + "<li><b>Pancerz</b> — zmniejsza obrażenia fizyczne (100 pkt to −50%).</li>"
        + "<li><b>Krytyk</b> — szansa na mocniejszy cios, <b>Penetracja</b> — ignoruje część pancerza wroga.</li>"
        + "<li><b>Mana</b> płaci za umiejętności, a <b>AP</b> wzmacnia czary.</li>"
        + "</ul>",
    });

    info({
      id: "class",
      center: true,
      title: `Twoja klasa: ${className}`,
      body: classStepBody,
    });

    info({
      id: "buttons",
      target: "#main-buttons",
      title: "Menu akcji",
      body: "<ul class=\"tut-list\">"
        + "<li><b>⚔️ Graj</b> — walka z przeciwnikiem z Twojego poziomu.</li>"
        + "<li><b>🪙 Sklep</b> — zakupy. <b>🎒 Ekwipunek</b> — zakładanie i sprzedaż.</li>"
        + "<li><b>⚙️ Opcje</b> — zapis gry, motyw i rozmiar interfejsu.</li>"
        + "<li><b>📖 Wiki</b> — pełny opis mechanik. Od 30. poziomu pojawi się też <b>🏟️ Arena</b>.</li>"
        + "</ul>",
    });

    // --- Sklep ---
    click({
      id: "open-shop",
      target: "#shop-btn",
      clickSel: "#shop-btn",
      until: () => screenOpen("shop-screen"),
      auto: () => byId("shop-btn").click(),
      title: "Sklep",
      body: "<p>Zacznijmy od zakupów. Kliknij <b>🪙 Sklep</b>.</p>",
    });

    info({
      id: "shop-filters",
      target: ".shop-filters",
      title: "Kategorie",
      body: isMage
        ? "<p><b>Filtry</b> dzielą ofertę na kategorie. Jako Mag nie widzisz broni ani przedmiotów AD — "
          + "zostają <b>przedmioty AP</b> (moc umiejętności i mana), <b>wzmocnienia</b> (trwałe ulepszenia HP i pancerza), "
          + "<b>mikstury</b> (jednorazowe) oraz podgląd <b>umiejętności</b> klasy, które masz od początku.</p>"
        : "<p><b>Filtry</b> dzielą ofertę na kategorie: <b>bronie</b>, <b>przedmioty AD</b> (siła ataku — obrażenia fizyczne), "
          + "<b>przedmioty AP</b> (moc umiejętności i mana), <b>wzmocnienia</b> (trwałe ulepszenia HP i pancerza), "
          + "<b>mikstury</b> (jednorazowe) oraz podgląd <b>umiejętności</b> klasy, które masz od początku.</p>"
        + "<p>Przy AD i AP widać licznik zajętych slotów.</p>",
    });

    info({
      id: "shop-money",
      target: ".shop-header",
      title: "Hajs i ceny",
      body: "<p>Po prawej widzisz swój <b>hajs</b>. Na karcie przedmiotu jest cena, a gdy Cię nie stać — ile jeszcze brakuje.</p>"
        + "<p>W dłuższej liście pomogą <b>wyszukiwarka</b> i <b>sortowanie</b>.</p>",
    });

    click({
      id: "shop-pick",
      target: () => {
        const cards = [...document.querySelectorAll("#shop-list .shop-card")].filter(visible);
        return cards.find((card) => !card.classList.contains("shop-card-equipped")) || cards[0] || null;
      },
      clickSel: "#shop-list .shop-card",
      auto: () => {
        const cards = [...document.querySelectorAll("#shop-list .shop-card")];
        (cards.find((card) => !card.classList.contains("shop-card-equipped")) || cards[0])?.click();
      },
      title: "Zobacz przedmiot",
      body: "<p>Kliknij dowolny przedmiot, żeby zobaczyć <b>podgląd</b>.</p>",
    });

    info({
      id: "shop-details",
      target: "#shop-details",
      title: "Podgląd przedmiotu",
      body: "<p>Widzisz opis, statystyki i <b>porównanie z tym, co już masz</b> (strzałki w górę i w dół), cenę oraz przycisk zakupu.</p>"
        + "<ul class=\"tut-list\">"
        + "<li>Drogie rzeczy (od 1000 $) wymagają <b>drugiego kliknięcia</b> jako potwierdzenia.</li>"
        + "<li>Przedmiot AD/AP zakłada się sam, jeśli jest wolny slot.</li>"
        + "<li>Pomyłkę w zakupie da się cofnąć w tej samej sesji.</li>"
        + "</ul>",
      // Na telefonie podgląd jest oknem — zamykamy je, żeby nie zasłaniało kolejnych kroków.
      leave: () => {
        const close = byId("shop-details-close");
        if (visible(close)) close.click();
      },
    });

    info({
      id: "shop-tips",
      center: true,
      title: "Co kupić na początek?",
      body: isMage
        ? "<p>Za pierwszych wrogów dostaniesz 5–25 $. Mag ma <b>25% zniżki</b> na przedmioty AP, więc oszczędzaj na <b>Zaklętą Księgę</b> (+60 AP i +60 many, około 375 $) — "
          + "to Twój pierwszy duży skok mocy czarów.</p>"
          + "<p><b>Mikstura Zdrowia</b> (60 $) ratuje w trudniejszej walce.</p>"
        : "<p>Za pierwszych wrogów dostaniesz 5–25 $. Po 3–4 walkach starczy na <b>Włócznię</b> (25 $), potem na <b>Zniszczony miecz</b> (55 $).</p>"
          + "<p><b>Mikstura Zdrowia</b> (60 $) ratuje w trudniejszej walce, a później celuj w <b>przedmioty AD</b> — podkręcają obrażenia każdej broni.</p>",
    });

    click({
      id: "shop-back",
      target: "#shop-back-btn",
      clickSel: "#shop-back-btn",
      until: () => screenOpen("main-menu"),
      auto: () => byId("shop-back-btn").click(),
      title: "Wracamy do menu",
      body: "<p>Kliknij <b>Wróć do menu</b>.</p>",
    });

    // --- Ekwipunek ---
    click({
      id: "open-inventory",
      target: "#inventory-btn",
      clickSel: "#inventory-btn",
      until: () => screenOpen("inventory-screen"),
      auto: () => byId("inventory-btn").click(),
      title: "Ekwipunek",
      body: "<p>Teraz zajrzyj do <b>🎒 Ekwipunku</b>.</p>",
    });

    info({
      id: "inventory",
      target: ".inventory-layout",
      title: "Twoje rzeczy",
      body: "<p>Tu zarządzasz tym, co kupiłeś: <b>bronie</b> (jedna aktywna naraz) oraz <b>przedmioty AD i AP</b> w ograniczonych slotach. "
        + `${slotsText()} Nad listą widać, ile slotów zostało wolnych.</p>`
        + "<p>Możesz też <b>sprzedawać</b> — dostajesz 40% ceny. Na razie jest pusto, ale po pierwszych zakupach to się zmieni.</p>",
    });

    click({
      id: "inventory-back",
      target: "#inventory-back-btn",
      clickSel: "#inventory-back-btn",
      until: () => screenOpen("main-menu"),
      auto: () => byId("inventory-back-btn").click(),
      title: "Wracamy do menu",
      body: "<p>Kliknij <b>Wróć do menu</b>.</p>",
    });

    // --- Walka ---
    if (live) {
      click({
        id: "play",
        target: "#play-btn",
        clickSel: "#play-btn",
        until: () => screenOpen("battle-screen"),
        auto: () => byId("play-btn").click(),
        title: "Pierwsza walka",
        body: "<p>Czas się bić! Kliknij <b>⚔️ Graj</b>. Pierwszy przeciwnik jest łatwy.</p>",
      });

      info({
        id: "battle-arena",
        target: ".battle-arena",
        enter: () => { battleLevel = window.player.level; },
        title: "Pole walki",
        body: () => `<p>Po lewej stoisz <b>Ty</b>, po prawej <b>${esc(byId("battle-enemy-name")?.textContent || "przeciwnik")}</b>.</p>`
          + "<p>Każdy poziom to kolejny wróg. Niektórzy mają kilka <b>fal</b>, a co 5. poziom czeka <b>boss</b>. "
          + "Ty robisz akcję, potem odpowiada wróg.</p>",
      });

      info({
        id: "battle-bars",
        target: ".battle-resource-bars",
        title: "HP i mana",
        body: "<p>Pasek <b>HP</b> to Twoje życie — przy zerze przegrywasz. Pasek <b>many</b> napędza umiejętności: regeneruje się co turę, "
          + "a dodatkowo +5 co 5 sekund. Zdrowie wroga widać pod jego modelem.</p>",
      });

      info({
        id: "battle-actions",
        target: "#battle-abilities",
        title: "Twoje akcje",
        body: isMage
          ? `<p>Jako Mag masz cztery czary pod klawiszami ${kbd("Q")} ${kbd("W")} ${kbd("E")} ${kbd("R")}. `
            + "<b>Powiew Burzy</b> jest tani i bez odnowienia — to Twój podstawowy atak.</p>"
            + "<p>Pod kafelkiem widać koszt many, a po użyciu liczbę tur odnowienia. Szary kafelek = za mało many albo trwa odnowienie. Najedź na niego, by przeczytać opis.</p>"
          : `<p><b>Atakuj</b> (${kbd("Q")}) to zwykły atak bronią. Kolejne kafelki to umiejętności klasy (${kbd("W")} ${kbd("E")} ${kbd("R")}).</p>`
            + "<p>Pod kafelkiem widać koszt many, a po użyciu liczbę tur odnowienia. Szary kafelek = za mało many albo trwa odnowienie. Najedź na niego, by przeczytać opis.</p>",
      });

      click({
        id: "battle-first-hit",
        target: () => {
          const buttons = [...document.querySelectorAll("#battle-abilities .ability-button")].filter(visible);
          return isMage ? buttons.find((button) => !button.disabled) || buttons[0] || null : byId("attack-btn");
        },
        clickSel: "#battle-abilities .ability-button",
        allowKeys: ["q"],
        enter: (step) => { step.startLog = byId("battle-log")?.textContent || ""; },
        until: (step) => (byId("battle-log")?.textContent || "") !== step.startLog,
        auto: () => {
          const buttons = [...document.querySelectorAll("#battle-abilities .ability-button")].filter(visible);
          (isMage ? buttons.find((button) => !button.disabled) || buttons[0] : byId("attack-btn"))?.click();
        },
        title: "Pierwszy cios!",
        body: isMage
          ? `<p>Kliknij <b>Powiew Burzy</b> albo wciśnij ${kbd("Q")}.</p>`
          : `<p>Kliknij <b>Atakuj</b> albo wciśnij ${kbd("Q")}.</p>`,
      });

      info({
        id: "battle-log",
        target: "#battle-log",
        title: "Co się stało?",
        body: "<p>Tu czytasz przebieg tury: trafienia, <b>krytyki</b>, uniki i obrażenia — Twoje oraz wroga. "
          + "Starsze komunikaty znajdziesz w zwijanej <b>📜 Historii walki</b> pod spodem.</p>",
      });

      info({
        id: "battle-header",
        target: ".battle-header-actions",
        title: "Pomocne przyciski",
        body: "<ul class=\"tut-list\">"
          + "<li><b>🏃 Uciekaj</b> — raz na poziom: leczy połowę HP i many, ale kończy walkę bez awansu.</li>"
          + `<li><b>▶ Auto</b> (${kbd("A")}) — gra za Ciebie. Obok zmieniasz prędkość 1×–3×.</li>`
          + "<li><b>Mikstury</b> kupione w sklepie pojawią się pod przyciskami akcji i nie kończą tury.</li>"
          + "</ul>",
        nextLabel: "Walczę! ›",
      });

      steps.push({
        id: "battle-free",
        mode: "wait",
        pill: "🎓 Dokończ walkę — samouczek poczeka.",
        until: () => screenOpen("battle-screen") && (!byId("battle-back-btn").classList.contains("hidden") || deathVisible()),
      });

      click({
        id: "battle-back",
        target: "#battle-back-btn",
        clickSel: "#battle-back-btn",
        skipIf: deathVisible,
        until: () => screenOpen("main-menu"),
        auto: () => byId("battle-back-btn").click(),
        title: "Koniec walki",
        body: () => (window.player.level > battleLevel
          ? `<p>Wygrana! 🎉 Awansujesz na <b>poziom ${window.player.level}</b>, dostajesz hajs za wroga i <b>1 Punkt Skinów</b>.</p>`
          : "<p>Walka zakończona. Za wygraną dostajesz hajs, awans i Punkt Skinów.</p>")
          + "<p>Kliknij <b>Wróć do menu</b>.</p>",
      });

      info({
        id: "battle-death",
        target: "#battle-death-panel",
        skipIf: () => !deathVisible(),
        last: true,
        nextLabel: "Rozumiem",
        title: "Porażka? Spokojnie ☠️",
        body: "<p>Gdy HP spadnie do zera, możesz <b>cofnąć stan sprzed walki</b> (razem z zakupami zrobionymi w jej trakcie) albo zacząć <b>nową grę</b>.</p>"
          + "<p>Wybierz przycisk poniżej — na tym samouczek się kończy.</p>",
      });
    } else {
      info({
        id: "battle-summary",
        center: true,
        title: "Walka w skrócie",
        body: "<ul class=\"tut-list\">"
          + "<li><b>⚔️ Graj</b> rozpoczyna walkę z przeciwnikiem z Twojego poziomu. Ty robisz akcję, potem odpowiada wróg.</li>"
          + "<li><b>HP</b> to życie, <b>mana</b> płaci za umiejętności. Pod kafelkiem akcji widać koszt many i odnowienie.</li>"
          + `<li>Skróty: ${isMage ? `${kbd("Q")} ${kbd("W")} ${kbd("E")} ${kbd("R")} (czary)` : `${kbd("Q")} (atak), ${kbd("W")} ${kbd("E")} ${kbd("R")} (umiejętności)`}, ${kbd("Spacja")} (broń unikalna), ${kbd("A")} (auto-walka).</li>`
          + "<li><b>🏃 Uciekaj</b> działa raz na poziom i kończy walkę bez awansu.</li>"
          + "<li>Co 5. poziom to <b>boss</b>, a po przegranej możesz cofnąć stan sprzed walki.</li>"
          + "</ul>",
      });
    }

    // --- Zakończenie ---
    info({
      id: "save",
      target: "#options-btn",
      title: "Zapisz grę!",
      body: "<p><b>Gra nie zapisuje się sama.</b> W <b>⚙️ Opcjach</b> znajdziesz <b>kod zapisu</b> (skopiuj go i wklej później w „Wczytaj grę”) "
        + "oraz zapis w <b>chmurze</b> przez Discord.</p>"
        + "<p>Zamknięcie karty bez zapisu kasuje postęp — zapisuj po każdej sesji.</p>",
    });

    info({
      id: "wiki",
      target: "#wiki-btn",
      title: "Wiki",
      body: "<p>Wszystkie wzory, przedmioty, przeciwnicy i klasy są opisane w <b>📖 Wiki</b>. Zajrzyj tam, gdy będziesz planować build.</p>",
    });

    info({
      id: "finish",
      center: true,
      title: "To już wszystko! 🎉",
      body: "<ul class=\"tut-list\">"
        + "<li>Zarabiaj w walkach, kupuj w sklepie i wracaj do walk — aż do <b>50. poziomu</b>.</li>"
        + "<li>Przed każdym <b>bossem</b> (co 5. poziom) zadbaj o HP i mikstury.</li>"
        + "<li>Od <b>30. poziomu</b> odblokujesz 🏟️ Arenę.</li>"
        + "<li>Samouczek odpalisz ponownie w <b>⚙️ Opcjach</b>.</li>"
        + "</ul>",
      nextLabel: "Zaczynam grać! 🥊",
      last: true,
    });

    return steps;
  }

  // ------------------------------------------------------- silnik nakładki

  let active = false;
  let steps = [];
  let index = -1;
  let step = null;
  let token = 0;
  let rafId = 0;
  let lastKey = "";
  let root = null;
  let ui = null;

  function buildUI() {
    root = document.createElement("div");
    root.className = "tut-root";
    root.innerHTML = `
      <div class="tut-block" data-tut="top"></div>
      <div class="tut-block" data-tut="bottom"></div>
      <div class="tut-block" data-tut="left"></div>
      <div class="tut-block" data-tut="right"></div>
      <div class="tut-hole" data-tut="hole"></div>
      <div class="tut-ring" data-tut="ring"></div>
      <section class="tut-card" data-tut="card" role="dialog" aria-labelledby="tut-title" tabindex="-1">
        <div class="tut-progress" aria-hidden="true"><span data-tut="progress"></span></div>
        <h3 class="tut-title" id="tut-title" data-tut="title"></h3>
        <div class="tut-body" data-tut="body"></div>
        <p class="tut-hint" data-tut="hint"></p>
        <div class="tut-actions">
          <button type="button" class="tut-skip" data-tut="skip">Pomiń samouczek</button>
          <span class="tut-actions-main">
            <button type="button" data-tut="auto">Zrób to za mnie</button>
            <button type="button" class="btn-primary" data-tut="next">Dalej ›</button>
          </span>
        </div>
      </section>
      <div class="tut-pill" data-tut="pill" role="status">
        <span data-tut="pill-text"></span>
        <button type="button" class="tut-skip" data-tut="pill-skip">Pomiń</button>
      </div>`;
    document.body.appendChild(root);

    ui = {};
    root.querySelectorAll("[data-tut]").forEach((node) => { ui[node.dataset.tut] = node; });

    ui.skip.addEventListener("click", () => end("skipped"));
    ui["pill-skip"].addEventListener("click", () => end("skipped"));
    ui.next.addEventListener("click", next);
    ui.auto.addEventListener("click", () => {
      if (step && step.auto) step.auto(step);
    });
  }

  function placeBox(node, x, y, w, h) {
    const show = w > 0 && h > 0;
    node.style.cssText = `left:${x}px;top:${y}px;width:${Math.max(0, w)}px;height:${Math.max(0, h)}px;display:${show ? "block" : "none"}`;
  }

  function targetElement() {
    if (!step || step.center) return null;
    const found = typeof step.target === "function" ? step.target() : (step.target ? qs(step.target) : null);
    return visible(found) ? found : null;
  }

  function scrollTo(element) {
    const rect = element.getBoundingClientRect();
    const fits = rect.height < window.innerHeight * 0.7;
    try {
      element.scrollIntoView({ block: fits ? "center" : "start", inline: "nearest", behavior: "instant" });
    } catch (error) {
      element.scrollIntoView();
    }
  }

  function placeCard(hole) {
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const margin = 8;
    const gap = 14;
    const cw = ui.card.offsetWidth;
    const ch = ui.card.offsetHeight;
    const clamp = (value, max) => Math.max(margin, Math.min(value, max));
    let left;
    let top;

    if (!hole) {
      left = (vw - cw) / 2;
      top = (vh - ch) / 2;
    } else {
      const below = vh - (hole.y + hole.h) - gap - margin;
      const above = hole.y - gap - margin;
      const rightRoom = vw - (hole.x + hole.w) - gap - margin;
      const leftRoom = hole.x - gap - margin;
      if (below >= ch) {
        top = hole.y + hole.h + gap;
      } else if (above >= ch) {
        top = hole.y - gap - ch;
      } else if (rightRoom >= cw) {
        left = hole.x + hole.w + gap;
        top = hole.y + hole.h / 2 - ch / 2;
      } else if (leftRoom >= cw) {
        left = hole.x - gap - cw;
        top = hole.y + hole.h / 2 - ch / 2;
      } else {
        // Cel jest ogromny — kafelek przykrywa jego fragment, po stronie z mniejszą ilością treści.
        top = hole.y + hole.h / 2 < vh / 2 ? vh - ch - margin : margin;
      }
      if (left === undefined) left = hole.x + hole.w / 2 - cw / 2;
    }

    ui.card.style.left = `${clamp(left, vw - cw - margin)}px`;
    ui.card.style.top = `${clamp(top, vh - ch - margin)}px`;
  }

  function layout(element) {
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;

    if (!element) {
      placeBox(ui.top, 0, 0, vw, vh);
      placeBox(ui.bottom, 0, 0, 0, 0);
      placeBox(ui.left, 0, 0, 0, 0);
      placeBox(ui.right, 0, 0, 0, 0);
      placeBox(ui.hole, 0, 0, 0, 0);
      placeBox(ui.ring, 0, 0, 0, 0);
      placeCard(null);
      return;
    }

    const pad = 6;
    const rect = element.getBoundingClientRect();
    const x = Math.max(0, rect.left - pad);
    const y = Math.max(0, rect.top - pad);
    const right = Math.min(vw, rect.right + pad);
    const bottom = Math.min(vh, rect.bottom + pad);
    const hole = { x, y, w: right - x, h: bottom - y };

    placeBox(ui.top, 0, 0, vw, y);
    placeBox(ui.bottom, 0, bottom, vw, vh - bottom);
    placeBox(ui.left, 0, y, x, hole.h);
    placeBox(ui.right, right, y, vw - right, hole.h);
    if (step.mode === "click") placeBox(ui.hole, 0, 0, 0, 0);
    else placeBox(ui.hole, hole.x, hole.y, hole.w, hole.h);
    placeBox(ui.ring, hole.x, hole.y, hole.w, hole.h);
    placeCard(hole);
  }

  function renderStep() {
    const waiting = step.mode === "wait";
    ui.card.classList.toggle("hidden", waiting);
    ui.pill.classList.toggle("hidden", !waiting);
    ["top", "bottom", "left", "right", "hole", "ring"].forEach((name) => ui[name].classList.toggle("hidden", waiting));
    ui.ring.classList.toggle("is-click", step.mode === "click");
    if (waiting) {
      ui["pill-text"].textContent = step.pill || "🎓 Samouczek czeka.";
      return;
    }

    ui.title.textContent = typeof step.title === "function" ? step.title() : step.title;
    const body = typeof step.body === "function" ? step.body() : step.body;
    ui.body.replaceChildren();
    if (body instanceof Node) ui.body.appendChild(body);
    else ui.body.innerHTML = body || "";

    const clickMode = step.mode === "click";
    ui.hint.classList.toggle("hidden", !clickMode);
    ui.hint.textContent = "👆 Kliknij podświetlony element — albo wybierz „Zrób to za mnie”.";
    ui.auto.classList.toggle("hidden", !clickMode);
    ui.next.classList.toggle("hidden", clickMode);
    ui.next.textContent = step.nextLabel || "Dalej ›";
    ui.progress.style.width = `${Math.round(((index + 1) / steps.length) * 100)}%`;
    ui.card.scrollTop = 0;
  }

  function gotoStep(target) {
    token += 1;
    let i = target;
    while (i < steps.length && steps[i].skipIf && safe(steps[i].skipIf)) i += 1;
    if (i >= steps.length) {
      end("done");
      return;
    }
    index = i;
    step = steps[i];
    step._completing = false;
    step._scrolled = null;
    if (step.enter) step.enter(step);
    renderStep();
    lastKey = "";
    tick();
    if (step.mode === "info") ui.next.focus({ preventScroll: true });
    else if (step.mode === "click") ui.card.focus({ preventScroll: true });
  }

  function next() {
    if (!active || !step) return;
    const finished = step.last;
    if (step.leave) {
      try { step.leave(step); } catch (error) { /* krok sprzątający nie może zatrzymać samouczka */ }
    }
    if (finished) {
      end("done");
      return;
    }
    gotoStep(index + 1);
  }

  function completeSoon(delay) {
    const own = token;
    window.setTimeout(() => {
      if (active && own === token) next();
    }, delay);
  }

  function tick() {
    if (!active || !step) return;

    if ((step.mode === "click" || step.mode === "wait") && !step._completing) {
      if (step.until && safe(() => step.until(step))) {
        step._completing = true;
        completeSoon(step.mode === "wait" ? 500 : 120);
      }
    }
    if (step.mode === "wait") return;

    const element = targetElement();
    if (element && step._scrolled !== element) {
      step._scrolled = element;
      scrollTo(element);
    }

    const rect = element ? element.getBoundingClientRect() : null;
    const key = [
      rect ? `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)}` : "none",
      document.documentElement.clientWidth, window.innerHeight, ui.card.offsetHeight, ui.card.offsetWidth,
    ].join("|");
    if (key === lastKey) return;
    lastKey = key;
    layout(element);
  }

  function frame() {
    tick();
    if (active) rafId = window.requestAnimationFrame(frame);
  }

  // --- Zdarzenia globalne działające tylko podczas samouczka ---

  function onDocClick(event) {
    if (!active || !step || step.mode !== "click" || !step.clickSel || step._completing) return;
    if (!(event.target instanceof Element) || !event.target.closest(step.clickSel)) return;
    step._completing = true;
    completeSoon(90);   // dajemy grze chwilę na obsłużenie kliknięcia
  }

  function onKeyDown(event) {
    if (!active || !step || step.mode === "wait") return;
    const key = event.key.toLowerCase();
    if (event.key === "Tab") return;

    // Skróty dozwolone w kroku (np. Q w kroku „pierwszy cios”) przechodzą do gry.
    if (step.mode === "click" && step.allowKeys && step.allowKeys.includes(key)) return;

    // Klawisze wciśnięte na kafelku samouczka obsługuje przeglądarka (Enter/Spacja = przycisk), ale gra ich nie widzi.
    if (root.contains(event.target)) {
      event.stopPropagation();
      return;
    }
    // Enter/Spacja na podświetlonym przycisku w kroku „kliknij” działają normalnie.
    if (step.mode === "click" && (key === "enter" || event.code === "Space")) {
      const element = targetElement();
      if (element && element.contains(event.target)) return;
    }
    event.stopImmediatePropagation();
    event.preventDefault();
  }

  function onFocusIn(event) {
    if (!active || !step || step.mode === "wait" || !root || root.contains(event.target)) return;
    if (step.mode === "click") {
      const element = targetElement();
      if (element && element.contains(event.target)) return;
    }
    ui.card.focus({ preventScroll: true });
  }

  function listen(on) {
    const method = on ? "addEventListener" : "removeEventListener";
    document[method]("click", onDocClick, true);
    window[method]("keydown", onKeyDown, true);
    document[method]("focusin", onFocusIn);
  }

  function start() {
    if (active) return false;
    if (!screenOpen("main-menu") || screenOpen("battle-screen")) {
      window.showToast?.("Samouczek uruchomisz z menu głównego.", "warning");
      return false;
    }
    closePrompt();
    steps = buildSteps();
    active = true;
    index = -1;
    buildUI();
    listen(true);
    gotoStep(0);
    rafId = window.requestAnimationFrame(frame);
    return true;
  }

  function end(reason) {
    if (!active) return;
    active = false;
    window.cancelAnimationFrame(rafId);
    listen(false);
    if (root) root.remove();
    root = null;
    ui = null;
    step = null;
    steps = [];
    writeFlag("done");
    if (reason === "skipped") {
      window.showToast?.("Samouczek znajdziesz w ⚙️ Opcjach.", "");
    }
  }

  // -------------------------------------------- pytanie przy nowej postaci

  let promptNode = null;

  function closePrompt() {
    if (!promptNode) return;
    promptNode.remove();
    promptNode = null;
  }

  function showPrompt() {
    promptNode = document.createElement("section");
    promptNode.className = "modal tut-modal";
    promptNode.setAttribute("role", "dialog");
    promptNode.setAttribute("aria-modal", "true");
    promptNode.setAttribute("aria-labelledby", "tut-prompt-title");
    promptNode.innerHTML = `
      <div class="modal-content">
        <h2 id="tut-prompt-title">Witaj w Legends of Wpierdol!</h2>
        <p>Czy masz jakieś doświadczenie z tą grą?</p>
        <div class="tut-choice">
          <button type="button" class="btn-primary" data-tut-choice="new">Nie, pokaż mi jak zacząć.</button>
          <button type="button" data-tut-choice="veteran">Tak, grałem już w to.</button>
        </div>
      </div>`;
    document.body.appendChild(promptNode);

    const buttons = [...promptNode.querySelectorAll("button")];
    buttons[0].focus();

    // Dopóki gracz nie odpowie, Tab krąży tylko między dwoma przyciskami, a skróty gry śpią.
    promptNode.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key !== "Tab") return;
      event.preventDefault();
      const at = buttons.indexOf(document.activeElement);
      const dir = event.shiftKey ? -1 : 1;
      buttons[(at + dir + buttons.length) % buttons.length].focus();
    });

    promptNode.querySelector("[data-tut-choice=\"veteran\"]").addEventListener("click", () => {
      writeFlag("done");
      closePrompt();
      window.showToast?.("Okej, powodzenia! Samouczek znajdziesz w ⚙️ Opcjach.", "success", 3800);
    });
    promptNode.querySelector("[data-tut-choice=\"new\"]").addEventListener("click", () => {
      closePrompt();
      start();
    });
  }

  function offer() {
    if (active || promptNode) return;
    if (readFlag() === "done") return;
    showPrompt();
  }

  // ------------------------------------------------------------ Opcje

  const optionsButton = byId("tutorial-start-btn");
  if (optionsButton) {
    optionsButton.addEventListener("click", () => {
      byId("close-options-btn")?.click();
      start();
    });
  }

  window.Tutorial = { offer, start, isActive: () => active };
})();

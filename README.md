# Legends of Wpierdol — Online (JS Edition)

**[🎮 Zagraj teraz (Wersja Live)](https://legendsofwpierdol-online.pages.dev/?utm_source=gemini)** | **[📖 Oficjalne Wiki gry](https://legendsofwpierdol-online.pages.dev/wiki?utm_source=gemini)**

Przeglądarkowa gra RPG z turowym systemem walki, napisana w całości w czystym JavaScript (Vanilla JS). Wybierz swoją klasę, rozbudowuj statystyki, kupuj wyposażenie i przebijaj się przez 50 poziomów pełnych popkulturowych bossów oraz memicznych przeciwników. Gra stawia na zaskakująco rozbudowaną matematykę statystyk — odpowiednie zarządzanie penetracją pancerza, lifestealem i cooldownami jest tu kluczem do przetrwania. Pełen opis mechanik i wzorów matematycznych znajdziesz na [Wiki gry](https://legendsofwpierdol-online.pages.dev/wiki?utm_source=gemini).

## Główne cechy

* **4 unikalne klasy postaci:**
* **Zabójca:** Skupiony na obrażeniach fizycznych; ładuje pulę *Overkill* z nadwyżki obrażeń, by ostatecznie ignorować pancerz wroga.
* **Mag:** Całkowicie rezygnuje z tradycyjnej broni i ataków fizycznych na rzecz potężnych czarów, zniżek na przedmioty magiczne i ogromnej regeneracji many (aż 8 slotów na przedmioty magiczne).
* **Tank:** Posiada ogromną pulę zdrowia oraz pancerza; otrzymywane ciosy kumuluje jako "Gniew", który może zdetonować w twarz przeciwnika.
* **Samurai:** Skupiony na celności i unikach, potrafi płynnie przełączać postawy bojowe (*Sen no Kata*), modyfikując styl walki w locie.


* **Zaawansowana mechanika walki:** Turowy system wykorzystujący klasyczne wzory redukcji obrażeń (znane z gier MOBA). Obejmuje przebicie pancerza i magii, odporności, wymuszone i naturalne uderzenia krytyczne, a także efekty statusowe (ogłuszenie, zatrucie, odbicie obrażeń).
* **Ekonomia i Ekwipunek:** Rozbudowany sklep z bronią, przedmiotami pod AD/AP, jednorazowymi miksturami oraz trwałymi ulepszeniami (skille). Wybrane bronie unikalne (np. *Pistolet Jhina* czy *Yamato*) wprowadzają do walki własne, potężne mini-gry uruchamiane klawiszem Spacji.
* **Progresja:** 50 rosnących w siłę przeciwników podzielonych na fale. Co 5 poziomów na gracza czeka potężny Boss.
* **Architektura bez backendu (Base64 Save System):** Zapis gry działa całkowicie po stronie klienta. Postęp gracza jest serializowany do jednego ciągu znaków kodowanego w Base64. Do projektu dołączone jest osobne, wbudowane narzędzie (*Save Editor*) pozwalające na pełną modyfikację pliku zapisu.
* **Kosmetyka:** Osobna waluta (Skin Points) pozwala na odblokowywanie opcjonalnych skórek dla postaci. Dostępne są również 4 motywy kolorystyczne interfejsu (prism, night, neon, nature).

## Sterowanie (w walce)

* **Q** — Zwykły atak bronią (lub pierwsza umiejętność dla klasy Maga)
* **W, E, R** — Aktywne umiejętności klasowe
* **Spacja** — Uwolnienie specjalnej mechaniki dla unikalnych broni (dostępne tylko po wylosowaniu odpowiedniego oręża)
* *Mikstury oraz opcja jednorazowej ucieczki z walki obsługiwane są bezpośrednio z poziomu interfejsu (UI).*

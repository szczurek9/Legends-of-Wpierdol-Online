# Ikony interfejsu

Gra sama podmienia emotkę na obrazek, gdy tylko plik pojawi się w odpowiednim
folderze (nazwy dokładnie jak niżej, małe litery, PNG z przezroczystością).
Brak pliku = wyświetla się emotka zastępcza, więc ikony można dorysowywać po kolei.

## Statystyki — `res/icons/stats/` (64×64 px)

| Plik            | Co oznacza                  | Emotka zastępcza |
|-----------------|-----------------------------|------------------|
| `hp.png`        | Zdrowie                     | ❤️ |
| `mana.png`      | Mana                        | 🔷 |
| `damage.png`    | Obrażenia (też ikona „Atakuj”) | ⚔️ |
| `ad.png`        | Siła ataku (AD)             | tekst „AD” |
| `crit.png`      | Szansa na krytyka           | 💥 |
| `armor-pen.png` | Penetracja pancerza         | 🗡️ |
| `ap.png`        | Moc umiejętności (AP)       | ⭐ |
| `mana-regen.png`| Regeneracja many            | 🔷 |
| `armor.png`     | Pancerz                     | 🛡️ |
| `mr.png`        | Odporność magiczna          | tekst „MR” |
| `accuracy.png`  | Celność (sklep)             | 🎯 |
| `lifesteal.png` | Lifesteal (sklep)           | 🩸 |
| `magic-pen.png` | Penetracja magii (sklep)    | 🪄 |

Ikony wyświetlają się w małych rozmiarach (18–26 px), więc prosty, wyrazisty
kształt wygląda lepiej niż szczegóły.

## Klasy — `res/icons/classes/` (96×96 px, jak ikony umiejętności)

`assassin.png`, `mage.png`, `tank.png`, `samurai.png`, `archer.png`
(emotki zastępcze: 🥷 🧙 🛡️ ⚔️ 🏹)

## Mikstury — `res/icons/potions/` (64×64 px)

`healthPotion.png`, `precisionElixir.png`, `vampireCocktail.png` (zastępcza: 🧪)

## Umiejętności łucznika

Łucznik nie ma jeszcze folderu `res/abilities/archer/`. Pliki `ability1.png`,
`ability2.png`, `ability3.png` (96×96) po dodaniu pojawią się automatycznie
w walce, na kartach klas i w sklepie. Do tego czasu widać glify z `icons.js`.

## Zmiana emotek zastępczych

Wszystkie emotki są na górze `script/icons.js` (`STATS`, `CLASS_GLYPHS`, `ABILITY_GLYPHS`).

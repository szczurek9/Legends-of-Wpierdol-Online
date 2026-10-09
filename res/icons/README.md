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

## Przedmioty sklepu (64×64 px, ikona w prawym dolnym rogu karty)

Brak pliku = emotka ℹ️. Nazwa pliku = `id` przedmiotu z plików w `data/`.

- `res/icons/weapons/<id>.png` — bronie (`data/weapons.json`)
- `res/icons/ad-items/<id>.png` — przedmioty AD (`data/ad-items.json`)
- `res/icons/magic-items/<id>.png` — przedmioty AP (`data/magic-items.json`)
- `res/icons/skills/<id>.png` — wzmocnienia (`data/skills.json`)
- `res/icons/potions/<id>.png` — mikstury (już opisane wyżej)
- `res/icons/passives/<klasa>.png` — pasywki klas (`assassin`, `mage`, `tank`, `samurai`, `archer`)

## Aktywne efekty w walce — `res/icons/effects/` (64×64 px)

Brak pliku = emotka ℹ️.

`potionAccuracy.png`, `potionLifesteal.png`, `stun.png`, `poison.png`, `vines.png`,
`mirror.png`, `mushin.png`, `ironTaunt.png`, `bastion.png`, `rageArmor.png`,
`focusMark.png`, `evadeNext.png`

## Umiejętności łucznika

Łucznik nie ma jeszcze folderu `res/abilities/archer/`. Pliki `ability1.png`,
`ability2.png`, `ability3.png` (96×96) po dodaniu pojawią się automatycznie
w walce, na kartach klas i w sklepie. Do tego czasu widać glify z `icons.js`.

## Zmiana emotek zastępczych

Wszystkie emotki są na górze `script/icons.js` (`STATS`, `CLASS_GLYPHS`, `ABILITY_GLYPHS`).

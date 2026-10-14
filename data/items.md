Zip `inventory-ui-changed-files.zip` zawiera tylko trzy zmienione pliki, w ich ścieżkach: `index.html`, `script/inventory.js` i `style/inventory.css`. Wystarczy je rozpakować w katalogu głównym projektu.

## Jak dodać nowy przedmiot

Przedmioty są w plikach `data/ad-items.json` (AD) i `data/magic-items.json` (AP). Sklep i ekwipunek czytają je automatycznie, więc dodanie wpisu wystarczy, żeby pojawił się w sklepie, w ekwipunku i miał chipy statystyk.

### Przedmiot AD (`data/ad-items.json`)

Pola ze statystykami leżą bezpośrednio w obiekcie:

```json
{
  "id": "stormBlade",
  "name": "Ostrze Burzy",
  "price": 1800,
  "description": "+90 AD, +15% szansy na krytyka. Ataki ignorują 8 pkt pancerza.",
  "ad": 90,
  "critChance": 15,
  "armorPenetration": 8,
  "unique": true
}
```

| Pole | Efekt |
|---|---|
| `id`, `name`, `price`, `description` | wymagane |
| `ad` | siła ataku |
| `critChance` | % krytyka (suma ograniczona do 100%) |
| `accuracy` | % celności |
| `lifesteal` | % lifestealu |
| `armorPenetration` | płaska penetracja pancerza |
| `armorPenetrationPercent` | % penetracji pancerza |
| `unique` | `true` = można mieć tylko jedną sztukę |

### Przedmiot AP (`data/magic-items.json`)

Tutaj statystyki są w obiekcie `effects`:

```json
{
  "id": "stormStaff",
  "name": "Kostur Burzy",
  "price": 1200,
  "description": "+80 AP, +50 many, +10 penetracji magii.",
  "effects": { "abilityPower": 80, "mana": 50, "magicPenetration": 10 }
}
```

| Pole w `effects` | Efekt |
|---|---|
| `abilityPower` | AP |
| `mana` | maksymalna mana |
| `manaRegenPercent` | % bazowej regeneracji many |
| `magicPenetration` | penetracja magii |
| `magicResistance` | odporność magiczna |
| `magicLifesteal` | magiczny lifesteal (wymaga też `maxMagicLifesteal` na poziomie przedmiotu, to limit sumy) |

Opcjonalne pola na poziomie przedmiotu: `unique`, `maxOwned` (limit sztuk, np. `3`) i `noMageDiscount: true`. Bez tego ostatniego mag płaci 75% ceny.

### Ikona
Plik `res/icons/ad-items/<id>.png` albo `res/icons/magic-items/<id>.png`, 64×64, z przezroczystością. Nazwa musi być identyczna z `id`. Bez pliku pokaże się ℹ️.

## Czego JSON nie załatwi

- **Efekty specjalne w walce** są wpisane na sztywno w kodzie, po `id`. Przykłady: `snakeFang`, `shadowArrows`, `nightPower` i `assassinCloakAd` w `battleActions.js` i `arena.js`, a `wolfGrip` w obu tych plikach (liczy bonus za każdą sztukę). Pola `special`, `bonusDamage` i `bonusDamageAdScaling` same nic nie robią, bo `bonusDamage` tylko wyświetla się w sklepie. Dla przedmiotu z unikalnym działaniem trzeba dopisać obsługę w tych plikach.
- **Magiczne efekty specjalne** (`adeptBook`, `adeptBookUpgrade`, `abilityPowerMultiplier`) są obsługiwane w `shop.js` i `battleMath.js`. Nowy mnożnik czy podobny mechanizm wymaga zmiany w kodzie.
- **Nowa statystyka** (np. unik z przedmiotu) wymaga jej dopisania w `adjustAdEffects` albo `adjustMagicEffects` w `shop.js`. Żeby pokazała się też jako chip w ekwipunku, dodaj ją w `itemChips()` w `script/inventory.js`.
- **Zapisy** przechowują instancje przedmiotów razem z ich polami, więc zmiana `id` lub statystyk istniejącego przedmiotu nie zmieni tego, co gracze już mają w ekwipunku.
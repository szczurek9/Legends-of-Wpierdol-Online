// Auto-walka: wyłącznie logika decyzji (bez DOM i bez zmiany stanu gry).
// battleUI.js pyta decide(state) o następną akcję i wykonuje ją tymi samymi
// funkcjami, których używa ręczna gra (atak, umiejętność, mikstura, Spacja) —
// dzięki temu auto-walka nie ma własnych zasad walki, tylko „klika” za gracza.
//
// Zwraca jedną z akcji:
//   { kind: "potion", id, free }      mikstura (nie zajmuje tury)
//   { kind: "weapon", free }          umiejętność broni, Spacja (nie zajmuje tury)
//   { kind: "ability", id, free }     umiejętność klasy (free = nie zajmuje tury)
//   { kind: "attack" }                zwykły atak (Q)
//   { kind: "pause", reason }         auto-walka powinna się zatrzymać
(function () {
  const M = window.BattleMath;

  // Poniżej tego odsetka HP auto-walka pije Miksturę Zdrowia.
  const HEAL_BELOW = 0.40;
  // Poniżej tego odsetka HP, bez mikstur i z dostępną ucieczką, auto-walka
  // oddaje decyzję graczowi zamiast iść na pewną śmierć.
  const PAUSE_BELOW = 0.20;
  // Zagrożenie: jeden krytyczny cios wroga (surowe obrażenia x1,5, bez pancerza —
  // czyli zapas ostrożności) mógłby zabić gracza. Traktowane jak niskie HP.
  const CRIT_MARGIN = 1.5;

  // Umiejętności, które nie zużywają tury (patrz BattleActions.useAbility).
  const FREE_ABILITIES = ["absoluteFocus"];

  const isStunned = (state) => (state.effects?.stun || 0) > 0;
  const dodgy = (enemy) => (enemy.playerAttackChance ?? (100 - (enemy.dodgeChance || 0))) < 100;

  // Reguły umiejętności klas, w kolejności priorytetu. Umiejętność jest użyta,
  // gdy jest gotowa (cooldown 0, wystarczająca mana) i jej warunek jest spełniony.
  // Sen no Kata (zmiana postawy Samuraja) jest celowo pominięte — to wybór gracza.
  const CLASS_RULES = {
    assassin: [
      ["undodgeableSpeed", (c) => !c.state.effects.accuracyTurns && dodgy(c.enemy)],
      // Overkill Release tylko jako wykończenie — inaczej marnuje pasywkę Zabójcy.
      ["overkillRelease", (c) => c.player.overkillPool > 0
        && M.physicalDamage(c.player.overkillPool, c.state.enemyArmor * 0.2, c.player.armorPenetration) >= c.state.enemyHealth],
      ["primalStrike", (c) => !c.state.guaranteedCrit],
    ],
    mage: [
      ["deadlyMirror", (c) => c.hpRatio < 0.5],
      ["deadlyVines", (c) => !isStunned(c.state) && c.enemyHpRatio > 0.3],
      ["starStrike", () => true],
      ["stormBreeze", () => true],
    ],
    tank: [
      ["stoneBastion", (c) => !isStunned(c.state)],
      ["ironTaunt", (c) => !c.state.effects.ironTaunt && (M.currentWeaponDamage() > 500 || dodgy(c.enemy))],
      // Pasywka sama detonuje Gniew z większym zyskiem; ręcznie tylko jako leczenie awaryjne.
      ["accumulatedRage", (c) => c.hpRatio < 0.5 && c.state.rage > 0],
    ],
    samurai: [
      ["mushin", (c) => c.hpRatio < 0.7 && !c.state.effects.mushin],
      ["kōgeki", () => true],
    ],
    archer: [
      ["frostArrow", (c) => !isStunned(c.state)],
      ["rhythmOfWar", () => true],
      ["absoluteFocus", (c) => !c.state.focusMark],
    ],
  };

  function hasPotion(id) {
    return (window.player.potionInventory || []).includes(id);
  }

  function weaponAbilityReady(state) {
    const player = window.player;
    if (state.enemyDefeated || state.enemyHealth <= 0) return false;
    if (player.weaponId === "yamato") {
      const threshold = Math.min(100, (player.yamatoExecuteCap || 5) + (state.yamatoJudgementStacks || 0));
      return state.enemyHealth <= state.enemyMaxHealth * threshold / 100;
    }
    // Uwolnienie puli Jhina nie kosztuje tury, a obrażenia są te same co przy
    // auto-uwolnieniu po 16 atakach — nie ma sensu czekać.
    if (player.weaponId === "jhinPistol") return state.jhinPool > 0;
    return false;
  }

  function decide(state) {
    const player = window.player;
    const enemy = window.BattleState.enemyOf(state);
    const hpRatio = player.healthPoints / player.maxHealthPoints;
    const ctx = {
      state,
      player,
      enemy,
      hpRatio,
      enemyHpRatio: state.enemyMaxHealth > 0 ? state.enemyHealth / state.enemyMaxHealth : 0,
    };

    // 1. Przetrwanie.
    const inDanger = player.healthPoints <= state.enemyDamage * CRIT_MARGIN;
    if ((hpRatio < HEAL_BELOW || inDanger) && hasPotion("healthPotion")) {
      return { kind: "potion", id: "healthPotion", free: true };
    }
    const escapeAvailable = !state.arena && !player.usedEscape;
    if ((hpRatio <= PAUSE_BELOW || inDanger) && escapeAvailable) {
      return { kind: "pause", reason: "Auto-walka wstrzymana: niskie HP i brak Mikstur Zdrowia. Użyj ucieczki albo walcz dalej ręcznie." };
    }

    // 2. Mikstury wzmacniające — tylko na bossów, żeby nie marnować drogich eliksirów.
    if (enemy.isBoss) {
      if (hasPotion("precisionElixir") && !state.effects.potionAccuracy && dodgy(enemy)) {
        return { kind: "potion", id: "precisionElixir", free: true };
      }
      if (hasPotion("vampireCocktail") && !state.effects.potionLifesteal && hpRatio < 0.8) {
        return { kind: "potion", id: "vampireCocktail", free: true };
      }
    }

    // 3. Umiejętność broni unikalnej (Spacja).
    if (weaponAbilityReady(state)) return { kind: "weapon", free: true };

    // 4. Umiejętności klasy według priorytetów.
    const abilities = M.abilitiesForPlayer();
    const rules = CLASS_RULES[M.classId()] || [];
    for (const [id, condition] of rules) {
      const ability = abilities.find((item) => item.id === id);
      if (!ability) continue;
      if ((state.cooldowns?.[id] || 0) > 0 || player.manaPoints < ability.cost) continue;
      if (!condition(ctx)) continue;
      return { kind: "ability", id, free: FREE_ABILITIES.includes(id) };
    }

    // 5. Zwykły atak (Mag go nie ma — wszystko robi czarami).
    if (M.classId() !== "mage") return { kind: "attack" };

    const hint = escapeAvailable ? " Ucieczka przywraca część many." : "";
    return { kind: "pause", reason: `Auto-walka wstrzymana: brak many na jakąkolwiek umiejętność.${hint}` };
  }

  window.AutoBattle = {
    decide,
    // Arena liczy wynik za tury i obrażenia, więc domyślnie zostaje ręczna.
    allowInArena: false,
  };
})();

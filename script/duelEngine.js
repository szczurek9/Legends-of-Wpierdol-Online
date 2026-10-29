// Silnik pojedynków 1v1 (best of N). Bez DOM i bez sieci: czysta symulacja, którą uruchamiają OBAJ gracze
// na tych samych danych (buildy z serwera + ziarno), więc dostają identyczny wynik każdej tury.
//
// Jak to działa: każdy gracz ma własny "stan walki" w takim samym kształcie jak w walce z wrogiem
// (cooldowny, efekty, Gniew...), w którym przeciwnik występuje jako "wróg" z HP, pancerzem i unikiem
// zsynchronizowanymi z jego buildu. Atak i umiejętności klas liczy istniejący kod (BattleActions),
// więc balans zostaje wspólny z kampanią. Wyjątek to kontratak wroga: w pojedynku nie ma go wcale,
// zamiast niego działa tura przeciwnika (zatrucie, pnącza, ogłuszenie).
//
// Ładowany po battleMath.js / battleState.js / battleActions.js. Obsługuje atak, umiejętności klas
// i aktywne umiejętności broni unikalnych (Yamato, Pistolet Jhina); bez mikstur.
(function () {
  const M = window.BattleMath;
  const S = window.BattleState;
  const A = window.BattleActions;

  const YAMATO_BASE_THRESHOLD = 8;           // próg egzekucji Yamato w 1. rundzie (%), niezależny od kampanii
  const YAMATO_THRESHOLD_PER_ROUND = 1;     // +1 punkt procentowy w każdej kolejnej rundzie
  const MANA_RESTORE_PER_ROUND = 0.5;          // po każdej rundzie +50% maks. many
  const ATTACK_ABILITIES = ["rhythmOfWar", "kōgeki"]; // umiejętności będące atakiem (podlegają unikowi)
  const FREE_ABILITIES = ["senNoKata", "absoluteFocus"]; // nie zużywają tury
  // Balans pojedynków (kampania zostaje bez zmian):
  const STUN_CAP_DEFAULT = 1;               // ogłuszenie w pojedynku trwa max 1 turę...
  const STUN_CAP_BY_CLASS = { archer: 2 };  // ...a Łucznik (Strzała Mrozu) ma max 2
  const MIRROR_FATAL_BLOCK = 0.65;          // Śmiertelne Lustro blokuje 65% śmiertelnego ciosu (w kampanii 99%)
  // Nadpisania umiejętności tylko na czas pojedynku (koszt, odnowienie, skalowanie). Opisy dopasowują się niżej.
  const DUEL_ABILITY_OVERRIDES = {
    starStrike: { cost: 125, apScaling: 0.8, text: [["90%", "80%"]] },                    // Mag W: 100 → 125 many, 90% → 80% AP
    deadlyMirror: { cooldown: 6, text: [["99%", "65%"]] },                               // Mag R: odnowienie 5 → 6
    deadlyVines: { text: [["Ogłusza na 3 tury i", "Ogłusza na 1 turę i przez 3 tury"]] },
    stoneBastion: { text: [["na 2 tury", "na 1 turę"]] },
    frostArrow: { text: [["na 3 tury", "na 2 tury"]] },
  };
  const OVERKILL_THRESHOLD = 0.5;           // próg puli Overkill = 50% maks. HP przeciwnika (jak w kampanii)
  const OVERKILL_START_SHARE = 0.3;         // Zabójca zaczyna pojedynek z 30% tego progu

  const other = (side) => (side === "host" ? "guest" : "host");

  // Generator pseudolosowy zależny tylko od ziarna (mulberry32) — ten sam ciąg u obu graczy.
  function createRng(seed) {
    let t = seed >>> 0;
    return function next() {
      t = (t + 0x6D2B79F5) >>> 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Kopia window.classAbilities z nadpisaniami pojedynków (przeliczana tylko, gdy dane się zmienią).
  let tunedSource = null;
  let tunedTable = null;
  function duelAbilityTable() {
    const source = window.classAbilities;
    if (source === tunedSource && tunedTable) return tunedTable;
    const table = JSON.parse(JSON.stringify(source || {}));
    Object.values(table).forEach((data) => (data.active || []).forEach((ability) => {
      const override = DUEL_ABILITY_OVERRIDES[ability.id];
      if (!override) return;
      const { text, ...values } = override;
      Object.assign(ability, values);
      (text || []).forEach(([from, to]) => { if (ability.description) ability.description = ability.description.replace(from, to); });
    }));
    tunedSource = source;
    tunedTable = table;
    return table;
  }

  function abilitiesOf(player) {
    return duelAbilityTable()?.[player.classId]?.active || [];
  }

  // Pancerz, jaki ma przeciwnik w momencie ataku (pancerz + bonus + premia z Gniewu, mnożona przez Bastion).
  function effectiveArmor(side, duel) {
    const unit = duel.sides[side];
    const effects = unit.state.effects;
    const base = Math.min(unit.player.armorPoints, unit.player.armorCap) + unit.player.bonusArmor + (effects.rageArmor || 0);
    return base * (1 + (effects.bastionArmor || 0) / 100);
  }

  function enemyBlockFor(player) {
    return {
      health: player.maxHealthPoints,
      damage: 0,
      armorPoints: player.armorPoints,
      magicResistance: player.magicResistance || 0,
      attackChance: 0,
      critChance: 0,
      armorPenetration: 0,
      waves: 1,
      dodgeChance: player.bonusDodge || 0,
    };
  }

  function freshState(duel, side) {
    const opponent = duel.sides[other(side)].player;
    return { ...S.startState(enemyBlockFor(opponent), -1), arena: true, arenaTurns: 0 };
  }

  // Próg egzekucji Yamato w pojedynku: stały dla obu graczy, 8% w 1. rundzie i +1% w każdej kolejnej.
  // Nie zależy od progu z kampanii ani od trafień w walce; po pojedynku nic nie wraca do zapisu.
  function yamatoThreshold(duel) {
    return Math.min(100, YAMATO_BASE_THRESHOLD + (duel.round - 1) * YAMATO_THRESHOLD_PER_ROUND);
  }

  // Start rundy: pełne HP, +50% many (poza 1. rundą, gdzie obaj mają pełną), czyste cooldowny i efekty.
  function startRound(duel, starter, firstRound) {
    ["host", "guest"].forEach((side) => {
      const player = duel.sides[side].player;
      player.healthPoints = player.maxHealthPoints;
      player.manaPoints = firstRound
        ? player.maxManaPoints
        : M.clamp(player.manaPoints + Math.floor(player.maxManaPoints * MANA_RESTORE_PER_ROUND), 0, player.maxManaPoints);
      // Pula Overkill: Zabójca zaczyna cały pojedynek z 30% progu i NIE zeruje jej między rundami.
      if (firstRound) {
        const foeMaxHp = duel.sides[other(side)].player.maxHealthPoints;
        player.overkillPool = player.classId === "assassin" ? Math.floor(foeMaxHp * OVERKILL_THRESHOLD * OVERKILL_START_SHARE) : 0;
      }
      player.adeptBookStacks = 0;
      // Kod kampanii (useWeaponAbility) czyta próg z tego pola, więc ustawiamy je zgodnie z regułą pojedynków.
      player.yamatoExecuteCap = yamatoThreshold(duel);
    });
    ["host", "guest"].forEach((side) => { duel.sides[side].state = freshState(duel, side); });
    duel.actor = starter;
  }

  function create({ builds, seed, first, bestOf = 3 }) {
    const duel = {
      bestOf,
      seed,
      rng: createRng(seed),
      round: 1,
      wins: { host: 0, guest: 0 },
      history: [],
      matchWinner: null,
      actor: null,
      sides: {
        host: { player: JSON.parse(JSON.stringify(builds.host)), state: null },
        guest: { player: JSON.parse(JSON.stringify(builds.guest)), state: null },
      },
    };
    startRound(duel, first, true);
    return duel;
  }

  // Czy gracz ma jakąkolwiek akcję inną niż „pass” (atak lub umiejętność, na którą go stać).
  function hasAnyAction(duel, side) {
    const options = [{ kind: "attack" }, ...abilitiesOf(duel.sides[side].player).map((item) => ({ kind: "ability", id: item.id }))];
    return options.some((option) => validate(duel, side, option).ok);
  }

  // Aktywna umiejętność broni unikalnej (Spacja): Judgement Cut (Yamato) albo wystrzał puli (Pistolet Jhina).
  // Jak w kampanii nie zużywa tury.
  function validateWeapon(duel, side) {
    const unit = duel.sides[side];
    const foe = duel.sides[other(side)].player;
    if (unit.player.weaponId === "yamato") {
      return foe.healthPoints <= foe.maxHealthPoints * yamatoThreshold(duel) / 100 ? { ok: true } : { ok: false, reason: "yamato_not_ready" };
    }
    if (unit.player.weaponId === "jhinPistol") {
      return unit.state.jhinPool > 0 ? { ok: true } : { ok: false, reason: "pool_empty" };
    }
    return { ok: false, reason: "no_weapon_ability" };
  }

  // Czy ruch jest dozwolony. Nic nie zmienia — klient sprawdza to przed wysłaniem, a klient przeciwnika
  // przed zastosowaniem (nielegalny ruch = rozjazd, walka zostaje anulowana).
  function validate(duel, side, action) {
    if (duel.matchWinner) return { ok: false, reason: "match_over" };
    if (duel.actor !== side) return { ok: false, reason: "not_your_turn" };
    if (!action || typeof action !== "object") return { ok: false, reason: "bad_action" };
    if (action.kind === "pass") return hasAnyAction(duel, side) ? { ok: false, reason: "has_actions" } : { ok: true };
    if (action.kind === "attack") {
      // Mag nie ma zwykłego ataku (jak w kampanii: kafelek „Atakuj” jest dla niego ukryty).
      return duel.sides[side].player.classId === "mage" ? { ok: false, reason: "mage_no_attack" } : { ok: true };
    }
    if (action.kind === "weapon") return validateWeapon(duel, side);
    if (action.kind !== "ability") return { ok: false, reason: "unsupported" };

    const unit = duel.sides[side];
    const ability = abilitiesOf(unit.player).find((item) => item.id === action.id);
    if (!ability) return { ok: false, reason: "unknown_ability" };
    if (unit.state.cooldowns[ability.id] > 0) return { ok: false, reason: "cooldown" };
    if (ability.id === "senNoKata") return { ok: true };
    if (ability.id === "absoluteFocus" && unit.state.focusMark) return { ok: false, reason: "already_marked" };
    if (unit.player.manaPoints < ability.cost) return { ok: false, reason: "no_mana" };
    if (ability.id === "overkillRelease" && !(unit.player.overkillPool > 0)) return { ok: false, reason: "no_overkill" };
    return { ok: true };
  }

  // "Tura przeciwnika" w miejsce kontrataku wroga: zatrucie i pnącza ranią przeciwnika, a jego ogłuszenie
  // oznacza, że straci swoją turę (zużycie licznika ogłuszenia robi potem tickCooldowns, jak w kampanii).
  function opponentTurn(ctx, state) {
    ctx.turnConsumed = true;
    ctx.hpAtHook = state.enemyHealth;
    if (state.enemyDefeated) return state;

    const player = window.player; // gracz wykonujący akcję (podmieniony na czas akcji)
    let next = state;
    const stunCap = STUN_CAP_BY_CLASS[player.classId] || STUN_CAP_DEFAULT;
    if (next.effects.stun > stunCap) next = { ...next, effects: { ...next.effects, stun: stunCap } };
    let text = "";
    if (state.effects.poison > 0) {
      const result = M.applyDamageToEnemy(next, M.magicDamage(30 + player.ad * 0.25, state.enemyMagicResistance, player.magicPenetration));
      next = result.state;
      text += ` Zatrucie zadaje ${result.dealt} magicznych obrażeń.`;
    }
    if (state.effects.vines > 0 && !next.enemyDefeated) {
      const result = M.applyDamageToEnemy(next, M.magicDamage(10 + M.effectiveAbilityPower() * 0.10, state.enemyMagicResistance, player.magicPenetration));
      next = result.state;
      text += ` Pnącza zadają ${result.dealt} magicznych obrażeń.`;
    }
    ctx.opponentSkips = !next.enemyDefeated && next.effects.stun > 0;
    if (ctx.opponentSkips) text += " Przeciwnik jest ogłuszony!";
    return text ? { ...next, message: text.trim() } : next;
  }

  function runAction(duel, side, action) {
    const unit = duel.sides[side];
    const foe = duel.sides[other(side)];
    const attackType = action.kind === "attack" || ATTACK_ABILITIES.includes(action.id);
    const foeEffects = foe.state.effects;
    const evading = attackType && Boolean(foeEffects.evadeNext);

    // Przeciwnik oczami atakującego: HP, pancerz, odporność i unik zsynchronizowane z jego buildu.
    const hpBefore = foe.player.healthPoints;
    const dodge = (foe.player.bonusDodge || 0) - (foeEffects.enemyAccuracy || 0); // Prędkość Nie do Uniknięcia obniża celność
    unit.state = {
      ...unit.state,
      enemyHealth: hpBefore,
      enemyMaxHealth: foe.player.maxHealthPoints,
      enemyArmor: effectiveArmor(other(side), duel),
      enemyMagicResistance: foe.player.magicResistance || 0,
      enemyDefeated: hpBefore <= 0,
      arenaEnemy: { ...unit.state.arenaEnemy, dodgeChance: dodge, playerAttackChance: evading ? -1000 : undefined },
    };

    const ctx = { turnConsumed: false, hpAtHook: null, opponentSkips: false };
    const previousPlayer = window.player;
    const previousRoll = M.roll;
    const previousAbilities = window.classAbilities;
    window.player = unit.player;
    window.classAbilities = duelAbilityTable(); // koszt/odnowienie/skalowanie z nadpisań pojedynków
    M.roll = () => Math.floor(duel.rng() * 100);
    A.setOpponentTurn((state) => opponentTurn(ctx, state));

    let result;
    try {
      if (action.kind === "pass") {
        result = A.finishPlayerAction(unit.state, "Brak dostępnych akcji — tracisz turę.");
      } else if (action.kind === "weapon") {
        result = A.useWeaponAbility(unit.state);
      } else if (action.kind === "attack") {
        const focused = Boolean(unit.state.focusMark);
        const attacked = A.playerAttack(unit.state, { forceCritical: Boolean(unit.state.guaranteedCrit), focusStrike: focused });
        attacked.guaranteedCrit = false;
        attacked.focusMark = false;
        result = attacked.enemyDefeated ? attacked : A.finishPlayerAction(attacked, attacked.message);
      } else {
        result = A.useAbility(unit.state, action.id);
      }
    } finally {
      A.setOpponentTurn(null);
      M.roll = previousRoll;
      window.player = previousPlayer;
      window.classAbilities = previousAbilities;
    }

    // --- Obrona przeciwnika (warstwa po obliczeniu obrażeń przez kod kampanii) ---
    const hpAfterDirect = ctx.hpAtHook === null ? result.enemyHealth : ctx.hpAtHook;
    const dot = Math.max(0, hpAfterDirect - result.enemyHealth);
    let direct = Math.max(0, hpBefore - hpAfterDirect);
    let finalDirect = direct;
    let foeHp = hpBefore;
    let reflected = 0;

    if (attackType && foeEffects.evadeNext) delete foe.state.effects.evadeNext; // unik zużyty (trafiony lub nie)
    if (foeEffects.rageArmor && (attackType || direct > 0)) delete foe.state.effects.rageArmor; // Gniew-pancerz na jeden atak

    const execution = action.kind === "weapon" && unit.player.weaponId === "yamato";
    if (direct > 0 && execution) {
      foeHp = 0; // Judgement Cut to egzekucja, nie obrażenia: Lustro i Mushin jej nie osłabiają
    } else if (direct > 0) {
      if (foeEffects.mushin) finalDirect = Math.max(1, Math.floor(finalDirect * 0.7));
      if (foeEffects.mirror) {
        const fatal = finalDirect >= hpBefore;
        const blocked = fatal ? Math.floor(finalDirect * MIRROR_FATAL_BLOCK) : Math.floor(finalDirect * 0.10);
        finalDirect = Math.max(1, finalDirect - blocked);
        reflected = Math.floor(blocked * (fatal ? 0.05 : 0.20));
        foeHp = M.clamp(hpBefore - finalDirect, 0, foe.player.maxHealthPoints);
        if (fatal) foeHp = M.clamp(foeHp + Math.floor(blocked * 0.15), 0, foe.player.maxHealthPoints);
        delete foe.state.effects.mirror;
      } else {
        foeHp = M.clamp(hpBefore - finalDirect, 0, foe.player.maxHealthPoints);
      }
    }
    foeHp = Math.max(0, foeHp - dot);
    foe.player.healthPoints = foeHp;
    if (reflected > 0) unit.player.healthPoints = Math.max(0, unit.player.healthPoints - reflected);

    // Pasywka Czołgu: Gniew rośnie od otrzymanych obrażeń i sam detonuje po przekroczeniu progu.
    let burst = 0;
    if (finalDirect > 0 && foe.player.classId === "tank") {
      const rage = (foe.state.rage || 0) + finalDirect;
      const weaponDamage = Math.max(1, Math.floor((foe.player.weaponBaseDamage || foe.player.weaponDmg || 0) + (foe.player.ad || 0) * (foe.player.weaponAdScaling || 0)));
      if (rage >= weaponDamage * 1.5 && foeHp > 0) {
        burst = M.physicalDamage(rage * 0.70, effectiveArmor(side, duel), foe.player.armorPenetration);
        unit.player.healthPoints = Math.max(0, unit.player.healthPoints - burst);
        foe.player.healthPoints = M.clamp(foe.player.healthPoints + Math.floor(rage * 0.35), 0, foe.player.maxHealthPoints);
        foe.state = { ...foe.state, rage: 0, effects: { ...foe.state.effects, rageArmor: Math.floor(rage * 0.05) } };
      } else {
        foe.state = { ...foe.state, rage };
      }
    } else if (finalDirect > 0 && foe.state.rage !== undefined) {
      foe.state = { ...foe.state, rage: (foe.state.rage || 0) + finalDirect };
    }

    unit.state = { ...result, yamatoJudgementStacks: 0, enemyHealth: foe.player.healthPoints, enemyDefeated: foe.player.healthPoints <= 0 };
    // Naprawa Lustra: w kampanii wróg atakuje w tej samej akcji (przed odliczaniem efektów), w pojedynku dopiero w swojej
    // turze — odliczanie zjadało efekt, zanim wróg zdążył uderzyć. Przywracamy go; zużywa go najbliższy atak wroga.
    if (action.kind === "ability" && action.id === "deadlyMirror" && !unit.state.enemyDefeated) {
      unit.state.effects = { ...unit.state.effects, mirror: true };
    }
    return {
      ctx, hpBefore, direct: finalDirect, dot, reflected, burst, evaded: evading,
      // komunikat kampanii mówi "na 3 tury" — w pojedynku stun Łucznika trwa max 2
      message: action.id === "frostArrow" && result.message ? result.message.replace("na 3 tury", "na 2 tury") : result.message,
      missed: Boolean(result.missed), critical: Boolean(result.critical),
    };
  }

  function endRound(duel, winner) {
    duel.wins[winner] += 1;
    duel.history.push({ round: duel.round, winner });
    const needed = Math.floor(duel.bestOf / 2) + 1;
    if (duel.wins[winner] >= needed) {
      duel.matchWinner = winner;
      duel.actor = null;
      return;
    }
    duel.round += 1;
    startRound(duel, other(winner), false); // następną rundę zaczyna przegrany
  }

  // Wykonuje ruch. Zwraca { ok, next, ... } — next to to, co klient wysyła do serwera jako "next":
  // kto ma następny ruch ("host" | "guest") albo null, gdy cały pojedynek się skończył.
  function apply(duel, side, action) {
    const check = validate(duel, side, action);
    if (!check.ok) return { ok: false, reason: check.reason };

    const unit = duel.sides[side];
    const foe = duel.sides[other(side)];
    const result = runAction(duel, side, action);
    const unitDead = unit.player.healthPoints <= 0;
    const foeDead = foe.player.healthPoints <= 0;

    const summary = {
      ok: true,
      side,
      action,
      message: result.message,
      damage: result.direct + result.dot,
      reflected: result.reflected,
      burst: result.burst,
      missed: result.missed,
      critical: result.critical,
      evaded: result.evaded,
      roundOver: false,
      roundWinner: null,
      matchOver: false,
    };

    if (unitDead || foeDead) {
      // Gdy padli obaj (np. odbicie obrażeń), wygrywa wykonujący akcję.
      const winner = foeDead ? side : other(side);
      summary.roundOver = true;
      summary.roundWinner = winner;
      endRound(duel, winner);
      summary.matchOver = Boolean(duel.matchWinner);
    } else if (!result.ctx.turnConsumed) {
      duel.actor = side; // akcja bez zużycia tury (Sen no Kata, Nieokiełznane Skupienie)
    } else {
      duel.actor = result.ctx.opponentSkips ? side : other(side);
    }
    summary.next = duel.actor;
    return summary;
  }

  // Dane do interfejsu: moje i przeciwnika HP/mana, cooldowny oraz efekty widziane z jednej strony.
  function view(duel, side) {
    const mine = duel.sides[side];
    const foe = duel.sides[other(side)];
    const pack = (unit) => {
      // Statystyki liczone tymi samymi funkcjami co w kampanii (czytają window.player, więc podmieniamy go na chwilę).
      const previous = window.player;
      window.player = unit.player;
      let stats;
      try {
        stats = {
          damage: M.currentWeaponDamage(),
          ad: unit.player.ad,
          crit: unit.player.critChance,
          armorPen: unit.player.armorPenetration,
          armor: unit.player.armorPoints,
          mr: unit.player.magicResistance,
          ap: M.effectiveAbilityPower(),
          manaRegen: M.manaRegenAmount(unit.player.manaRegenPercent),
        };
      } finally {
        window.player = previous;
      }
      return {
        classId: unit.player.classId,
        skinName: unit.player.skinName,
        weaponId: unit.player.weaponId,
        weaponName: unit.player.weaponName,
        jhinPool: unit.state.jhinPool || 0,
        yamatoThreshold: yamatoThreshold(duel),
        hp: unit.player.healthPoints,
        maxHp: unit.player.maxHealthPoints,
        mana: unit.player.manaPoints,
        maxMana: unit.player.maxManaPoints,
        overkillPool: unit.player.overkillPool || 0,
        effects: { ...unit.state.effects },
        cooldowns: { ...unit.state.cooldowns },
        focusMark: Boolean(unit.state.focusMark),
        guaranteedCrit: Boolean(unit.state.guaranteedCrit),
        rage: unit.state.rage || 0,
        senMode: unit.state.senMode,
        senAttackCount: unit.state.senAttackCount || 0,
        stats,
      };
    };
    return {
      round: duel.round,
      bestOf: duel.bestOf,
      wins: { ...duel.wins },
      actor: duel.actor,
      matchWinner: duel.matchWinner,
      me: pack(mine),
      opponent: pack(foe),
    };
  }

  window.DuelEngine = { create, validate, apply, view, abilitiesOf, hasAnyAction, yamatoThreshold };
})();

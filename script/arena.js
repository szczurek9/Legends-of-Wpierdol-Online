// Arena (Battle Bot): generowanie bota, nagroda, cooldown i blokada po ucieczce.
// Ładowany po battleMath.js (potrzebuje window.BattleMath) i po dataLoader.js.
(function () {
  const M = window.BattleMath;

  const UNLOCK_LEVEL = 30;
  const COOLDOWN_MS = 8 * 60 * 1000;   // cooldown po zakończeniu walki
  const ESCAPE_LOCK_MS = 30 * 1000;    // blokada po ucieczce

  // hits = trafienia do zabicia (T), dodge = unik bota, atkMult/botCritMult = mnożniki z wiersza kampanii,
  // dmgPct = obrażenia bota w 1. fali jako ułamek maks. HP gracza, rewardMult = mnożnik trudności nagrody.
  const DIFFICULTIES = {
    easy:   { label: "Łatwy",  waves: 2, isBoss: false, hits: 3, dodge: 20, atkMult: 0.75, botCritMult: 0.50, dmgPct: 0.13,  hpScale: 1,    dmgScale: 1,    rewardMult: 0.10 },
    medium: { label: "Średni", waves: 3, isBoss: true,  hits: 3, dodge: 30, atkMult: 0.90, botCritMult: 0.75, dmgPct: 0.10,  hpScale: 1.15, dmgScale: 1.10, rewardMult: 0.20 },
    hard:   { label: "Trudny", waves: 4, isBoss: true,  hits: 4, dodge: 40, atkMult: 1.00, botCritMult: 1.00, dmgPct: 0.055, hpScale: 1.15, dmgScale: 1.10, rewardMult: 0.35 },
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  // Obrażenia gracza na trafienie (po obronie bota) i jego największy pojedynczy cios.
  function playerDamageModel(row, dodge) {
    const player = window.player;
    const accuracyBonus = (player.bonusAccuracy || 0) + M.weaponAccuracyBonus();

    if (M.classId() === "mage") {
      const ap = M.effectiveAbilityPower();
      const mr = Math.max(0, row.magicResistance - (player.magicPenetration || 0));
      const reduction = mr / (mr + 100);
      return {
        hit: 1,
        perHit: (37.5 + 0.575 * ap) * (1 - reduction),
        burst: (60 + 0.9 * ap) * (1 - reduction),
      };
    }

    const equippedAd = (player.adItemInventory || []).filter((item) => item.equipped);
    const hasAdItem = (id) => equippedAd.some((item) => item.id === id);
    const wolfCount = equippedAd.filter((item) => item.id === "wolfGrip").length;

    const weaponDamage = Math.max(1, Math.floor((player.weaponBaseDamage || player.weaponDmg) + player.ad * (player.weaponAdScaling || 0)));
    let classMult = 1;
    if (M.classId() === "assassin") classMult = 1.10;
    if (M.classId() === "samurai") classMult = 1.15;
    if (M.classId() === "tank" && weaponDamage > 500) classMult = 0.75;
    const weaponHit = weaponDamage * classMult;

    const critMult = M.classId() === "samurai" ? 1.2 : 1.5;
    const critFraction = clamp(player.critChance || 0, 0, 100) / 100;
    const rawPerHit = weaponHit * (1 + critFraction * (critMult - 1)) + wolfCount * (10 + player.ad * 0.10);

    const armor = Math.max(0, row.armorPoints * (1 - (player.armorPenetrationPercent || 0) / 100) - (player.armorPenetration || 0));
    const reduction = armor / (armor + 100);
    const shadow = hasAdItem("shadowArrows") && M.classId() !== "samurai" ? 1.8 : 1;

    return {
      hit: clamp(100 - dodge + accuracyBonus, 5, 100) / 100,
      perHit: rawPerHit * (1 - reduction),
      burst: 2.25 * weaponHit * shadow * (1 - reduction),
    };
  }

  // Tworzy obiekt bota w formacie wiersza z enemies.json (+ pole arena z danymi do oceny).
  function buildBot(difficultyId) {
    const player = window.player;
    const d = DIFFICULTIES[difficultyId];
    const level = Math.min(player.level, 50);
    const row = window.enemies[level - 1];
    const dm = playerDamageModel(row, d.dodge);

    const health = Math.floor(Math.max(d.hits * dm.perHit, 1.5 * dm.burst));
    const damage = Math.floor(player.maxHealthPoints * d.dmgPct);
    const attackChance = Math.round(Math.min(75, row.attackChance * d.atkMult));
    const critChance = Math.round(Math.min(40, row.critChance * d.botCritMult));

    // Oczekiwany czas ("par") i oczekiwana strata HP w całej walce - bez zaokrągleń fal poza floor jak w grze.
    let hp = health;
    let dmg = damage;
    let parTurns = 0;
    let expectedLoss = 0;
    for (let wave = 1; wave <= d.waves; wave += 1) {
      const turns = hp / (dm.perHit * dm.hit);
      parTurns += turns;
      expectedLoss += turns * (attackChance / 100) * (1 + critChance / 200) * dmg;
      if (d.isBoss) {
        hp = Math.floor(hp * d.hpScale);
        dmg = Math.floor(dmg * d.dmgScale);
      }
    }

    return {
      level,
      name: "Battle Bot",
      health,
      damage,
      waves: d.waves,
      isBoss: d.isBoss,
      hpScale: d.hpScale,
      dmgScale: d.dmgScale,
      attackChance,
      critChance,
      dodgeChance: d.dodge,
      playerAttackChance: 100 - d.dodge,
      armorPoints: row.armorPoints,
      magicResistance: row.magicResistance,
      armorPenetration: row.armorPenetration,
      reward: 0, // nagroda wypłacana raz na końcu, przez settle()
      modelAlive: "res/enemies/battlebot_a.png",
      modelDead: "res/enemies/battlebot_d.png",
      arena: {
        difficulty: difficultyId,
        income: row.reward * row.waves,
        rewardMult: d.rewardMult,
        parTurns,
        expectedLoss,
      },
    };
  }

  // Nagroda po wygranej: state.arenaDamageTaken i state.arenaTurns zbierane są podczas walki.
  function settle(state) {
    const meta = state.arenaEnemy.arena;
    const taken = state.arenaDamageTaken || 0;
    const turns = state.arenaTurns || 0;
    const damageScore = 1 / (1 + (taken / meta.expectedLoss) ** 2);
    const timeScore = 1 / (1 + (turns / meta.parTurns) ** 2);
    const performance = 0.4 + 1.2 * (0.5 * damageScore + 0.5 * timeScore);
    return {
      reward: Math.round(meta.income * meta.rewardMult * performance),
      performance, damageScore, timeScore, taken, turns,
      parTurns: meta.parTurns, expectedLoss: meta.expectedLoss,
    };
  }

  // Orientacyjny zarobek: nagroda bazowa dla poziomu gracza x mnożnik trudności, przy przeciętnym wykonaniu (x1,0).
  function estimateReward(difficultyId, player = window.player) {
    const d = DIFFICULTIES[difficultyId];
    const row = window.enemies[Math.min(player.level, 50) - 1];
    return Math.round(row.reward * row.waves * d.rewardMult);
  }

  function remaining(until, now = Date.now()) {
    return Math.max(0, (Number(until) || 0) - now);
  }

  // { ok: true } albo { ok: false, message }
  function canEnter(player, now = Date.now()) {
    if (player.level < UNLOCK_LEVEL) return { ok: false, message: `Arena odblokowuje się na ${UNLOCK_LEVEL}. poziomie.` };
    const lock = remaining(player.arenaEscapeLockUntil, now);
    if (lock > 0) return { ok: false, message: `Po ucieczce: odczekaj jeszcze ${Math.ceil(lock / 1000)} s.` };
    const cooldown = remaining(player.arenaCooldownUntil, now);
    if (cooldown > 0) {
      const sec = Math.ceil(cooldown / 1000);
      return { ok: false, message: `Cooldown areny: ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}.` };
    }
    return { ok: true };
  }

  window.Arena = { UNLOCK_LEVEL, COOLDOWN_MS, ESCAPE_LOCK_MS, DIFFICULTIES, buildBot, settle, canEnter, estimateReward };
})();

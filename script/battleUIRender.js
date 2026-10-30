// Renders the battle screen from a BattleSystem state object. battleUI.js
// owns the DOM element references and passes them in as `refs` on every
// call, so this file has no state of its own.
(function () {
  function setBar(element, value, max) {
    const percent = Math.max(0, Math.min(100, (value / max) * 100));
    element.style.width = `${percent}%`;
    // Pasek z niskim stanem (<= 25%) dostaje ostrzegawczą pulsację (patrz battle.css).
    if (element.parentElement) element.parentElement.classList.toggle("is-low", percent <= 25 && percent > 0);
  }

  // Krótki błysk karty, gdy HP spadło od poprzedniego renderu.
  function flashIfHit(card, hpElement, currentHp) {
    const previous = Number(hpElement.dataset.prevHp);
    hpElement.dataset.prevHp = currentHp;
    if (!card || Number.isNaN(previous) || currentHp >= previous) return;
    card.classList.remove("is-hit");
    void card.offsetWidth; // restart animacji
    card.classList.add("is-hit");
  }

  function formatPlayerAttack(result) {
    let message = result.playerMessage || result.message;
    if (result.superCritical) message += " SUPER CRIT!";
    else if (result.critical) message += " KRYTYK!";
    if (result.overkill > 0) message += ` Overkill: +${result.overkill} do puli.`;
    if (result.overkillArmorBreak) message += " Overkill ignoruje 80% pancerza!";
    if (result.heal > 0) message += ` Odzyskujesz ${result.heal} HP.`;
    if (result.secondWindHeal > 0) message += ` Drugie Tchnienie przywraca ${result.secondWindHeal} HP.`;
    return message;
  }

  function formatEnemyAttack(result) {
    let message = result.enemyMessage || result.message;
    if (result.enemyCritical) message += " KRYTYK!";
    if (result.enemyArmorReduced > 0) message += ` Twój pancerz zmniejszył obrażenia o ${result.enemyArmorReduced}.`;
    return message;
  }

  function renderEnemyModel(refs, enemy, dead) {
    const modelPath = dead ? enemy.modelDead : enemy.modelAlive;
    refs.enemyModel.alt = dead ? `${enemy.name} — pokonany` : enemy.name;
    refs.enemyModel.onload = () => {
      refs.enemyModel.classList.remove("hidden");
      refs.enemyModelFallback.classList.add("hidden");
    };
    refs.enemyModel.onerror = () => {
      refs.enemyModel.classList.add("hidden");
      refs.enemyModelFallback.classList.remove("hidden");
    };
    refs.enemyModel.src = modelPath;
  }

  function renderPlayerModel(refs, dead) {
    const skin = window.skinCatalog?.find((item) => item.id === window.player.skinName);
    const modelPath = skin ? (dead ? skin.modelDead : skin.modelAlive) : "res/skins/player_model.png";
    refs.playerModel.onerror = () => {
      refs.playerModel.onerror = null;
      refs.playerModel.src = "res/skins/player_model.png";
    };
    refs.playerModel.src = modelPath;
    refs.playerModel.alt = dead ? "Postać gracza — pokonana" : "Postać gracza";
  }

  function createActionIcon(path, alt) {
    const image = document.createElement("img");
    image.className = "ability-icon";
    image.src = path;
    image.alt = alt;
    image.onerror = () => {
      image.onerror = null;
      image.src = "res/img/background.png";
    };
    return image;
  }

  // Efekty: [id ikony, wartość przy ikonie, podpis w dymku].
  function renderEffects(refs, state) {
    const effects = state.effects || {};
    const chips = Object.entries(effects)
      .filter(([name]) => !["accuracy", "enemyAccuracy", "bastionArmor", "evadeNext", "accuracyTurns", "enemyAccuracyTurns"].includes(name))
      .map(([name, value]) => {
        const id = name.endsWith("Turns") ? name.slice(0, -5) : name;
        const label = window.GameIcons.EFFECTS[id] || id;
        if (id === "rageArmor") return [id, `+${value}`, `${label}: +${value}`];
        if (value === true) return [id, "", `${label}: aktywne`];
        return [id, value, `${label}: ${value} tur`];
      });
    // Łucznik: znacznik Skupienia i unik z Rytmu Wojny nie mają licznika tur.
    if (state.focusMark) chips.push(["focusMark", "", "Znacznik Skupienia: następny atak (Q)"]);
    if (effects.evadeNext) chips.push(["evadeNext", "", "Unik następnego ataku wroga"]);
    // Zabójca: Un-Dodgable Speed (jedyny efekt z enemyAccuracyTurns) i Primal Strike (gwarantowany krytyk).
    if (effects.enemyAccuracyTurns > 0) chips.push(["undodgeableSpeed", effects.enemyAccuracyTurns, `Un-Dodgable Speed: ${effects.enemyAccuracyTurns} tur`]);
    if (state.guaranteedCrit) chips.push(["primalStrike", "", "Primal Strike: następny atak to gwarantowany krytyk"]);
    // Pule i progi (pasywki klas, bronie unikalne): wartość przy ikonie, próg w dymku.
    const player = window.player;
    const short = (n) => (n >= 10000 ? `${String(Math.round(n / 100) / 10).replace(".", ",")}k` : String(n));
    const classId = player.classId || "assassin";
    if (classId === "assassin" && player.overkillPool > 0) {
      const pool = Math.floor(player.overkillPool);
      const threshold = Math.ceil(state.enemyMaxHealth * 0.5);
      chips.push(["overkillPool", short(pool), `Overkill: ${pool} (od ${threshold} atak ignoruje 80% pancerza)`]);
    }
    if (classId === "tank" && state.rage > 0) {
      const rage = Math.floor(state.rage);
      const threshold = Math.floor(window.BattleMath.currentWeaponDamage() * 1.5);
      chips.push(["ragePool", short(rage), `Skumulowany Gniew: ${rage} (wybucha od ${threshold})`]);
    }
    if (player.weaponId === "jhinPistol" && state.jhinPool > 0) {
      chips.push(["jhinPool", short(state.jhinPool), `Pula Pistoletu Jhina: ${state.jhinPool}`]);
    }
    if (player.weaponId === "yamato") {
      const threshold = Math.min(100, (player.yamatoExecuteCap || 5) + (state.yamatoJudgementStacks || 0));
      chips.push(["yamatoJudgement", `${threshold}%`, `Judgement Cut: egzekucja wroga poniżej ${threshold}% HP`]);
    }
    // Efekty jako ikony (jak chipy statystyk): liczba tur przy ikonie, nazwa po najechaniu lub dotknięciu.
    refs.effectsPanel.replaceChildren();
    // Rzadziej potrzebne statystyki gracza (AD, regeneracja many) mieszkają tu, żeby pasek statystyk mieścił się w jednym rzędzie.
    const manaRegen = window.BattleMath.manaRegenAmount(player.manaRegenPercent);
    refs.effectsPanel.append(
      window.GameIcons.chip("ad", player.ad),
      window.GameIcons.chip("manaRegen", `+${manaRegen}`),
    );
    chips.forEach(([id, value, label]) => refs.effectsPanel.appendChild(window.GameIcons.effectChip(id, value, label)));
  }

  // Wiersz chipów „ikona + wartość”. Wpis: [klucz statystyki, wartość, (opcjonalnie) własna etykieta].
  function renderChips(container, entries) {
    container.replaceChildren(...entries.map(([stat, value, label]) => window.GameIcons.chip(stat, value, label)));
  }

  function render(refs, state) {
    const player = window.player;
    const enemy = window.BattleState.enemyOf(state);

    refs.battleTitle.textContent = enemy.name;
    refs.battleWave.textContent = `Fala ${state.currentWave} / ${state.totalWaves}`;
    refs.playerName.textContent = player.nickname || "Gracz";
    flashIfHit(document.querySelector(".combatant-player"), refs.playerHp, player.healthPoints);
    refs.playerHp.textContent = `${player.healthPoints} / ${player.maxHealthPoints}`;
    setBar(refs.playerHealthBar, player.healthPoints, player.maxHealthPoints);
    refs.playerManaValue.textContent = `${player.manaPoints} / ${player.maxManaPoints}`;
    setBar(refs.playerManaBar, player.manaPoints, player.maxManaPoints);
    renderPlayerModel(refs, false);
    const currentWeaponDamage = window.BattleMath.currentWeaponDamage();
    renderChips(refs.playerWeapon, [
      ["damage", currentWeaponDamage, "Obrażenia broni"],
      ["crit", `${player.critChance}%`],
      ["armorPen", player.armorPenetration],
    ]);

    const effectiveAP = window.BattleSystem.getEffectiveAbilityPower ? window.BattleSystem.getEffectiveAbilityPower() : player.abilityPower + player.adeptBookStacks;
    renderChips(refs.playerMana, [
      ["ap", effectiveAP],
      ["armor", player.armorPoints],
      ["mr", player.magicResistance],
    ]);

    refs.enemyName.textContent = enemy.name;
    flashIfHit(document.querySelector(".combatant-enemy"), refs.enemyHp, state.enemyHealth);
    refs.enemyHp.textContent = `${state.enemyHealth} / ${state.enemyMaxHealth}`;
    setBar(refs.enemyHealthBar, state.enemyHealth, state.enemyMaxHealth);
    renderChips(refs.enemyStats, [
      ["damage", state.enemyDamage],
      ["crit", `${enemy.critChance}%`],
      ["armor", state.enemyArmor],
      ["mr", state.enemyMagicResistance],
      ["armorPen", enemy.armorPenetration],
    ]);
    renderEnemyModel(refs, enemy, state.enemyDefeated === true);

    refs.escapeButton.disabled = player.usedEscape && !state.arena;
    refs.attackButton.classList.toggle("hidden", player.classId === "mage");
    renderEffects(refs, state);
  }

  // Kafelek akcji: ikona w ramce + plakietki (skrót, koszt many, cooldown) + podpis.
  function buildTile(button, { icon, name, hotkey, cost, cooldown, noMana, sub }) {
    const frame = document.createElement("span");
    frame.className = "tile-frame";
    frame.appendChild(icon);
    if (hotkey) {
      const key = document.createElement("span");
      key.className = "tile-key";
      key.textContent = hotkey;
      frame.appendChild(key);
    }
    if (cost > 0) {
      const badge = document.createElement("span");
      badge.className = "tile-cost";
      badge.append(window.GameIcons.stat("mana", "tile-cost-icon"), String(cost));
      frame.appendChild(badge);
    }
    if (cooldown > 0) {
      const overlay = document.createElement("span");
      overlay.className = "tile-cooldown";
      overlay.textContent = String(cooldown);
      frame.appendChild(overlay);
    }
    button.replaceChildren(frame);

    const label = document.createElement("span");
    label.className = "tile-name";
    label.textContent = name;
    button.appendChild(label);
    if (sub) {
      const subLine = document.createElement("span");
      subLine.className = "tile-sub";
      subLine.textContent = sub;
      button.appendChild(subLine);
    }
    button.classList.toggle("is-cooldown", cooldown > 0);
    button.classList.toggle("is-no-mana", Boolean(noMana) && !(cooldown > 0));
  }

  function describeTile({ name, hotkey, cost, cooldown, noMana, maxCooldown }) {
    const parts = [name];
    if (hotkey) parts.push(`skrót ${hotkey}`);
    if (cost > 0) parts.push(`koszt ${cost} many${noMana ? " (za mało many)" : ""}`);
    if (cooldown > 0) parts.push(`odnowienie: jeszcze ${cooldown} tur`);
    else if (maxCooldown) parts.push(`odnowienie ${maxCooldown} tur`);
    return parts.join(", ");
  }

  // Kafelek umiejętności broni (Yamato: Judgement Cut, Pistolet Jhina: wystrzał puli).
  // Zwraca null, jeśli aktualna broń nie ma aktywnej umiejętności.
  function buildWeaponAbilityTile(state, onUse) {
    const player = window.player;
    let name;
    let sub;
    let ready;
    let notReady;
    if (player.weaponId === "yamato") {
      const threshold = Math.min(100, (player.yamatoExecuteCap || 5) + (state.yamatoJudgementStacks || 0));
      name = "Judgement Cut";
      sub = `poniżej ${threshold}% HP`;
      notReady = `Judgement Cut wymaga celu poniżej ${threshold}% HP.`;
      ready = state.enemyHealth <= state.enemyMaxHealth * threshold / 100;
    } else if (player.weaponId === "jhinPistol") {
      const pool = Math.floor(state.jhinPool || 0);
      name = "Pula Jhina";
      sub = pool > 0 ? String(pool) : "pusta";
      notReady = "Pula Pistoletu Jhina jest pusta.";
      ready = pool > 0;
    } else {
      return null;
    }
    ready = ready && !state.enemyDefeated && state.enemyHealth > 0;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ability-button weapon-ability-button";
    const tile = { name, hotkey: window.GameSettings.label("weapon", true), sub };
    buildTile(button, { ...tile, icon: window.GameIcons.itemIcon("weapons", player.weaponId, "tile-img") });
    button.title = `Umiejętność broni: ${player.weaponName}`;
    button.setAttribute("aria-label", `${name}, ${sub}, skrót ${window.GameSettings.label("weapon")}`);
    // Kafelek zawsze klikalny: gdy umiejętność nie jest gotowa, klik tylko pokazuje powód w logu.
    button.classList.toggle("is-no-mana", !ready);
    button.addEventListener("click", () => onUse?.(ready ? null : notReady));
    return button;
  }

  function renderAbilities(refs, state, onUseAbility, onUseWeaponAbility) {
    refs.abilitiesPanel.replaceChildren();

    // Atak bronią (Q) — ten sam przycisk co zawsze, tylko w formie kafelka.
    buildTile(refs.attackButton, {
      icon: window.GameIcons.stat("damage", "tile-glyph"),
      name: "Atakuj",
      hotkey: window.GameSettings.label("slot1", true),
    });
    refs.attackButton.title = `Atak bronią: ${window.player.weaponName}`;
    refs.attackButton.setAttribute("aria-label", `Atakuj, skrót ${window.GameSettings.label("slot1")}`);
    refs.abilitiesPanel.appendChild(refs.attackButton);

    // Umiejętność broni unikalnej (Spacja) — kafelek dla telefonów, bez klawiatury.
    const weaponTile = buildWeaponAbilityTile(state, onUseWeaponAbility);
    if (weaponTile) refs.abilitiesPanel.appendChild(weaponTile);

    const classAbilities = window.classAbilities?.[window.player.classId]?.active || [];
    classAbilities.forEach((ability, abilityIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ability-button";
      const maxCooldown = window.BattleMath.effectiveCooldown(ability);
      const cooldownNote = maxCooldown ? ` | CD: ${maxCooldown} tur${maxCooldown < ability.cooldown ? ` (bazowo ${ability.cooldown})` : ""}` : "";
      button.title = `${ability.description} Koszt: ${ability.cost} many${cooldownNote}`;

      const hotkey = window.GameSettings.label(window.GameSettings.abilityAction(window.player.classId, abilityIndex), true);
      const isToggle = ability.id === "senNoKata";
      const cooldown = isToggle ? 0 : (state.cooldowns?.[ability.id] || 0);
      const noMana = window.player.manaPoints < ability.cost;
      let sub = "";
      if (isToggle) {
        button.classList.add(state.senMode === "boei" ? "ability-mode-boei" : "ability-mode-chikara");
        sub = state.senMode === "boei" ? `Bōei · atak ${state.senAttackCount}/3` : "Chikara";
      }

      const tile = { name: ability.name, hotkey, cost: ability.cost, cooldown, noMana, sub, maxCooldown };
      buildTile(button, { ...tile, icon: window.GameIcons.abilityIcon(window.player.classId, ability, "tile-img") });
      button.setAttribute("aria-label", describeTile(tile));
      button.disabled = cooldown > 0 || noMana;

      button.addEventListener("click", () => onUseAbility(ability.id));
      refs.abilitiesPanel.appendChild(button);
    });
  }

  function renderPotions(refs, state, onUsePotion) {
    refs.potionsPanel.replaceChildren();
    const counts = {};
    (window.player.potionInventory || []).forEach((id) => {
      counts[id] = (counts[id] || 0) + 1;
    });

    Object.entries(counts).forEach(([id, count]) => {
      const potion = window.shopPotions.find((item) => item.id === id);
      if (!potion) return;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "potion-button";
      button.title = potion.description;
      button.setAttribute("aria-label", `${potion.name}, ${count} szt. ${potion.description}`);

      const frame = document.createElement("span");
      frame.className = "tile-frame";
      frame.appendChild(window.GameIcons.potionIcon(id, "tile-img"));
      const badge = document.createElement("span");
      badge.className = "tile-count";
      badge.textContent = `×${count}`;
      frame.appendChild(badge);
      const label = document.createElement("span");
      label.className = "tile-name";
      label.textContent = potion.name;
      button.append(frame, label);

      button.addEventListener("click", () => onUsePotion(id));
      refs.potionsPanel.appendChild(button);
    });
  }

  window.BattleUIRender = {
    setBar,
    formatPlayerAttack,
    formatEnemyAttack,
    renderEnemyModel,
    renderPlayerModel,
    createActionIcon,
    buildTile,
    describeTile,
    renderChips,
    flashIfHit,
    render,
    renderAbilities,
    renderPotions,
  };
})();

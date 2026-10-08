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

  const EFFECT_LABELS = {
    potionAccuracy: "Eliksir Precyzji",
    potionLifesteal: "Koktajl Wampira",
    accuracy: "Celność",
    enemyAccuracy: "Celność wroga",
    stun: "Ogłuszenie",
    poison: "Zatrucie",
    vines: "Pnącza",
    mirror: "Śmiertelne Lustro",
    mushin: "Mushin",
    ironTaunt: "Prowokacja",
    bastionTurns: "Bastion",
    bastionArmor: "Bonus pancerza",
  };

  function renderEffects(refs, state) {
    const effectNames = Object.entries(state.effects || {})
      .filter(([name]) => !["accuracy", "enemyAccuracy", "bastionArmor", "evadeNext"].includes(name))
      .map(([name, value]) => {
        const label = name.endsWith("Turns") ? name.slice(0, -5) : name;
        return `${EFFECT_LABELS[label] || label}: ${name.endsWith("Turns") ? value : `${value} tur`}`;
      });
    // Łucznik: znacznik Skupienia i unik z Rytmu Wojny nie mają licznika tur.
    if (state.focusMark) effectNames.push("Znacznik Skupienia: następny atak (Q)");
    if ((state.effects || {}).evadeNext) effectNames.push("Unik następnego ataku wroga");
    // Efekty jako osobne "chipy" zamiast jednej długiej linii.
    refs.effectsPanel.replaceChildren();
    if (!effectNames.length) {
      refs.effectsPanel.textContent = "Brak aktywnych efektów.";
      return;
    }
    effectNames.forEach((text) => {
      const chip = document.createElement("span");
      chip.className = "effect-chip";
      chip.textContent = text;
      refs.effectsPanel.appendChild(chip);
    });
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
    refs.playerWeaponName.textContent = player.weaponName;
    renderChips(refs.playerWeapon, [
      ["damage", currentWeaponDamage, `Obrażenia broni (${player.weaponName})`],
      ["ad", player.ad],
      ["crit", `${player.critChance}%`],
      ["armorPen", player.armorPenetration],
    ]);

    const manaRegen = window.BattleMath.manaRegenAmount(player.manaRegenPercent);
    const effectiveAP = window.BattleSystem.getEffectiveAbilityPower ? window.BattleSystem.getEffectiveAbilityPower() : player.abilityPower + player.adeptBookStacks;
    renderChips(refs.playerMana, [
      ["ap", effectiveAP],
      ["manaRegen", `+${manaRegen}`],
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

  function renderAbilities(refs, state, onUseAbility) {
    refs.abilitiesPanel.replaceChildren();
    const isMage = window.player.classId === "mage";

    // Atak bronią (Q) — ten sam przycisk co zawsze, tylko w formie kafelka.
    buildTile(refs.attackButton, {
      icon: window.GameIcons.stat("damage", "tile-glyph"),
      name: "Atakuj",
      hotkey: "Q",
    });
    refs.attackButton.title = `Atak bronią: ${window.player.weaponName}`;
    refs.attackButton.setAttribute("aria-label", "Atakuj, skrót Q");
    refs.abilitiesPanel.appendChild(refs.attackButton);

    const classAbilities = window.classAbilities?.[window.player.classId]?.active || [];
    classAbilities.forEach((ability, abilityIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ability-button";
      button.title = `${ability.description} Koszt: ${ability.cost} many${ability.cooldown ? ` | CD: ${ability.cooldown} tur` : ""}`;

      const hotkey = isMage ? ["Q", "W", "E", "R"][abilityIndex] : ["W", "E", "R"][abilityIndex];
      const isToggle = ability.id === "senNoKata";
      const cooldown = isToggle ? 0 : (state.cooldowns?.[ability.id] || 0);
      const noMana = window.player.manaPoints < ability.cost;
      let sub = "";
      if (isToggle) {
        button.classList.add(state.senMode === "boei" ? "ability-mode-boei" : "ability-mode-chikara");
        sub = state.senMode === "boei" ? `Bōei · atak ${state.senAttackCount}/3` : "Chikara";
      }

      const tile = { name: ability.name, hotkey, cost: ability.cost, cooldown, noMana, sub, maxCooldown: ability.cooldown };
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
    render,
    renderAbilities,
    renderPotions,
  };
})();

// Renders the battle screen from a BattleSystem state object. battleUI.js
// owns the DOM element references and passes them in as `refs` on every
// call, so this file has no state of its own.
(function () {
  function setBar(element, value, max) {
    element.style.width = `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
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
      .filter(([name]) => !["accuracy", "enemyAccuracy", "bastionArmor"].includes(name))
      .map(([name, value]) => {
        const label = name.endsWith("Turns") ? name.slice(0, -5) : name;
        return `${EFFECT_LABELS[label] || label}: ${name.endsWith("Turns") ? value : `${value} tur`}`;
      });
    refs.effectsPanel.textContent = effectNames.length ? effectNames.join(" | ") : "Brak aktywnych efektów.";
  }

  function render(refs, state) {
    const player = window.player;
    const enemy = window.enemies[state.enemyIndex];

    refs.battleTitle.textContent = enemy.name;
    refs.battleWave.textContent = `Fala ${state.currentWave} / ${state.totalWaves}`;
    refs.playerName.textContent = player.nickname || "Gracz";
    refs.playerHp.textContent = `${player.healthPoints} / ${player.maxHealthPoints}`;
    setBar(refs.playerHealthBar, player.healthPoints, player.maxHealthPoints);
    refs.playerManaValue.textContent = `${player.manaPoints} / ${player.maxManaPoints}`;
    setBar(refs.playerManaBar, player.manaPoints, player.maxManaPoints);
    renderPlayerModel(refs, false);
    const currentWeaponDamage = window.BattleMath.currentWeaponDamage();
    refs.playerWeapon.textContent = `⚔️: ${player.weaponName} - ${currentWeaponDamage} DMG | AD: ${player.ad} | 💥: ${player.critChance}% | 🗡️: ${player.armorPenetration}`;

    const manaRegen = Math.floor(player.maxManaPoints * 0.03 * (1 + Math.max(0, player.manaRegenPercent || 0) / 100));
    const effectiveAP = window.BattleSystem.getEffectiveAbilityPower ? window.BattleSystem.getEffectiveAbilityPower() : player.abilityPower + player.adeptBookStacks;
    refs.playerMana.textContent = `⭐: ${effectiveAP} | 🔷: +${manaRegen}/turn | 🛡️: ${player.armorPoints} | MR: ${player.magicResistance}`;

    refs.enemyName.textContent = enemy.name;
    refs.enemyHp.textContent = `${state.enemyHealth} / ${state.enemyMaxHealth}`;
    setBar(refs.enemyHealthBar, state.enemyHealth, state.enemyMaxHealth);
    refs.enemyStats.textContent = `⚔️: ${state.enemyDamage} DMG | 💥: ${enemy.critChance}% | 🛡️: ${state.enemyArmor} | MR️: ${state.enemyMagicResistance} | 🗡️: ${enemy.armorPenetration}`;
    renderEnemyModel(refs, enemy, state.enemyDefeated === true);

    refs.escapeButton.disabled = player.usedEscape;
    refs.attackButton.classList.toggle("hidden", player.classId === "mage");
    renderEffects(refs, state);
  }

  function renderAbilities(refs, state, onUseAbility) {
    refs.abilitiesPanel.replaceChildren();
    const isMage = window.player.classId === "mage";
    refs.attackButton.textContent = "⚔️ Atakuj (Q)";
    refs.abilitiesPanel.appendChild(refs.attackButton);

    const classAbilities = window.classAbilities?.[window.player.classId]?.active || [];
    classAbilities.forEach((ability, abilityIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ability-button";
      button.title = `${ability.description} Koszt: ${ability.cost} many${ability.cooldown ? ` | CD: ${ability.cooldown} tur` : ""}`;

      button.appendChild(createActionIcon(`res/abilities/${window.player.classId}/${ability.icon}`, ability.name));

      const shortcut = isMage ? ["Q", "W", "E", "R"][abilityIndex] : ["W", "E", "R"][abilityIndex];
      const abilityName = ability.id === "senNoKata" ? `${ability.name} (${state.senMode === "boei" ? "Bōei" : "Chikara"})` : ability.name;
      const label = document.createElement("span");
      label.textContent = `${abilityName}${shortcut ? ` (${shortcut})` : ""}`;
      button.appendChild(label);

      const cooldown = state.cooldowns?.[ability.id] || 0;
      button.disabled = cooldown > 0 || window.player.manaPoints < ability.cost;
      if (ability.id !== "senNoKata" && cooldown > 0) label.textContent += ` — CD: ${cooldown}`;
      if (ability.id === "senNoKata") {
        button.classList.add(state.senMode === "boei" ? "ability-mode-boei" : "ability-mode-chikara");
        label.textContent += state.senMode === "boei" ? ` | atak: ${state.senAttackCount}/3` : "";
      }

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
      button.textContent = `🧪 ${potion.name} (${count})`;
      button.addEventListener("click", () => onUsePotion(id));
      refs.potionsPanel.appendChild(button);
    });
  }

  function renderWeaponAbility(refs, state) {
    if (!refs.weaponPanel || !refs.weaponAbilityButton) return;
    const player = window.player;
    if (player.weaponId !== "jhinPistol" && player.weaponId !== "yamato") {
      refs.weaponPanel.classList.add("hidden");
      return;
    }

    refs.weaponPanel.classList.remove("hidden");
    if (player.weaponId === "jhinPistol") {
      const pool = state.jhinPool || 0;
      const autoCount = state.jhinAttackCount || 0;
      const autoLeft = Math.max(0, 16 - autoCount);
      if (state.weaponAbilityUsed) {
        refs.weaponAbilityButton.disabled = true;
        refs.weaponAbilityButton.className = "weapon-ability-button";
        refs.weaponAbilityButton.textContent = "🔫 Pistolet Jhina (Spacja) | Zużyto w tej walce";
        refs.weaponAbilityButton.title = "Umiejętność Pistoletu Jhina została już zużyta w tej walce.";
      } else if (pool <= 0) {
        refs.weaponAbilityButton.disabled = true;
        refs.weaponAbilityButton.className = "weapon-ability-button";
        refs.weaponAbilityButton.textContent = `🔫 Uwolnij Pulę Jhina (Spacja) | Pusta pula (Auto za: ${autoLeft} atk)`;
        refs.weaponAbilityButton.title = "Pula jest pusta. Trafiaj wroga, aby gromadzić obrażenia (co 4. strzał).";
      } else {
        refs.weaponAbilityButton.disabled = false;
        refs.weaponAbilityButton.className = "weapon-ability-button ready";
        refs.weaponAbilityButton.textContent = `🔫 Uwolnij Pulę Jhina (Spacja) | ${pool} DMG (Auto za: ${autoLeft} atk)`;
        refs.weaponAbilityButton.title = `Uwalnia ${pool} zgromadzonych obrażeń fizycznych. Można użyć raz na walkę.`;
      }
    } else if (player.weaponId === "yamato") {
      const threshold = Math.min(100, (player.yamatoExecuteCap || 5) + (state.yamatoJudgementStacks || 0));
      const targetPercent = (state.enemyHealth / state.enemyMaxHealth) * 100;
      const canExecute = targetPercent <= threshold;

      if (state.weaponAbilityUsed) {
        refs.weaponAbilityButton.disabled = true;
        refs.weaponAbilityButton.className = "weapon-ability-button";
        refs.weaponAbilityButton.textContent = "⚔️ Judgement Cut (Spacja) | Zużyto w tej walce";
        refs.weaponAbilityButton.title = "Judgement Cut został już użyty w tej walce.";
      } else if (!canExecute) {
        refs.weaponAbilityButton.disabled = true;
        refs.weaponAbilityButton.className = "weapon-ability-button";
        refs.weaponAbilityButton.textContent = `⚔️ Judgement Cut (Spacja) | Wymaga ≤${threshold}% HP (Wróg: ${Math.ceil(targetPercent)}%)`;
        refs.weaponAbilityButton.title = `Natychmiast wykańcza wroga, gdy ma ≤${threshold}% HP. Atakuj (co 6 ataków +1 stack) lub osłab wroga.`;
      } else {
        refs.weaponAbilityButton.disabled = false;
        refs.weaponAbilityButton.className = "weapon-ability-button ready";
        refs.weaponAbilityButton.textContent = `⚔️ Judgement Cut (Spacja) | GOTOWY DO EGZEKUCJI! (≤${threshold}% HP)`;
        refs.weaponAbilityButton.title = `Wykonaj Judgement Cut! Natychmiast zabija wroga i trwale zwiększa próg egzekucji o +1%.`;
      }
    }
  }

  function renderPassives(refs, state) {
    if (!refs.passivesPanel) return;
    const player = window.player;
    const equippedAd = (player.adItemInventory || []).filter((item) => item.equipped);
    const hasAd = (id) => equippedAd.some((item) => item.id === id);
    const attackCount = state.weaponAttackCount || 0;
    const badges = [];

    // Pistolet Jhina
    if (player.weaponId === "jhinPistol") {
      const shotInCycle = (attackCount % 4) + 1;
      if (shotInCycle === 4) {
        badges.push({ text: "🎯 Jhin: 4. STRZAŁ GOTOWY! (KRYTYK)", className: "ready" });
      } else {
        badges.push({ text: `🎯 Jhin: Strzał ${shotInCycle}/4`, className: "" });
      }
      const pool = state.jhinPool || 0;
      const autoCount = state.jhinAttackCount || 0;
      badges.push({ text: `💥 Pula Jhina: ${pool} DMG (Auto: ${autoCount}/16)`, className: pool > 0 ? "active" : "" });
    }

    // Yamato
    if (player.weaponId === "yamato") {
      const cycle = (attackCount % 6) + 1;
      const stacks = state.yamatoJudgementStacks || 0;
      const threshold = Math.min(100, (player.yamatoExecuteCap || 5) + stacks);
      badges.push({ text: `⚔️ Yamato: Stacki +${stacks} (${cycle}/6) | Próg: ${threshold}% HP`, className: stacks > 0 ? "active" : "" });
    }

    // Kieł Węża
    if (hasAd("snakeFang")) {
      const cycle = (attackCount % 5) + 1;
      if (cycle === 5) {
        badges.push({ text: "🐍 Kieł Węża: NASTĘPNY ATAK ZATRUWA!", className: "ready" });
      } else {
        badges.push({ text: `🐍 Kieł Węża: ${cycle}/5`, className: "" });
      }
    }

    // Potęga Nocy
    if (hasAd("nightPower")) {
      const cycle = (attackCount % 5) + 1;
      if (cycle === 5) {
        badges.push({ text: "🌙 Potęga Nocy: NASTĘPNY ATAK: TRUE DMG!", className: "ready" });
      } else {
        badges.push({ text: `🌙 Potęga Nocy: ${cycle}/5`, className: "" });
      }
    }

    // Strzały Cieni
    if (hasAd("shadowArrows") && window.BattleMath?.classId() !== "samurai") {
      const cycle = (attackCount % 2) + 1;
      if (cycle === 2) {
        badges.push({ text: "🏹 Strzały Cieni: NASTĘPNY KRYTYK x1.8!", className: "ready" });
      } else {
        badges.push({ text: "🏹 Strzały Cieni: Ładowanie 1/2", className: "" });
      }
    }

    // Płaszcz Zabójcy
    if (hasAd("assassinCloakAd")) {
      const enemyLow = state.enemyHealth <= state.enemyMaxHealth * 0.30;
      if (enemyLow) {
        badges.push({ text: "🗡️ Płaszcz Zabójcy: AKTYWNY (+20% DMG)", className: "ready" });
      } else {
        badges.push({ text: "🗡️ Płaszcz Zabójcy: Wróg ≤30% HP", className: "" });
      }
    }

    // Uchwyt Wilka
    const wolfCount = equippedAd.filter((item) => item.id === "wolfGrip").length;
    if (wolfCount > 0) {
      const bonus = wolfCount * Math.floor(10 + player.ad * 0.10);
      badges.push({ text: `🐺 Uchwyt Wilka: +${bonus} DMG/atak${wolfCount > 1 ? ` (${wolfCount}x)` : ""}`, className: "active" });
    }

    // Księga Adeptów
    const hasBook = (player.magicInventory || []).some((item) => window.BattleMath?.magicEffects(item).adeptBook && window.BattleMath?.isMagicEquipped(item));
    if (hasBook) {
      const stacks = player.adeptBookStacks || 0;
      const limit = player.adeptBookStackLimit || 30;
      badges.push({ text: `📖 Księga Adeptów: ${stacks}/${limit} AP`, className: stacks > 0 ? "active" : "" });
    }

    // Overkill Zabójcy
    if (window.BattleMath?.classId() === "assassin") {
      const overkill = player.overkillPool || 0;
      const primalReady = overkill >= state.enemyMaxHealth * 0.5;
      if (primalReady) {
        badges.push({ text: `☠️ Overkill: ${overkill} (PRIMAL SLASH GOTOWY!)`, className: "ready" });
      } else if (overkill > 0) {
        badges.push({ text: `☠️ Overkill: ${overkill} DMG`, className: "active" });
      }
    }

    // Gniew Tanka
    if (window.BattleMath?.classId() === "tank") {
      const rage = state.rage || 0;
      const threshold = Math.floor((window.BattleMath?.currentWeaponDamage() || 1) * 1.5);
      if (rage >= threshold) {
        badges.push({ text: `🛡️ Gniew: ${rage}/${threshold} (WYBUCH PRZY NASTĘPNYM CIOSIE!)`, className: "ready" });
      } else if (rage > 0) {
        badges.push({ text: `🛡️ Gniew: ${rage}/${threshold}`, className: "active" });
      }
    }

    if (!badges.length) {
      refs.passivesPanel.classList.add("hidden");
      refs.passivesPanel.replaceChildren();
      return;
    }

    refs.passivesPanel.classList.remove("hidden");
    refs.passivesPanel.replaceChildren(
      ...badges.map((b) => {
        const badgeElem = document.createElement("span");
        badgeElem.className = `passive-badge ${b.className || ""}`.trim();
        badgeElem.textContent = b.text;
        return badgeElem;
      })
    );
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
    renderWeaponAbility,
    renderPassives,
  };
})();

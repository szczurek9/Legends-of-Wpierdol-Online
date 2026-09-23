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

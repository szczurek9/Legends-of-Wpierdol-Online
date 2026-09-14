(function () {
  const mainMenu = document.getElementById("main-menu");
  const battleScreen = document.getElementById("battle-screen");
  const playButton = document.getElementById("play-btn");
  const attackButton = document.getElementById("attack-btn");
  const escapeButton = document.getElementById("escape-btn");
  const backButton = document.getElementById("battle-back-btn");
  const actions = document.getElementById("battle-actions");
  const abilitiesPanel = document.getElementById("battle-abilities");
  const potionsPanel = document.getElementById("battle-potions");
  const effectsPanel = document.getElementById("battle-effects");
  const battleLog = document.getElementById("battle-log");
  const deathPanel = document.getElementById("battle-death-panel");
  const deathNewGameButton = document.getElementById("death-new-game-btn");
  const deathRestoreButton = document.getElementById("death-restore-btn");
  const battleTitle = document.getElementById("battle-title");
  const battleWave = document.getElementById("battle-wave");
  const playerName = document.getElementById("battle-player-name");
  const playerModel = document.querySelector(".battle-model-player img");
  const playerHp = document.getElementById("battle-player-hp");
  const playerHealthBar = document.getElementById("battle-player-health-bar");
  const playerManaBar = document.getElementById("battle-player-mana-bar");
  const playerManaValue = document.getElementById("battle-player-mana-value");
  const playerWeapon = document.getElementById("battle-player-weapon");
  const playerMana = document.getElementById("battle-player-mana");
  const enemyName = document.getElementById("battle-enemy-name");
  const enemyModel = document.getElementById("battle-enemy-model");
  const enemyModelFallback = document.getElementById("enemy-model-fallback");
  const enemyHp = document.getElementById("battle-enemy-hp");
  const enemyHealthBar = document.getElementById("battle-enemy-health-bar");
  const enemyStats = document.getElementById("battle-enemy-stats");
  let state;
  let isTransitioning = false;

  abilitiesPanel.appendChild(attackButton);
  attackButton.classList.add("ability-button");
  const battleHeaderActions = document.createElement("div");
  battleHeaderActions.className = "battle-header-actions";
  battleWave.replaceWith(battleHeaderActions);
  battleHeaderActions.append(battleWave, escapeButton);
  escapeButton.classList.add("battle-escape-top");

  function showMessage(message, type) {
    battleLog.textContent = message;
    battleLog.className = `battle-log ${type || ""}`.trim();
  }

  function setBar(element, value, max) {
    element.style.width = `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
  }

  function formatPlayerAttack(result) {
    let message = result.message;
    if (result.critical) message += " KRYTYK!";
    if (result.armorReduced > 0) message += ` Pancerz zmniejszył obrażenia o ${result.armorReduced}.`;
    if (result.heal > 0) message += ` Odzyskujesz ${result.heal} HP.`;
    if (result.secondWindHeal > 0) message += ` Drugie Tchnienie przywraca ${result.secondWindHeal} HP.`;
    return message;
  }

  function formatEnemyAttack(result) {
    let message = result.message;
    if (result.enemyCritical) message += " KRYTYK!";
    if (result.enemyArmorReduced > 0) message += ` Twój pancerz zmniejszył obrażenia o ${result.enemyArmorReduced}.`;
    return message;
  }

  function renderEnemyModel(enemy, dead) {
    const modelPath = dead ? enemy.modelDead : enemy.modelAlive;
    enemyModel.alt = dead ? `${enemy.name} — pokonany` : enemy.name;
    enemyModel.onload = () => {
      enemyModel.classList.remove("hidden");
      enemyModelFallback.classList.add("hidden");
    };
    enemyModel.onerror = () => {
      enemyModel.classList.add("hidden");
      enemyModelFallback.classList.remove("hidden");
    };
    enemyModel.src = modelPath;
  }

  function renderPlayerModel(dead) {
    const skin = window.skinCatalog?.find((item) => item.id === window.player.skinName);
    const modelPath = skin ? (dead ? skin.modelDead : skin.modelAlive) : "res/skins/player_model.png";
    playerModel.onerror = () => {
      playerModel.onerror = null;
      playerModel.src = "res/skins/player_model.png";
    };
    playerModel.src = modelPath;
    playerModel.alt = dead ? "Postać gracza — pokonana" : "Postać gracza";
  }

  function render() {
    const player = window.player;
    const enemy = window.enemies[state.enemyIndex];
    battleTitle.textContent = enemy.name;
    battleWave.textContent = `Fala ${state.currentWave} / ${state.totalWaves}`;
    playerName.textContent = player.nickname || "Gracz";
    playerHp.textContent = `${player.healthPoints} / ${player.maxHealthPoints}`;
    setBar(playerHealthBar, player.healthPoints, player.maxHealthPoints);
    playerManaValue.textContent = `${player.manaPoints} / ${player.maxManaPoints}`;
    setBar(playerManaBar, player.manaPoints, player.maxManaPoints);
    renderPlayerModel(false);
    playerWeapon.textContent = `Broń: ${player.weaponName} | ${player.weaponDmg} DMG | Crit: ${player.critChance}% | Pen: ${player.armorPenetration}`;
    const manaRegen = Math.floor(player.maxManaPoints * 0.03 * (1 + Math.max(0, player.manaRegenPercent || 0) / 100));
    const effectiveAP = window.BattleSystem.getEffectiveAbilityPower ? window.BattleSystem.getEffectiveAbilityPower() : player.abilityPower + player.adeptBookStacks;
    playerMana.textContent = `⭐ AP: ${effectiveAP} | Regen: +${manaRegen} | MR: ${player.magicResistance}`;
    enemyName.textContent = enemy.name;
    enemyHp.textContent = `${state.enemyHealth} / ${state.enemyMaxHealth}`;
    setBar(enemyHealthBar, state.enemyHealth, state.enemyMaxHealth);
    enemyStats.textContent = `DMG: ${state.enemyDamage} | Atak: ${state.enemyAttackChance}% | Crit: ${enemy.critChance}% | Pancerz: ${state.enemyArmor} | MR: ${state.enemyMagicResistance} | Pen: ${enemy.armorPenetration}`;
    renderEnemyModel(enemy, state.enemyDefeated === true);
    escapeButton.disabled = player.usedEscape;
    attackButton.classList.toggle("hidden", player.classId === "mage");
    renderAbilities();
    renderPotions();
    const effectLabels = { potionAccuracy: "Eliksir Precyzji", potionLifesteal: "Koktajl Wampira", accuracy: "Celność", enemyAccuracy: "Celność wroga", stun: "Ogłuszenie", vines: "Pnącza", mirror: "Śmiertelne Lustro", mushin: "Mushin", ironTaunt: "Prowokacja", bastionTurns: "Bastion", bastionArmor: "Bonus pancerza" };
    const effectNames = Object.entries(state.effects || {})
      .filter(([name]) => !["accuracy", "enemyAccuracy", "bastionArmor"].includes(name))
      .map(([name, value]) => {
        const label = name.endsWith("Turns") ? name.slice(0, -5) : name;
        return `${effectLabels[label] || label}: ${name.endsWith("Turns") ? value : `${value} tur`}`;
      });
    effectsPanel.textContent = effectNames.length ? effectNames.join(" | ") : "Brak aktywnych efektów.";
  }

  function createActionIcon(path, alt) {
    const image = document.createElement("img");
    image.className = "ability-icon"; image.src = path; image.alt = alt;
    image.onerror = () => { image.onerror = null; image.src = "res/img/background.png"; };
    return image;
  }

  function renderAbilities() {
    abilitiesPanel.replaceChildren();
    abilitiesPanel.appendChild(attackButton);
    const classAbilities = window.classAbilities?.[window.player.classId] || [];
    classAbilities.forEach((ability) => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "ability-button";
      button.title = `${ability.description} Koszt: ${ability.cost} many${ability.cooldown ? ` | CD: ${ability.cooldown} tur` : ""}`;
      const folder = window.player.classId === "assassin" ? "assasin" : window.player.classId;
      button.appendChild(createActionIcon(`res/abilities/${folder}/${ability.icon}`, ability.name));
      const label = document.createElement("span"); label.textContent = ability.id === "senNoKata" ? `${ability.name} (${state.senMode === "boei" ? "Bōei" : "Chikara"})` : ability.name; button.appendChild(label);
      const cooldown = state.cooldowns?.[ability.id] || 0;
      button.disabled = cooldown > 0 || window.player.manaPoints < ability.cost;
      if (ability.id !== "senNoKata" && cooldown > 0) label.textContent += ` — CD: ${cooldown}`;
      if (ability.id === "senNoKata") {
        button.classList.add(state.senMode === "boei" ? "ability-mode-boei" : "ability-mode-chikara");
        label.textContent += state.senMode === "boei" ? ` | atak: ${state.senAttackCount}/3` : "";
      }
      button.addEventListener("click", () => useAbility(ability.id)); abilitiesPanel.appendChild(button);
    });
  }

  function renderPotions() {
    potionsPanel.replaceChildren();
    const counts = {};
    (window.player.potionInventory || []).forEach((id) => { counts[id] = (counts[id] || 0) + 1; });
    Object.entries(counts).forEach(([id, count]) => {
      const potion = window.shopPotions.find((item) => item.id === id); if (!potion) return;
      const button = document.createElement("button"); button.type = "button"; button.className = "potion-button"; button.title = potion.description; button.textContent = `🧪 ${potion.name} (${count})`; button.addEventListener("click", () => usePotion(id)); potionsPanel.appendChild(button);
    });
  }

  function finish(message, type) {
    actions.classList.add("hidden");
    escapeButton.classList.add("hidden");
    abilitiesPanel.classList.add("hidden"); potionsPanel.classList.add("hidden"); effectsPanel.classList.add("hidden");
    backButton.classList.remove("hidden");
    showMessage(message, type);
  }

  function showDeathPanel() {
    actions.classList.add("hidden");
    escapeButton.classList.add("hidden");
    abilitiesPanel.classList.add("hidden");
    potionsPanel.classList.add("hidden");
    effectsPanel.classList.add("hidden");
    backButton.classList.add("hidden");
    deathPanel.classList.remove("hidden");
    renderPlayerModel(true);
    showMessage("Przegrywasz walkę.", "danger");
  }

  function openBattle() {
    window.SaveSystem.captureBattleState();
    state = window.BattleSystem.start(window.player.level);
    mainMenu.classList.add("hidden");
    battleScreen.classList.remove("hidden");
    actions.classList.remove("hidden");
    escapeButton.classList.remove("hidden");
    abilitiesPanel.classList.remove("hidden");
    potionsPanel.classList.remove("hidden");
    effectsPanel.classList.remove("hidden");
    abilitiesPanel.classList.remove("hidden"); potionsPanel.classList.remove("hidden"); effectsPanel.classList.remove("hidden");
    backButton.classList.add("hidden");
    deathPanel.classList.add("hidden");

    if (state.finished) {
      battleTitle.textContent = "Koniec gry";
      battleWave.textContent = "UKONCZONO";
      finish(state.message, "success");
      return;
    }

    render();
    showMessage("Wybierz akcje.");
  }

  function attack() {
    if (!state || state.finished || isTransitioning) return;
    const attackResult = window.BattleSystem.attack(state);
    state = attackResult;

    if (attackResult.enemyDefeated) {
      window.player.money += window.enemies[state.enemyIndex].reward;
      isTransitioning = true;
      actions.classList.add("hidden");
      render();
      showMessage(`${formatPlayerAttack(attackResult)} Pokonano przeciwnika!`, "success");

      window.setTimeout(() => {
        state = window.BattleSystem.nextWave(state);
        render();
        isTransitioning = false;

        if (state.levelUp) finish(`${formatPlayerAttack(attackResult)} ${state.message} Otrzymujesz nagrodę: ${state.reward} $.`, "success");
        else {
          actions.classList.remove("hidden");
          showMessage(`${formatPlayerAttack(attackResult)} ${state.message} Otrzymujesz ${state.reward} $.`, "success");
        }
      }, 700);
      return;
    }

    const enemyResult = attackResult;
    render();

    if (window.player.healthPoints <= 0) {
      showDeathPanel();
      return;
    }

    showMessage(`${formatPlayerAttack(attackResult)} ${formatEnemyAttack(enemyResult)}`);
  }

  function actionResult(result, actionMessage) {
    state = result;
    if (result.enemyDefeated) {
      window.player.money += window.enemies[state.enemyIndex].reward;
      isTransitioning = true; actions.classList.add("hidden"); abilitiesPanel.classList.add("hidden"); potionsPanel.classList.add("hidden"); render();
      showMessage(`${actionMessage || result.message} Pokonano przeciwnika!`, "success");
      window.setTimeout(() => {
        state = window.BattleSystem.nextWave(state); render(); isTransitioning = false;
        if (state.levelUp) finish(`${state.message} Otrzymujesz nagrodę: ${state.reward} $.`, "success");
        else { actions.classList.remove("hidden"); abilitiesPanel.classList.remove("hidden"); potionsPanel.classList.remove("hidden"); showMessage(`${state.message} Otrzymujesz ${state.reward} $.`, "success"); }
      }, 700);
      return;
    }
    render();
    if (window.player.healthPoints <= 0) { showDeathPanel(); return; }
    showMessage(actionMessage || result.message);
  }

  function useAbility(abilityId) {
    if (!state || state.finished || isTransitioning) return;
    const result = window.BattleSystem.useAbility(state, abilityId);
    actionResult(result, result.message);
  }

  function usePotion(potionId) {
    if (!state || state.finished || isTransitioning) return;
    const result = window.BattleSystem.usePotion(state, potionId);
    state = result; render(); showMessage(result.message, "success");
  }

  function handleBattleShortcut(event) {
    if (battleScreen.classList.contains("hidden") || event.repeat) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
    const key = event.key.toLowerCase();
    const classAbilities = window.classAbilities?.[window.player.classId] || [];
    const keys = ["q", "w", "e", "r"];
    const abilityIndex = keys.indexOf(key);

    if (window.player.classId === "mage") {
      if (abilityIndex < 0 || !classAbilities[abilityIndex]) return;
      event.preventDefault();
      useAbility(classAbilities[abilityIndex].id);
      return;
    }

    if (key === "q") {
      event.preventDefault();
      attack();
      return;
    }
    if (abilityIndex > 0 && classAbilities[abilityIndex - 1]) {
      event.preventDefault();
      useAbility(classAbilities[abilityIndex - 1].id);
    }
  }

  function escape() {
    const result = window.BattleSystem.escape();
    if (!result.allowed) {
      showMessage(result.message, "danger");
      return;
    }

    render();
    finish(result.message, "warning");
  }

  function closeBattle() {
    isTransitioning = false;
    battleScreen.classList.add("hidden");
    mainMenu.classList.remove("hidden");
    deathPanel.classList.add("hidden");
    window.SaveSystem.clearBattleState();
    window.refreshMainMenu();
  }

  function restoreBeforeBattle() {
    window.SaveSystem.restoreBattleState();
    closeBattle();
  }

  playButton.addEventListener("click", openBattle);
  document.addEventListener("keydown", handleBattleShortcut);
  attackButton.addEventListener("click", attack);
  escapeButton.addEventListener("click", escape);
  backButton.addEventListener("click", closeBattle);
  deathNewGameButton.addEventListener("click", () => {
    battleScreen.classList.add("hidden");
    window.startNewGame();
  });
  deathRestoreButton.addEventListener("click", restoreBeforeBattle);
})();

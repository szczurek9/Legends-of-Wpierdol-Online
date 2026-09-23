(function () {
  const SAVE_VERSION = 1;

  const numberFields = [
    "money", "level", "skinPoints", "weaponDmg", "weaponBaseDamage", "weaponAdScaling", "ad", "adItemSlots", "armorPenetrationPercent", "yamatoExecuteCap", "healthPoints", "maxHealthPoints", "armorPoints", "bonusArmor",
    "magicResistance", "critChance", "armorPenetration", "magicPenetration", "manaPoints", "maxManaPoints",
    "manaRegenPercent", "abilityPower", "magicLifesteal", "lifesteal", "bonusLifesteal", "bonusAccuracy", "bonusDodge",
    "armorCap", "magicItemSlots",
  ];

  // Simple text/number form fields that can be copied straight onto the
  // player object by id. Array/JSON/checkbox fields are handled separately.
  const simpleFieldIds = [
    "nickname", "classId", "theme", "money", "level", "skinPoints", "skinName", "weaponName", "weaponDmg",
    "healthPoints", "maxHealthPoints", "armorPoints", "bonusArmor", "magicResistance", "critChance",
    "armorPenetration", "magicPenetration", "manaPoints", "maxManaPoints", "manaRegenPercent", "abilityPower",
    "magicLifesteal", "lifesteal", "bonusLifesteal", "bonusAccuracy", "bonusDodge", "armorCap", "magicItemSlots",
  ];

  const field = (id) => document.getElementById(id);
  const message = field("editor-message");
  const saveCode = field("save-code");

  function number(id) {
    return Number(field(id).value);
  }

  function csvList(id) {
    return field(id).value.split(",").map((entry) => entry.trim()).filter(Boolean);
  }

  function jsonArray(id, label) {
    try {
      const value = JSON.parse(field(id).value || "[]");
      if (!Array.isArray(value)) throw new Error();
      return value;
    } catch (error) {
      throw new Error(`${label} musi być poprawną tablicą JSON.`);
    }
  }

  function validatePlayer(player) {
    if (!player.skinInventory.includes("default")) player.skinInventory.unshift("default");
    if (!["assassin", "mage", "tank", "samurai"].includes(player.classId)) {
      throw new Error("Nieprawidłowa klasa.");
    }
    if (!["prism", "night", "neon", "nature"].includes(player.theme)) {
      throw new Error("Nieprawidłowy motyw.");
    }
    const hasInvalidWeapon = player.inventory.some((item) => !item
      || typeof item.name !== "string"
      || !Number.isFinite(item.damage)
      || !Number.isFinite(item.price)
      || item.damage < 0
      || item.price < 0);
    if (hasInvalidWeapon) throw new Error("Każda broń musi mieć nazwę, damage i cenę.");
    if (player.magicInventory.some((item) => !item || typeof item.id !== "string")) {
      throw new Error("Każdy magiczny przedmiot musi mieć id.");
    }
    if (player.equippedMagicItems.some((id) => typeof id !== "string")) {
      throw new Error("Wyposażone magiczne UID muszą być tekstem.");
    }
    if (player.maxHealthPoints < 1 || player.healthPoints > player.maxHealthPoints) {
      throw new Error("HP musi być nie większe niż maksymalne HP.");
    }
    if (player.maxManaPoints < 1 || player.manaPoints > player.maxManaPoints) {
      throw new Error("Mana musi być nie większa niż maksymalna mana.");
    }
    if (numberFields.some((name) => !Number.isFinite(player[name]) || player[name] < 0)) {
      throw new Error("Wartości liczbowe muszą być nieujemne.");
    }
    if (player.magicLifesteal > window.SaveCodec.magicLifestealCap(player) || player.critChance > 100) {
      throw new Error("Przekroczono limit jednej ze statystyk.");
    }
    return player;
  }

  function playerFromForm() {
    const player = {
      nickname: field("nickname").value.trim(),
      classId: field("classId").value,
      theme: field("theme").value,
      money: number("money"),
      level: number("level"),
      skinPoints: number("skinPoints"),
      skinName: field("skinName").value.trim() || "default",
      skinInventory: csvList("skinInventory"),
      weaponName: field("weaponName").value.trim() || "Pięści",
      weaponDmg: number("weaponDmg"),
      weaponId: "fists",
      weaponBaseDamage: number("weaponDmg"), weaponAdScaling: 0.01, weaponType: "M",
      ad: 0, adItemInventory: [], equippedAdItems: [], adItemSlots: field("classId").value === "mage" ? 0 : 6,
      armorPenetrationPercent: 0, yamatoExecuteCap: 5,
      inventory: jsonArray("inventory", "Ekwipunek broni"),
      magicInventory: jsonArray("magicInventory", "Magiczne przedmioty"),
      equippedMagicItems: jsonArray("equippedMagicItems", "Wyposażone magiczne przedmioty"),
      potionInventory: csvList("potionInventory"),
      healthPoints: number("healthPoints"),
      maxHealthPoints: number("maxHealthPoints"),
      armorPoints: number("armorPoints"),
      bonusArmor: number("bonusArmor"),
      magicResistance: number("magicResistance"),
      critChance: number("critChance"),
      armorPenetration: number("armorPenetration"),
      magicPenetration: number("magicPenetration"),
      manaPoints: number("manaPoints"),
      maxManaPoints: number("maxManaPoints"),
      manaRegenPercent: number("manaRegenPercent"),
      abilityPower: number("abilityPower"),
      magicAbilityPower: 0,
      magicLifesteal: number("magicLifesteal"),
      lifesteal: number("lifesteal"),
      bonusLifesteal: number("bonusLifesteal"),
      bonusAccuracy: number("bonusAccuracy"),
      bonusDodge: number("bonusDodge"),
      armorCap: number("armorCap"),
      magicItemSlots: field("classId").value === "mage" ? 8 : 2,
      overkillPool: 0,
      adeptBookStacks: 0,
      adeptBookStackLimit: 30,
      secondWind: field("secondWind").checked,
      usedEscape: field("usedEscape").checked,
    };
    return validatePlayer(player);
  }

  function generate() {
    const player = playerFromForm();
    const save = { version: SAVE_VERSION, savedAt: new Date().toISOString(), player };
    saveCode.value = window.SaveCodec.encode(JSON.stringify(save));
    saveCode.select();
    message.textContent = "Zapis wygenerowany.";
  }

  function fillForm(player) {
    simpleFieldIds.forEach((id) => {
      if (player[id] !== undefined) field(id).value = player[id];
    });
    field("skinInventory").value = (player.skinInventory || ["default"]).join(", ");
    field("potionInventory").value = (player.potionInventory || []).join(", ");
    field("inventory").value = JSON.stringify(player.inventory || [], null, 2);
    field("magicInventory").value = JSON.stringify(player.magicInventory || [], null, 2);
    field("equippedMagicItems").value = JSON.stringify(player.equippedMagicItems || [], null, 2);
    field("secondWind").checked = Boolean(player.secondWind);
    field("usedEscape").checked = Boolean(player.usedEscape);
  }

  function load() {
    try {
      const save = JSON.parse(window.SaveCodec.decode(saveCode.value));
      if (save.version !== SAVE_VERSION || !save.player) throw new Error();
      fillForm(save.player);
      message.textContent = "Zapis wczytany do edytora.";
    } catch (error) {
      message.textContent = "Nieprawidłowy kod zapisu.";
    }
  }

  field("generate-btn").addEventListener("click", () => {
    try {
      generate();
    } catch (error) {
      message.textContent = error.message;
    }
  });

  field("load-btn").addEventListener("click", load);

  field("copy-btn").addEventListener("click", async () => {
    try {
      if (!saveCode.value) generate();
      await navigator.clipboard.writeText(saveCode.value);
      message.textContent = "Kod skopiowany do schowka.";
    } catch (error) {
      saveCode.select();
      message.textContent = "Kod zaznaczony — skopiuj go ręcznie.";
    }
  });
})();

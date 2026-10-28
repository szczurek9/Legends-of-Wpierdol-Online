// Encodes/decodes the plain-text save payload into the base64 "save code"
// string that players copy/paste. Used by saveSystem.js (in-game) and
// shop.js (magic lifesteal helpers) so the logic only lives once.
(function () {
  function encode(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  function decode(code) {
    const binary = atob(code.trim());
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  // ---- Format v2: deflate + base64 z prefiksem "LOW2." -------------------
  // Stare kody (sam base64 JSON-a, bez prefiksu) nadal się wczytują.
  const PACKED_PREFIX = "LOW2.";

  function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
  }

  function base64ToBytes(text) {
    return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
  }

  async function runStream(bytes, transform) {
    const response = new Response(new Blob([bytes]).stream().pipeThrough(transform));
    return new Uint8Array(await response.arrayBuffer());
  }

  // Bez CompressionStream (bardzo stara przegladarka) wracamy do starego formatu.
  async function encodePacked(text) {
    if (typeof CompressionStream === "undefined") return encode(text);
    const packed = await runStream(new TextEncoder().encode(text), new CompressionStream("deflate-raw"));
    return PACKED_PREFIX + bytesToBase64(packed);
  }

  // Przyjmuje oba formaty. Biale znaki (zawiniecia linii z czatu) sa ignorowane.
  async function decodeAny(code) {
    const clean = String(code).replace(/\s+/g, "");
    if (!clean.startsWith(PACKED_PREFIX)) return decode(clean);
    if (typeof DecompressionStream === "undefined") throw new Error("DecompressionStream unavailable");
    const bytes = await runStream(base64ToBytes(clean.slice(PACKED_PREFIX.length)), new DecompressionStream("deflate-raw"));
    return new TextDecoder().decode(bytes);
  }

  // Used by shop.js and saveEditor.js. Magic lifesteal is capped separately
  // per item type (id): copies of the same item add up to that item's
  // maxMagicLifesteal, and the per-type totals are then summed. Example:
  // 2x Dlonie Wampira (30 cap) + 2x Niszczyciel Swiatow (50 cap) = 80.
  function magicLifestealFromItems(items) {
    const perType = {};
    items.forEach((item) => {
      const amount = Number(((item && item.effects) || {}).magicLifesteal || 0);
      if (!amount) return;
      const entry = perType[item.id] || (perType[item.id] = { sum: 0, cap: Number(item.maxMagicLifesteal || 0) });
      entry.sum += amount;
    });
    return Object.values(perType).reduce((total, entry) => total + Math.min(entry.sum, entry.cap), 0);
  }

  function equippedMagicItems(player) {
    const equippedIds = player.equippedMagicItems || [];
    return (player.magicInventory || []).filter((item) => item && Boolean(item.equipped
      || equippedIds.includes(item.uid)
      || equippedIds.includes(item.id)));
  }

  // Max magic lifesteal the player can have from the currently equipped items.
  function magicLifestealCap(player) {
    return magicLifestealFromItems(equippedMagicItems(player));
  }

  // Same, but as if `item` was (direction > 0) or was not (direction < 0)
  // equipped. Needed because shop/inventory call adjustMagicEffects before
  // or after the item enters/leaves magicInventory.
  function magicLifestealWith(player, item, direction) {
    const others = equippedMagicItems(player).filter((owned) => owned !== item && owned.uid !== item.uid);
    return magicLifestealFromItems(direction > 0 ? others.concat(item) : others);
  }

  window.SaveCodec = { encode, decode, encodePacked, decodeAny, magicLifestealCap, magicLifestealWith };
})();

// Encodes/decodes the plain-text save payload into the base64 "save code"
// string that players copy/paste. Used by saveSystem.js (in-game) and
// shop.js (magicLifestealCap helper) so the logic only lives once.
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

  // Used by shop.js: the
  // magicLifesteal cap isn't a fixed number — it's the highest
  // maxMagicLifesteal among the currently equipped magic items that grant
  // magicLifesteal at all. Takes a plain player-shaped object (works for
  // window.player or any plain copy of it).
  function magicLifestealCap(player) {
    const equippedIds = player.equippedMagicItems || [];
    const isEquipped = (item) => Boolean(item.equipped
      || equippedIds.includes(item.uid)
      || equippedIds.includes(item.id));
    const caps = (player.magicInventory || [])
      .filter((item) => item && isEquipped(item) && (item.effects || {}).magicLifesteal)
      .map((item) => Number(item.maxMagicLifesteal || 0));
    return caps.length ? Math.max(...caps) : 0;
  }

  window.SaveCodec = { encode, decode, magicLifestealCap };
})();

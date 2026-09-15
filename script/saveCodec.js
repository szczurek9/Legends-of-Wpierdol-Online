// Encodes/decodes the plain-text save payload into the base64 "save code"
// string that players copy/paste. Shared by saveSystem.js (in-game) and
// saveEditor.js (standalone save-editor.html) so the logic only lives once.
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

  // Shared by shop.js (in-game) and saveEditor.js (standalone editor): the
  // magicLifesteal cap isn't a fixed number — it's the highest
  // maxMagicLifesteal among the currently equipped magic items that grant
  // magicLifesteal at all. Takes a plain player-shaped object (works for
  // both window.player and the editor's form-built player).
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

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

  window.SaveCodec = { encode, decode };
})();

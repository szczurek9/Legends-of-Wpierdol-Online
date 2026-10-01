// Pomocnicze funkcje: ciasteczka i podpisana sesja (HMAC-SHA256).
// Sesja jest bezstanowa — cały "dowód logowania" siedzi w podpisanym ciasteczku,
// więc nie potrzeba osobnej tabeli sesji w bazie.

export const SESSION_COOKIE = "low_session";
export const STATE_COOKIE = "low_oauth_state";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 dni

const encoder = new TextEncoder();

function toBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function importKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export function buildCookie(name, value, maxAge) {
  return `${name}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function createSessionToken(secret, userId, username) {
  const payload = JSON.stringify({
    uid: userId,
    name: username,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  });
  const body = toBase64Url(encoder.encode(payload));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await importKey(secret), encoder.encode(body)));
  return `${body}.${toBase64Url(signature)}`;
}

// Zwraca { userId, username } albo null, jeśli ciasteczka brak / jest podrobione / wygasło.
export async function readSession(request, secret) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token || !secret) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  try {
    const [body, signature] = parts;
    const valid = await crypto.subtle.verify("HMAC", await importKey(secret), fromBase64Url(signature), encoder.encode(body));
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    if (!payload.uid || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: String(payload.uid), username: String(payload.name || "Gracz") };
  } catch (error) {
    return null;
  }
}

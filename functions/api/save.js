// GET /api/save — pobiera zapis zalogowanego gracza.
// PUT /api/save — zapisuje (nadpisuje) zapis zalogowanego gracza.
// Zapis to ten sam kod base64, który gracz może skopiować ręcznie.
// Serwer tylko go przechowuje i sprawdza kształt; pełną walidację gry robi
// klient przy wczytywaniu (SaveSystem.loadSaveCode).
import { json, readSession } from "../_lib/session.js";

const MAX_SAVE_LENGTH = 100 * 1024; // 100 KB na zapis

function isSameOrigin(request) {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

function isValidSaveCode(code) {
  if (typeof code !== "string" || code.length < 10 || code.length > MAX_SAVE_LENGTH) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(code)) return false;

  try {
    const bytes = Uint8Array.from(atob(code), (character) => character.charCodeAt(0));
    const save = JSON.parse(new TextDecoder().decode(bytes));
    return Number.isInteger(save.version)
      && save.player !== null
      && typeof save.player === "object"
      && typeof save.player.nickname === "string";
  } catch (error) {
    return false;
  }
}

export async function onRequestGet({ request, env }) {
  const session = await readSession(request, env.SESSION_SECRET);
  if (!session) return json({ error: "unauthorized" }, 401);

  const row = await env.DB.prepare("SELECT data, updated_at FROM saves WHERE user_id = ?").bind(session.userId).first();
  if (!row) return json({ error: "no_save" }, 404);

  return json({ code: row.data, updatedAt: row.updated_at });
}

export async function onRequestPut({ request, env }) {
  const session = await readSession(request, env.SESSION_SECRET);
  if (!session) return json({ error: "unauthorized" }, 401);
  if (!isSameOrigin(request)) return json({ error: "forbidden" }, 403);

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_SAVE_LENGTH + 1024) return json({ error: "too_large" }, 413);

  let code;
  try {
    const text = await request.text();
    if (text.length > MAX_SAVE_LENGTH + 1024) return json({ error: "too_large" }, 413);
    code = JSON.parse(text).code;
  } catch (error) {
    return json({ error: "bad_request" }, 400);
  }

  if (!isValidSaveCode(code)) return json({ error: "invalid_save" }, 400);

  const updatedAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO saves (user_id, username, data, updated_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, data = excluded.data, updated_at = excluded.updated_at`,
  ).bind(session.userId, session.username, code, updatedAt).run();

  return json({ ok: true, updatedAt });
}

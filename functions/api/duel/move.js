// POST /api/duel/move — ruch gracza: { id, n, action: { kind, id? }, next: "host" | "guest" | null }
//   n      — numer ruchu (równy liczbie dotychczasowych ruchów), chroni przed dubletami i wyścigami
//   action — kind: attack | ability | weapon | potion, id: identyfikator umiejętności / mikstury
//   next   — kto ma następny ruch według silnika walki (null = walka skończona, czekamy na wyniki).
//            Umiejętność broni nie zajmuje tury, ogłuszenie pomija turę — dlatego deklaruje to wykonujący ruch,
//            a klient przeciwnika sprawdza zgodność ze swoją symulacją (rozjazd = przerwanie walki).
import { json } from "../../_lib/session.js";
import { MOVE_TIMEOUT_MS, authenticate, duelView, loadDuel, readBody, settleDuel, sideOf } from "../../_lib/duel.js";

const ACTION_KINDS = ["attack", "ability", "weapon", "potion"];

function parseAction(raw) {
  if (!raw || typeof raw !== "object" || !ACTION_KINDS.includes(raw.kind)) return null;
  if (raw.id !== undefined && (typeof raw.id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(raw.id))) return null;
  return raw.id === undefined ? { kind: raw.kind } : { kind: raw.kind, id: raw.id };
}

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env, { write: true });
  if (auth.response) return auth.response;

  const body = await readBody(request);
  const action = body ? parseAction(body.action) : null;
  const n = body ? body.n : null;
  const next = body ? body.next : undefined;
  if (!action || !Number.isInteger(n) || n < 0 || n > 10000 || !(next === null || next === "host" || next === "guest")) {
    return json({ error: "bad_request" }, 400);
  }

  let row = await loadDuel(env.DB, body.id);
  const side = row ? sideOf(row, auth.session.userId) : null;
  if (!row || !side) return json({ error: "not_found" }, 404);

  const now = Date.now();
  row = await settleDuel(env.DB, row, now);
  if (row.status !== "playing") return json({ error: "not_playing", duel: duelView(row, side, { now }) }, 409);
  if (row.next_actor !== side) return json({ error: "not_your_turn", moveCount: row.move_count }, 409);
  if (row.move_count !== n) return json({ error: "conflict", moveCount: row.move_count }, 409);

  // Wstawienie ruchu i podbicie licznika to jedna transakcja; warunki w WHERE chronią przed wyścigiem.
  const deadline = now + MOVE_TIMEOUT_MS;
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO duel_moves (duel_id, n, side, action, next_actor, created_at)
       SELECT ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM duels WHERE id = ? AND status = 'playing' AND move_count = ? AND next_actor = ?)`,
    ).bind(row.id, n, side, JSON.stringify(action), next, now, row.id, n, side),
    env.DB.prepare(
      `UPDATE duels SET move_count = ?, next_actor = ?, deadline = ?, updated_at = ?
       WHERE id = ? AND status = 'playing' AND move_count = ? AND next_actor = ?`,
    ).bind(n + 1, next, deadline, now, row.id, n, side),
  ]);
  if (results[1].meta.changes === 0) return json({ error: "conflict" }, 409);

  return json({ ok: true, moveCount: n + 1, deadline, serverTime: now });
}

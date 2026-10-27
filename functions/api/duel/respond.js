// POST /api/duel/respond — odpowiedź na prośbę o walkę.
//   host:  { id, accept: true | false } — akceptacja startuje walkę (migawka buildów, ziarno, losowanie pierwszego ruchu),
//          odrzucenie zwraca lobby na listę, a proszący gracz dowiaduje się o tym ze swojego /api/duel/state.
//   guest: { id, cancel: true }         — wycofanie własnej prośby.
import { json } from "../../_lib/session.js";
import {
  MOVE_TIMEOUT_MS, START_GRACE_MS, authenticate, duelView, loadBuild, loadDuel, randomSeed, randomSide,
  readBody, revertToOpen, settleDuel, sideOf,
} from "../../_lib/duel.js";

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env, { write: true });
  if (auth.response) return auth.response;

  const body = await readBody(request);
  if (!body) return json({ error: "bad_request" }, 400);

  let row = await loadDuel(env.DB, body.id);
  const side = row ? sideOf(row, auth.session.userId) : null;
  if (!row || !side) return json({ error: "not_found" }, 404);

  const now = Date.now();
  row = await settleDuel(env.DB, row, now);
  if (row.status !== "pending") return json({ error: "no_request", duel: duelView(row, side, { now }) }, 409);

  if (body.cancel === true) {
    if (side !== "guest") return json({ error: "forbidden" }, 403);
    await revertToOpen(env.DB, row, null, now);
    return json({ ok: true });
  }
  if (side !== "host" || typeof body.accept !== "boolean") return json({ error: "bad_request" }, 400);

  if (!body.accept) {
    await revertToOpen(env.DB, row, "declined", now);
    return json({ ok: true });
  }

  // Akceptacja: żaden z graczy nie może w międzyczasie być w innej walce.
  const busy = await env.DB.prepare(
    "SELECT id FROM duels WHERE status = 'playing' AND (host_id IN (?, ?) OR guest_id IN (?, ?)) LIMIT 1",
  ).bind(row.host_id, row.guest_id, row.host_id, row.guest_id).first();
  if (busy) {
    await revertToOpen(env.DB, row, "busy", now);
    return json({ error: "busy" }, 409);
  }

  const hostBuild = await loadBuild(env.DB, row.host_id);
  if (hostBuild.error) {
    await env.DB.prepare("UPDATE duels SET status = 'closed', updated_at = ? WHERE id = ?").bind(now, row.id).run();
    return json({ error: "lobby_invalid" }, 409);
  }
  const guestBuild = await loadBuild(env.DB, row.guest_id);
  if (guestBuild.error) {
    await revertToOpen(env.DB, row, "invalid", now);
    return json({ error: "guest_invalid" }, 409);
  }

  const first = randomSide();
  const result = await env.DB.prepare(
    `UPDATE duels SET status = 'playing', host_class = ?, host_level = ?, guest_class = ?, guest_level = ?,
       host_build = ?, guest_build = ?, seed = ?, first_side = ?, next_actor = ?, move_count = 0,
       deadline = ?, request_at = NULL, updated_at = ?
     WHERE id = ? AND status = 'pending' AND guest_id = ?`,
  ).bind(
    hostBuild.classId, hostBuild.level, guestBuild.classId, guestBuild.level,
    hostBuild.serialized, guestBuild.serialized, randomSeed(), first, first,
    now + MOVE_TIMEOUT_MS + START_GRACE_MS, now, row.id, row.guest_id,
  ).run();
  if (result.meta.changes === 0) return json({ error: "no_request" }, 409);

  const fresh = await loadDuel(env.DB, row.id);
  return json({ ok: true, duel: duelView(fresh, "host", { builds: true, now }) });
}

// POST /api/duel/join — prośba o walkę z hostem lobby: { id }.
// To jeszcze nie start walki: host musi ją zaakceptować (POST /api/duel/respond), a bez odpowiedzi
// w ciągu 20 s prośba wygasa. Jedno lobby rozpatruje jedną prośbę naraz, jeden gracz ma jedną prośbę naraz.
import { json } from "../../_lib/session.js";
import { authenticate, duelView, loadBuild, loadDuel, readBody, settleDuel } from "../../_lib/duel.js";

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env, { write: true });
  if (auth.response) return auth.response;
  const { userId, username } = auth.session;

  const body = await readBody(request);
  let row = await loadDuel(env.DB, body && body.id);
  if (!row) return json({ error: "not_available" }, 404);

  const now = Date.now();
  row = await settleDuel(env.DB, row, now); // wygasła prośba zwalnia lobby
  if (row.status === "pending") return json({ error: "busy" }, 409);
  if (row.status !== "open") return json({ error: "not_available" }, 404);
  if (row.host_id === userId) return json({ error: "own_lobby" }, 400);

  // Gracz w trwającej walce albo z inną czekającą prośbą nie może prosić o kolejną.
  const running = await env.DB.prepare(
    "SELECT * FROM duels WHERE (status = 'playing' AND (host_id = ? OR guest_id = ?)) OR (status = 'pending' AND guest_id = ?)",
  ).bind(userId, userId, userId).all();
  for (const other of running.results || []) {
    const settled = await settleDuel(env.DB, other, now);
    if (settled.status === "playing") return json({ error: "in_duel", id: settled.id }, 409);
    if (settled.status === "pending") return json({ error: "request_pending", id: settled.id }, 409);
  }

  const build = await loadBuild(env.DB, userId);
  if (build.error) return json({ error: build.error, minLevel: build.minLevel }, build.status);

  const result = await env.DB.prepare(
    `UPDATE duels SET status = 'pending', guest_id = ?, guest_name = ?, guest_class = ?, guest_level = ?,
       request_at = ?, guest_seen = ?, declined_id = NULL, declined_reason = NULL, updated_at = ?
     WHERE id = ? AND status = 'open'`,
  ).bind(userId, username, build.classId, build.level, now, now, now, row.id).run();
  if (result.meta.changes === 0) return json({ error: "busy" }, 409);

  const fresh = await loadDuel(env.DB, row.id);
  return json({ ok: true, duel: duelView(fresh, "guest", { now }) });
}

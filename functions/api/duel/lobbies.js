// GET    /api/duel/lobbies           — lista lobby (busy = host rozpatruje czyjąś prośbę) (przeglądarka serwerów) + trwający pojedynek gracza.
// POST   /api/duel/lobbies           — tworzy lobby: { mode: "casual" }. Wymaga zapisu w chmurze z ukończonym 50. poziomem.
// DELETE /api/duel/lobbies?id=KOD    — zamyka własne, wciąż otwarte lobby.
import { json } from "../../_lib/session.js";
import {
  LOBBY_STALE_MS, MODES, REQUEST_TIMEOUT_MS, authenticate, cleanupDuels, loadBuild, loadDuel, randomCode, readBody, settleDuel, sideOf,
} from "../../_lib/duel.js";

export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (auth.response) return auth.response;
  const { userId } = auth.session;
  const now = Date.now();

  const lobbies = await env.DB.prepare(
    `SELECT id, mode, status, request_at, host_id, host_name, host_class, host_level, created_at
     FROM duels WHERE status IN ('open', 'pending') AND host_seen >= ? ORDER BY created_at DESC LIMIT 50`,
  ).bind(now - LOBBY_STALE_MS).all();

  // Gracz, który odświeżył stronę w trakcie walki, może do niej wrócić (stan rozstrzyga /api/duel/state).
  const active = await env.DB.prepare(
    "SELECT id FROM duels WHERE status = 'playing' AND (host_id = ? OR guest_id = ?) ORDER BY updated_at DESC LIMIT 1",
  ).bind(userId, userId).first();

  return json({
    lobbies: (lobbies.results || []).map((row) => ({
      id: row.id,
      mode: row.mode,
      host: row.host_name,
      classId: row.host_class,
      level: row.host_level,
      mine: row.host_id === userId,
      busy: row.status === "pending" && now - row.request_at <= REQUEST_TIMEOUT_MS, // host rozpatruje czyjąś prośbę
      ageSeconds: Math.max(0, Math.floor((now - row.created_at) / 1000)),
    })),
    activeDuelId: active ? active.id : null,
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env, { write: true });
  if (auth.response) return auth.response;
  const { userId, username } = auth.session;

  const body = await readBody(request);
  const mode = body && typeof body.mode === "string" ? body.mode : "";
  if (!Object.prototype.hasOwnProperty.call(MODES, mode)) return json({ error: "mode_unavailable" }, 400);

  const now = Date.now();

  // Nie można mieć dwóch walk naraz. Walkę po czasie rozstrzygamy od razu, żeby nie blokowała gracza.
  const running = await env.DB.prepare(
    "SELECT * FROM duels WHERE status = 'playing' AND (host_id = ? OR guest_id = ?)",
  ).bind(userId, userId).all();
  for (const row of running.results || []) {
    const settled = await settleDuel(env.DB, row, now);
    if (settled.status === "playing") return json({ error: "in_duel", id: settled.id }, 409);
  }

  const build = await loadBuild(env.DB, userId);
  if (build.error) return json({ error: build.error, minLevel: build.minLevel }, build.status);

  await cleanupDuels(env.DB, now);
  await env.DB.prepare("UPDATE duels SET status = 'closed', updated_at = ? WHERE status IN ('open', 'pending') AND host_id = ?").bind(now, userId).run();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const id = randomCode();
    try {
      await env.DB.prepare(
        `INSERT INTO duels (id, mode, status, best_of, host_id, host_name, host_class, host_level, host_seen, created_at, updated_at)
         VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, mode, MODES[mode].bestOf, userId, username, build.classId, build.level, now, now, now).run();
      return json({ ok: true, id, mode });
    } catch (error) {
      // kolizja kodu — losujemy jeszcze raz
    }
  }
  return json({ error: "try_again" }, 500);
}

export async function onRequestDelete({ request, env }) {
  const auth = await authenticate(request, env, { write: true });
  if (auth.response) return auth.response;

  const id = new URL(request.url).searchParams.get("id");
  const row = await loadDuel(env.DB, id);
  if (!row || sideOf(row, auth.session.userId) !== "host") return json({ error: "not_found" }, 404);

  const result = await env.DB.prepare(
    "UPDATE duels SET status = 'closed', updated_at = ? WHERE id = ? AND status IN ('open', 'pending')",
  ).bind(Date.now(), row.id).run();
  return json({ ok: true, closed: result.meta.changes > 0 });
}

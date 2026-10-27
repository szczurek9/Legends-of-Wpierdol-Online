// GET /api/duel/state?id=KOD&since=N&builds=1 — stan pojedynku (odpytywany co 2–5 s).
// since = ile ruchów klient już zna (zwracamy ruchy o numerze >= since), builds=1 = dołącz buildy i ziarno
// (potrzebne tylko raz, gdy klient wczytuje walkę, np. po akceptacji albo po odświeżeniu strony).
// Statusy: open (host czeka) → pending (ktoś prosi o walkę) → playing → finished | void | closed.
// Odrzucony lub niezaakceptowany w 20 s gracz dostaje { status: "declined", reason }.
// Przy okazji serwer rozstrzyga prośby i walki po czasie oraz odnotowuje sygnał życia gracza.
import { json } from "../../_lib/session.js";
import { SEEN_THROTTLE_MS, authenticate, duelView, loadDuel, settleDuel, sideOf } from "../../_lib/duel.js";

export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (auth.response) return auth.response;
  const { userId } = auth.session;

  const params = new URL(request.url).searchParams;
  let row = await loadDuel(env.DB, params.get("id"));
  if (!row) return json({ error: "not_found" }, 404);

  let side = sideOf(row, userId);
  if (!side) {
    if (row.status === "open" && row.declined_id === userId) {
      return json({ id: row.id, status: "declined", reason: row.declined_reason });
    }
    return json({ error: "not_found" }, 404);
  }

  const now = Date.now();
  row = await settleDuel(env.DB, row, now);

  // Prośba gracza wygasła albo została odrzucona/wycofana: lobby wróciło do otwartych bez niego.
  if (side === "guest" && row.guest_id !== userId) {
    return json({ id: row.id, status: "declined", reason: row.declined_id === userId ? row.declined_reason : "cancelled" });
  }

  // Sygnał życia — host czekający w lobby musi odświeżać go, żeby lobby nie zniknęło z listy.
  const seenColumn = side === "host" ? "host_seen" : "guest_seen";
  if (row.status === "open" || row.status === "pending" || row.status === "playing") {
    if (!row[seenColumn] || now - row[seenColumn] > SEEN_THROTTLE_MS) {
      await env.DB.prepare(`UPDATE duels SET ${seenColumn} = ? WHERE id = ?`).bind(now, row.id).run();
    }
  }

  const since = Math.max(0, Math.floor(Number(params.get("since")) || 0));
  let moves = null;
  if ((row.status === "playing" || row.status === "finished" || row.status === "void") && since < row.move_count) {
    const result = await env.DB.prepare(
      "SELECT n, side, action, next_actor FROM duel_moves WHERE duel_id = ? AND n >= ? ORDER BY n LIMIT 500",
    ).bind(row.id, since).all();
    moves = result.results || [];
  }

  return json(duelView(row, side, { moves, builds: params.get("builds") === "1", now }));
}

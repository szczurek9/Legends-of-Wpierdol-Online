// POST /api/duel/finish — koniec walki:
//   { id, winner: "host" | "guest" } — wynik według silnika klienta. Gdy oba zgłoszenia są zgodne, walka jest zakończona;
//                                       gdy się różnią, walka jest anulowana (rozjazd symulacji, bez wyniku).
//   { id, forfeit: true }            — poddanie się (np. wyjście z walki): wygrywa przeciwnik.
//   { id, desync: true }             — klient wykrył rozjazd symulacji (niezgodny ruch przeciwnika): walka anulowana bez wyniku.
import { json } from "../../_lib/session.js";
import { authenticate, duelView, loadDuel, otherSide, readBody, settleDuel, sideOf } from "../../_lib/duel.js";

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env, { write: true });
  if (auth.response) return auth.response;

  const body = await readBody(request);
  if (!body) return json({ error: "bad_request" }, 400);
  const forfeit = body.forfeit === true;
  const desync = body.desync === true;
  if (!forfeit && !desync && body.winner !== "host" && body.winner !== "guest") return json({ error: "bad_request" }, 400);

  let row = await loadDuel(env.DB, body.id);
  const side = row ? sideOf(row, auth.session.userId) : null;
  if (!row || !side) return json({ error: "not_found" }, 404);

  const now = Date.now();
  row = await settleDuel(env.DB, row, now);
  if (row.status !== "playing") return json({ ok: true, duel: duelView(row, side, { now }) });

  if (desync) {
    await env.DB.prepare(
      "UPDATE duels SET status = 'void', winner = NULL, end_reason = 'desync', updated_at = ? WHERE id = ? AND status = 'playing'",
    ).bind(now, row.id).run();
  } else if (forfeit) {
    await env.DB.prepare(
      "UPDATE duels SET status = 'finished', winner = ?, end_reason = 'forfeit', updated_at = ? WHERE id = ? AND status = 'playing'",
    ).bind(otherSide(side), now, row.id).run();
  } else {
    const column = side === "host" ? "host_report" : "guest_report";
    await env.DB.prepare(
      `UPDATE duels SET ${column} = ?, updated_at = ? WHERE id = ? AND status = 'playing' AND ${column} IS NULL`,
    ).bind(body.winner, now, row.id).run();
  }

  row = await settleDuel(env.DB, await loadDuel(env.DB, row.id), now);
  return json({ ok: true, duel: duelView(row, side, { now }) });
}

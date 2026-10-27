// Wspólne funkcje pojedynków 1v1: wymagania, kody lobby, rozstrzyganie walki (timeout, wynik).
// Serwer NIE liczy walki — robią to obaj klienci tym samym silnikiem (to samo ziarno, te same buildy).
// Serwer pilnuje tylko: kto jest w pojedynku, czyja kolej (wg ostatniego ruchu), limitu 30 s i zgodności wyników.
import { json, readSession } from "./session.js";

export const MIN_LEVEL = 51; // ukończony 50. poziom (jak w osiągnięciach: level >= 51)
export const MODES = { casual: { bestOf: 3 } }; // ranked (bestOf 5) dojdzie później
export const MOVE_TIMEOUT_MS = 30 * 1000; // brak ruchu przez 30 s = przegrana
export const START_GRACE_MS = 15 * 1000; // dodatkowy czas na wczytanie walki przed 1. ruchem
export const REQUEST_TIMEOUT_MS = 20 * 1000; // host ma 20 s na odpowiedź na prośbę o walkę
export const LOBBY_STALE_MS = 30 * 1000; // lobby bez sygnału hosta znika z listy
export const SEEN_THROTTLE_MS = 10 * 1000; // sygnał życia zapisujemy najwyżej co 10 s (oszczędza zapisy D1)
const MAX_BUILD_LENGTH = 30 * 1024;
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

// Pola, których przeciwnik nie potrzebuje do walki i nie powinien widzieć.
const PRIVATE_PLAYER_FIELDS = [
  "money", "skinPoints", "skinInventory", "theme",
  "achRun", "achievementsEnabled", "achievementSpGranted",
  "arenaCooldownUntil", "arenaEscapeLockUntil",
];

export function isSameOrigin(request) {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

export function otherSide(side) {
  return side === "host" ? "guest" : "host";
}

export function sideOf(row, userId) {
  if (row.host_id === userId) return "host";
  if (row.guest_id === userId) return "guest";
  return null;
}

export function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

export function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

export function randomSide() {
  return crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0 ? "host" : "guest";
}

// Zwraca { response } (błąd do odesłania) albo { session }.
export async function authenticate(request, env, { write = false } = {}) {
  const session = await readSession(request, env.SESSION_SECRET);
  if (!session) return { response: json({ error: "unauthorized" }, 401) };
  if (write && !isSameOrigin(request)) return { response: json({ error: "forbidden" }, 403) };
  return { session };
}

export async function readBody(request, maxLength = 2048) {
  try {
    const text = await request.text();
    if (text.length > maxLength) return null;
    const body = JSON.parse(text);
    return body && typeof body === "object" ? body : null;
  } catch (error) {
    return null;
  }
}

// Build gracza = jego zapis w chmurze (tabela saves). Zwraca { player } albo { error, status }.
export async function loadBuild(db, userId) {
  const row = await db.prepare("SELECT data FROM saves WHERE user_id = ?").bind(userId).first();
  if (!row) return { error: "no_save", status: 422 };

  let player;
  try {
    const bytes = Uint8Array.from(atob(row.data), (character) => character.charCodeAt(0));
    player = JSON.parse(new TextDecoder().decode(bytes)).player;
  } catch (error) {
    return { error: "invalid_save", status: 422 };
  }
  if (!player || typeof player !== "object") return { error: "invalid_save", status: 422 };
  if (!(Number(player.level) >= MIN_LEVEL)) return { error: "level_too_low", status: 422, minLevel: MIN_LEVEL };
  if (typeof player.classId !== "string" || !player.classId) return { error: "no_class", status: 422 };

  const trimmed = { ...player };
  PRIVATE_PLAYER_FIELDS.forEach((field) => { delete trimmed[field]; });
  const serialized = JSON.stringify(trimmed);
  if (serialized.length > MAX_BUILD_LENGTH) return { error: "build_too_large", status: 422 };
  return { player: trimmed, serialized, classId: player.classId, level: Math.floor(Number(player.level)) };
}

// Rozstrzyga pojedynek na podstawie czasu i zgłoszonych wyników. Idempotentne:
// wywoływane przy każdym odczycie stanu, więc nie potrzeba osobnego zadania w tle.
// Zwraca aktualny wiersz (zaktualizowany, jeśli coś się rozstrzygnęło).
export async function settleDuel(db, row, now) {
  // Prośba o walkę bez odpowiedzi hosta wygasa i lobby wraca do otwartych.
  if (row.status === "pending") {
    if (row.request_at && now - row.request_at > REQUEST_TIMEOUT_MS) {
      return revertToOpen(db, row, "timeout", now);
    }
    return row;
  }
  if (row.status !== "playing") return row;

  let change = null;
  if (row.host_report && row.guest_report) {
    change = row.host_report === row.guest_report
      ? { status: "finished", winner: row.host_report, end_reason: "normal" }
      : { status: "void", winner: null, end_reason: "desync" };
  } else if (row.deadline && now > row.deadline) {
    if (row.next_actor === "host" || row.next_actor === "guest") {
      change = { status: "finished", winner: otherSide(row.next_actor), end_reason: "timeout" };
    } else {
      // Walka skończona, czekamy na zgłoszenia wyników: wystarczy jedno, jeśli drugi gracz zniknął.
      const report = row.host_report || row.guest_report;
      change = report
        ? { status: "finished", winner: report, end_reason: "reported" }
        : { status: "void", winner: null, end_reason: "abandoned" };
    }
  }
  if (!change) return row;

  const result = await db.prepare(
    "UPDATE duels SET status = ?, winner = ?, end_reason = ?, updated_at = ? WHERE id = ? AND status = 'playing'",
  ).bind(change.status, change.winner, change.end_reason, now, row.id).run();
  if (result.meta.changes === 0) {
    return (await db.prepare("SELECT * FROM duels WHERE id = ?").bind(row.id).first()) || row;
  }
  return { ...row, ...change, updated_at: now };
}

// Lobby z prośbą wraca do stanu "open". reason (timeout / declined) zapamiętujemy dla odrzuconego gracza,
// żeby jego klient dowiedział się, co się stało; przy wycofaniu prośby przez niego samego reason = null.
export async function revertToOpen(db, row, reason, now) {
  const declinedId = reason ? row.guest_id : null;
  const result = await db.prepare(
    `UPDATE duels SET status = 'open', guest_id = NULL, guest_name = NULL, guest_class = NULL, guest_level = NULL,
       guest_seen = NULL, request_at = NULL, declined_id = ?, declined_reason = ?, updated_at = ?
     WHERE id = ? AND status = 'pending' AND guest_id = ?`,
  ).bind(declinedId, reason, now, row.id, row.guest_id).run();
  if (result.meta.changes === 0) {
    return (await db.prepare("SELECT * FROM duels WHERE id = ?").bind(row.id).first()) || row;
  }
  return {
    ...row, status: "open", guest_id: null, guest_name: null, guest_class: null, guest_level: null,
    guest_seen: null, request_at: null, declined_id: declinedId, declined_reason: reason, updated_at: now,
  };
}

export async function loadDuel(db, id) {
  if (typeof id !== "string" || !/^[A-Z0-9]{6}$/.test(id)) return null;
  return db.prepare("SELECT * FROM duels WHERE id = ?").bind(id).first();
}

function safeParse(text) {
  try { return JSON.parse(text); } catch (error) { return null; }
}

// Widok pojedynku dla jednego z graczy (bez cudzych raportów i ID Discorda).
export function duelView(row, side, { moves = null, builds = false, now = Date.now() } = {}) {
  const view = {
    id: row.id,
    mode: row.mode,
    status: row.status,
    bestOf: row.best_of,
    side,
    host: { name: row.host_name, classId: row.host_class, level: row.host_level },
    guest: row.guest_id ? { name: row.guest_name, classId: row.guest_class, level: row.guest_level } : null,
    requestExpiresAt: row.status === "pending" && row.request_at ? row.request_at + REQUEST_TIMEOUT_MS : null,
    seed: row.seed,
    first: row.first_side,
    moveCount: row.move_count,
    nextActor: row.next_actor,
    deadline: row.deadline,
    serverTime: now,
    winner: row.winner,
    endReason: row.end_reason,
  };
  if (builds && row.host_build && row.guest_build) {
    view.builds = { host: safeParse(row.host_build), guest: safeParse(row.guest_build) };
  }
  if (moves) {
    view.moves = moves.map((move) => ({ n: move.n, side: move.side, action: safeParse(move.action), next: move.next_actor }));
  }
  return view;
}

// Przy tworzeniu lobby sprzątamy stare wiersze (żeby tabela nie rosła w nieskończoność).
export async function cleanupDuels(db, now) {
  await db.batch([
    db.prepare("DELETE FROM duel_moves WHERE duel_id IN (SELECT id FROM duels WHERE updated_at < ?)").bind(now - 60 * 60 * 1000),
    db.prepare("DELETE FROM duels WHERE updated_at < ?").bind(now - 60 * 60 * 1000),
    db.prepare("DELETE FROM duels WHERE status IN ('open', 'pending') AND host_seen < ?").bind(now - 2 * 60 * 1000),
  ]);
}

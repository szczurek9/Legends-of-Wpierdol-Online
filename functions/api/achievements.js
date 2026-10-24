// GET  /api/achievements — odblokowane osiągnięcia i postęp zalogowanego gracza.
// POST /api/achievements — zgłoszenie zdarzeń z gry:
//   { unlock: ["firstBlood"], counters: { overkillProcs: 2 }, sets: { arenaDifficulties: ["hard"] } }
// Odpowiedź ma ten sam kształt co GET, plus "newlyUnlocked" (co odblokowało się tym żądaniem).
// Osiągnięcia zależne od licznika/zbioru oraz platynę odblokowuje serwer, nie klient.
import { json, readSession } from "../_lib/session.js";
import {
  ACHIEVEMENTS, COUNTERS, SETS, MAX_COUNTER_DELTA, PLATINUM_ID, isEventAchievement,
} from "../_lib/achievements.js";

const MAX_BODY_LENGTH = 4 * 1024;

function isSameOrigin(request) {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

function emptyProgress() {
  return { counters: {}, sets: {} };
}

function parseProgress(text) {
  const progress = emptyProgress();
  try {
    const raw = JSON.parse(text);
    Object.keys(COUNTERS).forEach((name) => {
      const value = Number(raw?.counters?.[name]);
      if (Number.isInteger(value) && value > 0) progress.counters[name] = Math.min(value, COUNTERS[name]);
    });
    Object.keys(SETS).forEach((name) => {
      const values = Array.isArray(raw?.sets?.[name]) ? raw.sets[name] : [];
      progress.sets[name] = SETS[name].filter((value) => values.includes(value));
    });
  } catch (error) {
    // uszkodzony wiersz traktujemy jak pusty postęp
  }
  Object.keys(SETS).forEach((name) => { progress.sets[name] = progress.sets[name] || []; });
  return progress;
}

async function loadState(db, userId) {
  const unlockedRows = await db.prepare("SELECT achievement_id, unlocked_at FROM achievements WHERE user_id = ?").bind(userId).all();
  const progressRow = await db.prepare("SELECT data FROM achievement_progress WHERE user_id = ?").bind(userId).first();

  const unlocked = {};
  (unlockedRows.results || []).forEach((row) => {
    if (Object.prototype.hasOwnProperty.call(ACHIEVEMENTS, row.achievement_id)) unlocked[row.achievement_id] = row.unlocked_at;
  });
  return { unlocked, progress: parseProgress(progressRow ? progressRow.data : "{}") };
}

function goalReached(rule, progress) {
  if (rule.counter) return (progress.counters[rule.counter[0]] || 0) >= rule.counter[1];
  if (rule.set) return (progress.sets[rule.set[0]] || []).length >= rule.set[1];
  return false;
}

function view(state, extra = {}) {
  return json({ unlocked: state.unlocked, counters: state.progress.counters, sets: state.progress.sets, ...extra });
}

export async function onRequestGet({ request, env }) {
  const session = await readSession(request, env.SESSION_SECRET);
  if (!session) return json({ error: "unauthorized" }, 401);

  try {
    return view(await loadState(env.DB, session.userId));
  } catch (error) {
    return json({ error: "server_error" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const session = await readSession(request, env.SESSION_SECRET);
  if (!session) return json({ error: "unauthorized" }, 401);
  if (!isSameOrigin(request)) return json({ error: "forbidden" }, 403);

  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_LENGTH) return json({ error: "too_large" }, 413);
    body = JSON.parse(text);
  } catch (error) {
    return json({ error: "bad_request" }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "bad_request" }, 400);

  try {
    const state = await loadState(env.DB, session.userId);
    const { progress } = state;
    const now = new Date().toISOString();
    let progressChanged = false;

    Object.entries(body.counters && typeof body.counters === "object" ? body.counters : {}).forEach(([name, delta]) => {
      if (!Object.prototype.hasOwnProperty.call(COUNTERS, name) || !Number.isInteger(delta) || delta <= 0) return;
      const current = progress.counters[name] || 0;
      const next = Math.min(COUNTERS[name], current + Math.min(delta, MAX_COUNTER_DELTA));
      if (next !== current) {
        progress.counters[name] = next;
        progressChanged = true;
      }
    });

    Object.entries(body.sets && typeof body.sets === "object" ? body.sets : {}).forEach(([name, values]) => {
      if (!Object.prototype.hasOwnProperty.call(SETS, name) || !Array.isArray(values)) return;
      values.forEach((value) => {
        if (SETS[name].includes(value) && !progress.sets[name].includes(value)) {
          progress.sets[name].push(value);
          progressChanged = true;
        }
      });
    });

    const candidates = new Set();
    (Array.isArray(body.unlock) ? body.unlock : []).slice(0, 40).forEach((id) => {
      if (typeof id === "string" && isEventAchievement(id)) candidates.add(id);
    });
    Object.entries(ACHIEVEMENTS).forEach(([id, rule]) => {
      if (goalReached(rule, progress)) candidates.add(id);
    });

    const newlyUnlocked = [...candidates].filter((id) => !state.unlocked[id]);
    newlyUnlocked.forEach((id) => { state.unlocked[id] = now; });

    // Platyna: wszystkie osiągnięcia poza nią samą.
    const everythingElse = Object.keys(ACHIEVEMENTS).filter((id) => id !== PLATINUM_ID);
    if (!state.unlocked[PLATINUM_ID] && everythingElse.every((id) => state.unlocked[id])) {
      state.unlocked[PLATINUM_ID] = now;
      newlyUnlocked.push(PLATINUM_ID);
    }

    const statements = newlyUnlocked.map((id) => env.DB.prepare(
      "INSERT OR IGNORE INTO achievements (user_id, achievement_id, unlocked_at) VALUES (?1, ?2, ?3)",
    ).bind(session.userId, id, now));
    if (progressChanged) {
      statements.push(env.DB.prepare(
        `INSERT INTO achievement_progress (user_id, data, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      ).bind(session.userId, JSON.stringify(progress), now));
    }
    if (statements.length) await env.DB.batch(statements);

    return view(state, { newlyUnlocked });
  } catch (error) {
    return json({ error: "server_error" }, 500);
  }
}

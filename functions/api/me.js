// GET /api/me — kto jest zalogowany i czy ma zapis w chmurze.
import { json, readSession } from "../_lib/session.js";

export async function onRequestGet({ request, env }) {
  const session = await readSession(request, env.SESSION_SECRET);
  if (!session) return json({ loggedIn: false });

  const row = await env.DB.prepare("SELECT updated_at FROM saves WHERE user_id = ?").bind(session.userId).first();

  return json({
    loggedIn: true,
    username: session.username,
    hasSave: Boolean(row),
    updatedAt: row ? row.updated_at : null,
  });
}

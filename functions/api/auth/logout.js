// POST /api/auth/logout — kasuje ciasteczko sesji.
import { SESSION_COOKIE, buildCookie } from "../../_lib/session.js";

export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": buildCookie(SESSION_COOKIE, "", 0),
    },
  });
}

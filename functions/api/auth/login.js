// GET /api/auth/login — wysyła gracza na stronę logowania Discorda.
import { STATE_COOKIE, buildCookie } from "../../_lib/session.js";

export async function onRequestGet({ request, env }) {
  if (!env.DISCORD_CLIENT_ID) {
    return new Response("Logowanie nie jest skonfigurowane.", { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const state = crypto.randomUUID(); // losowy znacznik chroniący przed podszyciem się pod logowanie

  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: `${origin}/api/auth/callback`,
    response_type: "code",
    scope: "identify",
    state,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://discord.com/oauth2/authorize?${params}`,
      "Set-Cookie": buildCookie(STATE_COOKIE, state, 600),
    },
  });
}

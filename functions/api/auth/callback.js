// GET /api/auth/callback — Discord wraca tu po logowaniu.
// Wymieniamy kod na token, pytamy Discorda "kto to?", tworzymy sesję i wracamy do gry.
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  STATE_COOKIE,
  buildCookie,
  createSessionToken,
  getCookie,
} from "../../_lib/session.js";

function backToGame(origin, result, cookies) {
  const headers = new Headers({ Location: `${origin}/?login=${result}` });
  cookies.forEach((cookie) => headers.append("Set-Cookie", cookie));
  return new Response(null, { status: 302, headers });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const origin = url.origin;
  const clearState = buildCookie(STATE_COOKIE, "", 0);

  if (url.searchParams.get("error")) return backToGame(origin, "denied", [clearState]);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = getCookie(request, STATE_COOKIE);
  if (!code || !state || !savedState || state !== savedState) {
    return backToGame(origin, "error", [clearState]);
  }

  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.SESSION_SECRET) {
    return backToGame(origin, "error", [clearState]);
  }

  try {
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${origin}/api/auth/callback`,
      }),
    });
    if (!tokenResponse.ok) throw new Error("token");
    const { access_token: accessToken } = await tokenResponse.json();

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userResponse.ok) throw new Error("user");
    const user = await userResponse.json();
    if (!user.id) throw new Error("user");

    // Token Discorda nie jest nigdzie zapisywany — po tym kroku nie jest już potrzebny.
    const username = String(user.global_name || user.username || "Gracz").slice(0, 64);
    const session = await createSessionToken(env.SESSION_SECRET, String(user.id), username);

    return backToGame(origin, "ok", [clearState, buildCookie(SESSION_COOKIE, session, SESSION_MAX_AGE)]);
  } catch (error) {
    return backToGame(origin, "error", [clearState]);
  }
}

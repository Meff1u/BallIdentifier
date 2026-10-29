/**
 * Discord login for the website.
 *
 * GET  /.netlify/functions/auth?action=login[&returnTo=#/bot]  -> redirect to Discord (state in HttpOnly cookie)
 * GET  /.netlify/functions/auth?action=session                 -> { user } or { user: null }
 * POST /.netlify/functions/auth?action=logout                  -> clears the session, revokes the token
 */

const crypto = require("crypto");
const {
    STATE_COOKIE,
    STATE_MAX_AGE,
    seal,
    cookie,
    clearCookie,
    getSession,
    publicUser,
    SESSION_COOKIE,
    getRedirectUri,
    missingLoginConfig,
} = require("../lib/session");
const { json, redirect, isAllowedOrigin } = require("../lib/http");

const DISCORD_CLIENT_ID = "510775326310268930";
const SCOPES = "identify guilds";
const RETURN_ROUTES = /^#\/(identify|arts|trainer|bot|collectors|users|u|ballsdex|moderation)(\/[\w-]{0,40}){0,2}$/;

function login(event) {
    const requested = event.queryStringParameters?.returnTo || "";
    const returnTo = RETURN_ROUTES.test(requested) ? requested : "#/bot";
    const state = crypto.randomBytes(24).toString("base64url");

    const missing = missingLoginConfig();
    if (missing.length) {
        console.error(`Login is not configured: missing ${missing.join(", ")}`);
        return redirect(`/${returnTo}?login=config&missing=${missing.join(",")}`);
    }

    let stateCookie;
    try {
        stateCookie = cookie(STATE_COOKIE, seal({ state, returnTo, exp: Date.now() + STATE_MAX_AGE * 1000 }, "oauth-state"), {
            maxAge: STATE_MAX_AGE,
            event,
        });
    } catch (error) {
        console.error("Login error:", error.message);
        return redirect(`/${returnTo}?login=config`);
    }

    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        redirect_uri: getRedirectUri(event),
        response_type: "code",
        scope: SCOPES,
        state,
        prompt: "none",
    });
    return redirect(`https://discord.com/oauth2/authorize?${params}`, [stateCookie]);
}

function session(event) {
    let current = null;
    try {
        current = getSession(event);
    } catch (error) {
        console.error("Session error:", error.message);
    }
    return json(200, { user: current ? publicUser(current) : null });
}

async function logout(event) {
    if (!isAllowedOrigin(event)) return json(403, { error: "Invalid origin" });

    let current = null;
    try {
        current = getSession(event);
    } catch {
        // ignore - we clear the cookie anyway
    }

    // Best effort: revoke the Discord token so it can't be reused
    if (current?.token && process.env.DISCORD_CLIENT_SECRET) {
        try {
            await fetch("https://discord.com/api/v10/oauth2/token/revoke", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    token: current.token,
                    token_type_hint: "access_token",
                    client_id: DISCORD_CLIENT_ID,
                    client_secret: process.env.DISCORD_CLIENT_SECRET,
                }),
            });
        } catch (error) {
            console.warn("Token revoke failed:", error.message);
        }
    }

    return json(200, { success: true }, { cookies: [clearCookie(SESSION_COOKIE, event)] });
}

exports.handler = async (event) => {
    const action = event.queryStringParameters?.action;

    if (event.httpMethod === "GET" && action === "login") return login(event);
    if (event.httpMethod === "GET" && action === "session") return session(event);
    if (event.httpMethod === "POST" && action === "logout") return logout(event);

    return json(400, { error: "Unknown action" });
};

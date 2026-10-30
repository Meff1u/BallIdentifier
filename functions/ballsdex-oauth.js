/**
 * "Sign in with Ballsdex" (OAuth 2 with PKCE) for the logged-in Discord user.
 *
 * GET /.netlify/functions/ballsdex-oauth?action=start  -> redirect to Ballsdex's consent screen
 * GET /.netlify/functions/ballsdex-oauth?code=…&state=… -> callback: the bot exchanges the code, back to /ballsdex
 *
 * The PKCE verifier and state live in a short-lived encrypted HttpOnly cookie, tied to the Discord user.
 * The code exchange happens on the bot, which holds the client secret and stores the tokens encrypted.
 * Env: BALLSDEX_CLIENT_ID (the app's client id; not secret). Redirect URI to register on Ballsdex:
 * https://ballidentifier.xyz/.netlify/functions/ballsdex-oauth
 */

const crypto = require("crypto");
const { botApiFetch } = require("../lib/bot-api");
const { seal, unseal, cookie, clearCookie, parseCookies, getSession } = require("../lib/session");
const { redirect } = require("../lib/http");

const AUTHORIZE_URL = "https://ballsdex.com/api/oauth/authorize";
const COOKIE = "bi_bdx_oauth";
const MAX_AGE = 10 * 60; // seconds: Ballsdex codes must be exchanged within 10 minutes anyway
const OWNER_ID = "334411435633541121";
const SCOPES = "self:read player:read catalog:read";
// The owner's sign-in also loads the official specials list and market data for everyone
const OWNER_SCOPES = `${SCOPES} market:read`;

function callbackUri(event) {
    const host = String(event.headers?.host || "");
    if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `http://${host.replace("localhost", "127.0.0.1")}/.netlify/functions/ballsdex-oauth`;
    return "https://ballidentifier.xyz/.netlify/functions/ballsdex-oauth";
}

const back = (result, extra = [], params = {}) => redirect(`/ballsdex?${new URLSearchParams({ bdx: result, ...params })}`, extra);

function sessionOf(event) {
    try {
        return getSession(event);
    } catch {
        return null;
    }
}

function start(event, session) {
    const clientId = process.env.BALLSDEX_CLIENT_ID;
    if (!clientId) return back("not-configured");
    const state = crypto.randomBytes(24).toString("base64url");
    const verifier = crypto.randomBytes(48).toString("base64url"); // 64 characters
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const redirectUri = callbackUri(event);
    const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: session.user.id === OWNER_ID ? OWNER_SCOPES : SCOPES,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
    });
    const flow = cookie(COOKIE, seal({ state, verifier, userId: session.user.id, redirectUri, exp: Date.now() + MAX_AGE * 1000 }, "ballsdex-oauth"), { maxAge: MAX_AGE, event });
    return redirect(`${AUTHORIZE_URL}?${params}`, [flow]);
}

async function callback(event, session) {
    const query = event.queryStringParameters || {};
    const flow = unseal(parseCookies(event)[COOKIE] || "", "ballsdex-oauth");
    const done = clearCookie(COOKIE, event);
    if (!flow || flow.exp < Date.now() || !query.state || query.state !== flow.state) return back("expired", [done]);
    if (!session || session.user.id !== flow.userId) return back("session", [done]);
    if (query.error) return back(query.error === "access_denied" ? "denied" : "error", [done]);
    if (!query.code) return back("error", [done]);

    try {
        const response = await botApiFetch(`/api/users/${flow.userId}/ballsdex/oauth`, {
            method: "POST",
            body: { code: String(query.code).slice(0, 500), codeVerifier: flow.verifier, redirectUri: flow.redirectUri },
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) return back(data.reconnected ? "reconnected" : "linked", [done]);
        console.error("Ballsdex sign-in failed:", response.status, data.code, data.error);
        const known = ["WRONG_ACCOUNT", "OAUTH_FAILED", "RATE_LIMITED", "COOLDOWN", "APP_NOT_APPROVED", "NOT_CONFIGURED"];
        // Only numbers and a fixed word go back in the URL (the page builds the message itself)
        const params = {};
        if (Number.isFinite(Number(data.retryAfterSec)) && Number(data.retryAfterSec) > 0) params.wait = String(Math.min(Math.ceil(Number(data.retryAfterSec)), 7 * 86400));
        if (data.scope === "ip" || data.scope === "key") params.scope = data.scope;
        return back(known.includes(data.code) ? data.code.toLowerCase().replace(/_/g, "-") : "error", [done], params);
    } catch (error) {
        console.error("Ballsdex sign-in error:", error);
        return back("error", [done]);
    }
}

exports.handler = async (event) => {
    if (event.httpMethod !== "GET") return { statusCode: 405, body: "" };
    const session = sessionOf(event);
    const query = event.queryStringParameters || {};
    if (query.action === "start") {
        // Not logged in with Discord: log in first, then come back to the Ballsdex tab
        if (!session) return redirect(`/.netlify/functions/auth?action=login&returnTo=${encodeURIComponent("#/ballsdex")}`);
        return start(event, session);
    }
    return callback(event, session);
};

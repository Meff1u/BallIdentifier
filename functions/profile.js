/**
 * Public profiles (/u/<id>) and the Users tab.
 *
 * GET  /.netlify/functions/profile?id=<discord id>   -> { profile, viewer }   (own profile also while private)
 * GET  /.netlify/functions/profile?q=<name>          -> { total, users }      (public profiles only)
 * GET  /.netlify/functions/profile?action=me         -> own settings + profile (login)
 * POST /.netlify/functions/profile { action: "save", settings, catchStats? }     (login; catchStats: { public, tracking })
 * POST /.netlify/functions/profile { action: "moderate", id, op }               (owner)
 */

const { botApiFetch } = require("../lib/bot-api");
const { getSession, publicUser } = require("../lib/session");
const { json, requireSession, isAllowedOrigin, parseJsonBody, SNOWFLAKE } = require("../lib/http");

const OWNER_ID = "334411435633541121";
const CACHE_MS = 60 * 1000;
const cache = new Map(); // key -> { at, status, data }

function sessionOf(event) {
    try {
        return getSession(event);
    } catch {
        return null;
    }
}

async function readBot(response) {
    const data = await response.json().catch(() => ({}));
    if (response.status >= 500) return { status: 502, data: { error: typeof data.error === "string" ? data.error : "The bot is not responding. Try again in a moment." } };
    return { status: response.status, data };
}

async function cached(key, path) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit;
    const result = { at: Date.now(), ...(await readBot(await botApiFetch(path))) };
    if (result.status === 200 || result.status === 404) cache.set(key, result);
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return result;
}

// Catch stats privacy sent with the profile: only the two switches
function catchStatsInput(input) {
    if (!input || typeof input !== "object") return undefined;
    const out = {};
    if (typeof input.public === "boolean") out.public = input.public;
    if (typeof input.tracking === "boolean") out.tracking = input.tracking;
    return Object.keys(out).length ? out : undefined;
}

exports.handler = async (event) => {
    try {
        const query = event.queryStringParameters || {};
        const session = sessionOf(event);
        const viewer = session ? { id: session.user.id, canModerate: session.user.id === OWNER_ID } : null;

        if (event.httpMethod === "GET") {
            if (query.action === "me") {
                if (!session) return json(401, { error: "Not logged in", code: "LOGIN_REQUIRED" });
                const { status, data } = await readBot(await botApiFetch(`/api/users/${session.user.id}/profile`));
                return json(status, { ...data, user: publicUser(session) });
            }
            if (typeof query.id === "string") {
                if (!SNOWFLAKE.test(query.id)) return json(400, { error: "That isn't a Discord user ID." });
                // Your own profile: always fresh, and visible to you while it's private
                if (viewer?.id === query.id) {
                    const { status, data } = await readBot(await botApiFetch(`/api/users/${query.id}/profile`));
                    if (status !== 200) return json(status, data);
                    if (!data.profile) return json(404, { error: "You haven't set up your profile yet.", code: "NO_PROFILE", viewer });
                    return json(200, { profile: data.profile, viewer });
                }
                const { status, data } = await cached(`id:${query.id}`, `/api/profiles/${query.id}`);
                return json(status, { ...data, viewer }, { headers: status === 200 ? { "Cache-Control": "public, max-age=30" } : {} });
            }
            const q = String(query.q || "").trim().slice(0, 40);
            const { status, data } = await cached(`q:${q.toLowerCase()}`, `/api/profiles?q=${encodeURIComponent(q)}`);
            return json(status, { ...data, viewer });
        }

        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
        const auth = requireSession(event);
        if (auth.response) return auth.response;
        if (!isAllowedOrigin(event)) return json(403, { error: "Invalid origin" });
        const body = parseJsonBody(event);
        if (!body) return json(400, { error: "Invalid JSON body" });
        const userId = auth.session.user.id;

        if (body.action === "save") {
            if (!body.settings || typeof body.settings !== "object") return json(400, { error: "Invalid settings" });
            // The name and avatar shown on the profile come from the Discord login
            const { status, data } = await readBot(await botApiFetch(`/api/users/${userId}/profile`, { method: "POST", body: { settings: body.settings, discord: publicUser(auth.session), catchStats: catchStatsInput(body.catchStats) } }));
            if (status === 200) {
                cache.delete(`id:${userId}`);
                for (const key of cache.keys()) if (key.startsWith("q:")) cache.delete(key);
            }
            return json(status, data);
        }

        if (body.action === "moderate") {
            if (userId !== OWNER_ID) return json(403, { error: "Owner only" });
            if (typeof body.id !== "string" || !SNOWFLAKE.test(body.id)) return json(400, { error: "Invalid user" });
            const { status, data } = await readBot(await botApiFetch(`/api/users/${userId}/admin/profiles/${body.id}`, { method: "POST", body: { action: body.op } }));
            if (status === 200) cache.clear();
            return json(status, data);
        }

        return json(400, { error: "Unknown action" });
    } catch (error) {
        console.error("Profile function error:", error);
        return json(502, { error: "The bot is not responding. Try again in a moment." });
    }
};

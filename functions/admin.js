/**
 * Owner-only moderation (website: profile menu -> Moderation).
 *
 * GET  /.netlify/functions/admin                              -> sync status, bot status, recent logs
 * POST /.netlify/functions/admin { action: "cancel-sync" }    -> stop the running Ballsdex sync
 * POST /.netlify/functions/admin { action: "refresh-data" }   -> reload dex data in the bot now
 * POST /.netlify/functions/admin { action: "sync-switches", syncDisabled?, fastSyncDisabled? } -> turn syncing off/on for everyone else
 *
 * Supported dexes (committed to the website repo by the bot, see the bot's utils/dexes.js):
 * GET  /.netlify/functions/admin?view=dexes                                          -> { dexes, github }
 * POST { action: "dex-add", name, botId, key, waves?, enabled?, icon?: base64, announce? }
 * POST { action: "dex-update", name, enabled?, waves?, incomplete?, catchPhrases?, catchIgnore?, announce? }
 * POST { action: "dex-delete", name, confirm (= name), announce? }
 *
 * Only the owner's Discord ID (from the encrypted session) gets through; the bot checks it again.
 */

const { botApiFetch } = require("../lib/bot-api");
const { json, requireSession, isAllowedOrigin, parseJsonBody } = require("../lib/http");

const OWNER_ID = "334411435633541121";
const MAX_BODY = 4 * 1024 * 1024; // a new dex's icon

async function forward(response) {
    const data = await response.json().catch(() => ({}));
    if (response.status >= 500 && response.status !== 502) {
        console.error("Bot API error:", response.status, data);
        return json(502, { error: "The bot is not responding. Try again in a moment." });
    }
    return json(response.status, data);
}

exports.handler = async (event) => {
    const auth = requireSession(event);
    if (auth.response) return auth.response;
    if (auth.session.user.id !== OWNER_ID) return json(403, { error: "Owner only" });
    const base = `/api/users/${OWNER_ID}/admin`;

    try {
        if (event.httpMethod === "GET") {
            if (event.queryStringParameters?.view === "dexes") return forward(await botApiFetch(`${base}/dexes`));
            return forward(await botApiFetch(`${base}/overview`));
        }
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
        if (!isAllowedOrigin(event)) return json(403, { error: "Invalid origin" });

        if ((event.body || "").length > MAX_BODY) return json(413, { error: "The icon is too big." });
        const body = parseJsonBody(event);
        if (body?.action === "cancel-sync") return forward(await botApiFetch(`${base}/sync/cancel`, { method: "POST", body: {} }));
        if (body?.action === "refresh-data") return forward(await botApiFetch(`${base}/refresh-data`, { method: "POST", body: {} }));
        if (body?.action === "sync-switches") {
            const switches = {};
            for (const key of ["syncDisabled", "fastSyncDisabled"]) if (typeof body[key] === "boolean") switches[key] = body[key];
            return forward(await botApiFetch(`${base}/sync/switches`, { method: "POST", body: switches }));
        }
        if (body?.action === "dex-add") {
            const { name, botId, key, waves, enabled, icon, announce } = body;
            if (icon !== undefined && icon !== null && typeof icon !== "string") return json(400, { error: "Invalid icon" });
            return forward(await botApiFetch(`${base}/dexes/add`, { method: "POST", body: { name, botId, key, waves: waves === true, enabled: enabled === true, icon: icon || null, announce: announce !== false } }));
        }
        if (body?.action === "dex-update") {
            const out = { name: body.name, announce: body.announce !== false };
            for (const field of ["enabled", "waves", "incomplete"]) if (typeof body[field] === "boolean") out[field] = body[field];
            for (const field of ["catchPhrases", "catchIgnore"]) if (Array.isArray(body[field])) out[field] = body[field].filter((item) => typeof item === "string").slice(0, 20);
            return forward(await botApiFetch(`${base}/dexes/update`, { method: "POST", body: out }));
        }
        if (body?.action === "dex-delete") {
            return forward(await botApiFetch(`${base}/dexes/delete`, { method: "POST", body: { name: body.name, confirm: body.confirm, announce: body.announce !== false } }));
        }
        return json(400, { error: "Unknown action" });
    } catch (error) {
        console.error("Admin function error:", error);
        return json(502, { error: "The bot is not responding. Try again in a moment." });
    }
};

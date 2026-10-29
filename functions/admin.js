/**
 * Owner-only moderation (website: profile menu -> Moderation).
 *
 * GET  /.netlify/functions/admin                              -> sync status, bot status, recent logs
 * POST /.netlify/functions/admin { action: "cancel-sync" }    -> stop the running Ballsdex sync
 * POST /.netlify/functions/admin { action: "refresh-data" }   -> reload dex data in the bot now
 *
 * Only the owner's Discord ID (from the encrypted session) gets through; the bot checks it again.
 */

const { botApiFetch } = require("../lib/bot-api");
const { json, requireSession, isAllowedOrigin, parseJsonBody } = require("../lib/http");

const OWNER_ID = "334411435633541121";

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
        if (event.httpMethod === "GET") return forward(await botApiFetch(`${base}/overview`));
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
        if (!isAllowedOrigin(event)) return json(403, { error: "Invalid origin" });

        const body = parseJsonBody(event);
        if (body?.action === "cancel-sync") return forward(await botApiFetch(`${base}/sync/cancel`, { method: "POST", body: {} }));
        if (body?.action === "refresh-data") return forward(await botApiFetch(`${base}/refresh-data`, { method: "POST", body: {} }));
        return json(400, { error: "Unknown action" });
    } catch (error) {
        console.error("Admin function error:", error);
        return json(502, { error: "The bot is not responding. Try again in a moment." });
    }
};

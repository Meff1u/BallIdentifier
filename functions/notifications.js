/**
 * Website notifications for the logged-in user (history + per-type settings, stored by the bot).
 *
 * GET  /.netlify/functions/notifications                                   -> { items, unread, settings, types }
 * POST /.netlify/functions/notifications { action: "read", ids?: [], all?: true }
 * POST /.netlify/functions/notifications { action: "settings", type, enabled?, dm? }
 *
 * The Discord user id always comes from the encrypted session.
 */

const { botApiFetch } = require("../lib/bot-api");
const { json, requireSession, isAllowedOrigin, parseJsonBody } = require("../lib/http");

const TYPE_PATTERN = /^[a-z_]{3,40}$/;

async function forward(response) {
    const data = await response.json().catch(() => ({}));
    if (response.status >= 500) {
        console.error("Bot API error:", response.status, data);
        return json(502, { error: "The bot is not responding. Try again in a moment." });
    }
    return json(response.status, data);
}

exports.handler = async (event) => {
    const auth = requireSession(event);
    if (auth.response) return auth.response;
    const base = `/api/users/${auth.session.user.id}/notifications`;

    try {
        if (event.httpMethod === "GET") return forward(await botApiFetch(base));
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
        if (!isAllowedOrigin(event)) return json(403, { error: "Invalid origin" });

        const body = parseJsonBody(event);
        if (!body) return json(400, { error: "Invalid JSON body" });

        if (body.action === "read") {
            const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string" && id.length <= 40).slice(0, 100) : [];
            return forward(await botApiFetch(`${base}/read`, { method: "POST", body: body.all === true ? { all: true } : { ids } }));
        }
        if (body.action === "settings") {
            if (!TYPE_PATTERN.test(String(body.type || ""))) return json(400, { error: "Unknown notification type" });
            const payload = { type: body.type };
            if (typeof body.enabled === "boolean") payload.enabled = body.enabled;
            if (typeof body.dm === "boolean") payload.dm = body.dm;
            return forward(await botApiFetch(`${base}/settings`, { method: "POST", body: payload }));
        }
        return json(400, { error: "Unknown action" });
    } catch (error) {
        console.error("Notifications function error:", error);
        return json(502, { error: "The bot is not responding. Try again in a moment." });
    }
};

/**
 * Ballsdex account features for the logged-in user.
 *
 * GET  /.netlify/functions/ballsdex  -> link status, sync status, collection summary
 * POST /.netlify/functions/ballsdex  { action: "unlink" }
 * POST /.netlify/functions/ballsdex  { action: "sync" }
 * POST /.netlify/functions/ballsdex  { action: "cancel" }
 * POST /.netlify/functions/ballsdex  { action: "fast-sync", url }   Fast Sync from the Discord link of the /player settings export
 * GET  /.netlify/functions/ballsdex?view=raws  -> rare non-special balls x tier value
 * GET  /.netlify/functions/ballsdex?view=completion[&specialId=4][&refresh=1]  -> owned / missing balls
 * GET  /.netlify/functions/ballsdex?view=ratelimit  -> Ballsdex API limit usage (your account + the bot's IP)
 * GET  /.netlify/functions/ballsdex?view=shared     -> the bot's shared Ballsdex limits (no login needed)
 *
 * The Discord user id always comes from the encrypted session, never from the request.
 * Connecting the account is "Sign in with Ballsdex" (functions/ballsdex-oauth.js).
 */

const { botApiFetch } = require("../lib/bot-api");
const { json, requireSession, isAllowedOrigin, parseJsonBody } = require("../lib/http");

async function forward(response) {
    const data = await response.json().catch(() => ({}));
    if (response.status >= 500) {
        console.error("Bot API error:", response.status, data);
        // 502 from the bot means the Ballsdex API failed; keep the bot's message for that case
        const message = (response.status === 502 || response.status === 503) && typeof data.error === "string" ? data.error : null;
        return json(502, { error: message || "The bot is not responding. Try again in a moment." });
    }
    return json(response.status, data);
}

exports.handler = async (event) => {
    if (event.httpMethod === "GET" && event.queryStringParameters?.view === "shared") {
        try {
            const response = await forward(await botApiFetch("/api/ballsdex/limits"));
            if (response.statusCode === 200) response.headers["Cache-Control"] = "public, max-age=15";
            return response;
        } catch (error) {
            console.error("Ballsdex function error:", error);
            return json(502, { error: "The bot is not responding. Try again in a moment." });
        }
    }

    const auth = requireSession(event);
    if (auth.response) return auth.response;
    const base = `/api/users/${auth.session.user.id}/ballsdex`;

    try {
        if (event.httpMethod === "GET") {
            const view = event.queryStringParameters?.view;
            if (view === "completion") {
                const query = new URLSearchParams();
                const specialId = event.queryStringParameters?.specialId;
                if (/^\d{1,6}$/.test(String(specialId || ""))) query.set("specialId", specialId);
                if (event.queryStringParameters?.refresh === "1") query.set("refresh", "1");
                return forward(await botApiFetch(`${base}/completion${query.toString() ? `?${query}` : ""}`));
            }
            const path = view === "raws" ? `${base}/raws` : view === "ratelimit" ? `${base}/ratelimit` : base;
            return forward(await botApiFetch(path));
        }

        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
        if (!isAllowedOrigin(event)) return json(403, { error: "Invalid origin" });

        const body = parseJsonBody(event);
        if (!body) return json(400, { error: "Invalid JSON body" });

        switch (body.action) {
            case "unlink":
                return forward(await botApiFetch(`${base}/unlink`, { method: "POST", body: {} }));
            case "sync":
                return forward(await botApiFetch(`${base}/sync`, { method: "POST", body: {} }));
            case "cancel":
                return forward(await botApiFetch(`${base}/cancel`, { method: "POST", body: {} }));
            case "fast-sync": {
                const url = typeof body.url === "string" ? body.url.trim() : "";
                if (!url || url.length > 600) return json(400, { error: "Paste the link of player_data.zip from Discord." });
                return forward(await botApiFetch(`${base}/fast-sync`, { method: "POST", body: { url } }));
            }
            default:
                return json(400, { error: "Unknown action" });
        }
    } catch (error) {
        console.error("Ballsdex function error:", error);
        return json(502, { error: "The bot is not responding. Try again in a moment." });
    }
};

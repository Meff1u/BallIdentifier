/**
 * Ballsdex account features for the logged-in user.
 *
 * GET  /.netlify/functions/ballsdex  -> link status, sync status, collection summary
 * POST /.netlify/functions/ballsdex  { action: "link", apiKey }
 * POST /.netlify/functions/ballsdex  { action: "unlink" }
 * POST /.netlify/functions/ballsdex  { action: "sync" }
 * POST /.netlify/functions/ballsdex  { action: "cancel" }
 * POST /.netlify/functions/ballsdex  { action: "fast-sync", url }   Fast Sync from the Discord link of the /player settings export
 * GET  /.netlify/functions/ballsdex?view=raws  -> rare non-special balls x tier value
 * GET  /.netlify/functions/ballsdex?view=ratelimit  -> Ballsdex API limit usage (your key + the bot's IP)
 *
 * The Discord user id always comes from the encrypted session, never from the request.
 * The API key is encrypted end-to-end for the bot (encryptForBot) and stored encrypted by the bot.
 */

const { botApiFetch, encryptForBot } = require("../lib/bot-api");
const { json, requireSession, isAllowedOrigin, parseJsonBody } = require("../lib/http");

const API_KEY_PATTERN = /^[\x21-\x7e]{10,200}$/;

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
    const auth = requireSession(event);
    if (auth.response) return auth.response;
    const base = `/api/users/${auth.session.user.id}/ballsdex`;

    try {
        if (event.httpMethod === "GET") {
            const view = event.queryStringParameters?.view;
            const path = view === "raws" ? `${base}/raws` : view === "ratelimit" ? `${base}/ratelimit` : base;
            return forward(await botApiFetch(path));
        }

        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
        if (!isAllowedOrigin(event)) return json(403, { error: "Invalid origin" });

        const body = parseJsonBody(event);
        if (!body) return json(400, { error: "Invalid JSON body" });

        switch (body.action) {
            case "link": {
                const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
                if (!API_KEY_PATTERN.test(apiKey)) return json(400, { error: "That doesn't look like a Ballsdex API key." });
                return forward(await botApiFetch(`${base}/link`, { method: "POST", body: { encryptedKey: encryptForBot(apiKey) } }));
            }
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

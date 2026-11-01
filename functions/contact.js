/**
 * Contact form (navbar): suggestions, bug reports and questions, delivered to the owner by the bot.
 *
 * GET  /.netlify/functions/contact                       -> { cooldownMs, maxLength, minLength }   (login)
 * POST /.netlify/functions/contact { type, message }     -> { success, cooldownMs }                (login, 10 min cooldown, enforced by the bot)
 */

const { botApiFetch } = require("../lib/bot-api");
const { publicUser } = require("../lib/session");
const { json, requireSession, isAllowedOrigin, parseJsonBody } = require("../lib/http");

const TYPES = new Set(["suggestion", "bug", "question", "other"]);

async function readBot(response) {
    const data = await response.json().catch(() => ({}));
    if (response.status >= 500) return { status: 502, data: { error: typeof data.error === "string" ? data.error : "The bot is not responding. Try again in a moment." } };
    return { status: response.status, data };
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
        const auth = requireSession(event);
        if (auth.response) return auth.response;
        const userId = auth.session.user.id;

        if (event.httpMethod === "GET") {
            const { status, data } = await readBot(await botApiFetch(`/api/users/${userId}/contact`));
            return json(status, data);
        }

        if (!isAllowedOrigin(event)) return json(403, { error: "Invalid origin" });
        const body = parseJsonBody(event);
        if (!body) return json(400, { error: "Invalid JSON body" });
        if (!TYPES.has(body.type)) return json(400, { error: "Pick a message type." });
        if (typeof body.message !== "string" || !body.message.trim()) return json(400, { error: "Write a message first." });
        if (body.message.length > 4000) return json(400, { error: "That message is too long." });

        const user = publicUser(auth.session);
        const { status, data } = await readBot(
            await botApiFetch(`/api/users/${userId}/contact`, {
                method: "POST",
                body: { type: body.type, message: body.message, discord: { username: user.username, displayName: user.displayName } },
            }),
        );
        return json(status, data);
    } catch (error) {
        console.error("Contact function error:", error);
        return json(502, { error: "The bot is not responding. Try again in a moment." });
    }
};

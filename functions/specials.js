/**
 * Ballsdex specials: names, aliases, prices, event details (public), editable by the owner.
 *
 * GET  /.netlify/functions/specials            -> { specials, officialLoadedAt, marketWindowDays, canEdit }
 * POST /.netlify/functions/specials  { id, fields: { alias, emoji, priceAverage, priceHighest, spawnRate, duration, notes } }
 *
 * Editing is owner-only: checked here from the encrypted session and again by the bot.
 */

const { botApiFetch } = require("../lib/bot-api");
const { json, requireSession, isAllowedOrigin, parseJsonBody } = require("../lib/http");
const { getSession } = require("../lib/session");

const OWNER_ID = "334411435633541121";
const CACHE_MS = 5 * 60 * 1000;
let cache = null; // { at, data }

function isOwner(event) {
    try {
        return getSession(event)?.user.id === OWNER_ID;
    } catch {
        return false;
    }
}

async function readBot(response) {
    const data = await response.json().catch(() => ({}));
    if (response.status >= 500) {
        console.error("Bot API error:", response.status, data);
        return { status: 502, data: { error: typeof data.error === "string" ? data.error : "The bot is not responding. Try again in a moment." } };
    }
    return { status: response.status, data };
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "GET") {
            const owner = isOwner(event);
            // The owner always gets fresh data, so edits show up right away
            if (owner || !cache || Date.now() - cache.at > CACHE_MS) {
                const { status, data } = await readBot(await botApiFetch("/api/specials"));
                if (status !== 200) return json(status, data);
                cache = { at: Date.now(), data };
            }
            const { officialError, ...rest } = cache.data;
            return json(200, { ...rest, officialError: owner ? officialError : undefined, canEdit: owner });
        }

        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
        const auth = requireSession(event);
        if (auth.response) return auth.response;
        if (!isAllowedOrigin(event)) return json(403, { error: "Invalid origin" });
        if (auth.session.user.id !== OWNER_ID) return json(403, { error: "Owner only" });

        const body = parseJsonBody(event);
        const id = Number(body?.id);
        if (!body || !Number.isInteger(id) || id < 1 || !body.fields || typeof body.fields !== "object") return json(400, { error: "Invalid request" });

        const { status, data } = await readBot(
            await botApiFetch(`/api/users/${auth.session.user.id}/specials/${id}`, { method: "POST", body: body.fields }),
        );
        if (status === 200) cache = null;
        return json(status, data);
    } catch (error) {
        console.error("Specials function error:", error);
        return json(502, { error: "The bot is not responding. Try again in a moment." });
    }
};

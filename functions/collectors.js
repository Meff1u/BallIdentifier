/**
 * Collectors of every dex, with Discord names and avatars (resolved by the bot).
 *
 * GET  /.netlify/functions/collectors?dex=Ballsdex  -> { entries: { [ballId]: [collector] }, viewer }
 * POST /.netlify/functions/collectors  { action: "add" | "remove", dex, ballId, userId? }  (login required)
 *
 * The acting user always comes from the encrypted session. Removing someone else is only
 * allowed for the admin, and the bot checks that again.
 */

const { botApiFetch } = require("../lib/bot-api");
const { json, requireSession, isAllowedOrigin, parseJsonBody } = require("../lib/http");
const { getSession } = require("../lib/session");

const DEX_KEYS = {
    Ballsdex: "BD",
    FoodDex: "FOD",
    HistoryDex: "HD",
    JoJoDex: "JD",
    "Empireballs Reboot": "EB",
    MapsDex: "MD",
    FlagsDex: "FD",
};
const ADMIN_ID = "334411435633541121";
const CACHE_MS = 60 * 1000;
const cache = new Map(); // dexKey -> { at, data }

function viewer(event) {
    try {
        const session = getSession(event);
        return session ? { id: session.user.id, canModerate: session.user.id === ADMIN_ID } : null;
    } catch {
        return null;
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
            const dexKey = DEX_KEYS[event.queryStringParameters?.dex];
            if (!dexKey) return json(400, { error: "Unknown dex" });

            let cached = cache.get(dexKey);
            // After an add/remove the page asks for fresh data (logged-in users only, so it can't be used to skip the cache)
            const fresh = event.queryStringParameters?.fresh === "1" && Boolean(viewer(event));
            if (fresh || !cached || Date.now() - cached.at > CACHE_MS) {
                const { status, data } = await readBot(await botApiFetch(`/api/collectors/${dexKey}`));
                if (status !== 200) return json(status, data);
                cached = { at: Date.now(), data };
                // Keep refreshing quickly while the bot is still fetching Discord profiles
                if (data.pendingProfiles > 0) cached.at -= CACHE_MS - 10 * 1000;
                cache.set(dexKey, cached);
            }
            return json(200, { ...cached.data, viewer: viewer(event) });
        }

        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
        const auth = requireSession(event);
        if (auth.response) return auth.response;
        if (!isAllowedOrigin(event)) return json(403, { error: "Invalid origin" });

        const body = parseJsonBody(event);
        if (!body) return json(400, { error: "Invalid JSON body" });
        const dexKey = DEX_KEYS[body.dex];
        const ballId = Number(body.ballId);
        if (!dexKey || !Number.isInteger(ballId) || !["add", "remove"].includes(body.action)) return json(400, { error: "Invalid request" });
        const targetUserId = typeof body.userId === "string" && /^\d{17,20}$/.test(body.userId) ? body.userId : undefined;

        const { status, data } = await readBot(
            await botApiFetch(`/api/users/${auth.session.user.id}/collectors`, {
                method: "POST",
                body: { action: body.action, dexKey, ballId, targetUserId },
            }),
        );
        if (status === 200) cache.delete(dexKey);
        return json(status, data);
    } catch (error) {
        console.error("Collectors function error:", error);
        return json(502, { error: "The bot is not responding. Try again in a moment." });
    }
};

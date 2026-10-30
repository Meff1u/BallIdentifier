/**
 * Ballsdex specials: names, aliases, prices, event details (public), editable by the owner.
 *
 * GET  /.netlify/functions/specials            -> { specials, officialLoadedAt, marketWindowDays, canEdit }
 * GET  /.netlify/functions/specials?market=4   -> sale history and market numbers of one special
 * GET  /.netlify/functions/specials?ball=123    -> specials that Ballsdex ball can have (Spawn Arts popup)
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
const MARKET_CACHE_MS = 15 * 60 * 1000;
const marketCache = new Map(); // id -> { at, data }
const ballCache = new Map(); // ball id -> { at, data }

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
        if (event.httpMethod === "GET" && event.queryStringParameters?.ball) {
            const id = Number(event.queryStringParameters.ball);
            if (!Number.isInteger(id) || id < 1 || id > 1000000) return json(400, { error: "Invalid ball" });
            const cached = ballCache.get(id);
            if (cached && Date.now() - cached.at < MARKET_CACHE_MS) return json(200, cached.data, { headers: { "Cache-Control": "public, max-age=900" } });
            const { status, data } = await readBot(await botApiFetch(`/api/specials/ball/${id}`));
            if (status === 200 && data.loaded) {
                if (ballCache.size > 2000) ballCache.clear();
                ballCache.set(id, { at: Date.now(), data });
            }
            return json(status, data, status === 200 && data.loaded ? { headers: { "Cache-Control": "public, max-age=900" } } : {});
        }

        if (event.httpMethod === "GET" && event.queryStringParameters?.market) {
            const id = Number(event.queryStringParameters.market);
            if (!Number.isInteger(id) || id < 1 || id > 100000) return json(400, { error: "Invalid special" });
            const cached = marketCache.get(id);
            if (cached && Date.now() - cached.at < MARKET_CACHE_MS) return json(200, cached.data);
            const { status, data } = await readBot(await botApiFetch(`/api/specials/${id}/market`));
            if (status === 200) {
                if (marketCache.size > 200) marketCache.clear();
                marketCache.set(id, { at: Date.now(), data });
            }
            return json(status, data);
        }

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

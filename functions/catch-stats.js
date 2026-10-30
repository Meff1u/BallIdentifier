/**
 * Catch stats (website: Bot -> Catch stats).
 *
 * GET  ?view=leaderboard&period=all|30d|7d[&guildId=]  -> public rankings (users with public catch stats)
 * GET  ?view=servers                                  -> servers you administer + their Catch stats settings (login)
 * GET  ?view=me                                       -> your own catch stats (login)
 * POST { action: "save-server", guildId, enabled, mode, lines }   (Administrator on that server)
 * POST { action: "settings", public?, tracking? }                 (your own privacy; tracking off deletes your data)
 */

const { botApiFetch } = require("../lib/bot-api");
const { json, requireSession, isAllowedOrigin, parseJsonBody, discordApi, isGuildAdmin, discordErrorResponse, SNOWFLAKE } = require("../lib/http");

const PERIODS = ["all", "30d", "7d"];
const LINES = ["average", "ballAverage", "best", "serverRank"];
const cache = new Map(); // leaderboard key -> { at, data }
const CACHE_MS = 60 * 1000;

async function readBot(response) {
    const data = await response.json().catch(() => ({}));
    if (response.status >= 500) return { status: 502, data: { error: typeof data.error === "string" ? data.error : "The bot is not responding. Try again in a moment." } };
    return { status: response.status, data };
}

async function adminGuilds(session) {
    const result = await discordApi("/users/@me/guilds", session.token);
    if (!result.ok) return { response: discordErrorResponse(result) };
    return { guilds: (result.data || []).filter(isGuildAdmin) };
}

exports.handler = async (event) => {
    try {
        const query = event.queryStringParameters || {};

        if (event.httpMethod === "GET" && query.view === "leaderboard") {
            const period = PERIODS.includes(query.period) ? query.period : "all";
            const guildId = SNOWFLAKE.test(String(query.guildId || "")) ? query.guildId : "";
            const key = `${period}:${guildId}`;
            const hit = cache.get(key);
            if (hit && Date.now() - hit.at < CACHE_MS) return json(200, hit.data, { headers: { "Cache-Control": "public, max-age=60" } });
            const { status, data } = await readBot(await botApiFetch(`/api/catch-stats/leaderboard?period=${period}${guildId ? `&guildId=${guildId}` : ""}`));
            if (status === 200) cache.set(key, { at: Date.now(), data });
            return json(status, data, { headers: status === 200 ? { "Cache-Control": "public, max-age=60" } : {} });
        }

        const auth = requireSession(event);
        if (auth.response) return auth.response;
        const userId = auth.session.user.id;

        if (event.httpMethod === "GET") {
            if (query.view === "me") {
                const { status, data } = await readBot(await botApiFetch(`/api/users/${userId}/catch-stats`));
                return json(status, data);
            }
            if (query.view === "servers") {
                const admin = await adminGuilds(auth.session);
                if (admin.response) return admin.response;
                const ids = admin.guilds.map((g) => g.id);
                const { status, data } = ids.length ? await readBot(await botApiFetch(`/api/catch-stats/guilds?ids=${ids.join(",")}`)) : { status: 200, data: { configs: {} } };
                if (status !== 200) return json(status, data);
                const servers = admin.guilds
                    .map((g) => ({
                        id: g.id,
                        name: g.name,
                        icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null,
                        hasBot: Boolean(data.configs?.[g.id]?.botPresent),
                        config: data.configs?.[g.id] || null,
                    }))
                    .sort((a, b) => Number(b.hasBot) - Number(a.hasBot) || Number(b.config?.enabled) - Number(a.config?.enabled) || a.name.localeCompare(b.name));
                return json(200, { servers });
            }
            return json(400, { error: "Unknown view" });
        }

        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
        if (!isAllowedOrigin(event)) return json(403, { error: "Invalid origin" });
        const body = parseJsonBody(event);
        if (!body) return json(400, { error: "Invalid JSON body" });

        if (body.action === "save-server") {
            if (!SNOWFLAKE.test(String(body.guildId || ""))) return json(400, { error: "Invalid server" });
            const admin = await adminGuilds(auth.session);
            if (admin.response) return admin.response;
            if (!admin.guilds.some((g) => g.id === body.guildId)) return json(403, { error: "You need Administrator permission on this server." });
            const lines = {};
            for (const key of LINES) if (typeof body.lines?.[key] === "boolean") lines[key] = body.lines[key];
            const payload = {
                enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
                mode: ["every", "records"].includes(body.mode) ? body.mode : undefined,
                lines,
                setupBy: auth.session.user.username,
            };
            const { status, data } = await readBot(await botApiFetch(`/api/guilds/${body.guildId}/catch-stats`, { method: "POST", body: payload }));
            return json(status, data);
        }

        if (body.action === "settings") {
            const payload = {};
            if (typeof body.public === "boolean") payload.public = body.public;
            if (typeof body.tracking === "boolean") payload.tracking = body.tracking;
            const { status, data } = await readBot(await botApiFetch(`/api/users/${userId}/catch-stats/settings`, { method: "POST", body: payload }));
            if (status === 200) cache.clear();
            return json(status, data);
        }

        return json(400, { error: "Unknown action" });
    } catch (error) {
        console.error("Catch stats function error:", error);
        return json(502, { error: "The bot is not responding. Try again in a moment." });
    }
};

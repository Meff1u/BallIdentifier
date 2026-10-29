/**
 * Save or delete the Notifier configuration of one server (admins only).
 * POST /.netlify/functions/save-guild-config  (session cookie, same-origin only)
 * body: { guildId, kind?, selectedBots, selectedRole, customMessage } | { guildId, kind?, isDelete: true }
 * kind: "spawn" (default, Spawn notifier) or "tradesman" (Tradesman notifier)
 */

const { botApiFetch } = require("../lib/bot-api");
const {
    json,
    requireSession,
    isAllowedOrigin,
    parseJsonBody,
    discordApi,
    isGuildAdmin,
    discordErrorResponse,
    SNOWFLAKE,
} = require("../lib/http");

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    // CSRF: the session cookie is sent automatically, so only accept our own origin
    if (!isAllowedOrigin(event)) return json(403, { error: "Invalid origin" });

    const auth = requireSession(event);
    if (auth.response) return auth.response;

    const body = parseJsonBody(event);
    if (!body) return json(400, { error: "Invalid JSON body" });

    const { guildId, selectedBots, selectedRole, customMessage, isDelete } = body;
    const kind = body.kind === "tradesman" ? "tradesman" : "spawn";
    if (!SNOWFLAKE.test(String(guildId || ""))) return json(400, { error: "Invalid guildId" });
    if (!isDelete && (!Array.isArray(selectedBots) || !selectedBots.length || !selectedRole || !customMessage)) {
        return json(400, { error: "Pick at least one bot, a role and a message" });
    }

    try {
        const userGuilds = await discordApi("/users/@me/guilds", auth.session.token);
        if (!userGuilds.ok) return discordErrorResponse(userGuilds);

        const guild = (userGuilds.data || []).find((g) => g.id === guildId);
        if (!guild) return json(403, { error: "You are not a member of this server" });
        if (!isGuildAdmin(guild)) return json(403, { error: "You need Administrator permission on this server" });

        const setupBy = auth.session.user.username;
        const requestBody = isDelete
            ? { kind, isDelete: true, setupBy }
            : { kind, selectedBots, selectedRole, customMessage, setupBy, setupAt: Date.now() };

        const response = await botApiFetch(`/api/guilds/${guildId}/config`, { method: "POST", body: requestBody });
        const data = await response.json().catch(() => ({}));

        if (response.status === 429) return json(429, { error: "Too many requests. Try again in a moment." });
        if (response.status === 400 || response.status === 404) {
            return json(response.status, { error: data.error || "Invalid configuration" });
        }
        if (!response.ok) throw new Error(data.error || `Bot API returned ${response.status}`);

        return json(200, {
            success: true,
            message: isDelete ? "Configuration deleted" : "Configuration saved",
            configuration: data.configuration || null,
        });
    } catch (error) {
        console.error("Error saving guild config:", error);
        return json(502, { error: "The bot is not responding. Try again in a moment." });
    }
};

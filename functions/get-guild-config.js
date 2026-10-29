/**
 * Notifier configuration of one server (admins only).
 * GET /.netlify/functions/get-guild-config?guildId=<id>  (session cookie)
 */

const { botApiFetch } = require("../lib/bot-api");
const { json, requireSession, discordApi, isGuildAdmin, discordErrorResponse, SNOWFLAKE } = require("../lib/http");

exports.handler = async (event) => {
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

    const guildId = event.queryStringParameters?.guildId || "";
    if (!SNOWFLAKE.test(guildId)) return json(400, { error: "Invalid guildId" });

    const auth = requireSession(event);
    if (auth.response) return auth.response;

    try {
        const userGuilds = await discordApi("/users/@me/guilds", auth.session.token);
        if (!userGuilds.ok) return discordErrorResponse(userGuilds);

        const guild = (userGuilds.data || []).find((g) => g.id === guildId);
        if (!guild) return json(403, { error: "You are not a member of this server" });
        if (!isGuildAdmin(guild)) return json(403, { error: "You need Administrator permission on this server" });

        const response = await botApiFetch(`/api/guilds/${guildId}/config`);
        if (response.status === 404) return json(404, { error: "BallIdentifier is not on this server yet", code: "BOT_MISSING" });
        if (response.status === 429) return json(429, { error: "Too many requests. Try again in a moment." });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Bot API returned ${response.status}`);
        }

        const data = await response.json();
        return json(200, { success: true, ...data });
    } catch (error) {
        console.error("Error getting guild config:", error);
        return json(502, { error: "The bot is not responding. Try again in a moment." });
    }
};

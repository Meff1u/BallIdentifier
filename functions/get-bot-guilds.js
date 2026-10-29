/**
 * Servers the logged-in user administers, marked with whether the bot is there.
 * GET /.netlify/functions/get-bot-guilds  (session cookie)
 * -> { guilds: [{ id, name, icon, hasBot }], botListAvailable }
 */

const { botApiFetch } = require("../lib/bot-api");
const { json, requireSession, discordApi, isGuildAdmin, discordErrorResponse } = require("../lib/http");

exports.handler = async (event) => {
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

    const auth = requireSession(event);
    if (auth.response) return auth.response;

    try {
        const userGuilds = await discordApi("/users/@me/guilds", auth.session.token);
        if (!userGuilds.ok) return discordErrorResponse(userGuilds);

        const adminGuilds = (userGuilds.data || []).filter(isGuildAdmin);

        // Which of them have the bot (signed request; full bot list never leaves the server)
        let botGuildIds = null;
        const botResponse = await botApiFetch("/api/guilds").catch((error) => {
            console.error("Bot API request failed:", error.message);
            return null;
        });
        if (botResponse?.ok) {
            const data = await botResponse.json();
            botGuildIds = new Set((data.guilds || []).map((g) => g.id));
        } else if (botResponse) {
            console.error(`Bot API /api/guilds returned ${botResponse.status}`);
        }

        const guilds = adminGuilds
            .map((g) => ({
                id: g.id,
                name: g.name,
                icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null,
                hasBot: botGuildIds ? botGuildIds.has(g.id) : null,
            }))
            .sort((a, b) => Number(b.hasBot) - Number(a.hasBot) || a.name.localeCompare(b.name));

        return json(200, { guilds, botListAvailable: Boolean(botGuildIds) });
    } catch (error) {
        console.error("Error getting bot guilds:", error);
        return json(500, { error: "Could not load your servers" });
    }
};

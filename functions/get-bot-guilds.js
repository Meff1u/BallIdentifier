const { botApiFetch, botApiPublicFetch } = require('../lib/bot-api');

const ADMINISTRATOR = BigInt(8);

// Get list of guilds where the bot is present.
// Only returns guilds the logged-in user administers, so the full list of
// the bot's servers is never exposed to the client.
exports.handler = async (event) => {
    try {
        // Extract Discord access token from Authorization header
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Missing or invalid authorization header' })
            };
        }

        const discordToken = authHeader.substring(7);

        // Verify Discord token and get the guilds this user administers
        let adminGuildIds;
        try {
            const userGuildsResponse = await fetch('https://discord.com/api/v10/users/@me/guilds', {
                headers: {
                    'Authorization': `Bearer ${discordToken}`
                }
            });

            if (userGuildsResponse.status === 429) {
                return {
                    statusCode: 429,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ error: 'Too many requests' })
                };
            }

            if (!userGuildsResponse.ok) {
                return {
                    statusCode: 401,
                    body: JSON.stringify({ error: 'Invalid Discord token' })
                };
            }

            const userGuilds = await userGuildsResponse.json();
            adminGuildIds = new Set(
                userGuilds
                    .filter(g => (BigInt(g.permissions) & ADMINISTRATOR) === ADMINISTRATOR)
                    .map(g => g.id)
            );
        } catch (error) {
            console.error('Error verifying Discord token:', error);
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Failed to verify Discord token' })
            };
        }

        // Fetch guild list from bot API (signed request)
        const guildsResponse = await botApiFetch('/api/guilds').catch((error) => {
            console.error('Bot API request failed:', error.message);
            return null;
        });

        if (guildsResponse && guildsResponse.ok) {
            const data = await guildsResponse.json();

            // Return only the intersection: guilds with the bot AND administered by the user
            const guilds = (data.guilds || [])
                .filter(g => adminGuildIds.has(g.id))
                .map(g => ({ id: g.id }));

            // Extract and pass through rate limit headers
            const headers = { 'Content-Type': 'application/json' };
            const rateLimitLimit = guildsResponse.headers.get('X-RateLimit-Limit');
            const rateLimitRemaining = guildsResponse.headers.get('X-RateLimit-Remaining');
            const rateLimitReset = guildsResponse.headers.get('X-RateLimit-Reset');

            if (rateLimitLimit) headers['X-RateLimit-Limit'] = rateLimitLimit;
            if (rateLimitRemaining) headers['X-RateLimit-Remaining'] = rateLimitRemaining;
            if (rateLimitReset) headers['X-RateLimit-Reset'] = rateLimitReset;

            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({
                    success: true,
                    guilds: guilds,
                    total: guilds.length,
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Handle rate limit errors
        if (guildsResponse && guildsResponse.status === 429) {
            const errorData = await guildsResponse.json().catch(() => ({}));

            return {
                statusCode: 429,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: errorData.error || 'Too many requests'
                })
            };
        }

        if (guildsResponse) {
            console.error(`Bot API /api/guilds returned ${guildsResponse.status}`);
        }

        // Fallback: Try stats endpoint to verify bot is online.
        // guilds: null tells the dashboard the list is unknown.
        const statsResponse = await botApiPublicFetch('/api/stats').catch(() => null);

        if (statsResponse && statsResponse.ok) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: true,
                    guilds: null,
                    message: 'Bot is online, but could not fetch guild list (check BOT_API_SECRET)',
                    timestamp: new Date().toISOString()
                })
            };
        }

        return {
            statusCode: 503,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: false,
                error: 'Bot API is not responding',
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        console.error('Error getting bot guilds:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};

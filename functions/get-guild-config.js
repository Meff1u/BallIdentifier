// Get guild configuration from bot API
exports.handler = async (event) => {
    try {
        const { guildId } = event.queryStringParameters || {};
        const BOT_API_URL = 'http://fi11.bot-hosting.net:21302';
        const BOT_API_KEY = process.env.API_KEY;
        
        if (!guildId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'guildId parameter is required' })
            };
        }
        
        if (!BOT_API_KEY) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'BOT_API_KEY not configured' })
            };
        }
        
        // Extract Discord access token from Authorization header
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Missing or invalid authorization header' })
            };
        }
        
        const discordToken = authHeader.substring(7);
        
        // Verify user has access to this guild via Discord API
        try {
            const userGuildsResponse = await fetch('https://discord.com/api/v10/users/@me/guilds', {
                headers: {
                    'Authorization': `Bearer ${discordToken}`
                }
            });
            
            if (!userGuildsResponse.ok) {
                return {
                    statusCode: 401,
                    body: JSON.stringify({ error: 'Invalid Discord token' })
                };
            }
            
            const userGuilds = await userGuildsResponse.json();
            const hasAccessToGuild = userGuilds.some(g => g.id === guildId);
            
            if (!hasAccessToGuild) {
                return {
                    statusCode: 403,
                    body: JSON.stringify({ error: 'You do not have access to this guild' })
                };
            }
            
            // Check if user has admin permissions on this guild
            const userGuild = userGuilds.find(g => g.id === guildId);
            const permissions = BigInt(userGuild.permissions);
            const ADMINISTRATOR = BigInt(8);
            const hasAdmin = (permissions & ADMINISTRATOR) === ADMINISTRATOR;
            
            if (!hasAdmin) {
                return {
                    statusCode: 403,
                    body: JSON.stringify({ error: 'You do not have administrator permissions on this guild' })
                };
            }
        } catch (error) {
            console.error('Error verifying Discord token:', error);
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Failed to verify Discord token' })
            };
        }
        
        // Fetch guild config from bot API
        const response = await fetch(`${BOT_API_URL}/api/guilds/${guildId}/config`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${BOT_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        // Handle rate limit errors
        if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            const errorData = await response.json().catch(() => ({}));
            
            const headers = { 'Content-Type': 'application/json' };
            if (retryAfter) headers['Retry-After'] = retryAfter;
            
            return {
                statusCode: 429,
                headers: headers,
                body: JSON.stringify({
                    error: errorData.error || 'Too many requests',
                    retryAfter: retryAfter
                })
            };
        }
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Bot API returned ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Bot API Response:', JSON.stringify(data, null, 2));
        
        // Extract and pass through rate limit headers
        const headers = { 'Content-Type': 'application/json' };
        const rateLimitLimit = response.headers.get('X-RateLimit-Limit');
        const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
        const rateLimitReset = response.headers.get('X-RateLimit-Reset');
        
        if (rateLimitLimit) headers['X-RateLimit-Limit'] = rateLimitLimit;
        if (rateLimitRemaining) headers['X-RateLimit-Remaining'] = rateLimitRemaining;
        if (rateLimitReset) headers['X-RateLimit-Reset'] = rateLimitReset;
        
        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({
                success: true,
                ...data,
                timestamp: new Date().toISOString()
            })
        };
        
    } catch (error) {
        console.error('Error getting guild config:', error);
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

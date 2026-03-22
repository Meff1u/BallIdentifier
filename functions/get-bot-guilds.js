// Get list of guilds where the bot is present
exports.handler = async (event) => {
    try {
        const BOT_API_KEY = process.env.API_KEY;
        const BOT_API_URL = 'http://fi11.bot-hosting.net:21302';
        
        // Extract Discord access token from Authorization header
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Missing or invalid authorization header' })
            };
        }
        
        const discordToken = authHeader.substring(7);
        
        // Verify Discord token is valid
        try {
            const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
                headers: {
                    'Authorization': `Bearer ${discordToken}`
                }
            });
            
            if (!userResponse.ok) {
                return {
                    statusCode: 401,
                    body: JSON.stringify({ error: 'Invalid Discord token' })
                };
            }
        } catch (error) {
            console.error('Error verifying Discord token:', error);
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Failed to verify Discord token' })
            };
        }
        
        // Try to fetch guild list with API key
        const guildsResponse = await fetch(`${BOT_API_URL}/api/guilds`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${BOT_API_KEY}`,
                'Content-Type': 'application/json'
            }
        }).catch(() => null);
        
        if (guildsResponse && guildsResponse.ok) {
            const data = await guildsResponse.json();
            
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
                    guilds: data.guilds || [],
                    total: data.total || 0,
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
        
        // Fallback: Try stats endpoint to verify bot is online
        const statsResponse = await fetch(`${BOT_API_URL}/api/stats`);
        
        if (statsResponse && statsResponse.ok) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: true,
                    guilds: [],
                    message: 'Bot is online, but could not fetch guild list (API key may be missing)',
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

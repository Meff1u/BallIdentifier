// CSRF Protection: Validate Origin header
function isValidOrigin(event) {
    const origin = event.headers.origin || event.headers.Origin;
    const allowedOrigins = [
        'https://ballidentifier.xyz',
        'http://localhost:8888'
    ];
    
    return origin && allowedOrigins.includes(origin);
}

// Save guild configuration to bot API
exports.handler = async (event) => {
    try {
        // CORS response headers
        const responseHeaders = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': event.headers.origin || event.headers.Origin || '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Credentials': 'true'
        };
        
        // Handle CORS preflight
        if (event.httpMethod === 'OPTIONS') {
            return { statusCode: 200, headers: responseHeaders, body: '' };
        }
        
        // CSRF Protection: Reject invalid origins for POST requests
        if (event.httpMethod === 'POST' && !isValidOrigin(event)) {
            console.warn('Invalid origin: ' + (event.headers.origin || 'unknown'));
            return {
                statusCode: 403,
                headers: responseHeaders,
                body: JSON.stringify({ error: 'Invalid origin' })
            };
        }
        
        const { guildId, selectedBots, selectedRole, customMessage, isDelete } = JSON.parse(event.body || '{}');
        const BOT_API_URL = 'http://fi11.bot-hosting.net:21302';
        const BOT_API_KEY = process.env.API_KEY;
        
        // Validate required fields
        if (!guildId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ 
                    error: 'Missing required field: guildId' 
                })
            };
        }
        
        // If not deleting, validate required configuration fields
        if (!isDelete && (!selectedBots || !selectedRole || !customMessage)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ 
                    error: 'Missing required fields: selectedBots, selectedRole, customMessage' 
                })
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
        
        let setupBy = 'Unknown';
        
        // Verify user has access to this guild and has admin permissions
        try {
            // Get user info
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
            
            const user = await userResponse.json();
            setupBy = user.username;
            
            // Get user guilds
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
            const userGuild = userGuilds.find(g => g.id === guildId);
            
            if (!userGuild) {
                return {
                    statusCode: 403,
                    body: JSON.stringify({ error: 'You do not have access to this guild' })
                };
            }
            
            // Check if user has admin permissions on this guild
            const permissions = BigInt(userGuild.permissions);
            const ADMINISTRATOR = BigInt(8);
            const hasAdmin = (permissions & ADMINISTRATOR) === ADMINISTRATOR;
            
            if (!hasAdmin) {
                return {
                    statusCode: 403,
                    body: JSON.stringify({ error: 'You do not have administrator permissions on this guild' })
                };
            }
            
            // Use user username for setupBy
            setupBy = user.username;
        } catch (error) {
            console.error('Error verifying Discord token:', error);
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Failed to verify Discord token' })
            };
        }
        
        // Send configuration to bot API
        const requestBody = isDelete 
            ? { isDelete: true }
            : {
                selectedBots: selectedBots,
                selectedRole: selectedRole,
                customMessage: customMessage,
                setupBy: setupBy,
                setupAt: new Date().getTime()
            };
        
        const response = await fetch(`${BOT_API_URL}/api/guilds/${guildId}/config`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${BOT_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
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
                message: 'Configuration saved successfully',
                ...data
            })
        };
        
    } catch (error) {
        console.error('Error saving guild config:', error);
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

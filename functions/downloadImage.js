const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const url_module = require('url');

// API Key validation middleware
function validateApiKey(event) {
  const providedKey = event.headers?.['x-api-key'] || (event.body && JSON.parse(event.body).api_key);
  const validKey = process.env.API_KEY;
  
  if (!validKey) {
    console.error('API_KEY environment variable not set');
    return { valid: false, error: 'Server configuration error' };
  }
  
  if (!providedKey) {
    return { valid: false, error: 'API key required' };
  }
  
  if (providedKey !== validKey) {
    return { valid: false, error: 'Invalid API key' };
  }
  
  return { valid: true };
}

// Whitelist allowed domains for image downloads (SSRF prevention)
const ALLOWED_DOMAINS = [
    'cdn.discordapp.com',
    'discord.com',
    'canary.discord.com',
    'ptb.discord.com',
    'canary.discordapp.com',
    'ptb.discordapp.com',
];

function isValidImageUrl(urlString) {
    try {
        const parsedUrl = new url_module.URL(urlString);
        
        // Only allow HTTPS
        if (parsedUrl.protocol !== 'https:') {
            return false;
        }
        
        // Check if domain is in whitelist
        const hostname = parsedUrl.hostname;
        const isAllowed = ALLOWED_DOMAINS.some(domain => 
            hostname === domain || hostname.endsWith('.' + domain)
        );
        
        if (!isAllowed) {
            console.warn('Domain not whitelisted: ' + hostname);
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Invalid URL format: ' + urlString);
        return false;
    }
}

exports.handler = async function(event, context) {
    try {
        // Validate API key
        const apiKeyValidation = validateApiKey(event);
        if (!apiKeyValidation.valid) {
            return {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: apiKeyValidation.error })
            };
        }

        const { url } = JSON.parse(event.body);

        // Validate URL before fetching (SSRF prevention)
        if (!url || typeof url !== 'string') {
            throw new Error('Invalid URL parameter');
        }
        
        if (!isValidImageUrl(url)) {
            throw new Error('URL not allowed or invalid protocol');
        }

        console.log('Fetching image from: ' + url);
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        
        console.log(`Response status: ${response.status}`);
        console.log(`Content-Type: ${response.headers.get('content-type')}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.startsWith('image/')) {
            throw new Error(`Invalid content type: ${contentType}. Expected an image.`);
        }

        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
            throw new Error('Image too large (>10MB)');
        }

        const blob = await response.blob();
        
        if (blob.size === 0) {
            throw new Error('Received empty response');
        }
        
        if (blob.size < 100) {
            throw new Error('Response too small to be a valid image');
        }
        
        console.log(`Successfully downloaded image. Size: ${blob.size} bytes, Type: ${blob.type}`);
        
        const buffer = await blob.arrayBuffer();

        return {
            statusCode: 200,
            headers: {
                'Content-Type': blob.type,
                'Content-Disposition': 'attachment; filename="downloaded_image.png"'
            },
            body: Buffer.from(buffer).toString('base64'),
            isBase64Encoded: true
        };
    } catch (error) {
        console.error("Error downloading the image:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
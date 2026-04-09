const fs = require('fs');
const path = require('path');
const url_module = require('url');

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

async function downloadImage(imageUrl) {
    try {
        const fetchFn = (await import('node-fetch')).default;
        
        if (!imageUrl || typeof imageUrl !== 'string') {
            throw new Error('Invalid URL parameter');
        }
        
        if (!isValidImageUrl(imageUrl)) {
            throw new Error('URL not allowed or invalid protocol');
        }

        console.log('Fetching image from: ' + imageUrl);
        
        const response = await fetchFn(imageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        
        console.log(`Response status: ${response.status}`);
        console.log(`Content-Type: ${response.headers.get('content-type')}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText} (make sure the URL is encoded with encodeURIComponent() if it contains query parameters)`);
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
        return Buffer.from(buffer);
    } catch (error) {
        console.error("Error downloading the image:", error);
        throw error;
    }
}

async function callCompareImageFunction(imageBuffer, dex) {
    try {
        const FormData = (await import('form-data')).default;
        const fetchFn = (await import('node-fetch')).default;
        const formData = new FormData();
        
        formData.append('file', imageBuffer, 'image');
        formData.append('dex', dex);
        
        const isNetlify = process.env.URL && !process.env.URL.includes('localhost');
        const compareImageUrl = isNetlify 
            ? `${process.env.URL}/.netlify/functions/compareImage` 
            : 'http://localhost:8888/.netlify/functions/compareImage';
        
        // Call local compareImage function
        const response = await fetchFn(compareImageUrl, {
            method: 'POST',
            headers: formData.getHeaders(),
            body: formData
        });

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'compareImage function failed');
        }

        return result;
    } catch (error) {
        console.error('compareImage call error:', error);
        throw error;
    }
}

exports.handler = async (event) => {
    try {
        const jsonsPath = path.join(process.cwd(), 'assets/jsons');
        
        // Load available dexes
        const dexesConfig = JSON.parse(fs.readFileSync(path.join(jsonsPath, 'dexes.json'), 'utf8'));
        const availableDexes = dexesConfig.dexes;

        // Parse query parameters manually from rawQueryString to preserve full URLs with query params
        let url, dex;
        
        if (event.rawQueryString) {
            // Parse raw query string manually to preserve URL query params
            const params = new url_module.URLSearchParams(event.rawQueryString);
            url = params.get('url');
            dex = params.get('dex');
        } else {
            // Fallback to queryStringParameters
            const queryParams = event.queryStringParameters || {};
            url = queryParams.url;
            dex = queryParams.dex;
        }

        // Decode URL if encoded
        if (url) {
            try {
                url = decodeURIComponent(url);
            } catch (e) {
                // URL might not be encoded, use as-is
            }
        }

        // Validate parameters
        if (!url || !dex) {
            const exampleUrl = 'https://cdn.discordapp.com/attachments/123/456/image.png';
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({
                    error: 'Missing required parameters',
                    message: 'Both "url" and "dex" parameters are required. URL should be encoded with encodeURIComponent()',
                    availableDexes: availableDexes,
                    examples: availableDexes.slice(0, 5).map(d => ({
                        dex: d,
                        url: `/.netlify/functions/findBall?url=${encodeURIComponent(exampleUrl)}&dex=${d}`
                    }))
                })
            };
        }

        // Validate dex exists
        if (!availableDexes.includes(dex)) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({
                    error: 'Invalid dex',
                    message: `Dex "${dex}" not found`,
                    availableDexes: availableDexes
                })
            };
        }

        console.log(`Processing request: url=${url}, dex=${dex}`);

        // Step 1: Download image from URL
        console.log('Step 1: Downloading image...');
        const imageBuffer = await downloadImage(url);

        // Step 2: Send to compareImage function
        console.log('Step 2: Sending to compareImage...');
        const comparisonResult = await callCompareImageFunction(imageBuffer, dex);

        console.log('Final result:', comparisonResult);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: true,
                name: comparisonResult.country,
                diff: comparisonResult.diff,
                dex: dex
            })
        };

    } catch (error) {
        console.error('Handler error:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                error: 'Error processing request',
                message: error.message
            })
        };
    }
};

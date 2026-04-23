const fs = require('fs');
const path = require('path');
const url_module = require('url');

// API Key validation middleware
function validateApiKey(event) {
  const providedKey = event.headers?.['x-api-key'] || event.queryStringParameters?.api_key;
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

async function downloadImageFromEndpoint(imageUrl, apiKey) {
    try {
        const fetchFn = (await import('node-fetch')).default;
        
        if (!imageUrl || typeof imageUrl !== 'string') {
            throw new Error('Invalid URL parameter');
        }

        console.log('Calling downloadImage endpoint for: ' + imageUrl);
        
        const isNetlify = process.env.URL && !process.env.URL.includes('localhost');
        const downloadEndpointUrl = isNetlify 
            ? `${process.env.URL}/.netlify/functions/downloadImage` 
            : 'http://localhost:8888/.netlify/functions/downloadImage';
        
        const response = await fetchFn(downloadEndpointUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify({ url: imageUrl }),
            timeout: 10000
        });
        
        console.log(`Download endpoint response status: ${response.status}`);
        
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Failed to download image: ${response.status} ${response.statusText} - ${errorBody}`);
        }

        const imageData = await response.json();
        
        if (!imageData.body) {
            throw new Error('No image data in response');
        }
        
        // Decode base64 image
        const buffer = Buffer.from(imageData.body, 'base64');
        console.log(`Successfully downloaded image. Size: ${buffer.length} bytes`);
        
        return buffer;
    } catch (error) {
        console.error("Error downloading the image:", error);
        throw error;
    }
}

async function callCompareImageFunction(imageBuffer, dex, apiKey) {
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
        
        console.log('Calling compareImage endpoint...');
        
        // Call compareImage function with API key
        const response = await fetchFn(compareImageUrl, {
            method: 'POST',
            headers: {
                ...formData.getHeaders(),
                'x-api-key': apiKey
            },
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
    console.log("Received event.");
    try {
        // Validate API key
        const apiKeyValidation = validateApiKey(event);
        if (!apiKeyValidation.valid) {
            console.warn("API key validation failed:", apiKeyValidation.error);
            console.warn(event);
            return {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: apiKeyValidation.error })
            };
        }

        const apiKey = event.headers?.['x-api-key'] || event.queryStringParameters?.api_key;
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

        const dexJson = JSON.parse(fs.readFileSync(path.join(jsonsPath, `${dex}.json`), 'utf8'));

        console.log(`Processing request: url=${url}, dex=${dex}`);

        // Step 1: Download image from URL via downloadImage endpoint
        console.log('Step 1: Downloading image from endpoint...');
        const imageBuffer = await downloadImageFromEndpoint(url, apiKey);

        // Step 2: Send to compareImage endpoint
        console.log('Step 2: Sending to compareImage endpoint...');
        const comparisonResult = await callCompareImageFunction(imageBuffer, dex, apiKey);

        console.log('Final result:', comparisonResult);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: true,
                name: comparisonResult.country,
                diff: comparisonResult.diff,
                extras: dexJson[comparisonResult.country]
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

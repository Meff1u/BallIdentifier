const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

exports.handler = async function(event, context) {
    try {
        const { url } = JSON.parse(event.body);

        console.log(`Fetching image from: ${url}`);
        
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
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

exports.handler = async function(event, context) {
    try {
        const { url } = JSON.parse(event.body);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch image from URL: ${url}`);
        }

        const blob = await response.blob();
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
const { checkApiKey } = require("../lib/api-key");
const { downloadImage, errorToResponse } = require("../lib/identify-core");

function parseBody(event) {
    try {
        return JSON.parse(event.body || "{}");
    } catch {
        return {};
    }
}

/**
 * Download an image from a whitelisted Discord CDN URL (body: { url }).
 * Requires x-api-key (or api_key in the body). Returns the image (base64-encoded).
 */
exports.handler = async (event) => {
    const body = parseBody(event);
    const authError = checkApiKey(event, event.headers?.["x-api-key"] || body.api_key);
    if (authError) return authError;

    try {
        const { buffer, contentType } = await downloadImage(body.url);
        return {
            statusCode: 200,
            headers: {
                "Content-Type": contentType,
                "Content-Disposition": 'attachment; filename="downloaded_image.png"',
            },
            body: buffer.toString("base64"),
            isBase64Encoded: true,
        };
    } catch (error) {
        return errorToResponse(error);
    }
};

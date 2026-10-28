const { checkApiKey } = require("../lib/api-key");
const { getAvailableDexes, identifyUrl, errorToResponse } = require("../lib/identify-core");

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

/**
 * Identify a ball from an image URL.
 * GET /.netlify/functions/findBall?url=<encoded Discord CDN url>&dex=<dex>
 * Requires x-api-key (or ?api_key=). Response: { success, name, diff, extras }
 */
exports.handler = async (event) => {
    const authError = checkApiKey(event, event.headers?.["x-api-key"] || event.queryStringParameters?.api_key);
    if (authError) return authError;

    try {
        // Parse the raw query string so full URLs with their own query params are preserved
        const params = event.rawQueryString
            ? new URLSearchParams(event.rawQueryString)
            : new URLSearchParams(event.queryStringParameters || {});
        let url = params.get("url");
        const dex = params.get("dex");

        // Decode URL if it was double-encoded
        if (url) {
            try {
                url = decodeURIComponent(url);
            } catch {
                // Not encoded - use as-is
            }
        }

        if (!url || !dex) {
            const availableDexes = getAvailableDexes();
            const exampleUrl = "https://cdn.discordapp.com/attachments/123/456/image.png";
            return {
                statusCode: 400,
                headers: { "Content-Type": "application/json", ...CORS_HEADERS },
                body: JSON.stringify({
                    error: "Missing required parameters",
                    message: 'Both "url" and "dex" parameters are required. URL should be encoded with encodeURIComponent()',
                    availableDexes,
                    examples: availableDexes.slice(0, 5).map((d) => ({
                        dex: d,
                        url: `/.netlify/functions/findBall?url=${encodeURIComponent(exampleUrl)}&dex=${d}`,
                    })),
                }),
            };
        }

        const result = await identifyUrl(url, dex);
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS },
            body: JSON.stringify({
                success: true,
                name: result.country,
                diff: result.diff,
                extras: result.extras,
            }),
        };
    } catch (error) {
        return errorToResponse(error, CORS_HEADERS);
    }
};

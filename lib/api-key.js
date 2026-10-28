const crypto = require("crypto");

/**
 * Constant-time string comparison (prevents timing attacks on API keys).
 */
function safeEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Minimal, non-sensitive request info for logs (never log full event: it contains headers with keys/tokens).
 */
function describeRequest(event) {
    return {
        method: event.httpMethod,
        path: event.path,
        ip: (event.headers?.["x-forwarded-for"] || "").split(",")[0].trim() || "unknown",
    };
}

/**
 * Check a provided API key against env API_KEY.
 * @returns {null | {statusCode: number, headers: object, body: string}} null when valid, otherwise a 401/500 response
 */
function checkApiKey(event, providedKey) {
    const validKey = process.env.API_KEY;

    let error = null;
    if (!validKey) {
        console.error("API_KEY environment variable not set");
        error = "Server configuration error";
    } else if (!providedKey) {
        error = "API key required";
    } else if (!safeEqual(providedKey, validKey)) {
        error = "Invalid API key";
    }

    if (!error) return null;

    console.warn("API key validation failed:", error, describeRequest(event));
    return {
        statusCode: validKey ? 401 : 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error }),
    };
}

module.exports = { safeEqual, describeRequest, checkApiKey };

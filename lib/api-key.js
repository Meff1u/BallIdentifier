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

module.exports = { safeEqual, describeRequest };

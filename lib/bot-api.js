const crypto = require("crypto");

function getBotApiUrl() {
    const url = process.env.BOT_API_URL;
    if (!url) throw new Error("BOT_API_URL not configured");
    return url.replace(/\/+$/, "");
}

function signRequest(method, path, rawBody, timestamp) {
    const secret = process.env.BOT_API_SECRET;
    if (!secret) throw new Error("BOT_API_SECRET not configured");

    return crypto
        .createHmac("sha256", secret)
        .update(`${timestamp}.${method}.${path}.${rawBody}`)
        .digest("hex");
}

/**
 * Signed request to the bot API.
 * @param {string} path
 * @param {{ method?: string, body?: object }} options
 * @returns {Promise<Response>}
 */
async function botApiFetch(path, { method = "GET", body } = {}) {
    const rawBody = body ? JSON.stringify(body) : "";
    const timestamp = Date.now().toString();
    const signature = signRequest(method, path, rawBody, timestamp);

    return fetch(`${getBotApiUrl()}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            "X-Timestamp": timestamp,
            "X-Signature": signature,
        },
        body: rawBody || undefined,
    });
}

/**
 * Unsigned request for public bot endpoints (e.g. /api/stats).
 */
async function botApiPublicFetch(path) {
    return fetch(`${getBotApiUrl()}${path}`, {
        method: "GET",
        headers: { Accept: "application/json" },
    });
}

function encryptForBot(plaintext, purpose = "ballsdex-api-key") {
    const secret = process.env.BOT_API_SECRET;
    if (!secret) throw new Error("BOT_API_SECRET not configured");

    const key = Buffer.from(crypto.hkdfSync("sha256", secret, "ballidentifier", purpose, 32));
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const value = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
    return {
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        value: value.toString("base64"),
    };
}

module.exports = { botApiFetch, botApiPublicFetch, encryptForBot };

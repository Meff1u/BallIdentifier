/**
 * Small helpers shared by the website's Netlify functions.
 */

const { getSession } = require("./session");

const ALLOWED_ORIGINS = ["https://ballidentifier.xyz", "https://www.ballidentifier.xyz", "http://localhost:8888", "http://127.0.0.1:8888"];
const SNOWFLAKE = /^\d{17,20}$/;

function json(statusCode, body, { headers = {}, cookies = [] } = {}) {
    const response = {
        statusCode,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
        body: JSON.stringify(body),
    };
    if (cookies.length) response.multiValueHeaders = { "Set-Cookie": cookies };
    return response;
}

function redirect(location, cookies = []) {
    const response = { statusCode: 302, headers: { Location: location, "Cache-Control": "no-store" }, body: "" };
    if (cookies.length) response.multiValueHeaders = { "Set-Cookie": cookies };
    return response;
}

/** CSRF protection for state-changing requests: the Origin header must be our own site. */
function isAllowedOrigin(event) {
    const origin = event.headers?.origin || event.headers?.Origin;
    return Boolean(origin) && ALLOWED_ORIGINS.includes(origin);
}

function parseJsonBody(event) {
    try {
        const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body;
        const body = JSON.parse(raw || "{}");
        return body && typeof body === "object" && !Array.isArray(body) ? body : {};
    } catch {
        return null;
    }
}

/**
 * Resolve the logged-in session or return a ready 401 response.
 * @returns {{session: object} | {response: object}}
 */
function requireSession(event) {
    let session;
    try {
        session = getSession(event);
    } catch (error) {
        console.error("Session error:", error.message);
        return { response: json(500, { error: "Server configuration error" }) };
    }
    if (!session) return { response: json(401, { error: "Not logged in", code: "LOGIN_REQUIRED" }) };
    return { session };
}

/** Call a Discord API endpoint with the user's OAuth token. */
async function discordApi(path, token) {
    const response = await fetch(`https://discord.com/api/v10${path}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    let data = null;
    try {
        data = await response.json();
    } catch {
        // ignore
    }
    return { ok: response.ok, status: response.status, data };
}

const ADMINISTRATOR = 8n;
function isGuildAdmin(guild) {
    try {
        return guild.owner === true || (BigInt(guild.permissions) & ADMINISTRATOR) === ADMINISTRATOR;
    } catch {
        return false;
    }
}

/** Map a failed Discord call to a response for the page. */
function discordErrorResponse(result) {
    if (result.status === 401) return json(401, { error: "Your Discord session expired. Please log in again.", code: "LOGIN_REQUIRED" });
    if (result.status === 429) return json(429, { error: "Discord is rate limiting requests. Try again in a moment." });
    return json(502, { error: "Could not reach Discord. Try again in a moment." });
}

module.exports = {
    ALLOWED_ORIGINS,
    SNOWFLAKE,
    json,
    redirect,
    isAllowedOrigin,
    parseJsonBody,
    requireSession,
    discordApi,
    isGuildAdmin,
    discordErrorResponse,
};

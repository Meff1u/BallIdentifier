/**
 * Discord login session for Netlify functions.
 *
 * The session (Discord access token + basic user info) lives in an encrypted,
 * HttpOnly cookie, so page scripts can never read the token (XSS-safe).
 * Encryption: AES-256-GCM with a key derived from env SESSION_SECRET.
 */

const crypto = require("crypto");

const SESSION_COOKIE = "bi_session";
const STATE_COOKIE = "bi_oauth_state";
const DEFAULT_SESSION_MAX_AGE = 7 * 24 * 60 * 60; // seconds (Discord tokens last 7 days)
const STATE_MAX_AGE = 10 * 60; // seconds

function getKey(purpose) {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error("SESSION_SECRET not configured (min. 32 characters)");
    }
    return crypto.createHash("sha256").update(`${purpose}:${secret}`).digest();
}

/** Encrypt a JSON value into a URL-safe string. */
function seal(value, purpose = "session") {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", getKey(purpose), iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

/** Decrypt a value produced by seal(); returns null when invalid or tampered. */
function unseal(token, purpose = "session") {
    try {
        const [iv, tag, data] = String(token).split(".").map((part) => Buffer.from(part, "base64url"));
        if (!iv || !tag || !data || iv.length !== 12 || tag.length !== 16) return null;
        const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(purpose), iv);
        decipher.setAuthTag(tag);
        return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"));
    } catch {
        return null;
    }
}

function parseCookies(event) {
    const header = event.headers?.cookie || event.headers?.Cookie || "";
    const cookies = {};
    for (const part of header.split(";")) {
        const index = part.indexOf("=");
        if (index < 0) continue;
        const name = part.slice(0, index).trim();
        if (name) cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
    }
    return cookies;
}

function isLocalRequest(event) {
    const host = String(event.headers?.host || "").split(":")[0];
    return host === "localhost" || host === "127.0.0.1";
}

/**
 * Discord redirect URI: env REDIRECT_URI wins; local `netlify dev` (localhost/127.0.0.1)
 * uses its own host so the state cookie and the callback live on the same origin.
 * The URI must be listed in the Discord application's OAuth2 redirects.
 */
function getRedirectUri(event) {
    if (process.env.REDIRECT_URI) return process.env.REDIRECT_URI;
    if (event && isLocalRequest(event)) {
        const host = String(event.headers?.host || "localhost:8888");
        return `http://${host}/.netlify/functions/discord-oauth-callback`;
    }
    return "https://ballidentifier.xyz/.netlify/functions/discord-oauth-callback";
}

/** Names of env vars login needs but doesn't have (never their values). */
function missingLoginConfig() {
    const missing = [];
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) missing.push("SESSION_SECRET");
    if (!process.env.DISCORD_CLIENT_SECRET) missing.push("DISCORD_CLIENT_SECRET");
    return missing;
}

function cookie(name, value, { maxAge, event } = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
    // Browsers accept Secure cookies on http://localhost, but keep local dev working everywhere
    if (!event || !isLocalRequest(event)) parts.push("Secure");
    if (maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
    return parts.join("; ");
}

function clearCookie(name, event) {
    return cookie(name, "", { maxAge: 0, event });
}

/**
 * @returns {null | {user: {id, username, globalName, avatar}, token: string, exp: number}}
 */
function getSession(event) {
    const raw = parseCookies(event)[SESSION_COOKIE];
    if (!raw) return null;
    const session = unseal(raw, "session");
    if (!session?.user?.id || !session.token || !session.exp || session.exp < Date.now()) return null;
    return session;
}

function createSessionCookie(event, { user, token, expiresIn }) {
    const maxAge = Math.min(Number(expiresIn) || DEFAULT_SESSION_MAX_AGE, DEFAULT_SESSION_MAX_AGE);
    const value = seal({ user, token, exp: Date.now() + maxAge * 1000 }, "session");
    return cookie(SESSION_COOKIE, value, { maxAge, event });
}

function avatarUrl(user) {
    if (user.avatar) {
        const ext = user.avatar.startsWith("a_") ? "gif" : "png";
        return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=128`;
    }
    const index = Number((BigInt(user.id) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

/** Public, non-secret view of the session user (safe to send to the page). */
function publicUser(session) {
    const { user } = session;
    return {
        id: user.id,
        username: user.username,
        displayName: user.globalName || user.username,
        avatarUrl: avatarUrl(user),
    };
}

module.exports = {
    SESSION_COOKIE,
    STATE_COOKIE,
    STATE_MAX_AGE,
    seal,
    unseal,
    parseCookies,
    cookie,
    clearCookie,
    getSession,
    createSessionCookie,
    publicUser,
    getRedirectUri,
    missingLoginConfig,
};

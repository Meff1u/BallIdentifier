/**
 * Owner-only dex entry editing (Spawn Arts tab). The bot does the work: it builds the art preview
 * and hash, and commits the change (with a changelog entry) to the GitHub repo.
 *
 * POST /.netlify/functions/dex-admin
 *   { action: "save", dex, originalName?, name, details, image?: base64, shift?: "higher" | "same", previousAlt?: string, previousUntil?: string }
 *   { action: "delete", dex, name }
 */

const { botApiFetch } = require("../lib/bot-api");
const { json, requireSession, isAllowedOrigin, parseJsonBody } = require("../lib/http");

const OWNER_ID = "334411435633541121";
const MAX_BODY = 7 * 1024 * 1024;

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    const auth = requireSession(event);
    if (auth.response) return auth.response;
    if (auth.session.user.id !== OWNER_ID) return json(403, { error: "Owner only" });
    if (!isAllowedOrigin(event)) return json(403, { error: "Invalid origin" });
    if ((event.body || "").length > MAX_BODY) return json(413, { error: "The image is too big." });

    const body = parseJsonBody(event);
    if (!body || typeof body.dex !== "string" || typeof body.name !== "string") return json(400, { error: "Invalid request" });

    let path;
    let payload;
    if (body.action === "save") {
        path = "save";
        payload = {
            dex: body.dex,
            originalName: typeof body.originalName === "string" ? body.originalName : null,
            name: body.name,
            details: body.details && typeof body.details === "object" ? body.details : {},
            image: typeof body.image === "string" && body.image ? body.image : null,
            shift: body.shift === "higher" || body.shift === "same" ? body.shift : null,
            previousAlt: typeof body.previousAlt === "string" ? body.previousAlt.slice(0, 200) : "",
            previousUntil: typeof body.previousUntil === "string" ? body.previousUntil.slice(0, 60) : "",
        };
    } else if (body.action === "delete") {
        path = "delete";
        payload = { dex: body.dex, name: body.name };
    } else {
        return json(400, { error: "Unknown action" });
    }

    try {
        const response = await botApiFetch(`/api/users/${OWNER_ID}/dex/${path}`, { method: "POST", body: payload });
        const data = await response.json().catch(() => ({}));
        if (response.status >= 500 && typeof data.error !== "string") return json(502, { error: "The bot is not responding. Try again in a moment." });
        return json(response.status, data);
    } catch (error) {
        console.error("Dex admin function error:", error);
        return json(502, { error: "The bot is not responding. Try again in a moment." });
    }
};

/**
 * GitHub push webhook: a push to the website repo deploys the website (replaces Netlify's deploy-on-push).
 *
 * POST /.netlify/functions/github-webhook   (GitHub webhook, content type application/json, event "push")
 *
 * - The request is signed by GitHub (X-Hub-Signature-256, HMAC-SHA256 of the body with GITHUB_WEBHOOK_SECRET).
 * - Pushes whose commits all carry the bot's "[skip deploy]" marker (dex edits, see the bot's utils/deploy.js) are ignored:
 *   those wait for the owner's Deploy button in Moderation -> Deploy.
 * - Any other push asks the bot to deploy (same call as the Deploy button): the bot writes the waiting changelog entries,
 *   then tells the website container to git pull and restart. The answer goes out first, the deploy follows a moment later,
 *   because the restart would cut the response off.
 */

const crypto = require("crypto");
const { botApiFetch } = require("../lib/bot-api");
const { json } = require("../lib/http");

const OWNER_ID = "334411435633541121";
const SKIP_MARKER = "[skip deploy]";
const DEPLOY_DELAY_MS = 1500;

function header(event, name) {
    const headers = event.headers || {};
    const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
    return key ? String(headers[key]) : "";
}

function validSignature(secret, rawBody, signature) {
    const expected = Buffer.from(`sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`);
    const given = Buffer.from(signature);
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const secret = process.env.GITHUB_WEBHOOK_SECRET || "";
    if (secret.length < 16) {
        console.error("[github-webhook] GITHUB_WEBHOOK_SECRET isn't set (at least 16 characters)");
        return json(503, { error: "Webhook isn't configured" });
    }

    const rawBody = Buffer.from(event.body || "", event.isBase64Encoded ? "base64" : "utf8");
    if (!validSignature(secret, rawBody, header(event, "x-hub-signature-256"))) return json(401, { error: "Invalid signature" });

    const type = header(event, "x-github-event");
    if (type === "ping") return json(200, { ok: true });
    if (type !== "push") return json(202, { ignored: `event ${type}` });

    let payload;
    try {
        payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
        return json(400, { error: "Invalid JSON" });
    }

    const branch = process.env.GITHUB_BRANCH || "main";
    if (payload.ref !== `refs/heads/${branch}`) return json(202, { ignored: "other branch" });
    const commits = Array.isArray(payload.commits) ? payload.commits : [];
    if (payload.deleted || !commits.length) return json(202, { ignored: "no commits" });
    if (commits.every((commit) => String(commit.message || "").includes(SKIP_MARKER))) return json(202, { ignored: "bot commits wait for Deploy" });

    setTimeout(() => {
        botApiFetch(`/api/users/${OWNER_ID}/admin/deploy`, { method: "POST", body: {} })
            .then((response) => {
                if (!response.ok) console.error("[github-webhook] deploy request failed:", response.status);
            })
            .catch((error) => console.error("[github-webhook] deploy request failed:", error.message));
    }, DEPLOY_DELAY_MS);

    return json(202, { deploying: true });
};

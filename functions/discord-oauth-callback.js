/**
 * Discord OAuth callback.
 * Verifies the state cookie, exchanges the code for a token, stores the session
 * in an encrypted HttpOnly cookie and sends the user back to the page they came from.
 */

const { STATE_COOKIE, unseal, parseCookies, clearCookie, createSessionCookie, getRedirectUri } = require("../lib/session");
const { redirect } = require("../lib/http");

const DISCORD_CLIENT_ID = "510775326310268930";

exports.handler = async (event) => {
    if (event.httpMethod !== "GET") {
        return { statusCode: 405, body: "Method not allowed" };
    }

    const clearState = clearCookie(STATE_COOKIE, event);
    const fail = (reason) => redirect(`/#/bot?login=${encodeURIComponent(reason)}`, [clearState]);

    try {
        const { code, state, error } = event.queryStringParameters || {};
        if (error) return fail(error === "access_denied" ? "cancelled" : "error");
        if (!code || !state) return fail("error");

        // CSRF: the state must match the one we stored in the HttpOnly cookie
        const stored = unseal(parseCookies(event)[STATE_COOKIE] || "", "oauth-state");
        if (!stored || stored.state !== state || !stored.exp || stored.exp < Date.now()) {
            return fail("expired");
        }

        const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET || "",
                code,
                grant_type: "authorization_code",
                redirect_uri: getRedirectUri(event),
            }),
        });

        if (!tokenResponse.ok) {
            console.error("Discord token exchange failed:", tokenResponse.status, await tokenResponse.text());
            return fail("error");
        }

        const tokenData = await tokenResponse.json();
        const userResponse = await fetch("https://discord.com/api/v10/users/@me", {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (!userResponse.ok) return fail("error");
        const user = await userResponse.json();

        const sessionCookie = createSessionCookie(event, {
            user: {
                id: user.id,
                username: user.username,
                globalName: user.global_name || null,
                avatar: user.avatar || null,
            },
            token: tokenData.access_token,
            expiresIn: tokenData.expires_in,
        });

        return redirect(`/${stored.returnTo || "#/bot"}`, [sessionCookie, clearState]);
    } catch (error) {
        console.error("OAuth callback error:", error);
        return fail("error");
    }
};

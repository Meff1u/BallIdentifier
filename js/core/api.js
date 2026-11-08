/**
 * fetch wrapper for our functions (/.netlify/functions/*). Always same-origin, always JSON.
 * Throws ApiError with .status, .code and .data so views can branch on them.
 */

export class ApiError extends Error {
    constructor(message, status, data = {}) {
        super(message);
        this.status = status;
        this.code = data.code || null;
        this.data = data;
    }
}

const FN = "/.netlify/functions/";

export async function api(name, { method = "GET", body, query, signal } = {}) {
    const url = new URL(FN + name, location.origin);
    if (query) for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

    let response;
    try {
        response = await fetch(url, {
            method,
            signal,
            credentials: "same-origin",
            headers: body ? { "Content-Type": "application/json" } : undefined,
            body: body ? JSON.stringify(body) : undefined,
        });
    } catch (error) {
        if (error.name === "AbortError") throw error;
        throw new ApiError("You seem to be offline. Check your connection and try again.", 0);
    }

    const text = await response.text();
    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        // A proxy error page (Cloudflare's 502 and the like) is HTML, not something to show to a person
        data = /^\s*</.test(text) ? { gateway: true } : { error: text };
    }

    if (!response.ok) {
        const message = data.error || data.message || defaultMessage(response.status);
        throw new ApiError(message, response.status, data);
    }
    return data;
}

function defaultMessage(status) {
    if (status === 401) return "Your session has expired. Log in again.";
    if (status === 403) return "You don't have access to that.";
    if (status === 429) return "Too many requests. Try again in a moment.";
    if (status === 502 || status === 504 || status === 524) return `The server took too long or is restarting (error ${status}). Try again in a moment.`;
    if (status >= 500) return "The server is not responding. Try again in a moment.";
    return "Something went wrong. Try again.";
}

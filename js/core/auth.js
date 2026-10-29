/**
 * Discord login state. The session lives in an HttpOnly cookie; the page only
 * ever sees the public user ({ id, username, displayName, avatarUrl }).
 */

import { api } from "./api.js";

let user = null;
let loaded = null;
let ready = false;
const listeners = new Set();

export function sessionReady() {
    return ready;
}

export function getUser() {
    return user;
}

export function onAuthChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

function emit() {
    for (const fn of listeners) fn(user);
}

export function loadSession(force = false) {
    if (loaded && !force) return loaded;
    loaded = api("auth", { query: { action: "session" } })
        .then((data) => {
            user = data.user || null;
        })
        .catch(() => {
            user = null;
        })
        .then(() => {
            ready = true;
            emit();
            return user;
        });
    return loaded;
}

/** The view the user should come back to after Discord. */
function currentReturnTo() {
    const hash = location.hash.split("?")[0];
    return /^#\/(identify|arts|trainer|bot|ballsdex)(\/[\w-]{0,40}){0,2}$/.test(hash) ? hash : "#/bot";
}

export function loginUrl(returnTo = currentReturnTo()) {
    return `/.netlify/functions/auth?action=login&returnTo=${encodeURIComponent(returnTo)}`;
}

export function login(returnTo) {
    location.href = loginUrl(returnTo);
}

export async function logout() {
    try {
        await api("auth", { method: "POST", query: { action: "logout" } });
    } finally {
        user = null;
        emit();
    }
}

/** Called when an API call says the session is gone. */
export function sessionExpired() {
    if (!user) return;
    user = null;
    emit();
}

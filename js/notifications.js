/**
 * Notifications: bell in the top bar with an unread count, a history drawer and a settings panel
 * (each type on/off for the website, plus an optional Discord DM). Stored by the bot.
 */

import { h, icon, timeAgo } from "./core/dom.js";
import { openDialog, toast } from "./core/ui.js";
import { api, ApiError } from "./core/api.js";
import { getUser, onAuthChange, login, sessionExpired } from "./core/auth.js";

const POLL_MS = 60 * 1000;
const TYPE_ICONS = {
    vote_reminder: "thumbs-up",
    vote_thanks: "heart",
    sync_finished: "refresh-cw",
    sync_available: "clock",
    ballsdex_account: "key-round",
    update_dex: "sparkle",
    update_site: "newspaper",
};

let bell;
let badge;
let pollTimer = null;
let state = { items: [], unread: 0, settings: {}, types: [] };
const listeners = new Set();

export function onNotificationsChange(fn) {
    listeners.add(fn);
}

function setUnread(count) {
    state.unread = count;
    badge.hidden = !count;
    badge.textContent = count > 9 ? "9+" : String(count);
    bell.setAttribute("aria-label", count ? `Notifications, ${count} unread` : "Notifications");
}

export async function refreshNotifications() {
    if (!getUser()) return null;
    try {
        state = await api("notifications");
        setUnread(state.unread || 0);
        for (const fn of listeners) fn(state);
        return state;
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) sessionExpired();
        return null;
    }
}

function schedulePoll() {
    clearTimeout(pollTimer);
    if (!getUser()) return;
    pollTimer = setTimeout(async () => {
        if (document.visibilityState === "visible") await refreshNotifications();
        schedulePoll();
    }, POLL_MS);
}

export function initNotifications(button) {
    bell = button;
    badge = bell.querySelector(".count-badge");
    onAuthChange((user) => {
        if (user) {
            refreshNotifications();
            schedulePoll();
        } else {
            clearTimeout(pollTimer);
            state = { items: [], unread: 0, settings: {}, types: [] };
            setUnread(0);
        }
    });
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && getUser()) refreshNotifications();
    });
    bell.addEventListener("click", openNotifications);
}

async function markRead(body) {
    try {
        const result = await api("notifications", { method: "POST", body: { action: "read", ...body } });
        setUnread(result.unread || 0);
    } catch {
        /* the next poll fixes the badge */
    }
}

export function openNotifications() {
    const user = getUser();
    const listEl = h("div.nf-list");
    const toolbar = h("div.nf-toolbar");
    let view = "list";

    const { dialog, close } = openDialog({
        title: "Notifications",
        drawer: true,
        className: "notifications-drawer",
        onClose: () => {
            if (getUser() && state.items.some((item) => !item.read)) {
                state.items.forEach((item) => (item.read = true));
                markRead({ all: true });
            }
        },
    });
    dialog.querySelector(".dialog-inner").append(toolbar, listEl);

    if (!user) {
        toolbar.hidden = true;
        listEl.replaceChildren(
            h(
                "div.empty",
                h("div.empty-icon", icon("bell", "icon-lg")),
                h("h2", "Log in to get notifications"),
                h("p", "Sync updates, vote reminders and BallIdentifier news, here and in your Discord DMs if you want."),
                h("button.btn.btn-discord", { type: "button", onclick: () => login() }, icon("discord"), h("span", "Log in with Discord")),
            ),
        );
        return;
    }

    const settingsBtn = h("button.btn.btn-sm", { type: "button" }, icon("settings-2", "icon-sm"), h("span", "Settings"));
    const readAllBtn = h("button.btn.btn-ghost.btn-sm", { type: "button" }, icon("check-check", "icon-sm"), h("span", "Mark all read"));
    const backBtn = h("button.btn.btn-ghost.btn-sm", { type: "button" }, icon("arrow-left", "icon-sm"), h("span", "Back"));

    settingsBtn.addEventListener("click", () => {
        view = "settings";
        render();
    });
    backBtn.addEventListener("click", () => {
        view = "list";
        render();
    });
    readAllBtn.addEventListener("click", () => {
        state.items.forEach((item) => (item.read = true));
        markRead({ all: true });
        render();
    });

    function itemNode(item) {
        const external = /^https?:\/\//.test(item.link || "");
        const node = h(
            item.link ? "a.nf-item" : "div.nf-item",
            {
                class: item.read ? "" : "is-unread",
                href: item.link || undefined,
                target: external ? "_blank" : undefined,
                rel: external ? "noopener" : undefined,
                onclick: () => {
                    if (!item.read) {
                        item.read = true;
                        markRead({ ids: [item.id] });
                    }
                    if (item.link && !external) close();
                },
            },
            h("span.nf-icon", icon(TYPE_ICONS[item.type] || "bell", "icon-sm")),
            h(
                "span.nf-text",
                h("strong", item.title),
                item.body ? h("span.nf-body", item.body) : null,
                h("time.nf-time", { dateTime: item.createdAt }, timeAgo(item.createdAt)),
            ),
            item.read ? null : h("span.nf-dot", { "aria-label": "Unread" }),
        );
        return node;
    }

    function settingsNode() {
        const rows = (state.types || []).map((type) => {
            const current = state.settings[type.id] || { enabled: true, dm: false };
            const enabled = h("input", { type: "checkbox", checked: current.enabled, "aria-label": `${type.label}: show on the website` });
            const dm = h("input", { type: "checkbox", checked: current.dm, disabled: !current.enabled });
            const dmLabel = h("label.nf-dm", { class: current.enabled ? "" : "is-disabled" }, dm, icon("mail", "icon-sm"), h("span", "Discord DM"));

            async function save(patch) {
                const before = { ...current };
                Object.assign(current, patch);
                if (!current.enabled) current.dm = false;
                enabled.checked = current.enabled;
                dm.checked = current.dm;
                dm.disabled = !current.enabled;
                dmLabel.classList.toggle("is-disabled", !current.enabled);
                try {
                    const result = await api("notifications", { method: "POST", body: { action: "settings", type: type.id, ...patch } });
                    state.settings = result.settings || state.settings;
                } catch (error) {
                    Object.assign(current, before);
                    enabled.checked = current.enabled;
                    dm.checked = current.dm;
                    dm.disabled = !current.enabled;
                    dmLabel.classList.toggle("is-disabled", !current.enabled);
                    toast(error.message, "error");
                }
            }
            enabled.addEventListener("change", () => save({ enabled: enabled.checked }));
            dm.addEventListener("change", () => save({ dm: dm.checked }));

            return h(
                "div.nf-setting",
                h("span.nf-icon", icon(TYPE_ICONS[type.id] || "bell", "icon-sm")),
                h("span.nf-text", h("strong", type.label), h("span.nf-body", type.description)),
                h("div.nf-controls", h("label.switch", h("span.sr-only", "On"), enabled), dmLabel),
            );
        });
        return [
            h("p.subtle.nf-hint", "On: shown here on the website. Discord DM: also sent to you by the bot (keep DMs open for BallIdentifier)."),
            ...rows,
        ];
    }

    function render() {
        if (view === "settings") {
            toolbar.replaceChildren(backBtn, h("strong.nf-toolbar-title", "Notification settings"));
            listEl.replaceChildren(...settingsNode());
            return;
        }
        readAllBtn.disabled = !state.items.some((item) => !item.read);
        toolbar.replaceChildren(readAllBtn, settingsBtn);
        listEl.replaceChildren(
            ...(state.items.length
                ? state.items.map(itemNode)
                : [
                      h(
                          "div.empty",
                          h("div.empty-icon", icon("inbox", "icon-lg")),
                          h("h2", "Nothing yet"),
                          h("p", "Sync results, vote reminders and updates show up here. Choose which ones in Settings."),
                      ),
                  ]),
        );
    }

    listEl.replaceChildren(h("div.skeleton", { style: { height: "64px", margin: "16px 0" } }));
    refreshNotifications().then((result) => {
        if (!result && !state.types.length) {
            listEl.replaceChildren(h("p.subtle", { style: { padding: "24px 0" } }, "Couldn't load notifications. Try again in a moment."));
            return;
        }
        render();
    });
}

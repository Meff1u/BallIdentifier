/**
 * Moderation (owner only): Ballsdex sync status with a cancel button, bot health,
 * a manual dex data refresh and the latest important logs. Opened from the profile menu.
 */

import { h, icon, img, fmt, timeAgo, formatDuration } from "../core/dom.js";
import { toast, confirmDialog } from "../core/ui.js";
import { api, ApiError } from "../core/api.js";
import { getUser, onAuthChange, sessionReady, loadSession, sessionExpired } from "../core/auth.js";

export const OWNER_ID = "334411435633541121";
const REFRESH_MS = 5000;
const LOG_TABS = [
    ["ERRORS", "Errors"],
    ["BALLSDEX", "Ballsdex"],
    ["COLLECTORS", "Collectors"],
    ["API", "API"],
    ["VOTES", "Votes"],
    ["SYSTEM", "System"],
];

export function createView() {
    let visible = false;
    let timer = null;
    let data = null;
    let logTab = "ERRORS";

    const body = h("div.mod-body");
    const el = h(
        "section.view",
        { dataset: { view: "moderation" }, "aria-labelledby": "mod-title" },
        h("div.page-head", h("h1", { id: "mod-title" }, "Moderation"), h("p", "Owner tools: sync status, bot health and recent logs. Refreshes every few seconds.")),
        body,
    );

    function person(id) {
        const p = data?.people?.[id] || { id };
        return h(
            "span.mod-person",
            img(p.avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png", "", "col-avatar", { width: 28, height: 28 }),
            h("span", h("b", p.name || "Unknown user"), h("span.subtle", p.username ? ` @${p.username} · ${id}` : ` ${id}`)),
        );
    }

    function syncCard() {
        const sync = data.sync;
        const active = sync.active;
        const card = h("section.card.panel.mod-card", h("h2", icon("refresh-cw"), "Ballsdex sync"));
        if (!active) {
            card.append(h("p.mod-state", h("span.badge", "Idle"), " No sync is running."));
        } else {
            const progress = active.progress || {};
            const ratio = progress.total ? Math.min(1, progress.fetched / progress.total) : null;
            const fill = h("div.meter-fill");
            if (ratio !== null) fill.style.width = `${Math.round(ratio * 100)}%`;
            const cancelBtn = h("button.btn.btn-danger.btn-sm", { type: "button", disabled: active.cancelRequested }, icon("circle-stop", "icon-sm"), h("span", active.cancelRequested ? "Cancelling…" : "Cancel sync"));
            cancelBtn.addEventListener("click", async () => {
                const ok = await confirmDialog({
                    title: "Cancel this sync?",
                    message: "It stops after the current page. The user gets a notification and can start again in 5 minutes.",
                    confirmLabel: "Cancel sync",
                    danger: true,
                });
                if (!ok) return;
                cancelBtn.disabled = true;
                try {
                    await api("admin", { method: "POST", body: { action: "cancel-sync" } });
                    toast("Sync cancelled.", "success");
                    load();
                } catch (error) {
                    handleError(error);
                    cancelBtn.disabled = false;
                }
            });
            card.append(
                h("p.mod-state", h("span.badge.badge-accent", "Running"), active.resumed ? h("span.badge", "Resumed after restart") : null),
                person(active.userId),
                h(
                    "div.meter",
                    h("div.meter-head", h("span", progress.phase === "saving" ? "Saving" : "Balls fetched"), h("span.num", `${fmt(progress.fetched || 0)}${progress.total ? ` / ${fmt(progress.total)}` : ""}`)),
                    h("div.meter-track", { class: ratio === null ? "is-indeterminate" : "" }, fill),
                ),
                h("p.subtle", `Started ${active.startedAt ? timeAgo(active.startedAt) : "just now"}`),
                h("div.mod-actions", cancelBtn),
            );
        }
        const queue = [...sync.waiting.map((id) => [id, "Waiting for the slot"]), ...sync.resumeQueue.map((id) => [id, "Queued to resume"])];
        if (queue.length) {
            card.append(h("h3", "Waiting"), h("ul.mod-list", queue.map(([id, why]) => h("li", person(id), h("span.badge", why)))));
        }
        card.append(
            h("dl.kv.mod-kv", h("div", h("dt", "Linked accounts"), h("dd", fmt(sync.linkedAccounts))), h("div", h("dt", "Synced in the last 24 h"), h("dd", fmt(sync.syncedLast24h)))),
        );
        return card;
    }

    function botCard() {
        const bot = data.bot;
        const refreshBtn = h("button.btn.btn-sm", { type: "button" }, icon("refresh-cw", "icon-sm"), h("span", "Reload dex data now"));
        refreshBtn.addEventListener("click", async () => {
            refreshBtn.disabled = true;
            try {
                await api("admin", { method: "POST", body: { action: "refresh-data" } });
                toast("Dex data reloaded.", "success");
                load();
            } catch (error) {
                handleError(error);
            } finally {
                refreshBtn.disabled = false;
            }
        });
        return h(
            "section.card.panel.mod-card",
            h("h2", icon("bot"), "Bot"),
            h(
                "dl.kv.mod-kv",
                h("div", h("dt", "Uptime"), h("dd.text", formatDuration(bot.uptimeMs))),
                h("div", h("dt", "Ping"), h("dd", `${fmt(bot.pingMs)} ms`)),
                h("div", h("dt", "Servers"), h("dd", fmt(bot.guilds))),
                h("div", h("dt", "Memory"), h("dd", `${fmt(bot.memoryMb)} MB`)),
                h("div", h("dt", "Database"), h("dd.text", { class: bot.database === "ok" ? "mod-ok" : "mod-bad" }, bot.database === "ok" ? "Connected" : "Unavailable")),
                h("div", h("dt", "Active upvoters"), h("dd", fmt(bot.upvoters))),
            ),
            h(
                "p.subtle",
                `Dex data loaded ${bot.lastDataRefresh ? timeAgo(bot.lastDataRefresh) : "—"}: `,
                Object.entries(bot.dexes || {})
                    .map(([key, count]) => `${key} ${fmt(count)}`)
                    .join(" · "),
            ),
            h("div.mod-actions", refreshBtn),
        );
    }

    function logsCard() {
        const logs = data.logs || {};
        const tabs = LOG_TABS.map(([id, label]) =>
            h(
                "button",
                {
                    type: "button",
                    "aria-pressed": String(id === logTab),
                    onclick: () => {
                        logTab = id;
                        render();
                    },
                },
                label,
                logs[id]?.length ? h("span.mod-count", String(logs[id].length)) : null,
            ),
        );
        const lines = logs[logTab] || [];
        return h(
            "section.card.panel.mod-card.mod-logs",
            h("h2", icon("list"), "Recent logs"),
            h("div.segmented.mod-tabs", { role: "group", "aria-label": "Log category" }, tabs),
            lines.length
                ? h("ol.mod-log", lines.map((line) => h("li", h("time", { dateTime: line.at, title: new Date(line.at).toLocaleString("en-GB") }, timeAgo(line.at)), h("span", line.text))))
                : h("p.subtle", "Nothing since the bot started."),
            h("p.subtle", "Kept in memory since the last restart. Everything is also in the log threads on Discord."),
        );
    }

    function render() {
        if (!data) return;
        body.replaceChildren(h("div.mod-grid", syncCard(), botCard()), logsCard());
    }

    function handleError(error) {
        if (error instanceof ApiError && error.status === 401) {
            sessionExpired();
            return;
        }
        toast(error.message, "error");
    }

    async function load() {
        clearTimeout(timer);
        if (!visible) return;
        if (!sessionReady()) {
            await loadSession();
        }
        if (getUser()?.id !== OWNER_ID) {
            body.replaceChildren(h("div.card.empty", h("div.empty-icon", icon("lock", "icon-lg")), h("h2", "Owner only"), h("p", "This page is only for the BallIdentifier owner.")));
            return;
        }
        if (!data) body.replaceChildren(h("div.skeleton", { style: { height: "240px" } }));
        try {
            data = await api("admin");
            render();
        } catch (error) {
            if (!data) body.replaceChildren(h("div.card.empty", h("h2", "Couldn't load"), h("p", error.message)));
            else if (!(error instanceof ApiError && error.status === 429)) handleError(error);
        }
        if (visible) timer = setTimeout(load, REFRESH_MS);
    }

    onAuthChange(() => {
        data = null;
        if (visible) load();
    });

    return {
        el,
        show() {
            visible = true;
            load();
        },
        hide() {
            visible = false;
            clearTimeout(timer);
        },
    };
}

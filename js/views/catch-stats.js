/**
 * Bot -> Catch stats: what it is, public rankings, your own stats and the on/off switches for servers you administer.
 * Data: /.netlify/functions/catch-stats (bot keeps the stats; only users who made them public are ranked).
 */

import { h, icon, img, initials, fmt } from "../core/dom.js";
import { toast, openDialog, confirmDialog } from "../core/ui.js";
import { api, ApiError } from "../core/api.js";
import { getUser, login, sessionExpired } from "../core/auth.js";
import { renderDiscordMarkdown } from "../core/discord-md.js";

const PERIODS = [
    ["all", "All time"],
    ["30d", "30 days"],
    ["7d", "7 days"],
];
const LINES = [
    ["average", "Average time", "Their average over every tracked catch."],
    ["ballAverage", "This ball", "Their average and best for the ball they just caught."],
    ["best", "Personal best", "Their fastest catch so far."],
    ["serverRank", "Server rank", "Their place on this server by average (last 30 days)."],
];

export const formatMs = (ms) => {
    if (!Number.isFinite(ms)) return "—";
    if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 3 : 2)}s`;
    return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(1)}s`;
};

const serverIcon = (guild) => (guild.icon ? img(guild.icon, "", "server-icon") : h("span.server-icon", { "aria-hidden": "true" }, initials(guild.name)));

function authError(error) {
    if (error instanceof ApiError && error.status === 401) {
        sessionExpired();
        toast("Your session expired. Log in again.", "info");
        return true;
    }
    return false;
}

function periodPicker(current, onPick) {
    const buttons = PERIODS.map(([value, label]) => {
        const button = h("button", { type: "button", "aria-pressed": String(value === current) }, label);
        button.addEventListener("click", () => {
            buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
            onPick(value);
        });
        return button;
    });
    return h("div.segmented", { role: "group", "aria-label": "Time range" }, buttons);
}

/** Two ranked lists (fastest catch, best average) for everyone or one server. */
function rankingBoard({ guildId = null } = {}) {
    let period = guildId ? "30d" : "all";
    const body = h("div.cs-boards");
    const note = h("p.subtle.cs-board-note");
    let request = 0;

    const person = (row) => {
        const name = row.name || row.username || "Unknown user";
        const avatar = img(row.avatarUrl, "", "cs-avatar", { width: 28, height: 28, loading: "lazy" });
        return row.hasProfile ? h("a.cs-person", { href: `#/u/${row.userId}` }, avatar, h("span", name)) : h("span.cs-person", avatar, h("span", name));
    };
    const list = (title, iconName, rows, value) =>
        h(
            "div.cs-board",
            h("h3", icon(iconName, "icon-sm"), title),
            rows.length
                ? h(
                      "ol.cs-rank",
                      rows.map((row, index) => h("li", h("span.cs-pos", `${index + 1}`), person(row), h("span.cs-value", value(row)))),
                  )
                : h("p.subtle", "Nobody here yet."),
        );

    async function load() {
        const mine = ++request;
        body.setAttribute("aria-busy", "true");
        body.replaceChildren(h("div.skeleton.cs-skel"), h("div.skeleton.cs-skel"));
        try {
            const data = await api("catch-stats", { query: { view: "leaderboard", period, ...(guildId ? { guildId } : {}) } });
            if (mine !== request) return;
            body.removeAttribute("aria-busy");
            body.replaceChildren(
                list("Fastest catch", "zap", data.fastest || [], (row) => h("span", h("b", formatMs(row.bestMs)), row.best?.ball ? h("small", row.best.ball) : null)),
                list("Best average", "timer", data.average || [], (row) => h("span", h("b", formatMs(row.averageMs)), h("small", `${fmt(row.count)} catches`))),
            );
            note.textContent = `Averages need at least ${data.minCount} catches in this range. Only people who made their catch stats public are listed.`;
        } catch (error) {
            if (mine !== request) return;
            body.removeAttribute("aria-busy");
            body.replaceChildren(h("p.callout.callout-warning", icon("triangle-alert", "icon-sm"), h("span", error.message)));
        }
    }

    const el = h(
        "div.cs-ranking",
        periodPicker(period, (value) => {
            period = value;
            load();
        }),
        body,
        note,
    );
    load();
    return el;
}

function aboutCard() {
    const item = (iconName, title, text) => h("div.cs-about-item", icon(iconName), h("div", h("b", title), h("p", text)));
    return h(
        "section.card.card-pad.cs-about",
        h("div.cs-about-head", h("h2.section-title", icon("timer"), "Catch stats"), h("p.muted", "How fast do you catch? On servers where an admin turns this on, BallIdentifier answers every catch with your time and how it compares to your usual pace.")),
        h(
            "div.cs-about-grid",
            item("zap", "What it does", "After a catch the bot replies with the catch time, your average, your average and best for that ball, and tells you when you beat a record (yours or the server's). Admins choose what the reply shows, or make it reply only on records."),
            item("clock", "How it's measured", "The time between the spawn message and the dex bot's catch message, both stamped by Discord. Typing the name and the dex bot's own delay are included, so it's the same for everyone. Works with all 7 supported dex bots."),
            item("lock", "What's saved", "Your Discord ID, the server, the ball, the catch time and when it happened. Single catches are kept for 35 days (for the 7 and 30 day stats); totals, averages and records are kept until you opt out."),
            item("eye", "Who sees it", "Only you, by default. Turn on “Show my catch stats publicly” in your profile (or /catchstats settings) to show them on your profile and in the rankings. “Don't track me” under any reply, or the switch below, stops tracking and deletes your data."),
        ),
    );
}

function yourStatsCard() {
    const user = getUser();
    const card = h("section.card.card-pad.cs-you");
    if (!user) {
        card.append(
            h("h2.section-title", icon("user"), "Your catch stats"),
            h("p.muted", "Log in to see your times and choose who can see them."),
            h("button.btn.btn-discord", { type: "button", onclick: () => login("#/bot/catch-stats") }, icon("discord"), h("span", "Log in with Discord")),
        );
        return card;
    }
    card.append(h("h2.section-title", icon("user"), "Your catch stats"), h("div.skeleton.cs-skel"));

    const render = (data) => {
        const { settings = { public: false, tracking: true }, all, last30, last7 } = data;
        const stat = (value, label) => h("div.pf-stat", h("b", value), h("span", label));
        const publicInput = h("input", { type: "checkbox", role: "switch", checked: settings.public, disabled: !settings.tracking });
        const trackInput = h("input", { type: "checkbox", role: "switch", checked: settings.tracking });

        async function save(changes, input) {
            input.disabled = true;
            try {
                const result = await api("catch-stats", { method: "POST", body: { action: "settings", ...changes } });
                toast(changes.tracking === false ? "Tracking stopped and your catch data was deleted." : "Saved.", "success");
                if (changes.tracking !== undefined) return load();
                render({ ...data, settings: result.settings });
            } catch (error) {
                input.checked = !input.checked;
                input.disabled = false;
                if (!authError(error)) toast(error.message, "error");
            }
        }
        publicInput.addEventListener("change", () => save({ public: publicInput.checked }, publicInput));
        trackInput.addEventListener("change", async () => {
            if (!trackInput.checked) {
                const ok = await confirmDialog({ title: "Stop tracking your catches?", message: "Your catch data is deleted right away and the bot won't answer your catches anymore. You can turn it back on later, starting from zero.", confirmLabel: "Stop and delete", danger: true });
                if (!ok) {
                    trackInput.checked = true;
                    return;
                }
            }
            save({ tracking: trackInput.checked }, trackInput);
        });

        card.replaceChildren(
            h("div.cs-you-head", h("h2.section-title", icon("user"), "Your catch stats"), h("a.btn.btn-ghost.btn-sm", { href: `#/u/${user.id}` }, icon("user-round", "icon-sm"), h("span", "Profile"))),
            all
                ? h(
                      "div.cs-stats",
                      stat(fmt(all.count), "Catches"),
                      stat(formatMs(all.averageMs), "Average"),
                      stat(formatMs(all.bestMs), all.best?.ball ? `Fastest · ${all.best.ball}` : "Fastest"),
                      stat(last30?.count ? formatMs(last30.averageMs) : "—", "Avg · 30 days"),
                      stat(last7?.count ? formatMs(last7.averageMs) : "—", "Avg · 7 days"),
                  )
                : h("p.muted", settings.tracking ? "No catches tracked yet. They count on servers where Catch stats are on." : "You're not tracked. Turn tracking back on to start counting again."),
            h(
                "div.cs-you-switches",
                h("label.switch", h("span", h("b", "Show my catch stats publicly"), h("small.hint", "On your profile and in the rankings. Off: only you see them.")), publicInput),
                h("label.switch", h("span", h("b", "Track my catches"), h("small.hint", "Off stops tracking and deletes your catch data.")), trackInput),
            ),
        );
    };

    async function load() {
        try {
            render(await api("catch-stats", { query: { view: "me" } }));
        } catch (error) {
            if (authError(error)) return;
            card.replaceChildren(h("h2.section-title", icon("user"), "Your catch stats"), h("p.callout.callout-warning", icon("triangle-alert", "icon-sm"), h("span", error.message)));
        }
    }
    load();
    return card;
}

function previewReply(config) {
    // records mode only answers records, so show one; otherwise an ordinary catch (every line visible)
    const record = config.mode === "records";
    const lines = record ? ["⏱️ <@you> caught **Poland** in **2.481s**", "🥇 **New personal record!** (was 2.950s)"] : ["⏱️ <@you> caught **Poland** in **3.104s**"];
    const stats = [];
    if (config.lines.average) stats.push("avg 4.120s (86 catches)");
    if (config.lines.ballAverage) stats.push(`Poland: avg 3.300s, best ${record ? "2.481s" : "2.950s"}`);
    if (config.lines.best && !record) stats.push("best 2.950s (Poland)");
    if (config.lines.serverRank) stats.push("#3 of 17 on this server (30 days)");
    if (stats.length) lines.push(`-# ${stats.join(" · ")}`);
    const text = h("div.t-text");
    text.replaceChildren(...renderDiscordMarkdown(lines.join("\n"), (part) => part.split(/(<@you>)/).map((bit) => (bit === "<@you>" ? h("span.t-mention", "@you") : bit))));
    return h(
        "div.discord-preview.cs-preview",
        h(
            "div.t-msg",
            h("span.t-reply", icon("chevron-right", "icon-sm"), h("b", "Ballsdex"), h("span.t-reply-text", "@you You caught Poland!")),
            h("img.t-avatar", { src: "assets/brand/bot-avatar.png", alt: "" }),
            h("div.cs-preview-body", h("div.t-msg-head", h("span.t-author.is-bot", "BallIdentifier"), h("span.t-time", "Today")), text),
        ),
    );
}

function serverRow(server, inviteFor) {
    const config = server.config || { enabled: false, mode: "every", lines: { average: true, ballAverage: true, best: true, serverRank: false } };
    const row = h("div.cs-server");
    let saving = false;

    async function save(changes) {
        if (saving) return false;
        saving = true;
        row.setAttribute("aria-busy", "true");
        try {
            const result = await api("catch-stats", { method: "POST", body: { action: "save-server", guildId: server.id, ...changes } });
            Object.assign(config, result.config || changes);
            server.config = config;
            toast(changes.enabled === undefined ? "Saved." : changes.enabled ? `Catch stats are on in ${server.name}.` : `Catch stats are off in ${server.name}.`, "success");
            return true;
        } catch (error) {
            if (!authError(error)) toast(error.message, "error");
            return false;
        } finally {
            saving = false;
            row.removeAttribute("aria-busy");
        }
    }

    function render() {
        const head = h("div.cs-server-head", serverIcon(server), h("div.server-body", h("span.server-name", server.name), h("span.subtle", !server.hasBot ? "Bot not added yet" : config.enabled ? (config.mode === "records" ? "On · replies on records only" : "On · replies to every catch") : "Off")));
        if (!server.hasBot) {
            head.append(h("a.btn.btn-sm", { href: inviteFor(server.id), target: "_blank", rel: "noopener" }, icon("plus", "icon-sm"), h("span", "Add bot")));
            return row.replaceChildren(head);
        }
        const toggle = h("input", { type: "checkbox", role: "switch", checked: config.enabled, "aria-label": `Catch stats in ${server.name}` });
        toggle.addEventListener("change", async () => {
            const wanted = toggle.checked;
            if (!(await save({ enabled: wanted }))) toggle.checked = !wanted;
            render();
        });
        head.append(h("label.switch.cs-switch", toggle));
        if (!config.enabled) return row.replaceChildren(head);

        const mode = h(
            "select.select",
            { "aria-label": "When to reply" },
            h("option", { value: "every", selected: config.mode !== "records" }, "Every catch"),
            h("option", { value: "records", selected: config.mode === "records" }, "Only on records"),
        );
        mode.addEventListener("change", async () => {
            const previous = config.mode;
            if (!(await save({ mode: mode.value }))) mode.value = previous;
            render();
        });
        const lineInputs = LINES.map(([key, label, hint]) => {
            const input = h("input", { type: "checkbox", checked: Boolean(config.lines?.[key]) });
            input.addEventListener("change", async () => {
                const lines = { ...config.lines, [key]: input.checked };
                if (!(await save({ lines }))) input.checked = !input.checked;
                else render();
            });
            return h("label.cs-line", input, h("span", h("b", label), h("small.hint", hint)));
        });
        const rankingBtn = h("button.btn.btn-sm", { type: "button" }, icon("trophy", "icon-sm"), h("span", "Server ranking"));
        rankingBtn.addEventListener("click", () => openDialog({ title: `Fastest catchers · ${server.name}`, body: rankingBoard({ guildId: server.id }), wide: true }));

        row.replaceChildren(
            head,
            h(
                "div.cs-options",
                h(
                    "div.cs-options-form",
                    h("div.config-section", h("h3", "Reply"), mode, h("p.hint", "Records: a personal best, the fastest catch of that ball, or a new server record.")),
                    h("div.config-section", h("h3", "Show in the reply"), h("div.cs-lines", lineInputs)),
                    h("div", rankingBtn),
                ),
                previewReply(config),
            ),
        );
    }
    render();
    return row;
}

function serversCard(inviteFor) {
    const card = h("section.card.card-pad.cs-servers");
    const title = h("h2.section-title", icon("server"), "Your servers");
    const user = getUser();
    if (!user) {
        card.append(title, h("p.muted", "Log in to turn Catch stats on in servers where you have Administrator."), h("button.btn.btn-discord", { type: "button", onclick: () => login("#/bot/catch-stats") }, icon("discord"), h("span", "Log in with Discord")));
        return card;
    }
    const list = h("div.cs-server-list", { "aria-busy": "true" }, h("div.skeleton.cs-skel"), h("div.skeleton.cs-skel"));
    card.append(h("div", title, h("p.subtle", "Servers where you have Administrator. The bot needs to read and send messages in the spawn channels.")), list);

    (async () => {
        try {
            const { servers = [] } = await api("catch-stats", { query: { view: "servers" } });
            list.removeAttribute("aria-busy");
            if (!servers.length) return list.replaceChildren(h("p.muted", "You don't have Administrator on any server."));
            list.replaceChildren(...servers.map((server) => serverRow(server, inviteFor)));
        } catch (error) {
            if (authError(error)) return;
            list.removeAttribute("aria-busy");
            list.replaceChildren(h("p.callout.callout-warning", icon("triangle-alert", "icon-sm"), h("span", error.message)));
        }
    })();
    return card;
}

/** Whole Catch stats panel. */
export function catchStatsPanel({ inviteFor }) {
    return h(
        "div.cs-page",
        aboutCard(),
        h("section.card.card-pad", h("h2.section-title", icon("trophy"), "Fastest catchers"), rankingBoard()),
        yourStatsCard(),
        serversCard(inviteFor),
    );
}

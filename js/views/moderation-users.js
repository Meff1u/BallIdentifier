/**
 * Moderation -> Users (owner): everyone who logged in with Discord. Search, filters, details, block / unblock.
 * Data and enforcement live in the bot (utils/site-users.js); the owner is checked again there.
 */

import { h, icon, img, fmt, timeAgo } from "../core/dom.js";
import { toast, openDialog, confirmDialog } from "../core/ui.js";
import { api } from "../core/api.js";

const STATUS = [
    ["all", "All"],
    ["active", "Active"],
    ["blocked", "Blocked"],
];
const BALLSDEX = [
    ["all", "Ballsdex: any"],
    ["linked", "Linked"],
    ["unlinked", "Not linked"],
];
const SORTS = [
    ["seen", "Last activity"],
    ["login", "Last login"],
    ["first", "First login"],
    ["sync", "Last sync"],
    ["name", "Name"],
];
const AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png";

const when = (value) => (value ? h("time", { dateTime: value, title: new Date(value).toLocaleString("en-GB") }, timeAgo(value)) : h("span.subtle", "never"));

export function createUsersCard({ handleError }) {
    const query = { search: "", status: "all", ballsdex: "all", sort: "seen", page: 1 };
    let state = null;
    let timer = null;
    let loadId = 0;

    const summary = h("p.subtle", "Loading…");
    const list = h("div.mod-users-list", h("div.skeleton", { style: { height: "120px" } }));
    const pager = h("div.mod-users-pager");

    const search = h("input.input", { type: "search", placeholder: "Search by name or Discord ID", "aria-label": "Search users", maxlength: "60" });
    search.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            query.search = search.value.trim();
            query.page = 1;
            load();
        }, 300);
    });

    function selectOf(label, options, key) {
        const select = h("select.select", { "aria-label": label }, options.map(([value, text]) => h("option", { value }, text)));
        select.value = query[key];
        select.addEventListener("change", () => {
            query[key] = select.value;
            query.page = 1;
            load();
        });
        return select;
    }

    const refresh = h("button.btn.btn-ghost.btn-sm", { type: "button", onclick: () => load() }, icon("refresh-cw", "icon-sm"), h("span", "Refresh"));
    const logoutBtn = h("button.btn.btn-ghost.btn-sm", { type: "button", onclick: () => logoutInactiveDialog() }, icon("lock", "icon-sm"), h("span", "Log out inactive"));
    const el = h(
        "section.card.panel.mod-card.mod-users",
        h("h2", icon("users"), "Users"),
        h("p.subtle", "Everyone who logged in with Discord. A blocked account can't log in, use the site's features or the bot's commands, and its public profile is hidden."),
        summary,
        h("div.mod-users-filters", search, selectOf("Status", STATUS, "status"), selectOf("Ballsdex", BALLSDEX, "ballsdex"), selectOf("Sort by", SORTS, "sort"), refresh, logoutBtn),
        list,
        pager,
    );

    function nameOf(user) {
        return user.displayName || user.username || "Unknown user";
    }

    function row(user) {
        const open = h(
            "button.mod-user-row",
            { type: "button", "aria-label": `Open ${nameOf(user)}` },
            img(user.avatarUrl || AVATAR, "", "col-avatar", { width: 36, height: 36 }),
            h("span.mod-user-name", h("b", nameOf(user)), h("span.subtle", user.username ? ` @${user.username}` : ""), h("span.subtle.mod-user-id", user.id)),
            h("span.mod-user-meta", h("span.subtle", "Active "), when(user.lastSeenAt)),
            h("span.mod-user-meta", user.ballsdexLinked ? [h("span.subtle", "Synced "), when(user.lastSyncAt)] : h("span.subtle", "Ballsdex not linked")),
            h(`span.chip.chip-plain.mod-status`, { dataset: { status: user.status } }, user.status === "blocked" ? "Blocked" : "Active"),
        );
        open.addEventListener("click", () => openDetail(user.id));
        return open;
    }

    function render() {
        if (!state) return;
        const { summary: totals, matching, users, page, pages } = state;
        summary.textContent = `${fmt(totals.total)} users · ${fmt(totals.blocked)} blocked · ${fmt(totals.ballsdexLinked)} with Ballsdex linked${matching !== totals.total ? ` · ${fmt(matching)} match` : ""}`;
        list.replaceChildren(...(users.length ? users.map(row) : [h("p.subtle", "No users match.")]));
        pager.replaceChildren(
            ...(pages > 1
                ? [
                      h("button.btn.btn-ghost.btn-sm", { type: "button", disabled: page <= 1, "aria-label": "Previous page", onclick: () => go(page - 1) }, icon("chevron-left", "icon-sm")),
                      h("span.subtle", `Page ${page} of ${pages}`),
                      h("button.btn.btn-ghost.btn-sm", { type: "button", disabled: page >= pages, "aria-label": "Next page", onclick: () => go(page + 1) }, icon("chevron-right", "icon-sm")),
                  ]
                : []),
        );
    }

    function go(page) {
        query.page = page;
        load();
    }

    async function load() {
        const id = ++loadId;
        try {
            const data = await api("admin", { query: { view: "users", ...query } });
            if (id !== loadId) return;
            state = data;
            query.page = data.page;
            render();
        } catch (error) {
            if (id !== loadId) return;
            if (!state) list.replaceChildren(h("p.subtle", error.message));
            else handleError(error);
        }
    }

    function fact(label, value) {
        return h("div", h("dt", label), h("dd", value));
    }

    async function openDetail(id) {
        const body = h("div.mod-user-detail", h("div.skeleton", { style: { height: "180px" } }));
        const footer = h("div.mod-user-actions");
        const { close } = openDialog({ title: "User", body, footer, wide: true });
        try {
            const user = await api("admin", { query: { view: "user", id } });
            renderDetail(user, body, footer, close);
        } catch (error) {
            body.replaceChildren(h("p.subtle", error.message));
        }
    }

    function renderDetail(user, body, footer, close) {
        body.replaceChildren(
            h(
                "div.mod-user-head",
                img(user.avatarUrl || AVATAR, "", "col-avatar", { width: 56, height: 56 }),
                h("div", h("h3", nameOf(user)), h("p.subtle", user.username ? `@${user.username} · ${user.id}` : user.id)),
                h("span.chip.chip-plain.mod-status", { dataset: { status: user.status } }, user.status === "blocked" ? "Blocked" : "Active"),
            ),
            user.block
                ? h(
                      "p.callout.callout-warning",
                      icon("lock", "icon-sm"),
                      h("span", `Blocked ${user.block.at ? timeAgo(user.block.at) : ""}${user.block.by ? ` by ${user.block.by.username || user.block.by.id}` : ""}. Reason shown to the user: ${user.block.reason || "none"}`),
                  )
                : null,
            h(
                "dl.mod-kv",
                fact("Ballsdex", user.ballsdexLinked ? "Linked" : "Not linked"),
                fact("Last Ballsdex sync", user.ballsdexLinked || user.lastSyncAt ? when(user.lastSyncAt) : "-"),
                fact("Last activity on the site", when(user.lastSeenAt)),
                fact("Last login", user.imported ? h("span.subtle", "unknown (account existed before the registry)") : when(user.lastLoginAt)),
                fact("First login", user.firstLoginAt ? when(user.firstLoginAt) : h("span.subtle", "unknown")),
                fact("Logins", fmt(user.loginCount)),
                fact("Catches (30 days)", user.catches30 === null ? "-" : fmt(user.catches30)),
                fact("Collector entries", user.collectorEntries === null ? "-" : fmt(user.collectorEntries)),
                fact("Public profile", user.profile ? (user.profile.hidden ? "Hidden by the owner" : user.profile.public ? "Public" : "Private") : "No profile"),
            ),
        );
        footer.replaceChildren(
            h("button.btn.btn-ghost", { type: "button", onclick: () => close() }, "Close"),
            user.status === "blocked"
                ? h("button.btn.btn-primary", { type: "button", onclick: () => unblock(user, close) }, icon("shield-check", "icon-sm"), h("span", "Unblock"))
                : h("button.btn.btn-danger", { type: "button", onclick: () => blockDialog(user, close) }, icon("lock", "icon-sm"), h("span", "Block")),
        );
    }

    async function unblock(user, close) {
        try {
            await api("admin", { method: "POST", body: { action: "user-unblock", id: user.id } });
            toast(`${nameOf(user)} was unblocked. Their profile stays private until they make it public again.`, "success", 6000);
            close();
            load();
        } catch (error) {
            handleError(error);
        }
    }

    function logoutInactiveDialog() {
        const days = h("input.input", { type: "number", min: "1", max: "365", value: "30", inputmode: "numeric", "aria-label": "Days of inactivity" });
        const submit = h("button.btn.btn-danger", { type: "button" }, icon("lock", "icon-sm"), h("span", "Continue"));
        const { close } = openDialog({
            title: "Log out inactive users",
            body: h(
                "div.mod-user-detail",
                h("p.muted", "Everyone with no activity on the site for at least this long is logged out and has to log in again. People who were active more recently, and you, stay logged in. Accounts without a recorded activity date count as inactive."),
                h("label.field", h("span", "Inactive for at least (days)"), days),
            ),
            footer: [h("button.btn.btn-ghost", { type: "button", onclick: () => close() }, "Cancel"), submit],
        });
        submit.addEventListener("click", async () => {
            const value = Number(days.value);
            if (!Number.isInteger(value) || value < 1 || value > 365) {
                days.setAttribute("aria-invalid", "true");
                days.focus();
                return;
            }
            submit.disabled = true;
            try {
                const preview = await api("admin", { method: "POST", body: { action: "users-logout-inactive", days: value, dryRun: true } });
                if (!preview.affected) {
                    toast(`Nobody has been inactive for ${value}+ days.`, "info");
                    submit.disabled = false;
                    return;
                }
                const ok = await confirmDialog({
                    title: "Log out these users?",
                    message: `${fmt(preview.affected)} user${preview.affected === 1 ? "" : "s"} inactive for ${value}+ days will have to log in again.`,
                    confirmLabel: "Log them out",
                    danger: true,
                });
                if (!ok) {
                    submit.disabled = false;
                    return;
                }
                const result = await api("admin", { method: "POST", body: { action: "users-logout-inactive", days: value } });
                toast(`${fmt(result.affected)} user${result.affected === 1 ? "" : "s"} will have to log in again.`, "success", 6000);
                close();
                load();
            } catch (error) {
                submit.disabled = false;
                handleError(error);
            }
        });
    }

    function blockDialog(user, closeDetail) {
        const reason = h("textarea.textarea", { rows: "3", maxlength: "300", placeholder: "Why is this account blocked? (shown to the user)", "aria-label": "Reason" });
        const submit = h("button.btn.btn-danger", { type: "button" }, icon("lock", "icon-sm"), h("span", "Block account"));
        const { close } = openDialog({
            title: `Block ${nameOf(user)}?`,
            body: h(
                "div.mod-user-detail",
                h("p.muted", "They will be logged out, can't log in or use the website features and the bot's commands, any running Ballsdex sync stops and their public profile is hidden. Their collector entries stay."),
                h("label.field", h("span", "Reason (the user sees it)"), reason),
            ),
            footer: [h("button.btn.btn-ghost", { type: "button", onclick: () => close() }, "Cancel"), submit],
        });
        submit.addEventListener("click", async () => {
            const text = reason.value.trim();
            if (text.length < 3) {
                reason.setAttribute("aria-invalid", "true");
                reason.focus();
                return;
            }
            submit.disabled = true;
            try {
                await api("admin", { method: "POST", body: { action: "user-block", id: user.id, reason: text } });
                toast(`${nameOf(user)} was blocked.`, "success");
                close();
                closeDetail();
                load();
            } catch (error) {
                submit.disabled = false;
                handleError(error);
            }
        });
    }

    return { el, load };
}

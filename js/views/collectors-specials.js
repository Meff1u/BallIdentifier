/**
 * Collectors -> Specials: who collects which Ballsdex special.
 * Logged-in users add themselves (no ownership check, so the bot limits how much one account can add).
 */

import { h, icon, img, fmt, timeAgo } from "../core/dom.js";
import { toast, openDialog, confirmDialog } from "../core/ui.js";
import { api, ApiError } from "../core/api.js";
import { getUser, onAuthChange, login, sessionExpired } from "../core/auth.js";

const PAGE = 48;
const FILTERS = [
    { id: "with", label: "With collectors" },
    { id: "all", label: "All specials" },
    { id: "mine", label: "Mine" },
];

/** A special's emoji: custom Discord emoji as an image, otherwise the text emoji (same as the Specials tab). */
function specialEmoji(special) {
    if (special.emoji) return h("span.spc-emoji", { "aria-hidden": "true" }, special.emoji);
    const custom = /^<a?:\w+:(\d+)>$/.exec(special.officialEmoji || "");
    if (custom) return h("span.spc-emoji", img(`https://cdn.discordapp.com/emojis/${custom[1]}.webp?size=64`, ""));
    if (special.officialEmoji) return h("span.spc-emoji", { "aria-hidden": "true" }, special.officialEmoji);
    return h("span.spc-emoji.is-empty", { "aria-hidden": "true" }, icon("sparkles"));
}

export function createSpecialsPanel() {
    let filter = "with";
    let specials = []; // [{ id, name, emoji, officialEmoji }]
    let entries = {}; // specialId -> [collector]
    let limits = { daily: 10, max: 25 };
    let viewer = null;
    let shown = PAGE;
    let loadToken = 0;
    let visible = false;
    let loaded = false;
    let refreshTimer = null;

    const search = h("input.input", { type: "search", placeholder: "Search specials", "aria-label": "Search specials", autocomplete: "off", spellcheck: false });
    const filterBtns = FILTERS.map((f) => h("button", { type: "button", "aria-pressed": String(f.id === filter), onclick: () => setFilter(f.id) }, f.label));
    const metaCount = h("span.num");
    const metaHint = h("span");
    const grid = h("div.col-grid", { role: "list" });
    const moreBtn = h("button.btn", { type: "button", hidden: true, onclick: () => ((shown += PAGE), paint()) }, h("span", "Show more"));
    const emptyEl = h("div.empty", { hidden: true }, h("div.empty-icon", icon("sparkles")), h("h2", "No collectors here"), h("p"));

    const el = h(
        "div",
        h("p.subtle.col-spc-note", "Collect a Ballsdex special? Add yourself to it. These are self-added and not verified, and every account has limits to keep the lists honest."),
        h("div.arts-toolbar.col-toolbar", h("div.toolbar-row", h("label.input-icon", icon("search"), search))),
        h("div.col-filters", h("div.segmented", { role: "group", "aria-label": "Show" }, filterBtns)),
        h("div.arts-meta", metaCount, metaHint),
        grid,
        h("div.col-more", moreBtn),
        emptyEl,
    );

    /* ----- Data ----- */

    async function load() {
        const token = ++loadToken;
        grid.replaceChildren(...Array.from({ length: 6 }, () => h("div.skeleton.col-skeleton")));
        emptyEl.hidden = true;
        moreBtn.hidden = true;
        try {
            const [list, result] = await Promise.all([api("specials"), api("collectors", { query: { kind: "specials" } })]);
            if (token !== loadToken) return;
            specials = (list.specials || []).map((item) => ({ id: item.id, name: item.alias || item.name || `Special #${item.id}`, emoji: item.emoji, officialEmoji: item.officialEmoji }));
            apply(result);
            loaded = true;
            shown = PAGE;
            paint();
        } catch (error) {
            if (token !== loadToken) return;
            grid.replaceChildren();
            emptyEl.hidden = false;
            emptyEl.querySelector("h2").textContent = "Couldn't load specials";
            emptyEl.querySelector("p").textContent = error.message;
        }
    }

    function apply(result) {
        entries = result.entries || {};
        viewer = result.viewer;
        if (result.limits) limits = result.limits;
        clearTimeout(refreshTimer);
        // The bot is still looking up some Discord names: refresh once they're ready
        if (result.pendingProfiles > 0) refreshTimer = setTimeout(() => visible && reload(), 15000);
    }

    async function reload({ fresh = false } = {}) {
        try {
            apply(await api("collectors", { query: fresh ? { kind: "specials", fresh: "1" } : { kind: "specials" } }));
            paint();
        } catch {
            /* keep what's shown */
        }
    }

    /* ----- Rendering ----- */

    const myId = () => viewer?.id || getUser()?.id || null;
    const collectorsOf = (special) => entries[special.id] || [];
    const isMine = (special) => Boolean(myId()) && collectorsOf(special).some((c) => c.id === myId());
    const displayName = (c) => c.name || (c.missing ? "Unknown user" : `User ${c.id.slice(-4)}`);

    function filtered() {
        const query = search.value.trim().toLowerCase();
        let list = specials.filter((special) => !query || special.name.toLowerCase().includes(query) || String(special.id) === query.replace(/^#/, ""));
        if (filter === "with") list = list.filter((special) => collectorsOf(special).length);
        if (filter === "mine") list = list.filter(isMine);
        return filter === "all" ? list.sort((a, b) => b.id - a.id) : list.sort((a, b) => collectorsOf(b).length - collectorsOf(a).length || b.id - a.id);
    }

    function avatarStack(collectors) {
        const head = collectors.slice(0, 5);
        return h(
            "div.col-stack",
            head.map((c) => img(c.avatarUrl, "", "col-avatar", { width: 28, height: 28 })),
            collectors.length > head.length ? h("span.col-more-count", `+${collectors.length - head.length}`) : null,
        );
    }

    function card(special) {
        const collectors = collectorsOf(special);
        const mine = isMine(special);
        return h(
            "button.col-card",
            { type: "button", role: "listitem", class: mine ? "is-mine" : "", onclick: () => openSpecial(special) },
            h("span.col-art", specialEmoji(special)),
            h(
                "span.col-body",
                h("span.col-name", special.name),
                h("span.col-meta", `#${special.id}`, mine ? h("span.badge.badge-accent", "You") : null),
                collectors.length
                    ? h("span.col-who", avatarStack(collectors), h("span", `${fmt(collectors.length)} collector${collectors.length === 1 ? "" : "s"}`))
                    : h("span.col-who.subtle", "No collectors yet"),
            ),
        );
    }

    function paint() {
        const list = filtered();
        const people = new Set(Object.values(entries).flat().map((c) => c.id));
        metaCount.textContent = `${fmt(list.length)} ${list.length === 1 ? "special" : "specials"}`;
        metaHint.textContent = `${fmt(people.size)} collectors`;
        grid.replaceChildren(...list.slice(0, shown).map(card));
        moreBtn.hidden = list.length <= shown;
        emptyEl.hidden = list.length > 0;
        if (!list.length) {
            emptyEl.querySelector("h2").textContent = filter === "mine" ? "You don't collect any special here yet" : "No collectors here";
            emptyEl.querySelector("p").textContent = filter === "with" ? "Switch to All specials to find one and add yourself." : search.value ? "Try a different spelling." : "Pick a special from All specials and add yourself.";
        }
        filterBtns.forEach((btn, index) => btn.setAttribute("aria-pressed", String(FILTERS[index].id === filter)));
        filterBtns[2].hidden = !myId();
    }

    function setFilter(id) {
        filter = id;
        shown = PAGE;
        paint();
    }

    /* ----- Special dialog ----- */

    function openSpecial(special) {
        let dialogRef = null;
        const listEl = h("ul.col-list");
        const actions = h("div.col-actions");

        function fill() {
            const collectors = collectorsOf(special);
            const me = myId();
            listEl.replaceChildren(
                ...(collectors.length
                    ? collectors.map((c) =>
                          h(
                              "li",
                              img(c.avatarUrl, "", "col-avatar col-avatar-lg", { width: 40, height: 40 }),
                              h(
                                  "div.col-person",
                                  c.hasProfile ? h("a", { href: `/u/${c.id}`, onclick: () => dialogRef?.close() }, h("b", displayName(c))) : h("b", displayName(c)),
                                  h("span.subtle", c.username ? `@${c.username}` : c.id),
                              ),
                              h(
                                  "div.col-tags",
                                  h("span.badge", { title: c.addedAt ? `Added ${timeAgo(c.addedAt)}` : "" }, "Self-added"),
                                  viewer?.canModerate || c.id === me
                                      ? h("button.icon-btn", { type: "button", "aria-label": c.id === me ? "Remove me" : `Remove ${displayName(c)}`, onclick: () => remove(c) }, icon("trash-2"))
                                      : null,
                              ),
                          ),
                      )
                    : [h("li.subtle", "Nobody has added themselves yet.")]),
            );

            const mine = collectors.find((c) => c.id === me);
            if (!getUser()) {
                actions.replaceChildren(h("button.btn.btn-discord", { type: "button", onclick: () => login("#/collectors/specials") }, icon("discord"), h("span", "Log in to add yourself")));
            } else if (!mine) {
                const addBtn = h("button.btn.btn-primary", { type: "button", onclick: () => add(addBtn) }, icon("plus"), h("span", "I'm a collector"));
                actions.replaceChildren(h("p.subtle.col-req", `Up to ${limits.daily} a day and ${limits.max} in total. Not verified.`), addBtn);
            } else {
                actions.replaceChildren(h("button.btn.btn-danger", { type: "button", onclick: () => remove(mine) }, icon("trash-2"), h("span", "Remove me")));
            }
        }

        async function add(btn) {
            btn.disabled = true;
            try {
                await api("collectors", { method: "POST", body: { kind: "specials", action: "add", specialId: special.id } });
                toast(`You're now a collector of ${special.name}.`, "success");
                await reload({ fresh: true });
                fill();
            } catch (error) {
                handleError(error);
                btn.disabled = false;
            }
        }

        async function remove(collector) {
            const self = collector.id === myId();
            const ok = await confirmDialog({
                title: self ? "Remove yourself?" : "Remove this collector?",
                message: self ? `You won't be listed as a collector of ${special.name} anymore.` : `${displayName(collector)} won't be listed as a collector of ${special.name}.`,
                confirmLabel: "Remove",
                danger: true,
            });
            if (!ok) return;
            try {
                await api("collectors", { method: "POST", body: { kind: "specials", action: "remove", specialId: special.id, userId: collector.id } });
                toast(self ? "Removed." : `${displayName(collector)} removed.`, "success");
                await reload({ fresh: true });
                if (dialogRef?.dialog.isConnected) fill();
            } catch (error) {
                handleError(error);
            }
        }

        fill();
        dialogRef = openDialog({
            title: special.name,
            className: "col-dialog",
            body: [
                h("div.col-dialog-head.is-special", specialEmoji(special), h("dl.kv", h("div", h("dt", "Special"), h("dd", special.name)), h("div", h("dt", "ID"), h("dd", String(special.id))))),
                listEl,
                h("p.subtle.col-note", "Nobody checks these. Users add themselves, and the BallIdentifier owner removes anyone who abuses it."),
            ],
            footer: actions,
        });
    }

    function handleError(error) {
        if (error instanceof ApiError && error.status === 401) {
            sessionExpired();
            toast("Your session expired. Log in again.", "info");
            return;
        }
        toast(error.message, [403, 409, 429].includes(error.status) ? "info" : "error");
    }

    /* ----- Events ----- */

    let searchTimer;
    search.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            shown = PAGE;
            paint();
        }, 120);
    });
    onAuthChange(() => {
        if (filter === "mine" && !getUser()) filter = "with";
        if (visible && loaded) reload();
    });

    return {
        el,
        show() {
            visible = true;
            if (!loaded) load();
            else reload();
        },
        hide() {
            visible = false;
            clearTimeout(refreshTimer);
        },
    };
}

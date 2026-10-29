/**
 * What's new: changelog drawer (bottom sheet on phones, side drawer on desktop)
 * with an unread dot on the bell. Entries come from changelog.json.
 */

import { h, img, storage, store, timeAgo } from "./core/dom.js";
import { openDialog } from "./core/ui.js";
import { getChangelog, getDexList, dexIcon } from "./core/data.js";

const SEEN_KEY = "changelogSeen";
const PAGE = 25;
const FILTERS = [
    { id: "all", label: "All" },
    { id: "website", label: "Website" },
    { id: "bot", label: "Bot" },
    { id: "dex", label: "Dexes" },
];

let bell;
let entries = null;
let dexNames = null;

async function load() {
    if (entries) return entries;
    const data = await getChangelog();
    entries = (data.changes || [])
        .map((entry) => ({ ...entry, time: Number(entry.timestamp) * 1000 }))
        .filter((entry) => Number.isFinite(entry.time))
        .sort((a, b) => b.time - a.time);
    return entries;
}

/** Dexes found in the log, canonical order first. */
async function getDexNames() {
    if (dexNames) return dexNames;
    const list = await load();
    const inLog = [...new Set(list.filter((entry) => entry.dex).map((entry) => entry.dex))];
    let known = [];
    try {
        ({ dexes: known } = await getDexList());
    } catch {
        /* order is decorative */
    }
    dexNames = [...known.filter((name) => inLog.includes(name)), ...inLog.filter((name) => !known.includes(name))];
    return dexNames;
}

function matches(entry, filter) {
    if (filter === "all") return true;
    if (filter === "dex") return entry.type === "dex";
    if (filter === "website") return entry.type === "website";
    if (filter === "bot") return entry.type === "bot";
    return entry.dex === filter;
}

function badge(entry) {
    if (entry.type === "website") return h("span.badge.badge-accent", "Website");
    if (entry.type === "bot") return h("span.badge.badge-primary", "Bot");
    if (entry.dex) return h("span.badge", img(dexIcon(entry.dex), "", "badge-ico"), entry.dex);
    return h("span.badge", "Dex update");
}

export async function initChangelog(button) {
    bell = button;
    try {
        const list = await load();
        if (list[0] && list[0].time > seenTime()) setUnread(true);
    } catch {
        /* changelog is optional */
    }
}

/** First visit: only the last two weeks count as new. */
function seenTime() {
    const saved = storage(SEEN_KEY, null);
    return saved === null ? Date.now() - 14 * 86400000 : Number(saved) || 0;
}

function setUnread(on) {
    bell?.querySelector(".dot")?.toggleAttribute("hidden", !on);
    bell?.setAttribute("aria-label", on ? "What's new (new updates)" : "What's new");
}

/** Latest dex entry, optionally for one dex, for the "Updated …" pill on the Identifier. */
export async function latestEntry(dexName = null) {
    const list = await load();
    return list.find((entry) => (entry.type === "dex" || entry.type === "bot") && (!dexName || entry.dex === dexName)) || null;
}

export async function openChangelog(initialFilter = "all") {
    let list, dexes;
    try {
        list = await load();
        dexes = await getDexNames();
    } catch {
        list = [];
        dexes = [];
    }
    const seen = seenTime();
    let filter = FILTERS.some((option) => option.id === initialFilter) || dexes.includes(initialFilter) ? initialFilter : "all";
    let shown = PAGE;

    const listEl = h("div.cl-list");
    const dexSelect = h(
        "select.select.cl-dex-select",
        { "aria-label": "Filter by dex", hidden: filter !== "dex" && !dexes.includes(filter) },
        h("option", { value: "dex" }, "All dexes"),
        dexes.map((name) => h("option", { value: name, selected: name === filter }, name)),
    );
    dexSelect.addEventListener("change", () => setFilter(dexSelect.value));

    const tabs = FILTERS.map((option) =>
        h(
            "button",
            {
                type: "button",
                "aria-pressed": String(option.id === filter || (option.id === "dex" && dexes.includes(filter))),
                onclick: () => setFilter(option.id),
            },
            option.label,
        ),
    );

    function setFilter(next) {
        filter = next;
        shown = PAGE;
        tabs.forEach((tab, i) => tab.setAttribute("aria-pressed", String(FILTERS[i].id === filter || (FILTERS[i].id === "dex" && dexes.includes(filter)))));
        dexSelect.hidden = filter !== "dex" && !dexes.includes(filter);
        dexSelect.value = dexes.includes(filter) ? filter : "dex";
        render();
        listEl.scrollTop = 0;
    }

    function render() {
        const filtered = list.filter((entry) => matches(entry, filter));
        const nodes = [];
        let month = "";

        if (!filtered.length) {
            nodes.push(h("p.subtle", { style: { padding: "24px 0" } }, "Nothing here yet."));
        }

        for (const entry of filtered.slice(0, shown)) {
            const label = new Date(entry.time).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
            if (label !== month) {
                month = label;
                nodes.push(h("h3.cl-month", label));
            }
            nodes.push(
                h(
                    "article.cl-entry",
                    { class: entry.time > seen ? "is-new" : "", dataset: { type: entry.type } },
                    h("span.cl-dot", { "aria-hidden": "true" }),
                    h(
                        "div",
                        h(
                            "div.cl-meta",
                            h("time", { dateTime: new Date(entry.time).toISOString(), title: new Date(entry.time).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" }) }, timeAgo(entry.time)),
                            badge(entry),
                            entry.time > seen ? h("span.badge.badge-success", "New") : null,
                        ),
                        h("ul", entry.changes.map((change) => h("li", change))),
                    ),
                ),
            );
        }

        if (filtered.length > shown) {
            nodes.push(
                h(
                    "button.btn.btn-ghost.cl-more",
                    {
                        type: "button",
                        onclick: () => {
                            shown += PAGE;
                            render();
                        },
                    },
                    `Show older updates (${filtered.length - shown})`,
                ),
            );
        }
        listEl.replaceChildren(...nodes);
    }

    render();

    const { dialog } = openDialog({
        title: "What's new",
        drawer: true,
        body: null,
        className: "changelog-drawer",
    });
    // The drawer needs the filter row and its own scrolling list instead of the default body
    dialog.querySelector(".dialog-inner").append(h("div.cl-filters", h("div.segmented", { role: "group", "aria-label": "Filter updates" }, tabs), dexSelect), listEl);

    if (list[0]) store(SEEN_KEY, list[0].time);
    setUnread(false);
}

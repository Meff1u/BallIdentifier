/**
 * What's new: changelog drawer (bottom sheet on phones, side drawer on desktop)
 * with an unread dot on the bell. Entries come from changelog.json.
 */

import { h, storage, store, timeAgo } from "./core/dom.js";
import { openDialog } from "./core/ui.js";
import { getChangelog } from "./core/data.js";

const SEEN_KEY = "changelogSeen";
const PAGE = 25;
const FILTERS = [
    { id: "all", label: "All" },
    { id: "website", label: "Website" },
    { id: "dex", label: "Dexes" },
];

let bell;
let entries = null;

async function load() {
    if (entries) return entries;
    const data = await getChangelog();
    entries = (data.changes || [])
        .map((entry) => ({ ...entry, time: Number(entry.timestamp) * 1000 }))
        .filter((entry) => Number.isFinite(entry.time))
        .sort((a, b) => b.time - a.time);
    return entries;
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

/** Latest entry of a type, for the "Updated …" pill on the Identifier. */
export async function latestEntry(type) {
    const list = await load();
    return list.find((entry) => !type || entry.type === type) || null;
}

export async function openChangelog(initialFilter = "all") {
    let list;
    try {
        list = await load();
    } catch {
        list = [];
    }
    const seen = seenTime();
    let filter = initialFilter;
    let shown = PAGE;

    const listEl = h("div.cl-list");
    const tabs = FILTERS.map((option) =>
        h(
            "button",
            {
                type: "button",
                "aria-pressed": String(option.id === filter),
                onclick: () => {
                    filter = option.id;
                    shown = PAGE;
                    tabs.forEach((tab, i) => tab.setAttribute("aria-pressed", String(FILTERS[i].id === filter)));
                    render();
                    listEl.scrollTop = 0;
                },
            },
            option.label,
        ),
    );

    function render() {
        const filtered = list.filter((entry) => filter === "all" || entry.type === filter);
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
                            h(`span.badge${entry.type === "website" ? ".badge-accent" : ""}`, entry.type === "website" ? "Website" : "Dex update"),
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
    dialog.querySelector(".dialog-inner").append(h("div.cl-filters", h("div.segmented", { role: "group", "aria-label": "Filter updates" }, tabs)), listEl);

    if (list[0]) store(SEEN_KEY, list[0].time);
    setUnread(false);
}

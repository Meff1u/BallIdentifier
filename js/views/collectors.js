/**
 * Collectors — who collects which ball, in every dex (same data as /collectors in the bot).
 * Logged-in users can add themselves as a collector of any ball, or remove themselves.
 */

import { h, icon, img, fmt, storage, store, timeAgo } from "../core/dom.js";
import { toast, openDialog, confirmDialog } from "../core/ui.js";
import { api, ApiError } from "../core/api.js";
import { getUser, onAuthChange, login, sessionExpired } from "../core/auth.js";
import { getDexList, getDex, compressedArtUrl } from "../core/data.js";

const PAGE = 48;
const FILTERS = [
    { id: "with", label: "With collectors" },
    { id: "all", label: "All balls" },
    { id: "mine", label: "Mine" },
];

export function createView() {
    let dex = storage("collectorsDex", "Ballsdex");
    let filter = "with";
    let balls = []; // [{ id, name, rarity, cc }]
    let entries = {}; // ballId -> [collector]
    let viewer = null;
    let shown = PAGE;
    let loadToken = 0;
    let visible = false;
    let refreshTimer = null;

    const dexSelect = h("select.select", { "aria-label": "Dex" });
    const search = h("input.input", { type: "search", placeholder: "Search balls", "aria-label": "Search balls", autocomplete: "off", spellcheck: false });
    const filterBtns = FILTERS.map((f) => h("button", { type: "button", "aria-pressed": String(f.id === filter), onclick: () => setFilter(f.id) }, f.label));
    const metaCount = h("span.num");
    const metaHint = h("span");
    const grid = h("div.col-grid", { role: "list" });
    const moreBtn = h("button.btn", { type: "button", hidden: true, onclick: () => ((shown += PAGE), paint()) }, h("span", "Show more"));
    const emptyEl = h("div.empty", { hidden: true }, h("div.empty-icon", icon("users")), h("h2", "No collectors here"), h("p"));

    const el = h(
        "section.view",
        { dataset: { view: "collectors" }, "aria-labelledby": "collectors-title" },
        h("div.page-head", h("h1", { id: "collectors-title" }, "Collectors"), h("p", "Who collects which ball. Collect one yourself? Log in and add yourself to it.")),
        h(
            "div.arts-toolbar",
            h("div.toolbar-row", h("label.input-icon", icon("search"), search)),
            h("div.toolbar-row", dexSelect),
        ),
        h("div.col-filters", h("div.segmented", { role: "group", "aria-label": "Show" }, filterBtns)),
        h("div.arts-meta", metaCount, metaHint),
        grid,
        h("div.col-more", moreBtn),
        emptyEl,
    );

    /* ----- Data ----- */

    async function init() {
        const { dexes } = await getDexList();
        if (!dexes.includes(dex)) dex = dexes[0];
        dexSelect.replaceChildren(...dexes.map((name) => h("option", { value: name, selected: name === dex }, name)));
        await load();
    }

    async function load() {
        const token = ++loadToken;
        grid.replaceChildren(...Array.from({ length: 6 }, () => h("div.skeleton.col-skeleton")));
        emptyEl.hidden = true;
        moreBtn.hidden = true;
        try {
            const [dexData, result] = await Promise.all([getDex(dex), api("collectors", { query: { dex } })]);
            if (token !== loadToken) return;
            balls = Object.entries(dexData)
                .filter(([, data]) => data && data.id !== undefined)
                .map(([name, data]) => ({ id: Number(data.id), name, rarity: data.rarity, cc: data.cc }));
            entries = result.entries || {};
            viewer = result.viewer;
            shown = PAGE;
            paint();
            clearTimeout(refreshTimer);
            // The bot is still looking up some Discord names: refresh once they're ready
            if (result.pendingProfiles > 0) refreshTimer = setTimeout(() => visible && reloadCollectors(), 15000);
        } catch (error) {
            if (token !== loadToken) return;
            grid.replaceChildren();
            emptyEl.hidden = false;
            emptyEl.querySelector("h2").textContent = "Couldn't load collectors";
            emptyEl.querySelector("p").textContent = error.message;
        }
    }

    async function reloadCollectors() {
        try {
            const result = await api("collectors", { query: { dex } });
            entries = result.entries || {};
            viewer = result.viewer;
            paint();
            if (result.pendingProfiles > 0) refreshTimer = setTimeout(() => visible && reloadCollectors(), 15000);
        } catch {
            /* keep what's shown */
        }
    }

    /* ----- Rendering ----- */

    const myId = () => viewer?.id || getUser()?.id || null;
    const collectorsOf = (ball) => entries[ball.id] || [];
    const isMine = (ball) => Boolean(myId()) && collectorsOf(ball).some((c) => c.id === myId());
    const displayName = (c) => c.name || (c.missing ? "Unknown user" : `User ${c.id.slice(-4)}`);

    function filtered() {
        const query = search.value.trim().toLowerCase();
        let list = balls.filter((ball) => !query || ball.name.toLowerCase().includes(query) || String(ball.id) === query);
        if (filter === "with") list = list.filter((ball) => collectorsOf(ball).length);
        if (filter === "mine") list = list.filter(isMine);
        const byRarity = (a, b) => (a.rarity ?? 9999) - (b.rarity ?? 9999) || a.name.localeCompare(b.name);
        return filter === "all" ? list.sort(byRarity) : list.sort((a, b) => collectorsOf(b).length - collectorsOf(a).length || byRarity(a, b));
    }

    function avatarStack(collectors) {
        const head = collectors.slice(0, 5);
        return h(
            "div.col-stack",
            head.map((c) => img(c.avatarUrl, "", "col-avatar", { width: 28, height: 28 })),
            collectors.length > head.length ? h("span.col-more-count", `+${collectors.length - head.length}`) : null,
        );
    }

    function card(ball) {
        const collectors = collectorsOf(ball);
        const mine = isMine(ball);
        return h(
            "button.col-card",
            { type: "button", role: "listitem", class: mine ? "is-mine" : "", onclick: () => openBall(ball) },
            h("span.col-art", img(compressedArtUrl(dex, ball.name), "", "", { width: 64, height: 64 })),
            h(
                "span.col-body",
                h("span.col-name", ball.name),
                h("span.col-meta", ball.rarity !== undefined ? `T${ball.rarity}` : null, ball.cc ? ` · needs ${ball.cc}` : null, mine ? h("span.badge.badge-accent", "You") : null),
                collectors.length
                    ? h("span.col-who", avatarStack(collectors), h("span", `${fmt(collectors.length)} collector${collectors.length === 1 ? "" : "s"}`))
                    : h("span.col-who.subtle", "No collectors yet"),
            ),
        );
    }

    function paint() {
        const list = filtered();
        const people = new Set(Object.values(entries).flat().map((c) => c.id));
        metaCount.textContent = `${fmt(list.length)} ${list.length === 1 ? "ball" : "balls"}`;
        metaHint.textContent = `${fmt(people.size)} collectors in ${dex}`;
        grid.replaceChildren(...list.slice(0, shown).map(card));
        moreBtn.hidden = list.length <= shown;
        emptyEl.hidden = list.length > 0;
        if (!list.length) {
            emptyEl.querySelector("h2").textContent = filter === "mine" ? "You're not a collector here yet" : "No collectors here";
            emptyEl.querySelector("p").textContent = filter === "with" ? "Switch to All balls to find one and add yourself." : search.value ? "Try a different spelling." : "Pick a ball from All balls and add yourself.";
        }
        filterBtns.forEach((btn, index) => btn.setAttribute("aria-pressed", String(FILTERS[index].id === filter)));
        filterBtns[2].hidden = !myId();
    }

    function setFilter(id) {
        filter = id;
        shown = PAGE;
        paint();
    }

    /* ----- Ball dialog ----- */

    function openBall(ball) {
        let dialogRef = null;
        const listEl = h("ul.col-list");
        const actions = h("div.col-actions");
        const adminRow = h("div.col-admin");

        function fill() {
            const collectors = collectorsOf(ball);
            const me = myId();
            listEl.replaceChildren(
                ...(collectors.length
                    ? collectors.map((c) =>
                          h(
                              "li",
                              img(c.avatarUrl, "", "col-avatar col-avatar-lg", { width: 40, height: 40 }),
                              h("div.col-person", h("b", displayName(c)), h("span.subtle", c.username ? `@${c.username}` : c.id)),
                              h(
                                  "div.col-tags",
                                  c.source === "verified" ? h("span.badge.badge-success", icon("shield-check", "icon-sm"), "Verified") : h("span.badge", { title: c.addedAt ? `Added ${timeAgo(c.addedAt)}` : "" }, "Self-added"),
                                  viewer?.canModerate || (c.id === me && c.origin !== "data")
                                      ? h("button.icon-btn", { type: "button", "aria-label": c.id === me ? "Remove me" : `Remove ${displayName(c)}`, onclick: () => remove(ball, c) }, icon("trash-2"))
                                      : null,
                              ),
                          ),
                      )
                    : [h("li.subtle", "Nobody has added themselves yet.")]),
            );

            const mine = collectors.find((c) => c.id === me);
            if (!getUser()) {
                actions.replaceChildren(h("button.btn.btn-discord", { type: "button", onclick: () => login("#/collectors") }, icon("discord"), h("span", "Log in to add yourself")));
            } else if (!mine) {
                const addBtn = h("button.btn.btn-primary", { type: "button", onclick: () => add(ball, addBtn) }, icon("plus"), h("span", "I'm a collector"));
                const needed = Math.ceil(Number(String(ball.cc ?? "").replace(/\D/g, "")) / 2);
                actions.replaceChildren(
                    dex === "Ballsdex"
                        ? h("p.subtle.col-req", `Checked against your last Ballsdex sync${Number.isFinite(needed) && needed > 0 ? `: you need at least ${needed} ${ball.name}` : ""}.`)
                        : null,
                    addBtn,
                );
            } else if (mine.origin === "data" && !viewer?.canModerate) {
                actions.replaceChildren(h("p.subtle", icon("shield-check", "icon-sm"), " You're on the verified list for this ball."));
            } else {
                actions.replaceChildren(h("button.btn.btn-danger", { type: "button", onclick: () => remove(ball, mine) }, icon("trash-2"), h("span", "Remove me")));
            }

            // Owner: add anyone by Discord ID, straight to verified
            if (viewer?.canModerate) {
                const idInput = h("input.input", { type: "text", inputMode: "numeric", placeholder: "Discord user ID", "aria-label": "Discord user ID", autocomplete: "off", spellcheck: false });
                const addIdBtn = h("button.btn", { type: "button" }, icon("shield-check"), h("span", "Add as verified"));
                const submit = async () => {
                    const userId = idInput.value.trim();
                    if (!/^\d{17,20}$/.test(userId)) {
                        toast("That isn't a Discord user ID (17-20 digits).", "error");
                        idInput.focus();
                        return;
                    }
                    addIdBtn.disabled = true;
                    try {
                        await api("collectors", { method: "POST", body: { action: "add", dex, ballId: ball.id, userId } });
                        toast(`Added as a verified collector of ${ball.name}.`, "success");
                        await reloadCollectors();
                        fill();
                    } catch (error) {
                        handleError(error);
                        addIdBtn.disabled = false;
                    }
                };
                addIdBtn.addEventListener("click", submit);
                idInput.addEventListener("keydown", (event) => {
                    if (event.key === "Enter") submit();
                });
                adminRow.replaceChildren(idInput, addIdBtn);
            }
        }

        async function add(ballToAdd, btn) {
            btn.disabled = true;
            try {
                await api("collectors", { method: "POST", body: { action: "add", dex, ballId: ballToAdd.id } });
                toast(`You're now a collector of ${ballToAdd.name}.`, "success");
                await reloadCollectors();
                fill();
            } catch (error) {
                handleError(error);
                btn.disabled = false;
            }
        }

        async function remove(ballToChange, collector) {
            const self = collector.id === myId();
            const ok = await confirmDialog({
                title: self ? "Remove yourself?" : "Remove this collector?",
                message: self ? `You won't be listed as a collector of ${ballToChange.name} anymore.` : `${displayName(collector)} won't be listed as a collector of ${ballToChange.name}.`,
                confirmLabel: "Remove",
                danger: true,
            });
            if (!ok) return;
            try {
                await api("collectors", { method: "POST", body: { action: "remove", dex, ballId: ballToChange.id, userId: collector.id } });
                toast(self ? "Removed." : `${displayName(collector)} removed.`, "success");
                await reloadCollectors();
                if (dialogRef?.dialog.isConnected) fill();
            } catch (error) {
                handleError(error);
            }
        }

        fill();
        dialogRef = openDialog({
            title: ball.name,
            className: "col-dialog",
            body: [
                h(
                    "div.col-dialog-head",
                    img(compressedArtUrl(dex, ball.name), "", "", { width: 96, height: 96 }),
                    h(
                        "dl.kv",
                        h("div", h("dt", "Dex"), h("dd", dex)),
                        ball.rarity !== undefined ? h("div", h("dt", "Rarity"), h("dd", `T${ball.rarity}`)) : null,
                        ball.cc ? h("div", h("dt", "Collector requirement"), h("dd", ball.cc)) : null,
                        h("div", h("dt", "ID"), h("dd", String(ball.id))),
                    ),
                ),
                listEl,
                adminRow,
                h("p.subtle.col-note", "Verified collectors are confirmed by the BallIdentifier owner. Self-added ones were added by the users themselves."),
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
        toast(error.message, error.status === 429 || error.status === 409 ? "info" : "error");
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
    dexSelect.addEventListener("change", () => {
        dex = dexSelect.value;
        store("collectorsDex", dex);
        load();
    });
    onAuthChange(() => {
        if (filter === "mine" && !getUser()) filter = "with";
        if (visible) reloadCollectors();
    });

    let started = false;
    return {
        el,
        show() {
            visible = true;
            if (!started) {
                started = true;
                init();
            }
        },
        hide() {
            visible = false;
            clearTimeout(refreshTimer);
        },
    };
}

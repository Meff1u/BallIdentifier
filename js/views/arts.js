/**
 * Spawn Arts — browse every ball of a dex, search, sort, and open previous or enlarged arts.
 */

import { h, icon, img, fmt, storage, store } from "../core/dom.js";
import { toast, openDialog } from "../core/ui.js";
import { api } from "../core/api.js";
import {
    getDexList,
    getDex,
    getPreviousArts,
    artUrl,
    compressedArtUrl,
    previousArtUrl,
    DEX_WITH_WAVES,
    DEX_WITH_PREVIOUS_ARTS,
    WAVE_COLORS,
} from "../core/data.js";

const SORTS = [
    { id: "rarity", label: "Rarity" },
    { id: "a-z", label: "A–Z" },
    { id: "wave", label: "Wave" },
    { id: "id", label: "ID" },
];

const DEFAULTS = { showWave: true, showRarity: true, showArtist: true, showID: false, sort: "rarity" };

export function createView() {
    const settings = { ...DEFAULTS, ...(storage("displaySettings") || {}) };
    let dex = storage("artsDex", "Ballsdex");
    let balls = []; // [name, details, cardEl]
    let loadedDex = null;
    let loadToken = 0;
    let pendingBall = null; // from a shared link: /arts/<dex>/<ball>

    const dexSelect = h("select.select", { "aria-label": "Dex" });
    const search = h("input.input", { type: "search", placeholder: "Search balls", "aria-label": "Search balls", autocomplete: "off", spellcheck: false, "data-search": "" });
    const optionsBtn = h("button.btn", { type: "button", "aria-label": "View options" }, icon("sliders-horizontal"), h("span.hide-sm", "View"));

    const metaCount = h("span.num");
    const metaHint = h("span");
    const grid = h("div.arts-grid", { role: "list" });
    const emptyEl = h("div.empty", { hidden: true }, h("div.empty-icon", icon("search")), h("h2", "No balls found"), h("p", "Try a different spelling or another dex."));

    const el = h(
        "section.view",
        { dataset: { view: "arts" }, "aria-labelledby": "arts-title" },
        h("h1.sr-only", { id: "arts-title" }, "Spawn Arts"),
        h(
            "div.arts-toolbar",
            h("div.toolbar-row", h("label.input-icon", icon("search"), search)),
            h("div.toolbar-row", dexSelect, optionsBtn),
        ),
        h("div.arts-meta", metaCount, h("span.arts-meta-end", metaHint, h("a.arts-contrib", { href: "https://github.com/Meff1u/BallIdentifier#contributing-dex-data", target: "_blank", rel: "noopener" }, icon("github", "icon-sm"), "Missing or wrong art? Help on GitHub"))),
        grid,
        emptyEl,
    );

    /* ----- Settings ----- */

    function save() {
        store("displaySettings", settings);
    }

    function applyVisibility() {
        grid.toggleAttribute("data-hide-wave", !settings.showWave || !DEX_WITH_WAVES.includes(dex));
        grid.toggleAttribute("data-hide-rarity", !settings.showRarity);
        grid.toggleAttribute("data-hide-artist", !settings.showArtist);
        grid.toggleAttribute("data-hide-id", !settings.showID);
        metaHint.textContent = "Tap a ball for its details";
    }

    function effectiveSort() {
        return settings.sort === "wave" && !DEX_WITH_WAVES.includes(dex) ? "rarity" : settings.sort;
    }

    /* ----- Data ----- */

    async function init() {
        const { dexes } = await getDexList();
        if (!dexes.includes(dex)) dex = dexes[0];
        dexSelect.replaceChildren(...dexes.map((name) => h("option", { value: name, selected: name === dex }, name)));
        load();
    }

    dexSelect.addEventListener("change", () => {
        dex = dexSelect.value;
        store("artsDex", dex);
        load();
    });

    async function load() {
        const token = ++loadToken;
        grid.setAttribute("aria-busy", "true");
        grid.replaceChildren(...Array.from({ length: 12 }, () => h("div.art-card", { "aria-hidden": "true" }, h("div.art-img.skeleton"), h("div.art-body", h("div.skeleton", { style: { height: "14px", width: "70%" } })))));
        metaCount.textContent = "Loading…";
        try {
            const data = await getDex(dex);
            if (token !== loadToken) return;
            balls = Object.entries(data).map(([name, details]) => [name, details, card(name, details)]);
            loadedDex = dex;
            sortAndRender();
            openPending();
        } catch {
            if (token !== loadToken) return;
            grid.replaceChildren();
            metaCount.textContent = "";
            toast(`Couldn't load ${dex}. Check your connection and try again.`, "error");
        } finally {
            if (token === loadToken) grid.removeAttribute("aria-busy");
        }
    }

    function card(name, details) {
        const wave = details.wave;
        return h(
            "button.art-card",
            { type: "button", role: "listitem", dataset: { name: name.toLowerCase() }, onclick: () => open(name) },
            h(
                "div.art-tags",
                wave !== undefined
                    ? h("span.wave-tag", { title: `Wave ${wave}` }, h("i", { style: { background: WAVE_COLORS[wave] || "#808080" } }), `W${wave}`)
                    : h("span"),
                details.id !== undefined ? h("span.id-tag", `#${details.id}`) : null,
            ),
            h("div.art-img", img(compressedArtUrl(dex, name), "")),
            h(
                "div.art-body",
                h("span.art-name", name),
                h("span.art-meta", h("span.m-rarity", h("b", `T${details.rarity}`)), h("span.m-artist", details.artist || "Unknown artist")),
            ),
        );
    }

    function sortAndRender() {
        const by = effectiveSort();
        const byName = (a, b) => a[0].localeCompare(b[0]);
        const sorters = {
            rarity: (a, b) => a[1].rarity - b[1].rarity || byName(a, b),
            "a-z": byName,
            wave: (a, b) => a[1].wave - b[1].wave || byName(a, b),
            id: (a, b) => a[1].id - b[1].id,
        };
        balls.sort(sorters[by] || sorters.rarity);
        grid.replaceChildren(...balls.map((ball) => ball[2]));
        applyVisibility();
        filter();
    }

    function filter() {
        const query = search.value.trim().toLowerCase();
        let visible = 0;
        for (const [, , cardEl] of balls) {
            const match = !query || cardEl.dataset.name.includes(query);
            cardEl.hidden = !match;
            if (match) visible += 1;
        }
        const sortLabel = SORTS.find((s) => s.id === effectiveSort())?.label.toLowerCase();
        metaCount.textContent = query ? `${fmt(visible)} of ${fmt(balls.length)} entries` : `${fmt(balls.length)} entries · by ${sortLabel}`;
        emptyEl.hidden = visible > 0 || !balls.length;
    }

    let searchTimer;
    search.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(filter, 60);
    });

    /* ----- Card actions ----- */

    // Collectors per dex, loaded the first time a ball of that dex is opened
    const collectorsCache = new Map(); // dex -> Promise<{ [ballId]: collector[] }>
    function getCollectors(dexName) {
        if (!collectorsCache.has(dexName)) {
            const promise = api("collectors", { query: { dex: dexName } }).then((result) => result.entries || {});
            promise.catch(() => collectorsCache.delete(dexName));
            collectorsCache.set(dexName, promise);
        }
        return collectorsCache.get(dexName);
    }

    function previousArtsGrid(name, arts) {
        return h(
            "div.prev-arts",
            arts.map((art, index) => {
                const image = h("img", { src: previousArtUrl(name, index), alt: `${name}, art by ${art.artist}`, loading: "lazy" });
                image.addEventListener("error", () => (image.src = previousArtUrl(name, index, "gif")), { once: true });
                return h(
                    "figure.prev-art",
                    { title: art.alt || undefined },
                    image,
                    h("div", h("span", "Artist ", h("b", art.artist)), h("span", "Used until ", h("b", art.until)), art.alt ? h("span", art.alt) : null),
                );
            }),
        );
    }

    function openPending() {
        if (!pendingBall || loadedDex !== dex) return;
        const wanted = pendingBall.toLowerCase();
        pendingBall = null;
        const match = balls.find(([name]) => name.toLowerCase() === wanted);
        if (match) open(match[0]);
        else toast("That ball isn't in this dex.", "info");
    }

    const ballPath = (dexName, name) => `/arts/${encodeURIComponent(dexName)}/${encodeURIComponent(name)}`;

    /** Ball details: the full art, the same facts as /info in the bot, collectors and previous arts. */
    function open(name) {
        const dexName = loadedDex;
        const details = balls.find(([ballName]) => ballName === name)?.[1] || {};
        const kv = (label, value, cls = "") => (value === undefined || value === null || value === "" ? null : h("div", h("dt", label), h(`dd${cls}`, String(value))));

        const tags = h(
            "div.bd-tags",
            details.rarity !== undefined ? h("span.badge.badge-accent", `T${details.rarity}`) : null,
            details.wave !== undefined ? h("span.badge", h("i.bd-wave", { style: { background: WAVE_COLORS[details.wave] || "#808080" } }), `Wave ${details.wave}`) : null,
            details.id !== undefined ? h("span.badge", `#${details.id}`) : null,
        );

        const facts = h(
            "dl.kv.bd-facts",
            kv("Rarity", details.rarity !== undefined ? `T${details.rarity}` : null),
            kv("Artist", details.artist || "Unknown", ".text"),
            kv("Wave", details.wave),
            kv("Common value", details.common_value),
            kv("Collector requirement", details.cc),
            kv("Demand tier", details.demand),
            kv("ID", details.id),
        );

        const collectorsBody = h("div.bd-collectors", h("div.skeleton", { style: { height: "32px" } }));
        const collectorsTitle = h("h3", icon("crown", "icon-sm"), "Collectors");
        getCollectors(dexName)
            .then((entries) => {
                const list = entries[details.id] || [];
                collectorsTitle.replaceChildren(icon("crown", "icon-sm"), `Collectors (${fmt(list.length)})`);
                if (!list.length) return collectorsBody.replaceChildren(h("p.subtle", "No collectors yet."));
                collectorsBody.replaceChildren(
                    ...list.map((c) =>
                        h(
                            "span.bd-person",
                            { title: c.username ? `@${c.username}` : c.id },
                            img(c.avatarUrl, "", "col-avatar", { width: 24, height: 24 }),
                            h("span", c.name || (c.missing ? "Unknown user" : `User ${c.id.slice(-4)}`)),
                            c.source === "verified" ? icon("shield-check", "icon-sm bd-verified") : null,
                        ),
                    ),
                );
            })
            .catch(() => collectorsBody.replaceChildren(h("p.subtle", "Couldn't load collectors.")));

        const prevSection = h("section.bd-prev", { hidden: true });
        const prevBtn = h("button.btn", { type: "button", hidden: true, "aria-expanded": "false" }, icon("history"), h("span", "Previous arts"));
        if (DEX_WITH_PREVIOUS_ARTS.includes(dexName)) {
            getPreviousArts()
                .then((all) => {
                    const arts = all?.[name];
                    if (!arts?.length) return;
                    prevBtn.hidden = false;
                    prevBtn.querySelector("span").textContent = `Previous arts (${arts.length})`;
                    prevBtn.addEventListener("click", () => {
                        if (!prevSection.childElementCount) prevSection.append(h("h3", "Previous arts"), previousArtsGrid(name, arts));
                        prevSection.hidden = !prevSection.hidden;
                        prevBtn.setAttribute("aria-expanded", String(!prevSection.hidden));
                        if (!prevSection.hidden) prevSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    });
                })
                .catch(() => {});
        }

        // The address bar shows this ball, so the link can be shared (with its own preview)
        const path = ballPath(dexName, name);
        history.replaceState(null, "", path);
        const copyBtn = h("button.btn.btn-ghost", { type: "button" }, icon("link"), h("span", "Copy link"));
        copyBtn.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(location.origin + path);
                toast("Link copied.", "success");
            } catch {
                toast("Couldn't copy the link.", "error");
            }
        });

        openDialog({
            title: name,
            wide: true,
            className: "ball-dialog",
            onClose: () => {
                if (location.pathname === path) history.replaceState(null, "", "/arts");
            },
            body: [
                h(
                    "div.bd-layout",
                    h("a.bd-art", { href: artUrl(dexName, name), target: "_blank", rel: "noopener", title: "Open the full-size art" }, h("img", { src: artUrl(dexName, name), alt: `${name} spawn art` })),
                    h(
                        "div.bd-info",
                        h("div.bd-head", tags, h("span.subtle", dexName)),
                        facts,
                        h("section.bd-section", collectorsTitle, collectorsBody),
                        h(
                            "div.bd-actions",
                            prevBtn,
                            copyBtn,
                            h("a.btn.btn-ghost", { href: `https://github.com/Meff1u/BallIdentifier/blob/main/assets/jsons/${encodeURIComponent(dexName)}.json`, target: "_blank", rel: "noopener" }, icon("external-link"), h("span", "Wrong details? Fix on GitHub")),
                        ),
                    ),
                ),
                prevSection,
            ],
        });
    }

    /* ----- Options sheet ----- */

    optionsBtn.addEventListener("click", () => {
        const hasWaves = DEX_WITH_WAVES.includes(dex);

        const sortButtons = SORTS.filter((s) => s.id !== "wave" || hasWaves).map((s) =>
            h(
                "button",
                {
                    type: "button",
                    "aria-pressed": String(effectiveSort() === s.id),
                    onclick: (event) => {
                        settings.sort = s.id;
                        save();
                        event.currentTarget.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === event.currentTarget)));
                        sortAndRender();
                    },
                },
                s.label,
            ),
        );

        const toggle = (key, label, disabled = false) => {
            const input = h("input", { type: "checkbox", checked: Boolean(settings[key]), disabled });
            input.addEventListener("change", () => {
                settings[key] = input.checked;
                save();
                applyVisibility();
            });
            return h("label.switch", h("span", label, disabled ? h("span.subtle", " (not in this dex)") : null), input);
        };

        const doneBtn = h("button.btn.btn-primary", { type: "button" }, "Done");
        const dialog = openDialog({
            title: "View options",
            body: h(
                "div.stack",
                { style: { gap: "24px" } },
                h("div.field", h("span.label", "Sort by"), h("div.segmented", { role: "group", "aria-label": "Sort by" }, sortButtons)),
                h(
                    "div.field",
                    h("span.label", "Show on cards"),
                    h("div", toggle("showRarity", "Rarity"), toggle("showArtist", "Artist"), toggle("showWave", "Wave", !hasWaves), toggle("showID", "ID")),
                ),
                h("p.callout", icon("info", "icon-sm"), h("span", "Arts are cached so the page loads faster. Missing a new art? Hard-refresh with Ctrl+F5, or pull down to refresh on your phone.")),
            ),
            footer: [doneBtn],
        });
        doneBtn.addEventListener("click", () => dialog.close());
    });

    init();

    return {
        el,
        show(params = []) {
            const [dexParam, ballParam] = params;
            if (!dexParam) return;
            pendingBall = ballParam || null;
            if (dexParam !== dex) {
                dex = dexParam;
                // Before init() finished, it validates the dex and loads it
                if (dexSelect.options.length) {
                    if (![...dexSelect.options].some((o) => o.value === dex)) dex = loadedDex || dexSelect.options[0].value;
                    dexSelect.value = dex;
                    load();
                }
                return;
            }
            openPending();
        },
    };
}

/**
 * Spawn Arts — browse every ball of a dex, search, sort, and open previous or enlarged arts.
 */

import { h, icon, img, fmt, storage, store } from "../core/dom.js";
import { toast, openDialog } from "../core/ui.js";
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

const DEFAULTS = { showWave: true, showRarity: true, showArtist: true, showID: false, onClick: "previous-arts", sort: "rarity" };

export function createView() {
    const settings = { ...DEFAULTS, ...(storage("displaySettings") || {}) };
    let dex = storage("artsDex", "Ballsdex");
    let balls = []; // [name, details, cardEl]
    let loadedDex = null;
    let loadToken = 0;

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
        h("div.arts-meta", metaCount, metaHint),
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
        const canPrevious = DEX_WITH_PREVIOUS_ARTS.includes(dex);
        metaHint.textContent = settings.onClick === "previous-arts" && canPrevious ? "Tap a ball to see its previous arts" : "Tap a ball to see its full art";
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

    async function open(name) {
        const canPrevious = DEX_WITH_PREVIOUS_ARTS.includes(loadedDex);
        if (settings.onClick === "previous-arts" && canPrevious) {
            let arts;
            try {
                arts = (await getPreviousArts())[name];
            } catch {
                return toast("Couldn't load previous arts. Try again.", "error");
            }
            if (!arts?.length) return toast(`${name} has no previous arts yet.`, "info");
            const { dialog } = openDialog({
                title: `Previous arts of ${name}`,
                className: "prev-arts-dialog",
                body: h(
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
                ),
            });
            dialog.style.setProperty("--n", String(Math.min(arts.length, 5)));
            return;
        }
        openDialog({
            title: name,
            wide: true,
            body: h("img.enlarged-art", { src: artUrl(loadedDex, name), alt: `${name} spawn art` }),
        });
    }

    /* ----- Options sheet ----- */

    optionsBtn.addEventListener("click", () => {
        const hasWaves = DEX_WITH_WAVES.includes(dex);
        const hasPrevious = DEX_WITH_PREVIOUS_ARTS.includes(dex);

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

        const clickOption = (value, title, hint, disabled = false) => {
            const input = h("input", { type: "radio", name: "arts-click", value, checked: settings.onClick === value || (disabled === false && value === "enlarge-art" && !hasPrevious), disabled });
            input.addEventListener("change", () => {
                settings.onClick = value;
                save();
                applyVisibility();
            });
            return h("label.option", input, h("strong", title), h("small", hint));
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
                h(
                    "div.field",
                    h("span.label", "When I tap a ball"),
                    h(
                        "div.option-grid",
                        clickOption("previous-arts", "Previous arts", hasPrevious ? "Older versions of the art" : "Ballsdex only", !hasPrevious),
                        clickOption("enlarge-art", "Full art", "The current art, enlarged"),
                    ),
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
        show() {},
    };
}

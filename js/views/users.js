/**
 * Users — search BallIdentifier users with a public profile.
 */

import { h, icon, img, fmt } from "../core/dom.js";
import { api } from "../core/api.js";
import { getUser, onAuthChange } from "../core/auth.js";
import { dexIcon } from "../core/data.js";
import { ACCENTS } from "./profile.js";

export function createView() {
    let loadToken = 0;
    let loaded = false;

    const search = h("input.input", { type: "search", placeholder: "Search by Discord name", "aria-label": "Search users", autocomplete: "off", spellcheck: false, dataset: { search: "" } });
    const meta = h("div.arts-meta");
    const grid = h("div.uc-grid", { role: "list" });
    const emptyEl = h("div.empty", { hidden: true }, h("div.empty-icon", icon("users", "icon-lg")), h("h2"), h("p"));
    const ownCta = h("div");

    const el = h(
        "section.view",
        { dataset: { view: "users" }, "aria-labelledby": "users-title" },
        h("div.page-head", h("h1", { id: "users-title" }, "Users"), h("p", "Public profiles of BallIdentifier users: what they collect, their showcase and Ballsdex stats.")),
        h("div.arts-toolbar", h("div.toolbar-row", h("label.input-icon", icon("search"), search))),
        ownCta,
        meta,
        grid,
        emptyEl,
    );

    function paintCta() {
        const user = getUser();
        if (!user) return ownCta.replaceChildren();
        ownCta.replaceChildren(
            user
                ? h(
                      "div.card.uc-cta",
                      img(user.avatarUrl, "", "avatar"),
                      h("p", h("b", "Your profile"), h("span.subtle", "Show what you collect, your favorite balls and your Ballsdex stats.")),
                      h("a.btn.btn-sm", { href: `/u/${user.id}` }, icon("user-round", "icon-sm"), h("span", "Open")),
                  )
                : null,
        );
    }

    async function load() {
        const token = ++loadToken;
        const q = search.value.trim();
        if (!grid.children.length) grid.replaceChildren(...Array.from({ length: 6 }, () => h("div.skeleton.uc-skeleton")));
        try {
            const result = await api("profile", { query: { q } });
            if (token !== loadToken) return;
            loaded = true;
            grid.replaceChildren(...result.users.map(card));
            meta.textContent = q ? `${fmt(result.total)} ${result.total === 1 ? "match" : "matches"}` : `${fmt(result.total)} public ${result.total === 1 ? "profile" : "profiles"}${result.total > result.users.length ? ` · showing the ${result.users.length} most recently updated` : ""}`;
            emptyEl.hidden = result.users.length > 0;
            emptyEl.querySelector("h2").textContent = q ? "Nobody found" : "No public profiles yet";
            emptyEl.querySelector("p").textContent = q ? "Only users who made their profile public show up here." : "Be the first: open your profile and make it public.";
        } catch (error) {
            if (token !== loadToken) return;
            grid.replaceChildren();
            meta.textContent = "";
            emptyEl.hidden = false;
            emptyEl.querySelector("h2").textContent = "Couldn't load users";
            emptyEl.querySelector("p").textContent = error.message;
        }
    }

    function card(user) {
        return h(
            "a.card.uc-card",
            { href: `/u/${user.id}`, role: "listitem", style: { "--pf-accent": ACCENTS[user.accent] || ACCENTS.violet } },
            img(user.avatarUrl, "", "uc-avatar", { width: 56, height: 56 }),
            h(
                "div.uc-body",
                h("div.uc-name", h("b", user.name || user.username || "Unknown"), user.pronouns ? h("span.badge", user.pronouns) : null),
                user.username ? h("span.subtle", `@${user.username}`) : null,
                user.bio ? h("p.uc-bio", user.bio) : null,
                h(
                    "div.uc-foot",
                    user.favoriteDex ? h("span", img(dexIcon(user.favoriteDex), "", "badge-ico"), user.favoriteDex) : null,
                    user.collections ? h("span", icon("crown", "icon-sm"), `${fmt(user.collections)} collecting`) : null,
                ),
            ),
        );
    }

    let timer;
    search.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(load, 250);
    });
    onAuthChange(paintCta);

    return {
        el,
        show() {
            paintCta();
            if (!loaded) load();
        },
    };
}

/**
 * BallIdentifier — app shell: routing, navigation, theme, account, What's new.
 */

import { h, icon, setIcon, $, $$, img, store } from "./core/dom.js";
import { toast, toggleMenu, menuItem, closeMenu } from "./core/ui.js";
import { THEMES, getThemeChoice, setTheme, applyTheme, onThemeChange, resolvedTheme } from "./core/theme.js";
import { getUser, loadSession, onAuthChange, login, logout } from "./core/auth.js";
import { initChangelog, openChangelog } from "./changelog.js";
import { initNotifications } from "./notifications.js";
import { autoEnhanceSelects } from "./core/select.js";

// The owner sees "Moderation" in the profile menu (the page and the API check it again)
const OWNER_ID = "334411435633541121";

const ROUTES = {
    identify: { title: "Identify", load: () => import("./views/identify.js") },
    arts: { title: "Spawn Arts", load: () => import("./views/arts.js") },
    trainer: { title: "Catch Trainer", load: () => import("./views/trainer.js") },
    bot: { title: "Bot", load: () => import("./views/bot.js") },
    collectors: { title: "Collectors", load: () => import("./views/collectors.js") },
    users: { title: "Users", load: () => import("./views/users.js") },
    u: { title: "Profile", load: () => import("./views/profile.js") },
    moderation: { title: "Moderation", load: () => import("./views/moderation.js") },
    ballsdex: { title: "Ballsdex", load: () => import("./views/ballsdex.js") },
};

const views = new Map(); // name -> { el, show, hide }
let current = null;
let routeToken = 0;

const viewsRoot = $("#views");

/* ---------- Routing ---------- */

// Pages use clean paths (/ballsdex/specials), so every page can have its own link preview.
// Old links (/#/ballsdex/specials) still work: they're turned into the new form on load.

const decode = (part) => {
    try {
        return decodeURIComponent(part);
    } catch {
        return part;
    }
};

export function parseRoute() {
    const [name, ...rest] = location.pathname.split("/").filter(Boolean).map(decode);
    return { name: ROUTES[name] ? name : "identify", params: rest, query: new URLSearchParams(location.search) };
}

/** "/#/bot?login=ok" -> "/bot?login=ok" */
function upgradeLegacyHash() {
    if (!location.hash.startsWith("#/")) return false;
    const [path, query] = location.hash.slice(1).split("?");
    history.replaceState(null, "", `${path}${query ? `?${query}` : ""}`);
    return true;
}

function isAppPath(pathname) {
    const first = pathname.split("/").filter(Boolean)[0];
    return !first || Boolean(ROUTES[first]);
}

export function navigate(path, { replace = false } = {}) {
    if (path !== location.pathname + location.search) history[replace ? "replaceState" : "pushState"](null, "", path);
    route();
}

// Same-site links are handled here instead of reloading the page
document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.("a[href]");
    if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
    const raw = link.getAttribute("href");
    if (raw.startsWith("#") && !raw.startsWith("#/")) {
        // In-page anchor (skip link)
        event.preventDefault();
        const target = document.getElementById(decode(raw.slice(1)));
        target?.focus?.();
        target?.scrollIntoView();
        return;
    }
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    let path = url.pathname + url.search;
    if (url.hash.startsWith("#/")) path = url.hash.slice(1);
    if (!isAppPath(path.split("?")[0])) return;
    event.preventDefault();
    navigate(path);
});

async function route() {
    const token = ++routeToken;
    const { name, params, query } = parseRoute();
    closeMenu();
    setDrawer(false);

    handleLoginResult(query);
    if (query.get("whatsnew")) {
        history.replaceState(null, "", location.pathname);
        openChangelog();
    }

    const navName = name === "u" ? "users" : name;
    $$("[data-nav]").forEach((link) => {
        if (link.dataset.nav === navName) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });
    document.title = name === "identify" ? "BallIdentifier · Identify any ball in a second" : `${ROUTES[name].title} · BallIdentifier`;
    document.body.dataset.route = name;

    let view = views.get(name);
    if (!view) {
        try {
            const module = await ROUTES[name].load();
            if (token !== routeToken) return;
            view = module.createView();
            views.set(name, view);
            viewsRoot.append(view.el);
        } catch (error) {
            console.error(error);
            toast("This page failed to load. Refresh and try again.", "error");
            return;
        }
    }

    if (current && current !== view) {
        current.hide?.();
        current.el.hidden = true;
    }
    const changed = current !== view;
    current = view;
    view.el.hidden = false;
    if (changed) {
        // Replay the entrance animation
        view.el.style.animation = "none";
        void view.el.offsetWidth;
        view.el.style.animation = "";
        window.scrollTo({ top: 0, behavior: "instant" });
    }
    view.show?.(params, { changed });
}

const LOGIN_MESSAGES = {
    cancelled: ["Login was cancelled.", "info"],
    expired: ["The login link expired. Try again.", "error"],
    error: ["Couldn't log you in with Discord. Try again.", "error"],
    config: ["Login isn't configured on this deployment.", "error"],
};

function handleLoginResult(query) {
    const result = query.get("login");
    if (!result) return;
    let [message, type] = LOGIN_MESSAGES[result] || LOGIN_MESSAGES.error;
    const missing = (query.get("missing") || "").split(",").filter((name) => /^[A-Z_]{3,40}$/.test(name));
    if (result === "config" && missing.length) message = `Login isn't set up here: add ${missing.join(" and ")} to the environment variables.`;
    toast(message, type, type === "error" ? 9000 : 4200);
    history.replaceState(null, "", location.pathname);
}

/* ---------- Theme ---------- */

const themeBtn = $("#theme-btn");

/** The theme's color circle (both halves: its two main colors), used in the menu and on the button. */
function themeSwatch(theme) {
    return h("span.theme-swatch", { style: { "--sw-bg": theme.swatch[0], "--sw-accent": theme.swatch[1] }, "aria-hidden": "true" });
}

themeBtn.addEventListener("click", () =>
    toggleMenu(
        themeBtn,
        () => [
            h("div.menu-label", "Theme"),
            THEMES.map((theme) =>
                menuItem({
                    label: theme.label,
                    lead: themeSwatch(theme),
                    checked: getThemeChoice() === theme.id,
                    onSelect: () => setTheme(theme.id),
                }),
            ),
        ],
        { label: "Theme" },
    ),
);

onThemeChange(() => {
    const choice = THEMES.find((theme) => theme.id === getThemeChoice()) || THEMES[0];
    themeBtn.replaceChildren(themeSwatch(choice));
    themeBtn.setAttribute("aria-label", `Theme: ${resolvedTheme()}`);
});

/* ---------- Account ---------- */

const accountSlot = $("#account-slot");

function renderAccount(user) {
    closeMenu();
    if (!user) {
        accountSlot.replaceChildren(
            h(
                "button.btn.btn-discord.btn-sm",
                { type: "button", "aria-label": "Log in with Discord", onclick: () => login() },
                icon("discord", "icon-sm"),
                h("span.login-label", "Log in"),
            ),
        );
        return;
    }

    const trigger = h(
        "button.account-btn",
        { type: "button", "aria-haspopup": "menu", "aria-expanded": "false", "aria-label": `Account: ${user.displayName}` },
        img(user.avatarUrl, "", "avatar"),
        icon("chevron-down", "icon-sm"),
    );
    trigger.addEventListener("click", () =>
        toggleMenu(
            trigger,
            () => [
                h(
                    "div.menu-user",
                    img(user.avatarUrl, "", "avatar"),
                    h("div", h("strong", user.displayName), h("small", `@${user.username}`)),
                ),
                h("div.menu-sep"),
                menuItem({ label: "Your profile", iconName: "user-round", href: `#/u/${user.id}` }),
                menuItem({ label: "Ballsdex account", iconName: "layers", href: "#/ballsdex" }),
                menuItem({ label: "Notifier settings", iconName: "bell-ring", href: "#/bot/notifier" }),
                user.id === OWNER_ID ? menuItem({ label: "Moderation", iconName: "shield-check", href: "#/moderation" }) : null,
                h("div.menu-sep"),
                menuItem({
                    label: "Log out",
                    iconName: "log-out",
                    onSelect: async () => {
                        await logout();
                        toast("You're logged out.", "info");
                    },
                }),
            ],
            { label: "Account" },
        ),
    );
    accountSlot.replaceChildren(trigger);
}

/* ---------- Navigation drawer (phones and tablets) ---------- */

const navToggle = $("#nav-toggle");
const drawerQuery = window.matchMedia("(max-width: 1023.98px)");

function setDrawer(open) {
    if (!navToggle) return;
    const wasOpen = document.documentElement.classList.contains("nav-open");
    document.documentElement.classList.toggle("nav-open", open);
    navToggle.setAttribute("aria-expanded", String(open));
    // Closed drawer: links out of the tab order on small screens
    $("#sidebar")?.toggleAttribute("inert", drawerQuery.matches && !open);
    if (open) $("#sidebar .nav-link[aria-current='page']")?.focus({ preventScroll: true });
    else if (wasOpen && document.activeElement?.closest?.("#sidebar")) navToggle.focus({ preventScroll: true });
}

navToggle?.addEventListener("click", () => setDrawer(!document.documentElement.classList.contains("nav-open")));
$("#nav-close")?.addEventListener("click", () => setDrawer(false));
$("#nav-backdrop")?.addEventListener("click", () => setDrawer(false));
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.documentElement.classList.contains("nav-open")) setDrawer(false);
});
drawerQuery.addEventListener("change", () => setDrawer(false));
setDrawer(false);

/* ---------- Boot ---------- */

applyTheme();
onAuthChange(renderAccount);
autoEnhanceSelects();

/* ---------- Sidebar collapse (desktop) ---------- */

const sidebarToggle = $("#sidebar-toggle");
function paintSidebar() {
    const collapsed = document.documentElement.getAttribute("data-sidebar") === "collapsed";
    sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
    sidebarToggle.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
    sidebarToggle.querySelector(".nav-label").textContent = collapsed ? "Expand" : "Collapse";
    setIcon(sidebarToggle.querySelector("svg"), collapsed ? "panel-left-open" : "panel-left-close");
}
sidebarToggle?.addEventListener("click", () => {
    const collapsed = document.documentElement.getAttribute("data-sidebar") !== "collapsed";
    if (collapsed) document.documentElement.setAttribute("data-sidebar", "collapsed");
    else document.documentElement.removeAttribute("data-sidebar");
    store("sidebarCollapsed", collapsed);
    paintSidebar();
});
if (sidebarToggle) paintSidebar();
initChangelog($("#whats-new-btn"));
initNotifications($("#notifications-btn"));
$("#whats-new-btn").addEventListener("click", () => openChangelog());

window.addEventListener("popstate", route);
window.addEventListener("hashchange", () => upgradeLegacyHash() && route());
upgradeLegacyHash();
route();
loadSession();

// Keyboard: "/" focuses the search on Spawn Arts
document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !event.ctrlKey && !event.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) {
        const search = current?.el.querySelector("[data-search]");
        if (search && !current.el.hidden) {
            event.preventDefault();
            search.focus();
            search.select();
        }
    }
});

export { getUser };

/**
 * BallIdentifier — app shell: routing, navigation, theme, account, What's new.
 */

import { h, icon, setIcon, $, $$, img } from "./core/dom.js";
import { toast, toggleMenu, menuItem, closeMenu } from "./core/ui.js";
import { THEMES, getThemeChoice, setTheme, applyTheme, onThemeChange, resolvedTheme } from "./core/theme.js";
import { getUser, loadSession, onAuthChange, login, logout } from "./core/auth.js";
import { initChangelog, openChangelog } from "./changelog.js";

const ROUTES = {
    identify: { title: "Identify", load: () => import("./views/identify.js") },
    arts: { title: "Spawn Arts", load: () => import("./views/arts.js") },
    trainer: { title: "Catch Trainer", load: () => import("./views/trainer.js") },
    bot: { title: "Bot", load: () => import("./views/bot.js") },
    ballsdex: { title: "Ballsdex", load: () => import("./views/ballsdex.js") },
};

const views = new Map(); // name -> { el, show, hide }
let current = null;
let routeToken = 0;

const viewsRoot = $("#views");
const titleEl = $("#topbar-title");

/* ---------- Routing ---------- */

export function parseHash(hash = location.hash) {
    const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
    const [name, ...rest] = path.split("/").filter(Boolean);
    return { name: ROUTES[name] ? name : "identify", params: rest, query: new URLSearchParams(query) };
}

async function route() {
    const token = ++routeToken;
    const { name, params, query } = parseHash();

    handleLoginResult(query);

    $$("[data-nav]").forEach((link) => {
        if (link.dataset.nav === name) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });
    titleEl.textContent = ROUTES[name].title;
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
    history.replaceState(null, "", location.hash.split("?")[0]);
}

/* ---------- Theme ---------- */

const themeBtn = $("#theme-btn");

function themeIcon() {
    const choice = getThemeChoice();
    return THEMES.find((theme) => theme.id === choice)?.icon || "monitor";
}

themeBtn.addEventListener("click", () =>
    toggleMenu(
        themeBtn,
        () => [
            h("div.menu-label", "Theme"),
            THEMES.map((theme) =>
                menuItem({
                    label: theme.label,
                    iconName: theme.icon,
                    checked: getThemeChoice() === theme.id,
                    onSelect: () => setTheme(theme.id),
                }),
            ),
        ],
        { label: "Theme" },
    ),
);

onThemeChange(() => {
    setIcon(themeBtn.querySelector("svg"), themeIcon());
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
                { type: "button", onclick: () => login() },
                icon("discord", "icon-sm"),
                h("span", "Log in"),
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
                menuItem({ label: "Ballsdex account", iconName: "layers", href: "#/ballsdex" }),
                menuItem({ label: "Notifier settings", iconName: "bell-ring", href: "#/bot/notifier" }),
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

/* ---------- Boot ---------- */

applyTheme();
onAuthChange(renderAccount);
initChangelog($("#whats-new-btn"));
$("#whats-new-btn").addEventListener("click", () => openChangelog());

window.addEventListener("hashchange", route);
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

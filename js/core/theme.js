/**
 * Themes: light, dark, synthwave, sakura, or follow the system (no data-theme attribute).
 * js/theme-boot.js applies the saved choice before first paint.
 */

import { storage, store } from "./dom.js";

export const THEMES = [
    { id: "system", label: "Match system", icon: "monitor" },
    { id: "light", label: "Light", icon: "sun" },
    { id: "dark", label: "Dark", icon: "moon" },
    { id: "synthwave", label: "Synthwave", icon: "sparkles" },
    { id: "sakura", label: "Sakura", icon: "flower" },
];

const THEME_COLORS = { light: "#F6F4FA", dark: "#0E0B14", synthwave: "#0D0519", sakura: "#FBF0F4" };
const media = window.matchMedia("(prefers-color-scheme: light)");
const listeners = new Set();

export function getThemeChoice() {
    const saved = storage("theme");
    return THEMES.some((theme) => theme.id === saved) ? saved : "system";
}

export function resolvedTheme(choice = getThemeChoice()) {
    if (choice !== "system") return choice;
    return media.matches ? "light" : "dark";
}

export function applyTheme(choice = getThemeChoice()) {
    const root = document.documentElement;
    if (choice === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", choice);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[resolvedTheme(choice)]);
    for (const fn of listeners) fn(choice);
}

export function setTheme(choice) {
    store("theme", choice);
    applyTheme(choice);
}

export function onThemeChange(fn) {
    listeners.add(fn);
}

media.addEventListener("change", () => {
    if (getThemeChoice() === "system") applyTheme("system");
});

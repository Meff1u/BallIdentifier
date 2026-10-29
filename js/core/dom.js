/**
 * Tiny DOM helpers. Everything user- or API-provided goes through textContent,
 * never innerHTML, so these helpers are the only way markup is built.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const ICON_SPRITE = "assets/icons.svg";

export function h(tag, props, ...children) {
    const [name, ...classes] = tag.split(".");
    const el = document.createElement(name || "div");
    if (classes.length) el.className = classes.join(" ");

    if (props && (typeof props !== "object" || props instanceof Node || Array.isArray(props))) {
        children.unshift(props);
        props = null;
    }

    if (props) {
        for (const [key, value] of Object.entries(props)) {
            if (value === undefined || value === null || value === false) continue;
            if (key === "class" || key === "className") el.className = [el.className, value].filter(Boolean).join(" ");
            else if (key === "dataset") Object.assign(el.dataset, value);
            else if (key === "style") for (const [prop, v] of Object.entries(value)) el.style.setProperty(prop, v);
            else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
            else if (key === "text") el.textContent = value;
            // App links use clean paths ("#/arts" -> "/arts"), so they can be copied and shared
            else if (key === "href" && typeof value === "string" && value.startsWith("#/")) el.setAttribute("href", value.slice(1));
            else if (value === true) el.setAttribute(key, "");
            else if (key in el && !key.startsWith("aria-") && key !== "list" && key !== "form") el[key] = value;
            else el.setAttribute(key, value);
        }
    }

    append(el, children);
    return el;
}

export function append(parent, children) {
    for (const child of children.flat(Infinity)) {
        if (child === null || child === undefined || child === false) continue;
        parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return parent;
}

/** Lucide icon from the sprite. */
export function icon(name, cls = "icon") {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", cls);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", `${ICON_SPRITE}#i-${name}`);
    svg.append(use);
    return svg;
}

export function setIcon(svg, name) {
    svg?.querySelector("use")?.setAttribute("href", `${ICON_SPRITE}#i-${name}`);
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function clear(el) {
    el.replaceChildren();
    return el;
}

export function spinner() {
    return h("span.spinner", { role: "status", "aria-label": "Loading" });
}

/** Image that hides itself if it fails to load (bot icons, avatars). */
export function img(src, alt = "", cls = "", extra = {}) {
    const el = h("img", { src, alt, class: cls, loading: "lazy", decoding: "async", ...extra });
    el.addEventListener("error", () => el.classList.add("is-broken"), { once: true });
    return el;
}

/** Initial-letter avatar for things without an image. */
export function initials(name = "?") {
    return (
        name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => [...part][0])
            .join("")
            .toUpperCase() || "?"
    );
}

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const numberFormat = new Intl.NumberFormat("en-US");
export const fmt = (n) => (Number.isFinite(Number(n)) ? numberFormat.format(Number(n)) : "—");

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function timeAgo(date) {
    const then = date instanceof Date ? date.getTime() : new Date(date).getTime();
    if (!Number.isFinite(then)) return "unknown";
    const seconds = Math.round((then - Date.now()) / 1000);
    const units = [
        ["year", 31536000],
        ["month", 2592000],
        ["week", 604800],
        ["day", 86400],
        ["hour", 3600],
        ["minute", 60],
    ];
    for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
    }
    return "just now";
}

export function formatDate(date, opts = { day: "numeric", month: "short", year: "numeric" }) {
    const d = date instanceof Date ? date : new Date(date);
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-GB", opts) : "Unknown";
}

/** Same format the bot uses: 1d 2h 3m 4.567s */
export function formatDuration(ms) {
    if (!Number.isFinite(ms)) return "—";
    const total = ms / 1000;
    const d = Math.floor(total / 86400);
    const hr = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (hr || d) parts.push(`${hr}h`);
    if (m || hr || d) parts.push(`${m}m`);
    parts.push(`${s.toFixed(m || hr || d ? 0 : 2)}s`);
    return parts.join(" ");
}

export function storage(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch {
        return fallback;
    }
}

export function store(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* private mode */
    }
}

export async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const area = h("textarea", { value: text, readonly: true, style: { position: "fixed", opacity: "0" } });
        document.body.append(area);
        area.select();
        const ok = document.execCommand("copy");
        area.remove();
        return ok;
    }
}

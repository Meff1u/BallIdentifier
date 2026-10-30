/**
 * Shared UI primitives: toasts, dialogs (centered + sheet/drawer), popover menus, confirm.
 */

import { h, icon, reducedMotion } from "./dom.js";

/* ---------- Toasts ---------- */

let toastRegion;
const TOAST_ICONS = { success: "circle-check", error: "circle-x", info: "info" };

export function toast(message, type = "info", duration = 4200) {
    toastRegion ??= document.getElementById("toasts");
    const el = h(`div.toast.toast-${type}`, { role: type === "error" ? "alert" : "status" }, icon(TOAST_ICONS[type] || "info"), h("span", message));
    toastRegion.append(el);
    const remove = () => {
        if (!el.isConnected) return;
        el.classList.add("leaving");
        setTimeout(() => el.remove(), reducedMotion() ? 0 : 220);
    };
    setTimeout(remove, duration);
    el.addEventListener("click", remove);
    while (toastRegion.children.length > 3) toastRegion.firstElementChild.remove();
}

/* ---------- Dialogs ---------- */

export function openDialog({ title, body, footer, wide = false, drawer = false, onClose, dismissible = true, className = "", initialFocus = "auto" }) {
    const titleId = `dlg-${Math.random().toString(36).slice(2, 8)}`;
    const closeBtn = dismissible
        ? h("button.icon-btn", { type: "button", "aria-label": "Close", onclick: () => close() }, icon("x"))
        : null;

    const dialog = h(
        "dialog.dialog",
        { class: [wide && "dialog-wide", drawer && "drawer", className].filter(Boolean).join(" "), "aria-labelledby": titleId, tabindex: "-1" },
        h(
            "div.dialog-inner",
            drawer ? h("div.grabber", { "aria-hidden": "true" }) : null,
            h("div.dialog-head", h("h2", { id: titleId }, title), closeBtn),
            body ? h("div.dialog-body", body) : null,
            footer ? h("div.dialog-foot", footer) : null,
        ),
    );

    let closed = false;
    function close(result) {
        if (closed) return;
        closed = true;
        const finish = () => {
            stopKeyboardTracking();
            dialog.close();
            dialog.remove();
            onClose?.(result);
        };
        if (reducedMotion()) return finish();
        dialog.classList.add("closing");
        setTimeout(finish, 200);
    }

    dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        if (dismissible) close();
    });
    // Click on the backdrop closes
    dialog.addEventListener("click", (event) => {
        if (dismissible && event.target === dialog) close();
    });

    // Bottom sheets stay above the on-screen keyboard (iOS and Android overlay it)
    const viewport = window.visualViewport;
    const trackKeyboard = () => {
        const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
        dialog.style.setProperty("--keyboard", `${Math.round(covered)}px`);
    };
    const stopKeyboardTracking = () => {
        viewport?.removeEventListener("resize", trackKeyboard);
        viewport?.removeEventListener("scroll", trackKeyboard);
    };
    if (drawer && viewport) {
        viewport.addEventListener("resize", trackKeyboard);
        viewport.addEventListener("scroll", trackKeyboard);
    }

    document.body.append(dialog);
    dialog.showModal();
    if (initialFocus === "dialog") dialog.focus();
    else if (initialFocus instanceof HTMLElement) initialFocus.focus();
    return { dialog, close };
}

export function isDialogOpen() {
    return Boolean(document.querySelector("dialog[open]"));
}

/** Promise-based confirm. */
export function confirmDialog({ title, message, confirmLabel = "Confirm", danger = false }) {
    return new Promise((resolve) => {
        let result = false;
        const { close } = openDialog({
            title,
            body: h("p.muted", message),
            footer: [
                h("button.btn.btn-ghost", { type: "button", onclick: () => close() }, "Cancel"),
                h(
                    `button.btn.${danger ? "btn-danger" : "btn-primary"}`,
                    {
                        type: "button",
                        onclick: () => {
                            result = true;
                            close();
                        },
                    },
                    confirmLabel,
                ),
            ],
            onClose: () => resolve(result),
        });
    });
}

/* ---------- Popover menus ---------- */

let openMenu = null;

export function closeMenu() {
    if (!openMenu) return;
    const { el, trigger, onKey, onDown } = openMenu;
    el.remove();
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("pointerdown", onDown, true);
    openMenu = null;
}

/**
 * toggleMenu(trigger, () => [menu items...]) — positions under the trigger, closes on outside click/Esc.
 */
export function toggleMenu(trigger, build, { label = "Menu" } = {}) {
    if (openMenu?.trigger === trigger) return closeMenu();
    closeMenu();

    const el = h("div.menu", { role: "menu", "aria-label": label }, build(closeMenu));
    document.body.append(el);

    const rect = trigger.getBoundingClientRect();
    const width = el.offsetWidth;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    el.style.left = `${left}px`;
    el.style.top = `${rect.bottom + 8}px`;

    const items = () => [...el.querySelectorAll(".menu-item:not([disabled])")];
    const onKey = (event) => {
        if (event.key === "Escape") {
            closeMenu();
            trigger.focus();
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const list = items();
            const index = list.indexOf(document.activeElement);
            const next = event.key === "ArrowDown" ? index + 1 : index - 1;
            list[(next + list.length) % list.length]?.focus();
        } else if (event.key === "Tab") {
            closeMenu();
        }
    };
    const onDown = (event) => {
        if (!el.contains(event.target) && !trigger.contains(event.target)) closeMenu();
    };

    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    trigger.setAttribute("aria-expanded", "true");
    openMenu = { el, trigger, onKey, onDown };
    (el.querySelector('[aria-checked="true"]') || items()[0])?.focus();
}

export function menuItem({ label, iconName, lead, onSelect, checked, href, role = "menuitem", danger }) {
    // lead: any element shown instead of an icon (e.g. a theme's color circle)
    const content = [lead || (iconName ? icon(iconName) : null), h("span", label)];
    if (checked !== undefined) content.push(icon("check", "icon-sm check"));
    const props = {
        role: checked !== undefined ? "menuitemradio" : role,
        "aria-checked": checked === undefined ? undefined : String(Boolean(checked)),
        tabindex: "-1",
        class: danger ? "is-danger" : undefined,
    };
    if (href) {
        return h("a.menu-item", { ...props, href, onclick: () => closeMenu() }, content);
    }
    return h(
        "button.menu-item",
        {
            ...props,
            type: "button",
            onclick: () => {
                closeMenu();
                onSelect?.();
            },
        },
        content,
    );
}

window.addEventListener("resize", closeMenu);
window.addEventListener("popstate", closeMenu);

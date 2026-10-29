/**
 * Themed select boxes. Every <select class="select"> on the page gets a button + listbox drawn
 * with the theme tokens, while the native <select> stays in the DOM (visually hidden) as the
 * source of truth: views keep reading/setting .value, replacing <option>s and listening to "change".
 */

import { h, icon } from "./dom.js";

const enhanced = new WeakMap(); // select -> { button, sync }
const valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
const indexDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "selectedIndex");
const supportsPopover = typeof HTMLElement.prototype.showPopover === "function";
let openMenu = null;

function closeOpenMenu({ focus = false } = {}) {
    if (!openMenu) return;
    const { menu, button, cleanup } = openMenu;
    openMenu = null;
    cleanup();
    if (supportsPopover && menu.matches(":popover-open")) menu.hidePopover();
    menu.remove();
    button.setAttribute("aria-expanded", "false");
    if (focus) button.focus();
}

function choose(select, option) {
    if (option.disabled || select.value === option.value) return;
    valueDesc.set.call(select, option.value);
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
}

function open(select, button) {
    closeOpenMenu();
    const menu = h("div.cs-menu", { role: "listbox", tabindex: "-1", "aria-label": button.getAttribute("aria-label") || "" });
    if (supportsPopover) menu.popover = "manual";

    let current = null;
    for (const child of select.children) {
        const options = child.tagName === "OPTGROUP" ? [...child.children] : [child];
        if (child.tagName === "OPTGROUP") menu.append(h("div.cs-group", child.label));
        for (const option of options) {
            if (option.tagName !== "OPTION" || option.hidden) continue;
            const selected = option.selected;
            const item = h(
                "div.cs-option",
                { role: "option", tabindex: "-1", "aria-selected": String(selected), "aria-disabled": option.disabled ? "true" : undefined },
                h("span.cs-text", option.textContent),
                selected ? icon("check", "icon-sm cs-check") : null,
            );
            item.addEventListener("click", () => {
                choose(select, option);
                closeOpenMenu({ focus: true });
            });
            menu.append(item);
            if (selected) current = item;
        }
    }

    // Inside a modal <dialog> the menu must live in the dialog, or it would be inert
    (button.closest("dialog") || document.body).append(menu);
    if (supportsPopover) menu.showPopover();

    const rect = button.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const maxHeight = Math.min(320, Math.max(below, above) - 4);
    menu.style.maxHeight = `${Math.max(120, maxHeight)}px`;
    menu.style.minWidth = `${rect.width}px`;
    const width = menu.offsetWidth;
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    const height = menu.offsetHeight;
    menu.style.top = `${below >= height || below >= above ? rect.bottom + 4 : rect.top - height - 4}px`;

    const items = () => [...menu.querySelectorAll('.cs-option:not([aria-disabled="true"])')];
    (current || items()[0])?.focus();
    current?.scrollIntoView({ block: "nearest" });

    let typed = "";
    let typedTimer;
    const onKey = (event) => {
        const list = items();
        const index = list.indexOf(document.activeElement);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const next = event.key === "ArrowDown" ? Math.min(list.length - 1, index + 1) : Math.max(0, index - 1);
            list[next]?.focus();
        } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            list[event.key === "Home" ? 0 : list.length - 1]?.focus();
        } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            document.activeElement?.click();
        } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation(); // don't close the surrounding dialog
            closeOpenMenu({ focus: true });
        } else if (event.key === "Tab") {
            closeOpenMenu();
        } else if (event.key.length === 1 && /\S/.test(event.key)) {
            typed += event.key.toLowerCase();
            clearTimeout(typedTimer);
            typedTimer = setTimeout(() => (typed = ""), 600);
            list.find((item) => item.textContent.trim().toLowerCase().startsWith(typed))?.focus();
        }
    };
    const onDown = (event) => {
        if (!menu.contains(event.target) && !button.contains(event.target)) closeOpenMenu();
    };
    const onScroll = (event) => {
        if (!menu.contains(event.target)) closeOpenMenu();
    };
    menu.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", closeOpenMenu);
    button.setAttribute("aria-expanded", "true");
    openMenu = {
        menu,
        button,
        cleanup: () => {
            document.removeEventListener("pointerdown", onDown, true);
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", closeOpenMenu);
        },
    };
}

export function enhanceSelect(select) {
    if (enhanced.has(select) || select.multiple || !select.parentNode) return;

    const label = h("span.cs-label");
    const button = h("button", { type: "button", "aria-haspopup": "listbox", "aria-expanded": "false" }, label);
    button.className = `${select.className} cs-button`;
    select.className = "cs-native";
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    select.after(button);

    const labelEl = select.id ? document.querySelector(`label[for="${CSS.escape(select.id)}"]`) : null;
    const name = select.getAttribute("aria-label") || labelEl?.textContent.trim() || "";

    function sync() {
        const option = select.options[select.selectedIndex];
        label.textContent = option ? option.textContent : "";
        button.setAttribute("aria-label", name ? `${name}: ${label.textContent}` : label.textContent);
        button.hidden = select.hidden;
        button.disabled = select.disabled;
        if (openMenu?.button === button && (select.hidden || select.disabled)) closeOpenMenu();
    }

    // Views set .value / .selectedIndex directly: keep the button in step
    Object.defineProperty(select, "value", {
        configurable: true,
        get: () => valueDesc.get.call(select),
        set: (value) => {
            valueDesc.set.call(select, value);
            sync();
        },
    });
    Object.defineProperty(select, "selectedIndex", {
        configurable: true,
        get: () => indexDesc.get.call(select),
        set: (value) => {
            indexDesc.set.call(select, value);
            sync();
        },
    });
    new MutationObserver(sync).observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden", "disabled", "selected", "label"] });
    select.addEventListener("change", sync);
    select.addEventListener("focus", () => button.focus());
    labelEl?.addEventListener("click", (event) => {
        event.preventDefault();
        button.focus();
    });

    button.addEventListener("click", () => (openMenu?.button === button ? closeOpenMenu() : open(select, button)));
    button.addEventListener("keydown", (event) => {
        if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            open(select, button);
        }
    });

    enhanced.set(select, { button, sync });
    sync();
}

/** Enhance every select.select now and whenever one is added to the page. */
export function autoEnhanceSelects(root = document.body) {
    const scan = (node) => {
        if (node.nodeType !== 1) return;
        if (node.matches("select.select")) enhanceSelect(node);
        node.querySelectorAll?.("select.select").forEach(enhanceSelect);
    };
    scan(root);
    new MutationObserver((mutations) => {
        for (const mutation of mutations) mutation.addedNodes.forEach(scan);
    }).observe(root, { childList: true, subtree: true });
}

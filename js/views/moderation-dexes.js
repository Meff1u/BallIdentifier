/**
 * Moderation -> Dexes (owner): add a dex, turn one on/off, edit its settings (catch phrases, waves,
 * trainer abbreviations) or delete it with every file. The bot commits each change to the website repo
 * (assets/jsons/dexes.json + the dex's files); the bot uses it right away, the website after its next deploy.
 */

import { h, icon, img, fmt } from "../core/dom.js";
import { toast, openDialog } from "../core/ui.js";
import { api } from "../core/api.js";
import { dexIcon } from "../core/data.js";

const DEPLOY_NOTE = "The bot uses it right away; the website after its next deploy (about 2 minutes).";
const MAX_ICON_BYTES = 2 * 1024 * 1024;

const lines = (text) =>
    String(text || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

function readBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = () => reject(new Error("Couldn't read the file."));
        reader.readAsDataURL(file);
    });
}

const field = (label, control, hint) => h("div.field", h("label.label", label, control), hint ? h("p.hint", hint) : null);
const checkbox = (label, hint, checked = false) => {
    const input = h("input", { type: "checkbox", checked });
    return { input, el: h("label.switch", h("span", h("b", label), hint ? h("small.hint", hint) : null), input) };
};

/** Dialog with a confirm button; resolves with what the form says, or null when cancelled. */
function ask({ title, body, confirmLabel, danger = false, read = () => ({}), canConfirm = () => true }) {
    return new Promise((resolve) => {
        let result = null;
        const confirm = h(`button.btn.${danger ? "btn-danger" : "btn-primary"}`, { type: "button" }, confirmLabel);
        const sync = () => (confirm.disabled = !canConfirm());
        const dialog = openDialog({
            title,
            body,
            footer: [h("button.btn.btn-ghost", { type: "button", onclick: () => dialog.close() }, "Cancel"), confirm],
            onClose: () => resolve(result),
        });
        confirm.addEventListener("click", () => {
            result = read();
            dialog.close();
        });
        body.forEach?.((part) => part?.addEventListener?.("input", sync));
        sync();
    });
}

export function createDexesCard({ handleError }) {
    let state = null; // { dexes, github }
    let busy = false;
    const list = h("ul.mod-dex-list", h("li.skeleton.mod-dex-skel"));
    const addBtn = h("button.btn.btn-sm.btn-primary", { type: "button" }, icon("plus", "icon-sm"), h("span", "Add dex"));
    const warning = h("p.callout.callout-warning", { hidden: true }, icon("triangle-alert", "icon-sm"), h("span", "GITHUB_TOKEN isn't set in the bot's .env, so the list can't be changed from here."));
    const el = h(
        "section.card.panel.mod-card.mod-dexes",
        h("div.mod-dexes-head", h("h2", icon("layers"), "Dexes"), addBtn),
        h("p.subtle", "Every change is committed to the website repo. ", DEPLOY_NOTE),
        warning,
        list,
    );

    async function run(body, success) {
        if (busy) return false;
        busy = true;
        el.setAttribute("aria-busy", "true");
        try {
            const result = await api("admin", { method: "POST", body });
            state = { dexes: result.dexes, github: result.github };
            render();
            toast(success, "success");
            return true;
        } catch (error) {
            handleError(error);
            return false;
        } finally {
            busy = false;
            el.removeAttribute("aria-busy");
        }
    }

    async function load() {
        try {
            state = await api("admin", { query: { view: "dexes" } });
            render();
        } catch (error) {
            list.replaceChildren(h("li.subtle", error.message));
        }
    }

    /* ----- Actions ----- */

    async function toggle(dex, input) {
        const on = input.checked;
        input.checked = !on; // stays until it's saved
        const announce = checkbox("Announce in the changelog", "Users get the update notification.", true);
        const answer = await ask({
            title: `${on ? "Turn on" : "Turn off"} ${dex.name}?`,
            body: [
                h(
                    "p.muted",
                    on
                        ? `${dex.name} comes back everywhere: identification, spawn arts, the trainer, collectors, /info, the Notifier and Catch stats.`
                        : `${dex.name} disappears from identification, spawn arts, the trainer, collectors, /info, the Notifier and Catch stats. Its files stay, so you can turn it back on any time.`,
                ),
                announce.el,
            ],
            confirmLabel: on ? "Turn on" : "Turn off",
            danger: !on,
            read: () => ({ announce: announce.input.checked }),
        });
        if (!answer) return;
        await run({ action: "dex-update", name: dex.name, enabled: on, announce: answer.announce }, `${dex.name} is ${on ? "on" : "off"}. ${DEPLOY_NOTE}`);
    }

    async function settings(dex) {
        const phrases = h("textarea.textarea", { rows: 4, placeholder: "One per line. Empty: the default (Ballsdex) phrases.", value: (dex.catchPhrases || []).join("\n") });
        const ignore = h("textarea.textarea", { rows: 3, placeholder: "One per line", value: (dex.catchIgnore ?? ["Wrong name", "already been caught", "not the right"]).join("\n") });
        const waves = checkbox("Waves", "Entries have a wave (shown and sortable on Spawn Arts).", Boolean(dex.waves));
        const incomplete = checkbox("Trainer abbreviations are incomplete", "The trainer warns that short names may not be accepted.", Boolean(dex.incomplete));
        const answer = await ask({
            title: `${dex.name} settings`,
            body: [
                field("Catch phrases", phrases, "Catch stats count a message of this dex bot as a catch when it contains any of these."),
                field("Ignore when it contains", ignore, "For answers like “wrong name”."),
                waves.el,
                incomplete.el,
            ],
            confirmLabel: "Save",
            read: () => ({ catchPhrases: lines(phrases.value), catchIgnore: lines(ignore.value), waves: waves.input.checked, incomplete: incomplete.input.checked }),
        });
        if (!answer) return;
        await run({ action: "dex-update", name: dex.name, ...answer }, `${dex.name} saved. ${DEPLOY_NOTE}`);
    }

    async function remove(dex) {
        const confirmInput = h("input.input", { type: "text", autocomplete: "off", spellcheck: false, placeholder: dex.name });
        const announce = checkbox("Announce in the changelog", "Users get the update notification.", true);
        const answer = await ask({
            title: `Delete ${dex.name}?`,
            body: [
                h("p.muted", "This removes it from the website repo for good:"),
                h(
                    "ul.mod-dex-gone",
                    h("li", "the entry in the dex list"),
                    h("li", `every spawn art and preview (assets/dexes/${dex.name}/)`),
                    h("li", "its details, hashes and collectors (assets/jsons)"),
                    h("li", "its icon"),
                ),
                h("p.subtle", "Only git history keeps it. To hide it for a while, turn it off instead."),
                field(`Type ${dex.name} to confirm`, confirmInput),
                announce.el,
            ],
            confirmLabel: "Delete for good",
            danger: true,
            canConfirm: () => confirmInput.value === dex.name,
            read: () => ({ announce: announce.input.checked }),
        });
        if (!answer) return;
        await run({ action: "dex-delete", name: dex.name, confirm: dex.name, announce: answer.announce }, `${dex.name} was deleted. ${DEPLOY_NOTE}`);
    }

    async function add() {
        const name = h("input.input", { type: "text", maxLength: 40, autocomplete: "off", placeholder: "e.g. CarsDex" });
        const botId = h("input.input", { type: "text", inputMode: "numeric", autocomplete: "off", placeholder: "Discord ID of the dex bot" });
        const key = h("input.input", { type: "text", maxLength: 5, autocomplete: "off", placeholder: "e.g. CD" });
        const iconInput = h("input.input", { type: "file", accept: "image/png,image/webp,image/jpeg,image/gif" });
        const waves = checkbox("Waves", "Entries have a wave.", false);
        const enabled = checkbox("Turn on now", "Off: add its entries in Spawn Arts first, then turn it on here.", false);
        const valid = () => name.value.trim() && /^\d{17,20}$/.test(botId.value.trim()) && /^[A-Za-z0-9]{2,5}$/.test(key.value.trim());
        const answer = await ask({
            title: "Add a dex",
            body: [
                h("div.grid-2", field("Name", name, "As the dex calls itself. Used in file names."), field("Short key", key, "2–5 letters, unique (BD is Ballsdex).")),
                field("Bot ID", botId, "Right-click the dex bot in Discord → Copy User ID."),
                field("Icon", iconInput, "Square image, made 128×128."),
                waves.el,
                enabled.el,
                h("p.subtle", "Catch phrases start from the Ballsdex ones; change them in its settings after adding."),
            ],
            confirmLabel: "Add dex",
            canConfirm: valid,
            read: () => ({ name: name.value.trim(), botId: botId.value.trim(), key: key.value.trim().toUpperCase(), waves: waves.input.checked, enabled: enabled.input.checked, file: iconInput.files?.[0] || null }),
        });
        if (!answer) return;
        let iconData = null;
        if (answer.file) {
            if (answer.file.size > MAX_ICON_BYTES) return toast("The icon is too big (2 MB max).", "error");
            iconData = await readBase64(answer.file);
        }
        const { file, ...fields } = answer;
        await run({ action: "dex-add", ...fields, icon: iconData, announce: true }, `${answer.name} was added${answer.enabled ? "" : " (off)"}. ${DEPLOY_NOTE}`);
    }

    addBtn.addEventListener("click", () => add());

    /* ----- List ----- */

    function render() {
        if (!state) return;
        warning.hidden = state.github !== false;
        addBtn.disabled = state.github === false;
        list.replaceChildren(
            ...state.dexes.map((dex) => {
                const toggleInput = h("input", { type: "checkbox", checked: dex.enabled, disabled: state.github === false, "aria-label": `${dex.name} on` });
                toggleInput.addEventListener("change", () => toggle(dex, toggleInput));
                const details = [dex.key, `bot ${dex.botId}`, dex.enabled && dex.entries !== null ? `${fmt(dex.entries)} entries` : null].filter(Boolean).join(" · ");
                return h(
                    "li.mod-dex",
                    { class: dex.enabled ? "" : "is-off" },
                    img(dexIcon(dex.name), "", "mod-dex-icon", { width: 36, height: 36 }),
                    h(
                        "div.mod-dex-body",
                        h("b", dex.name, dex.enabled ? null : h("span.badge", "Off"), dex.waves ? h("span.badge", "Waves") : null, dex.catchPhrases?.length ? h("span.badge", "Own catch phrases") : null),
                        h("span.subtle", details),
                    ),
                    h("label.switch.mod-dex-switch", toggleInput),
                    h(
                        "div.mod-dex-actions",
                        h("button.icon-btn", { type: "button", "aria-label": `${dex.name} settings`, title: "Settings", disabled: state.github === false, onclick: () => settings(dex) }, icon("settings-2")),
                        h("button.icon-btn.mod-danger", { type: "button", "aria-label": `Delete ${dex.name}`, title: "Delete", disabled: state.github === false, onclick: () => remove(dex) }, icon("trash-2")),
                    ),
                );
            }),
        );
    }

    return { el, load };
}

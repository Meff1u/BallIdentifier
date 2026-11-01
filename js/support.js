/**
 * Navbar popups: support the project (PayPal) and the contact form (suggestions, bug reports, questions).
 */

import { h, icon } from "./core/dom.js";
import { openDialog, toast } from "./core/ui.js";
import { api } from "./core/api.js";
import { getUser, login, loadSession, sessionExpired } from "./core/auth.js";

const PAYPAL_URL = "https://paypal.me/meffiu";

const TYPES = [
    { id: "suggestion", label: "Suggestion", hint: "An idea or a feature you'd like to see" },
    { id: "bug", label: "Bug report", hint: "Something is broken or shows wrong data" },
    { id: "question", label: "Question", hint: "Something you couldn't figure out" },
    { id: "other", label: "Other", hint: "Anything else" },
];

/* ---------- Support ---------- */

export function openSupport() {
    openDialog({
        title: "Support BallIdentifier",
        className: "support-dialog",
        body: [
            h("p.support-lead", icon("heart"), h("span", "BallIdentifier is a free, solo-run project.")),
            h("p.muted", "Keeping the website and the bot online costs real money every month, and a donation helps cover it:"),
            h(
                "ul.support-list",
                h("li", h("b", "Hosting"), " for the bot, which runs 24/7 and syncs your Ballsdex collections."),
                h("li", h("b", "Database and storage"), " for dexes, spawn arts, profiles and catch stats."),
                h("li", h("b", "Domain and website"), " hosting and its serverless functions."),
                h("li", h("b", "Time"), " spent adding new dexes and features."),
            ),
            h("p.subtle", "No pressure at all. Using the site and telling friends about it helps just as much, and nothing is locked behind a donation. Thank you!"),
        ],
        footer: [
            h("a.btn.btn-primary", { href: PAYPAL_URL, target: "_blank", rel: "noopener noreferrer" }, icon("heart", "icon-sm"), h("span", "Donate with PayPal"), icon("external-link", "icon-sm")),
        ],
    });
}

/* ---------- Contact ---------- */

function minutesLabel(ms) {
    const minutes = Math.max(1, Math.ceil(ms / 60000));
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export async function openContact() {
    if (!getUser()) await loadSession();
    const user = getUser();

    if (!user) {
        const { close } = openDialog({
            title: "Contact & feedback",
            className: "contact-dialog",
            body: [
                h("p.muted", "Log in with Discord to send a suggestion, bug report or question. It goes straight to the owner, and we need to know who it's from."),
            ],
            footer: [
                h("button.btn", { type: "button", onclick: () => close() }, "Cancel"),
                h("button.btn.btn-discord", { type: "button", onclick: () => login() }, icon("discord", "icon-sm"), h("span", "Log in with Discord")),
            ],
        });
        return;
    }

    let limits = { maxLength: 1500, minLength: 10 };
    let cooldownEnd = 0;
    try {
        const info = await api("contact");
        limits = { maxLength: info.maxLength || limits.maxLength, minLength: info.minLength || limits.minLength };
        if (info.cooldownMs > 0) cooldownEnd = Date.now() + info.cooldownMs;
    } catch (error) {
        if (error.status === 401) sessionExpired();
        // The form still works: the bot checks the cooldown again on send
    }

    const typeSelect = h("select.select", { "aria-label": "Message type" }, TYPES.map((type) => h("option", { value: type.id }, type.label)));
    const typeHint = h("span.hint", TYPES[0].hint);
    typeSelect.addEventListener("change", () => (typeHint.textContent = TYPES.find((type) => type.id === typeSelect.value)?.hint || ""));

    const message = h("textarea.textarea", { rows: 7, maxLength: limits.maxLength, placeholder: "Write your message…", "aria-label": "Message" });
    const count = h("span.char-count");
    const notice = h("p.form-error", { role: "alert", hidden: true });
    const cooldownNote = h("p.contact-cooldown", { hidden: true });
    const sendBtn = h("button.btn.btn-primary", { type: "button" }, icon("send", "icon-sm"), h("span", "Send"));

    const tooShort = () => message.value.trim().length < limits.minLength;
    const coolingDown = () => cooldownEnd > Date.now();

    function paint() {
        const length = message.value.length;
        count.textContent = `${length} / ${limits.maxLength}`;
        count.classList.toggle("over", length > limits.maxLength);
        if (coolingDown()) {
            cooldownNote.hidden = false;
            cooldownNote.textContent = `You can send another message in ${minutesLabel(cooldownEnd - Date.now())}.`;
        } else {
            cooldownNote.hidden = true;
        }
        sendBtn.disabled = coolingDown() || tooShort();
    }
    message.addEventListener("input", paint);
    paint();
    const timer = setInterval(paint, 15000);

    const { close } = openDialog({
        title: "Contact & feedback",
        className: "contact-dialog",
        onClose: () => clearInterval(timer),
        initialFocus: message,
        body: [
            h("p.muted", `Signed in as ${user.displayName}. Your message goes straight to the owner by Discord DM, and he may reply there. One message every 10 minutes.`),
            h("div.field", h("label.label", "Type"), typeSelect, typeHint),
            h("div.field", h("label.label", "Message"), message, count),
            cooldownNote,
            notice,
        ],
        footer: [h("button.btn", { type: "button", onclick: () => close() }, "Cancel"), sendBtn],
    });

    sendBtn.addEventListener("click", async () => {
        notice.hidden = true;
        sendBtn.disabled = true;
        try {
            const result = await api("contact", { method: "POST", body: { type: typeSelect.value, message: message.value } });
            clearInterval(timer);
            close();
            toast(`Message sent. Thank you! You can send another in ${minutesLabel(result.cooldownMs || 600000)}.`, "success");
        } catch (error) {
            if (error.status === 401) {
                sessionExpired();
                close();
                toast("Your session expired. Log in again.", "error");
                return;
            }
            if (error.status === 429 && error.data?.retryAfterMs) cooldownEnd = Date.now() + error.data.retryAfterMs;
            notice.textContent = error.message;
            notice.hidden = false;
            paint();
            if (!coolingDown()) sendBtn.disabled = tooShort();
        }
    });
}

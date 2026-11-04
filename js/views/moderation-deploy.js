/**
 * Moderation -> Deploy (owner): dex changes the bot committed wait here (a preview of what will go live);
 * Deploy makes the website pull the repo so they all go live at once (bot: utils/deploy.js).
 */

import { h, icon, timeAgo } from "../core/dom.js";
import { toast, confirmDialog } from "../core/ui.js";
import { api } from "../core/api.js";

export function createDeployCard({ handleError }) {
    let state = null; // { enabled, deploying, pending, lastDeployAt }
    let busy = false;
    const content = h("div.mod-deploy-body", h("div.skeleton", { style: { height: "72px" } }));
    const el = h("section.card.panel.mod-card.mod-deploy", h("h2", icon("upload"), "Deploy"), content);

    async function deploy() {
        const count = state.pending.length;
        const ok = await confirmDialog({
            title: "Deploy the website?",
            message: `${count} change${count === 1 ? "" : "s"} will go live in about 2 minutes, all at once.`,
            confirmLabel: "Deploy",
        });
        if (!ok || busy) return;
        busy = true;
        render();
        try {
            state = await api("admin", { method: "POST", body: { action: "deploy" } });
            toast("Deploy started. The website updates in about 2 minutes.", "success", 6000);
        } catch (error) {
            handleError(error);
        }
        busy = false;
        render();
    }

    function change(item) {
        const details = Array.isArray(item.changes) ? item.changes : [];
        return h(
            "li.mod-deploy-item",
            h(
                "div.mod-deploy-head",
                h("b", item.url ? h("a", { href: item.url, target: "_blank", rel: "noopener noreferrer" }, item.title) : item.title),
                h("time.subtle", { dateTime: item.at, title: new Date(item.at).toLocaleString("en-GB") }, timeAgo(item.at)),
            ),
            details.length ? h("p.subtle", details.join(" · ")) : null,
        );
    }

    function render() {
        if (!state) return;
        const { enabled, pending, lastDeployAt } = state;
        if (!enabled) {
            content.replaceChildren(
                h(
                    "p.callout.callout-warning",
                    icon("triangle-alert", "icon-sm"),
                    h("span", "SITE_DEPLOY_HOOK isn't set for the bot, so dex changes can't be deployed from here. Set it (and DEPLOY_SECRET) in the stack's .env and restart the bot."),
                ),
            );
            return;
        }
        const button = h("button.btn.btn-primary", { type: "button", disabled: busy || state.deploying || !pending.length }, icon("upload", "icon-sm"), h("span", busy || state.deploying ? "Deploying…" : "Deploy"));
        button.addEventListener("click", deploy);
        content.replaceChildren(
            pending.length
                ? h("ul.mod-deploy-list", [...pending].reverse().map(change))
                : h("p.subtle", "Nothing to deploy. Dex changes show up here until you press Deploy."),
            h("div.mod-deploy-foot", button, h("span.subtle", lastDeployAt ? `Last deploy ${timeAgo(lastDeployAt)}` : "No deploy from here yet")),
        );
    }

    return {
        el,
        async load() {
            if (busy) return;
            try {
                state = await api("admin", { query: { view: "deploy" } });
                render();
            } catch (error) {
                if (!state) content.replaceChildren(h("p.subtle", error.message));
                else handleError(error);
            }
        },
    };
}

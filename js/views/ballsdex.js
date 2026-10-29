/**
 * Ballsdex — the web version of /ballsdex: link an API key, sync the collection, see the stats.
 * Everything runs through the bot (same encryption, cooldowns and account checks as in Discord).
 */

import { h, icon, img, fmt, timeAgo, formatDate, formatDuration, spinner } from "../core/dom.js";
import { toast, confirmDialog } from "../core/ui.js";
import { api, ApiError } from "../core/api.js";
import { getUser, onAuthChange, loadSession, login, sessionExpired, sessionReady } from "../core/auth.js";

const KEYS_URL = "https://ballsdex.com/api/keys";
const POLL_MS = 3000;

export function createView() {
    let data = null;
    let renderToken = 0;
    let pollTimer = null;
    let countdownTimer = null;
    let visible = false;

    const body = h("div");
    const el = h(
        "section.view",
        { dataset: { view: "ballsdex" }, "aria-labelledby": "bdx-title" },
        h("div.page-head", h("h1", { id: "bdx-title" }, "Ballsdex"), h("p", "Your Ballsdex collection, synced from your account.")),
        body,
    );

    function stopTimers() {
        clearTimeout(pollTimer);
        clearInterval(countdownTimer);
        pollTimer = null;
        countdownTimer = null;
    }

    function skeleton() {
        body.replaceChildren(
            h(
                "div.stack",
                { "aria-busy": "true" },
                h("div.card.card-pad", h("div.skeleton", { style: { height: "64px" } })),
                h("div.bdx-grid", h("div.card.card-pad", h("div.skeleton", { style: { height: "140px" } })), h("div.card.card-pad", h("div.skeleton", { style: { height: "140px" } }))),
            ),
        );
    }

    function handleAuthError(error) {
        if (error instanceof ApiError && error.status === 401) {
            sessionExpired();
            toast("Your session expired. Log in again.", "info");
            return true;
        }
        return false;
    }

    async function refresh({ quiet = false } = {}) {
        const token = ++renderToken;
        if (!sessionReady()) return skeleton();
        if (!getUser()) {
            stopTimers();
            return renderLoggedOut();
        }
        if (!quiet || !data) skeleton();
        try {
            const next = await api("ballsdex");
            if (token !== renderToken) return null;
            data = next;
            render();
            return data;
        } catch (error) {
            if (token !== renderToken) return null;
            if (handleAuthError(error)) return null;
            body.replaceChildren(
                h(
                    "div.card.empty",
                    h("div.empty-icon", icon("triangle-alert", "icon-lg")),
                    h("h2", "Couldn't load your Ballsdex data"),
                    h("p", error.message),
                    h("button.btn", { type: "button", onclick: () => refresh() }, icon("refresh-cw"), h("span", "Try again")),
                ),
            );
            return null;
        }
    }

    onAuthChange(() => {
        data = null;
        if (visible) refresh();
    });

    /* ----- Logged out ----- */

    function renderLoggedOut() {
        body.replaceChildren(
            h(
                "div.card.empty",
                h("div.empty-icon", icon("layers", "icon-lg")),
                h("h2", "Connect your Ballsdex account"),
                h("p", "Log in with Discord, link your Ballsdex API key once, and see your collection stats here and in the bot."),
                h("button.btn.btn-discord.btn-lg", { type: "button", onclick: () => login("#/ballsdex") }, icon("discord"), h("span", "Log in with Discord")),
            ),
        );
    }

    /* ----- Not linked: link form ----- */

    function renderLinkForm() {
        const input = h("input.input", {
            id: "bdx-key",
            type: "password",
            autocomplete: "off",
            spellcheck: false,
            placeholder: "Paste your API key",
            "aria-describedby": "bdx-key-note",
        });
        const reveal = h("button.icon-btn", { type: "button", "aria-label": "Show key", "aria-pressed": "false" }, icon("eye"));
        reveal.addEventListener("click", () => {
            const show = input.type === "password";
            input.type = show ? "text" : "password";
            reveal.setAttribute("aria-pressed", String(show));
            reveal.setAttribute("aria-label", show ? "Hide key" : "Show key");
        });
        const submit = h("button.btn.btn-primary.btn-block", { type: "submit" }, icon("link"), h("span", "Link account"));
        const error = h("p.form-error", { role: "alert" });

        const form = h(
            "form.panel.card",
            h("h2", icon("key-round"), "Link your API key"),
            h("div.field", h("label.label", { htmlFor: "bdx-key" }, "Ballsdex API key"), h("div.input-group", input, reveal)),
            error,
            submit,
            h(
                "p.callout",
                { id: "bdx-key-note" },
                icon("shield-check", "icon-sm"),
                h("span", "The key travels over HTTPS, is encrypted again for the bot and stored encrypted. It's only used for Ballsdex requests on your behalf. Unlink any time to delete it."),
            ),
        );

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const apiKey = input.value.trim();
            error.textContent = "";
            if (!/^[\x21-\x7e]{10,200}$/.test(apiKey)) {
                error.textContent = "That doesn't look like a Ballsdex API key.";
                input.setAttribute("aria-invalid", "true");
                return input.focus();
            }
            input.removeAttribute("aria-invalid");
            submit.disabled = true;
            submit.replaceChildren(spinner(), h("span", "Checking the key…"));
            try {
                await api("ballsdex", { method: "POST", body: { action: "link", apiKey } });
                input.value = "";
                toast("Ballsdex account linked. Syncing your collection…", "success");
                await refresh();
                startSync({ auto: true });
            } catch (err) {
                if (handleAuthError(err)) return;
                error.textContent = err.message;
                input.setAttribute("aria-invalid", "true");
            } finally {
                submit.disabled = false;
                submit.replaceChildren(icon("link"), h("span", "Link account"));
            }
        });

        const steps = h(
            "div.panel.card",
            h("h2", icon("info"), "Create an API key"),
            h(
                "ol.link-steps",
                h("li", h("span", "Open ", h("a", { href: KEYS_URL, target: "_blank", rel: "noopener" }, "Ballsdex API keys", icon("external-link", "icon-sm inline-icon")), ".")),
                h("li", h("span", "Log in with the same Discord account you use here.")),
                h("li", h("span", "Create a key with ", h("b", "all five scopes"), " selected.")),
                h("li", h("span", "Copy the key and paste it in the form.")),
            ),
            h("p.subtle", "The key lets BallIdentifier read data Ballsdex only shows to the account owner, like your full collection."),
        );

        const parts = [];
        if (data?.databaseAvailable === false) {
            parts.push(h("p.callout.callout-warning", { style: { "margin-bottom": "16px" } }, icon("triangle-alert", "icon-sm"), h("span", "Collection storage is offline right now. You can link, but syncing may fail until it's back.")));
        }
        parts.push(h("div.bdx-grid", { style: { "margin-top": "0" } }, steps, form));
        body.replaceChildren(...parts);
    }

    /* ----- Linked ----- */

    function render() {
        stopTimers();
        if (!data?.linked) return renderLinkForm();

        const user = getUser();
        const summary = data.collection?.summary || null;
        const sync = data.sync || {};
        const name = summary?.displayName && summary.displayName !== "Unknown" ? summary.displayName : user?.displayName || "You";

        const syncBtn = h("button.btn.btn-primary", { type: "button" });
        const unlinkBtn = h("button.btn.btn-danger", { type: "button" }, icon("unlink"), h("span", "Unlink"));
        const status = h("p.sync-status", { "aria-live": "polite" });

        function paintSync() {
            const retry = Math.ceil(remaining());
            if (sync.inProgress) {
                syncBtn.disabled = true;
                syncBtn.replaceChildren(spinner(), h("span", "Syncing…"));
                status.replaceChildren(spinner(), h("span", "Syncing with Ballsdex…"));
                return;
            }
            syncBtn.disabled = retry > 0;
            syncBtn.replaceChildren(icon("refresh-cw"), h("span", retry > 0 ? `Sync again in ${Math.floor(retry / 60)}:${String(retry % 60).padStart(2, "0")}` : "Sync now"));
            if (data.collection?.lastSyncedAt) {
                status.replaceChildren(icon("history", "icon-sm"), h("span", `Last synced ${timeAgo(data.collection.lastSyncedAt)} · ${fmt(data.collection.ballCount)} balls`));
            } else {
                status.replaceChildren(icon("info", "icon-sm"), h("span", "Not synced yet"));
            }
        }

        const fetchedAt = Date.now();
        const remaining = () => Math.max(0, (sync.retryAfterSec || 0) - (Date.now() - fetchedAt) / 1000);

        syncBtn.addEventListener("click", () => startSync());
        unlinkBtn.addEventListener("click", unlink);
        paintSync();

        if (sync.inProgress) pollTimer = setTimeout(poll, POLL_MS);
        else if (remaining() > 0) {
            countdownTimer = setInterval(() => {
                paintSync();
                if (remaining() <= 0) clearInterval(countdownTimer);
            }, 1000);
        }

        const head = h(
            "div.card.bdx-head",
            img(user?.avatarUrl || "assets/brand/avatar-512.png", "", "avatar avatar-lg"),
            h("div.who", h("h2", { style: { "font-size": "var(--fs-xl)" } }, name), h("p.subtle", `Linked ${data.linkedAt ? timeAgo(data.linkedAt) : ""}`.trim()), status),
            h("div.bdx-actions", syncBtn, unlinkBtn),
        );

        const parts = [head];
        if (sync.inProgress) parts.push(syncProgress(sync));
        const failed = sync.error && !sync.inProgress && (!data.collection?.lastSyncedAt || new Date(sync.finishedAt) > new Date(data.collection.lastSyncedAt));
        if (failed) parts.push(h("p.callout.callout-danger", { style: { "margin-top": "16px" } }, icon("circle-x", "icon-sm"), h("span", `Last sync failed: ${sync.error}`)));
        parts.push(summary ? statsGrid(summary) : noData());
        body.replaceChildren(...parts);
    }

    /** Progress of a running sync: pages of 25 balls, paced by the Ballsdex rate limit. */
    function syncProgress(sync) {
        const p = sync.progress || { phase: "starting", fetched: 0, total: null };
        const total = Number.isFinite(p.total) && p.total > 0 ? p.total : null;
        const fetched = Math.max(0, p.fetched || 0);
        const ratio = p.phase === "saving" ? 1 : total ? Math.min(1, fetched / total) : null;

        let label = "Connecting to Ballsdex…";
        if (p.phase === "balls") label = total ? `Importing balls: ${fmt(fetched)} of ${fmt(total)}` : `Importing balls: ${fmt(fetched)} so far`;
        if (p.phase === "saving") label = "Saving your stats…";

        let eta = "";
        const startedAt = sync.startedAt ? new Date(sync.startedAt).getTime() : null;
        if (p.phase === "balls" && total && fetched > 0 && startedAt) {
            const perMs = fetched / Math.max(1, Date.now() - startedAt);
            const leftMin = Math.ceil((total - fetched) / perMs / 60000);
            eta = leftMin <= 1 ? "Less than a minute left" : `About ${leftMin} min left`;
        } else if (p.phase !== "saving") {
            eta = "Big collections take a while: the Ballsdex API hands out 25 balls per page, about one page a second. You can leave this page; the sync keeps going.";
        }

        const fill = h("div.meter-fill");
        if (ratio !== null) fill.style.width = `${Math.round(ratio * 1000) / 10}%`;
        return h(
            "section.card.panel.sync-progress",
            { "aria-live": "polite", style: { "margin-top": "16px" } },
            h("div.meter-head", h("span", label), ratio !== null ? h("span.num", `${Math.floor(ratio * 100)}%`) : null),
            h("div.meter-track", { class: ratio === null ? "is-indeterminate" : "", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": ratio === null ? undefined : String(Math.floor(ratio * 100)), "aria-label": "Sync progress" }, fill),
            h("p.subtle", eta || "Almost done"),
        );
    }

    function noData() {
        return h(
            "div.card.empty",
            { style: { "margin-top": "16px" } },
            h("div.empty-icon", icon("refresh-cw", "icon-lg")),
            h("h2", "No collection data yet"),
            h("p", "Sync once to import your balls. After that you can sync again every few minutes."),
        );
    }

    const kv = (label, value, cls = "") => h("div", h("dt", label), h(`dd${cls}`, value));
    const dateOf = (value) => (value ? formatDate(value) : "—");

    function catchRecord(label, record) {
        if (!record) return kv(label, "—");
        const hex = record.instanceId ? `#${BigInt(String(record.instanceId)).toString(16).toUpperCase()}` : "";
        return h("div", h("dt", label), h("dd", formatDuration(record.durationMs)), h("p.subtle", { style: { "margin-top": "2px" } }, `${record.ballName} ${hex}`.trim()));
    }

    function ranking(title, entries) {
        return h(
            "div.rank-group",
            h("h3", title),
            entries?.length
                ? h("ol.rank", entries.map((entry, i) => h("li", h("span.pos", i + 1), h("span.name", { title: entry.name }, entry.name), h("span.val.num", fmt(entry.count)))))
                : h("p.subtle", "Nothing yet"),
        );
    }

    function statsGrid(s) {
        return h(
            "div.bdx-grid",
            h(
                "section.card.panel.span-2",
                h("h2", icon("layers"), "Collection"),
                h(
                    "dl.kv.cols-4",
                    Number.isFinite(s.listedBalls) && s.listedBalls !== s.totalBalls
                        ? h("div", h("dt", "Total balls"), h("dd", fmt(s.totalBalls)), h("p.subtle", { style: { "margin-top": "2px" } }, `Stats below use the ${fmt(s.listedBalls)} the API lists`))
                        : kv("Total balls", fmt(s.totalBalls)),
                    kv("Unique", fmt(s.uniqueBalls)),
                    kv("Duplicates", fmt(s.duplicateCount)),
                    kv("Specials", fmt(s.specialCount)),
                    kv("Self-caught", fmt(s.selfCaughtCount)),
                    kv("Favorites", fmt(s.favoriteCount)),
                    kv("Frames", fmt(s.frameCount)),
                    kv("Timed catches", fmt(s.timedCatchCount)),
                ),
            ),
            h(
                "section.card.panel",
                h("h2", icon("timer"), "Catch speed"),
                h("dl.kv", catchRecord("Fastest", s.fastestCatch), catchRecord("Slowest", s.slowestCatch), h("div", { style: { "grid-column": "1 / -1" } }, h("dt", "Average"), h("dd", formatDuration(s.averageCatchMs)))),
            ),
            h(
                "section.card.panel",
                h("h2", icon("calendar-days"), "History"),
                h(
                    "dl.kv",
                    kv("First catch", dateOf(s.oldestCaughtAt), ".text"),
                    kv("Latest catch", dateOf(s.newestCaughtAt), ".text"),
                    kv("Best day", s.mostActiveCatchCount ? `${fmt(s.mostActiveCatchCount)} catches` : "—", ".text"),
                    kv("That day", s.mostActiveCatchDay ? formatDate(`${s.mostActiveCatchDay}T00:00:00Z`) : "—", ".text"),
                    h("div", { style: { "grid-column": "1 / -1" } }, h("dt", "Average gap between catches that day"), h("dd", formatDuration(s.averageCatchIntervalMs))),
                ),
            ),
            h(
                "section.card.panel.span-2",
                h("h2", icon("trophy"), "Rankings"),
                h("div.rank-cols", ranking("Most owned", s.topCountries), ranking("Top specials", s.topSpecials), ranking("Most specials on one ball", s.topSpecialBalls)),
            ),
        );
    }

    /* ----- Actions ----- */

    async function startSync({ auto = false } = {}) {
        try {
            const result = await api("ballsdex", { method: "POST", body: { action: "sync" } });
            data = { ...data, sync: result.sync || { inProgress: true } };
            render();
        } catch (error) {
            if (handleAuthError(error)) return;
            if (!auto || error.code !== "COOLDOWN") toast(error.message, "error");
            await refresh({ quiet: true });
        }
    }

    async function poll() {
        const before = data;
        const next = await refresh({ quiet: true });
        if (!next || next.sync?.inProgress) return;
        if (before?.sync?.inProgress) {
            if (next.sync?.error) toast(`Sync failed: ${next.sync.error}`, "error");
            else toast(`Synced ${fmt(next.sync?.ballCount ?? next.collection?.ballCount)} balls.`, "success");
        }
    }

    async function unlink() {
        const ok = await confirmDialog({
            title: "Unlink your Ballsdex account?",
            message: "The encrypted API key and your saved collection data are deleted. You can link again any time.",
            confirmLabel: "Unlink",
            danger: true,
        });
        if (!ok) return;
        try {
            await api("ballsdex", { method: "POST", body: { action: "unlink" } });
            toast("Ballsdex account unlinked.", "success");
            await refresh();
        } catch (error) {
            if (!handleAuthError(error)) toast(error.message, "error");
        }
    }

    return {
        el,
        show() {
            visible = true;
            if (!sessionReady()) {
                skeleton();
                loadSession();
                return;
            }
            refresh({ quiet: Boolean(data) });
        },
        hide() {
            visible = false;
            stopTimers();
        },
    };
}

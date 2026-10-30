/**
 * Ballsdex — the web version of /ballsdex: connect the account (Sign in with Ballsdex), sync the collection, see the stats.
 * Everything runs through the bot (same encryption, cooldowns and account checks as in Discord).
 */

import { h, icon, img, fmt, timeAgo, formatDate, formatDuration, spinner } from "../core/dom.js";
import { toast, confirmDialog, openDialog } from "../core/ui.js";
import { api, ApiError } from "../core/api.js";
import { getUser, onAuthChange, loadSession, login, sessionExpired, sessionReady } from "../core/auth.js";
import { compressedArtUrl } from "../core/data.js";
import { refreshNotifications } from "../notifications.js";

const KEYS_URL = "https://ballsdex.com/api/keys";
// "Sign in with Ballsdex" (functions/ballsdex-oauth.js): Ballsdex's consent screen, then back here with ?bdx=<result>
const CONNECT_URL = "/.netlify/functions/ballsdex-oauth?action=start";
const CONNECT_RESULTS = {
    linked: ["Ballsdex account connected. Syncing your collection…", "success"],
    reconnected: ["Ballsdex account reconnected.", "success"],
    denied: ["Sign in with Ballsdex was cancelled.", "info"],
    expired: ["The sign-in took too long or was opened twice. Try again.", "error"],
    session: ["Log in with Discord on this site first, then sign in with Ballsdex.", "error"],
    "wrong-account": ["You signed in to Ballsdex with a different Discord account than the one logged in here. Use the same account.", "error"],
    "oauth-failed": ["Ballsdex refused the sign-in. Try again.", "error"],
    "rate-limited": ["The Ballsdex API is busy right now. Try again in a few minutes.", "error"],
    cooldown: ["Please wait a moment before trying again.", "info"],
    "app-not-approved": ["BallIdentifier's Ballsdex app is still waiting for approval by the Ballsdex team. Try again later.", "info"],
    "not-configured": ["Sign in with Ballsdex isn't set up on BallIdentifier yet.", "error"],
    error: ["Couldn't connect your Ballsdex account. Try again in a moment.", "error"],
};
const waitText = (sec) => (sec < 60 ? `${Math.ceil(sec)} s` : sec < 3600 ? `${Math.ceil(sec / 60)} min` : `${Math.floor(sec / 3600)} h ${Math.round((sec % 3600) / 60)} min`);
const connectButton = (label = "Sign in with Ballsdex") => h("a.btn.btn-primary.btn-lg", { href: CONNECT_URL }, icon("log-in"), h("span", label));
// Fast Sync: link to player_data.zip that Ballsdex posts in your DMs (the bot downloads and checks it)
const EXPORT_LINK = /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\/\d{17,20}\/(\d{17,20})\/player_data\.zip\?\S*hm=\S+$/i;
const exportUploadedAt = (attachmentId) => Number((BigInt(attachmentId) >> 22n) + 1420070400000n);

export function createView() {
    let data = null;
    let renderToken = 0;
    let pollTimer = null;
    let countdownTimer = null;
    let visible = false;
    let section = "profile";
    let showMissing = false;
    let specialsData = null;
    let specialsQuery = "";

    const body = h("div");
    const tabProfile = h("a", { href: "#/ballsdex" }, icon("user-round", "icon-sm"), "Profile");
    const tabRaws = h("a", { href: "#/ballsdex/raws" }, icon("gem", "icon-sm"), "Raws");
    const tabSpecials = h("a", { href: "#/ballsdex/specials" }, icon("sparkles", "icon-sm"), "Specials");
    const el = h(
        "section.view",
        { dataset: { view: "ballsdex" }, "aria-labelledby": "bdx-title" },
        h("div.page-head", h("h1", { id: "bdx-title" }, "Ballsdex"), h("p", "Your Ballsdex account, collection stats, raws and every special.")),
        h("div.tabs-bar.bdx-tabs", h("nav.segmented", { "aria-label": "Ballsdex sections" }, tabProfile, tabRaws, tabSpecials)),
        body,
    );

    function paintTabs() {
        for (const [tab, on] of [[tabProfile, section === "profile"], [tabRaws, section === "raws"], [tabSpecials, section === "specials"]]) {
            if (on) tab.setAttribute("aria-current", "page");
            else tab.removeAttribute("aria-current");
        }
    }

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
        if (section === "specials") return loadSpecials(token, { quiet });
        if (!sessionReady()) return skeleton();
        if (!getUser()) {
            stopTimers();
            return renderLoggedOut();
        }
        if (section === "raws") return loadRaws(token);
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
        limits.reset();
        if (visible) refresh();
    });

    /* ----- Logged out ----- */

    function renderLoggedOut() {
        body.replaceChildren(
            h(
                "div.card.empty",
                h("div.empty-icon", icon("layers", "icon-lg")),
                h("h2", "Connect your Ballsdex account"),
                h("p", "Log in with Discord, connect your Ballsdex account once with Sign in with Ballsdex, and see your collection stats here and in the bot."),
                h("button.btn.btn-discord.btn-lg", { type: "button", onclick: () => login("#/ballsdex") }, icon("discord"), h("span", "Log in with Discord")),
            ),
        );
    }

    /* ----- Not linked: Sign in with Ballsdex ----- */

    function renderLinkForm() {
        const connect = h(
            "div.panel.card.bdx-connect",
            h("h2", icon("link"), "Connect your Ballsdex account"),
            h("p.muted", "Ballsdex asks you to let BallIdentifier read your collection. No key to create or copy."),
            connectButton(),
            h(
                "p.callout",
                icon("shield-check", "icon-sm"),
                h("span", "BallIdentifier only gets read access, and the sign-in is stored encrypted. Remove it any time with Unlink here or on your ", h("a", { href: KEYS_URL, target: "_blank", rel: "noopener" }, "Ballsdex Keys page"), "."),
            ),
        );

        const steps = h(
            "div.panel.card",
            h("h2", icon("info"), "How it works"),
            h(
                "ol.link-steps",
                h("li", h("span", "Press ", h("b", "Sign in with Ballsdex"), ".")),
                h("li", h("span", "Log in to Ballsdex with the same Discord account you use here.")),
                h("li", h("span", "Allow BallIdentifier to read your data. You come right back here.")),
                h("li", h("span", "Your collection syncs by itself. For big collections, Fast Sync is much quicker.")),
            ),
            h("p.subtle", "Had an API key linked before? Ballsdex replaced keys with this sign-in on November 1, 2026."),
        );

        const parts = [];
        if (data?.databaseAvailable === false) {
            parts.push(h("p.callout.callout-warning", { style: { "margin-bottom": "16px" } }, icon("triangle-alert", "icon-sm"), h("span", "Collection storage is offline right now. You can connect, but syncing may fail until it's back.")));
        }
        parts.push(h("div.bdx-grid", { style: { "margin-top": "0" } }, steps, connect));
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
        const fastBtn = h("button.btn", { type: "button", title: "Import your collection from the export of Ballsdex's /player settings" });
        const cancelBtn = h("button.btn", { type: "button", hidden: !sync.inProgress && !sync.paused, disabled: Boolean(sync.cancelRequested) }, icon("circle-stop"), h("span", sync.cancelRequested ? "Cancelling…" : sync.paused ? "Discard paused sync" : "Cancel sync"));
        const unlinkBtn = h("button.btn.btn-danger", { type: "button", hidden: Boolean(sync.inProgress) }, icon("unlink"), h("span", "Unlink"));
        const status = h("p.sync-status", { "aria-live": "polite" });

        function paintSync() {
            const retry = Math.ceil(remaining());
            const fastRetry = Math.ceil(fastRemaining());
            fastBtn.disabled = Boolean(sync.inProgress) || fastRetry > 0;
            fastBtn.replaceChildren(icon(fastRetry > 0 ? "clock" : "upload"), h("span", fastRetry > 0 ? `Fast Sync in ${Math.ceil(fastRetry / 60)} min` : "Fast Sync"));
            if (sync.inProgress) {
                syncBtn.disabled = true;
                syncBtn.replaceChildren(spinner(), h("span", "Syncing…"));
                status.replaceChildren(spinner(), h("span", sync.source === "file" ? "Importing your file…" : "Syncing with Ballsdex…"));
                return;
            }
            syncBtn.disabled = retry > 0;
            const wait = retry >= 3600 ? `${Math.floor(retry / 3600)}h ${Math.floor((retry % 3600) / 60)}m` : `${Math.floor(retry / 60)}:${String(retry % 60).padStart(2, "0")}`;
            syncBtn.replaceChildren(icon(retry > 0 ? "clock" : "refresh-cw"), h("span", retry > 0 ? `Sync again in ${wait}` : sync.paused ? "Continue sync" : "Sync now"));
            if (data.collection?.lastSyncedAt) {
                const viaFile = summary?.source === "file" ? " · from a file" : "";
                status.replaceChildren(icon("history", "icon-sm"), h("span", `Last synced ${timeAgo(data.collection.lastSyncedAt)} · ${fmt(data.collection.ballCount)} balls${viaFile}`));
            } else {
                status.replaceChildren(icon("info", "icon-sm"), h("span", "Not synced yet"));
            }
        }

        const fetchedAt = Date.now();
        const remaining = () => Math.max(0, (sync.retryAfterSec || 0) - (Date.now() - fetchedAt) / 1000);
        const fastRemaining = () => Math.max(0, (sync.fastRetryAfterSec || 0) - (Date.now() - fetchedAt) / 1000);

        syncBtn.addEventListener("click", () => startSync());
        fastBtn.addEventListener("click", () => openFastSync());
        cancelBtn.addEventListener("click", async () => {
            if (sync.paused) {
                const ok = await confirmDialog({ title: "Discard the paused sync?", message: `The ${fmt(sync.pausedFetched || 0)} balls fetched so far are thrown away and the next sync starts from the beginning.`, confirmLabel: "Discard", danger: true });
                if (!ok) return;
            }
            cancelSync();
        });
        unlinkBtn.addEventListener("click", unlink);
        paintSync();

        if (sync.inProgress) pollTimer = setTimeout(poll, POLL_MS);
        else if (remaining() > 0 || fastRemaining() > 0) {
            countdownTimer = setInterval(() => {
                paintSync();
                if (remaining() <= 0 && fastRemaining() <= 0) clearInterval(countdownTimer);
            }, 1000);
        }

        const head = h(
            "div.card.bdx-head",
            img(user?.avatarUrl || "assets/brand/avatar-512.png", "", "avatar avatar-lg"),
            h("div.who", h("h2", { style: { "font-size": "var(--fs-xl)" } }, name), h("p.subtle", `Linked ${data.linkedAt ? timeAgo(data.linkedAt) : ""}`.trim()), status),
            h("div.bdx-actions", syncBtn, fastBtn, cancelBtn, unlinkBtn),
        );

        const parts = [head];
        if (data.reconnect) {
            parts.push(
                h(
                    "div.callout.callout-warning.bdx-reconnect",
                    { style: { "margin-top": "16px" } },
                    icon("triangle-alert", "icon-sm"),
                    h("span", h("b", "Sign in with Ballsdex again. "), "Ballsdex replaced API keys with a new sign-in (or your sign-in expired). Your stats below are kept; you need to sign in again to sync."),
                    h("a.btn.btn-sm.btn-primary", { href: CONNECT_URL }, icon("log-in", "icon-sm"), h("span", "Sign in")),
                ),
            );
        }
        if (sync.inProgress) parts.push(syncProgress(sync));
        else if (sync.paused) {
            parts.push(
                h(
                    "p.callout.callout-warning",
                    { style: { "margin-top": "16px" } },
                    icon("clock", "icon-sm"),
                    h("span", `Sync paused at ${fmt(sync.pausedFetched || 0)} balls: today's Ballsdex API requests ran out. It continues by itself ${sync.resumeAt ? timeAgo(sync.resumeAt) : "later"}, nothing is lost.`),
                ),
            );
        }
        else if (sync.busy) {
            parts.push(
                h(
                    "p.callout",
                    { style: { "margin-top": "16px" } },
                    icon("clock", "icon-sm"),
                    h("span", sync.waiting ? "Another collection is being synced right now. You'll get a notification as soon as you can start yours." : "Another collection is being synced right now. Only one sync runs at a time."),
                ),
            );
        }
        const failed = sync.error && !sync.inProgress && sync.source !== "file" && (!data.collection?.lastSyncedAt || new Date(sync.finishedAt) > new Date(data.collection.lastSyncedAt));
        if (failed) parts.push(h("p.callout.callout-danger", { style: { "margin-top": "16px" } }, icon("circle-x", "icon-sm"), h("span", `Last sync failed: ${sync.error}`)));
        if (sync.error && !sync.inProgress && sync.source === "file") parts.push(h("p.callout.callout-danger", { style: { "margin-top": "16px" } }, icon("circle-x", "icon-sm"), h("span", `Fast Sync failed: ${sync.error}`)));
        if (summary && data.collection?.needsResync && !sync.inProgress) {
            parts.push(
                h(
                    "p.callout.callout-warning",
                    { style: { "margin-top": "16px" } },
                    icon("refresh-cw", "icon-sm"),
                    h("span", "These stats were saved before top 5 rankings and raws existed. Sync once to update them."),
                ),
            );
        }
        parts.push(summary ? statsGrid(summary) : noData());
        parts.push(limits.card);
        limits.load();
        body.replaceChildren(...parts);
    }

    /** Progress of a running sync: pages of 25 balls, paced by the Ballsdex rate limit. */
    function syncProgress(sync) {
        const p = sync.progress || { phase: "starting", fetched: 0, total: null };
        const total = Number.isFinite(p.total) && p.total > 0 ? p.total : null;
        const fetched = Math.max(0, p.fetched || 0);
        const ratio = p.phase === "saving" ? 1 : p.phase === "verifying" || p.phase === "downloading" ? null : total ? Math.min(1, fetched / total) : null;

        let label = "Connecting to Ballsdex…";
        if (p.phase === "balls") label = total ? `Importing balls: ${fmt(fetched)} of ${fmt(total)}` : `Importing balls: ${fmt(fetched)} so far`;
        if (p.phase === "saving") label = "Saving your stats…";
        if (p.phase === "verifying") label = "Checking the file against your Ballsdex account…";
        if (p.phase === "downloading") label = "Downloading your export from Discord…";

        let eta = "";
        const startedAt = sync.startedAt ? new Date(sync.startedAt).getTime() : null;
        if (p.phase === "balls" && total && fetched > 0 && startedAt) {
            const perMs = fetched / Math.max(1, Date.now() - startedAt);
            const leftMin = Math.ceil((total - fetched) / perMs / 60000);
            eta = leftMin <= 1 ? "Less than a minute left" : `About ${leftMin} min left`;
        } else if (sync.source === "file") {
            eta = "Fast Sync takes a few seconds.";
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
            h("p", "Sync once to import your balls. After a sync you can sync again in 24 hours."),
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
            s.source === "file"
                ? h("p.callout.span-2", icon("info", "icon-sm"), h("span", "Imported with Fast Sync. Ballsdex exports don't include favorites, frames or catch times, and self-caught counts balls that were never traded. A normal sync fills those in."))
                : null,
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
                    Number.isFinite(s.specialKinds) && s.specialKinds > 0
                        ? h("div", h("dt", "Specials"), h("dd", fmt(s.specialCount)), h("p.subtle", { style: { "margin-top": "2px" } }, `${fmt(s.specialKinds)} different specials`))
                        : kv("Specials", fmt(s.specialCount)),
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

    /* ----- Ballsdex API limits ----- */

    // One card for the whole view, so sync polling (which re-renders) doesn't refetch it
    const limits = (() => {
        const list = h("div.rl-groups");
        const refreshBtn = h("button.btn.btn-ghost.btn-sm", { type: "button", onclick: () => load({ force: true }) }, icon("refresh-cw", "icon-sm"), h("span", "Refresh"));
        const card = h(
            "section.card.panel.rl-card",
            h("div.rl-head", h("h2", icon("gauge"), "Ballsdex API limits"), refreshBtn),
            h("p.subtle", "Your account's limits are only yours. The bot's limits are shared by everyone using BallIdentifier, because all requests come from one server."),
            list,
        );
        let loadedAt = 0;
        let loading = false;

        function meter(limit) {
            const ratio = limit.limit ? limit.used / limit.limit : 0;
            const pct = Math.round(ratio * 100);
            const fill = h("div.meter-fill");
            fill.style.width = `${Math.min(100, pct)}%`;
            const reset = limit.resetInSec ? ` · resets in ${limit.resetInSec >= 3600 ? `${Math.floor(limit.resetInSec / 3600)}h ${Math.floor((limit.resetInSec % 3600) / 60)}m` : limit.resetInSec >= 60 ? `${Math.floor(limit.resetInSec / 60)}m ${limit.resetInSec % 60}s` : `${limit.resetInSec}s`}` : "";
            return h(
                "div.meter",
                { dataset: { level: ratio >= 0.8 ? "low" : ratio >= 0.5 ? "warn" : "high" } },
                h("div.meter-head", h("span", limit.label), h("span.num.meter-value", `${pct}% used`)),
                h("div.meter-track", { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct), "aria-label": `${limit.label}: ${pct}% used` }, fill),
                h("p.subtle", `${fmt(limit.remaining)} of ${fmt(limit.limit)} left${reset}`),
            );
        }

        function group(title, snapshot) {
            return h(
                "div.rl-group",
                h("h3", title),
                snapshot?.limits?.length ? snapshot.limits.map(meter) : h("p.subtle", "No data yet."),
            );
        }

        async function load({ force = false } = {}) {
            if (loading || (!force && Date.now() - loadedAt < 30000)) return;
            loading = true;
            refreshBtn.disabled = true;
            if (!loadedAt) list.replaceChildren(h("div.skeleton", { style: { height: "96px" } }));
            try {
                const result = await api("ballsdex", { query: { view: "ratelimit" } });
                loadedAt = Date.now();
                if (!result.available) list.replaceChildren(h("p.subtle", data?.reconnect ? "Sign in with Ballsdex again to see your limits." : "Connect your Ballsdex account to see its limits."));
                else list.replaceChildren(group("Your account", result.key), group("BallIdentifier bot (shared)", result.ip));
            } catch (error) {
                if (!handleAuthError(error)) list.replaceChildren(h("p.subtle", error.message));
            } finally {
                loading = false;
                refreshBtn.disabled = false;
            }
        }

        return { card, load, reset: () => (loadedAt = 0) };
    })();

    /* ----- Raws ----- */

    const fmt2 = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });

    /* ----- Specials (public; the owner can edit) ----- */

    async function loadSpecials(token, { quiet = false } = {}) {
        stopTimers();
        if (!quiet || !specialsData) skeleton();
        try {
            const result = await api("specials");
            if (token !== renderToken) return null;
            specialsData = result;
            renderSpecials();
            return result;
        } catch (error) {
            if (token !== renderToken) return null;
            body.replaceChildren(
                h("div.card.empty", h("div.empty-icon", icon("triangle-alert", "icon-lg")), h("h2", "Couldn't load the specials"), h("p", error.message), h("button.btn", { type: "button", onclick: () => refresh() }, icon("refresh-cw"), h("span", "Try again"))),
            );
            return null;
        }
    }

    function specialEmoji(special) {
        if (special.emoji) return h("span.spc-emoji", { "aria-hidden": "true" }, special.emoji);
        const custom = /^<a?:\w+:(\d+)>$/.exec(special.officialEmoji || "");
        if (custom) return h("span.spc-emoji", img(`https://cdn.discordapp.com/emojis/${custom[1]}.webp?size=64`, ""));
        if (special.officialEmoji) return h("span.spc-emoji", { "aria-hidden": "true" }, special.officialEmoji);
        return h("span.spc-emoji.is-empty", { "aria-hidden": "true" }, icon("sparkles"));
    }

    function specialCard(special, { canEdit }) {
        const title = special.alias || special.name || `Special #${special.id}`;
        const rows = [];
        const add = (label, iconName, value) => value && rows.push(h("div.spc-row", h("dt", icon(iconName, "icon-sm"), label), h("dd", value)));

        const avg = special.priceAverage;
        const high = special.priceHighest;
        if (avg && high && avg !== high) add("Common price", "gem", h("span", avg, h("span.subtle", " avg · "), high, h("span.subtle", " highest")));
        else if (avg || high) add("Common price", "gem", avg || high);
        add("Spawn rate", "gauge", special.spawnRate);
        add("Duration", "timer", special.duration);
        if (special.startDate || special.endDate) {
            const start = special.startDate ? formatDate(special.startDate) : "?";
            const end = special.endDate ? formatDate(special.endDate) : "no end";
            add("Dates", "calendar-days", start === end ? start : `${start} – ${end}`);
        }

        return h(
            "article.card.spc-card",
            h(
                "div.spc-head",
                specialEmoji(special),
                h("div.spc-title", h("h3", title), special.alias && special.name && special.alias !== special.name ? h("p.subtle", special.name) : null),
                h("span.spc-id", `#${special.id}`),
            ),
            special.tradeable === false || special.priceAverage === "Untradable" ? h("span.spc-badge.is-warn", icon("lock", "icon-sm"), "Untradeable") : null,
            rows.length ? h("dl.spc-rows", rows) : h("p.subtle", "No details yet."),
            special.notes ? h("p.spc-notes", special.notes) : null,
            h(
                "div.row.spc-actions",
                special.market ? h("button.btn.btn-sm", { type: "button", onclick: () => openMarket(special) }, icon("trophy", "icon-sm"), h("span", "Market data")) : null,
                canEdit ? h("button.btn.btn-sm", { type: "button", onclick: () => editSpecial(special) }, icon("sliders-horizontal", "icon-sm"), h("span", "Edit")) : null,
                h("button.btn.btn-sm.btn-ghost", { type: "button", "aria-label": `Copy link to ${title}`, title: "Copy link", onclick: () => copySpecialLink(special) }, icon("link", "icon-sm")),
            ),
        );
    }

    async function copySpecialLink(special) {
        try {
            await navigator.clipboard.writeText(`${location.origin}/ballsdex/specials/${special.id}`);
            toast("Link copied.", "success");
        } catch {
            toast("Couldn't copy the link.", "error");
        }
    }

    function renderSpecials() {
        const { specials = [], canEdit, officialLoadedAt, officialError } = specialsData;
        const search = h("input.input", { type: "search", placeholder: "Search by name, alias or ID", "aria-label": "Search specials", autocomplete: "off", spellcheck: false, value: specialsQuery });
        const grid = h("div.spc-grid");

        function paint() {
            const q = specialsQuery.trim().toLowerCase();
            const shown = specials.filter((s) => !q || String(s.id) === q.replace("#", "") || [s.name, s.alias].some((v) => v?.toLowerCase().includes(q)));
            grid.replaceChildren(...(shown.length ? shown.map((s) => specialCard(s, { canEdit })) : [h("p.subtle", "No special matches your search.")]));
        }
        search.addEventListener("input", () => {
            specialsQuery = search.value;
            if (location.pathname !== "/ballsdex/specials") history.replaceState(null, "", "/ballsdex/specials");
            paint();
        });
        paint();

        body.replaceChildren(
            h(
                "div.stack",
                h(
                    "div.card.card-pad.spc-intro",
                    h("p", "Every Ballsdex special with its nickname, common price and event details. Prices are in commons: the first number is the average, the second the highest. They're community estimates, so treat them as a guide."),
                    canEdit && officialError ? h("p.hint", icon("info", "icon-sm"), ` Official data unavailable: ${officialError}`) : null,
                    officialLoadedAt ? h("p.hint", `Names, dates and market sales from the Ballsdex API, updated ${timeAgo(officialLoadedAt)}.`) : null,
                ),
                search,
                grid,
            ),
        );
    }

    /* Market data of one special, loaded when its button is clicked */

    const SVG = "http://www.w3.org/2000/svg";
    function svg(tag, attrs = {}) {
        const node = document.createElementNS(SVG, tag);
        for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
        return node;
    }

    function priceChart(series) {
        const points = series.map((b, i) => ({ ...b, i })).filter((b) => b.count > 0 && b.median != null);
        if (points.length < 2) return null;
        const W = 300;
        const H = 90;
        const pad = 6;
        const lo = Math.min(...points.map((b) => b.low ?? b.median));
        const hi = Math.max(...points.map((b) => b.high ?? b.median));
        const x = (i) => pad + (i / Math.max(1, series.length - 1)) * (W - pad * 2);
        const y = (v) => H - pad - ((v - lo) / Math.max(1, hi - lo)) * (H - pad * 2);
        const chart = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "spc-chart", role: "img", "aria-label": "Median sale price over time" });
        for (const b of points) {
            if (b.low != null && b.high != null) chart.append(svg("line", { x1: x(b.i), x2: x(b.i), y1: y(b.low), y2: y(b.high), class: "spc-chart-range" }));
        }
        chart.append(svg("polyline", { points: points.map((b) => `${x(b.i).toFixed(1)},${y(b.median).toFixed(1)}`).join(" "), class: "spc-chart-line" }));
        for (const b of points) {
            const dot = svg("circle", { cx: x(b.i), cy: y(b.median), r: 2.5, class: "spc-chart-dot" });
            const title = svg("title");
            title.textContent = `${formatDate(b.start)} – ${formatDate(b.end)}: median ${fmt(b.median)}, ${fmt(b.count)} sale${b.count === 1 ? "" : "s"}${b.low != null ? `, ${fmt(b.low)}–${fmt(b.high)}` : ""}`;
            dot.append(title);
            chart.append(dot);
        }
        return h(
            "figure.spc-chart-wrap",
            h("div.spc-chart-scale", h("span", fmt(hi)), h("span", fmt(lo))),
            chart,
            h("figcaption.spc-chart-axis", h("span", formatDate(series[0].start)), h("span", "Median per period, line = lowest to highest sale"), h("span", formatDate(series[series.length - 1].end))),
        );
    }

    function ballList(rows, describe) {
        return h(
            "ul.spc-balls",
            rows.map((row) => h("li", img(compressedArtUrl("Ballsdex", row.country), "", "spc-ball-art"), h("span.spc-ball-name", row.country), h("span.subtle", describe(row)))),
        );
    }

    function renderMarket(special, data) {
        const recent = special.market?.recent;
        const all = special.market?.all;
        const allLabel = data.windowDays ? `All time (${fmt(data.windowDays)}d)` : "All time";
        const cell = (v) => h("td", v == null ? "—" : fmt(v));
        const table = h(
            "table.spc-mkt-table",
            h("thead", h("tr", h("th", ""), h("th", "Last 30 days"), h("th", allLabel))),
            h(
                "tbody",
                h("tr", h("th", "Median"), cell(recent?.median), cell(all?.median)),
                h("tr", h("th", "Average"), cell(recent?.mean), cell(all?.mean)),
                h("tr", h("th", "Sales"), cell(recent?.sales ?? 0), cell(all?.sales ?? data.totalSales)),
                h("tr", h("th", "Different balls"), cell(recent?.distinctBalls ?? 0), cell(all?.distinctBalls ?? data.ballsSold)),
            ),
        );

        const facts = [];
        const fact = (label, value) => value != null && facts.push(h("div.spc-fact", h("span.subtle", label), h("strong", value)));
        fact("Lowest sale", data.lowestSale != null ? fmt(data.lowestSale) : null);
        fact("Highest sale", data.highestSale != null ? fmt(data.highestSale) : null);
        fact("Last sale", data.lastSaleAt ? timeAgo(data.lastSaleAt) : null);
        if (recent?.median && all?.median) {
            const change = Math.round(((recent.median - all.median) / all.median) * 100);
            fact("30 days vs all time", `${change > 0 ? "+" : ""}${change}%`);
        }
        if (recent?.sales && all?.sales) fact("Sales in the last 30 days", `${Math.round((recent.sales / all.sales) * 100)}% of all`);

        const parts = [table, facts.length ? h("div.spc-facts", facts) : null, priceChart(data.series)];
        if (data.topBalls.length) parts.push(h("h3.spc-mkt-h", "Most sold balls"), ballList(data.topBalls, (b) => `${fmt(b.count)} sale${b.count === 1 ? "" : "s"} · median ${fmt(b.median)}`));
        if (data.cheapestBalls.length >= 2) {
            parts.push(
                h(
                    "div.spc-mkt-cols",
                    h("div", h("h3.spc-mkt-h", "Cheapest balls"), ballList(data.cheapestBalls, (b) => `median ${fmt(b.median)}`)),
                    h("div", h("h3.spc-mkt-h", "Most expensive balls"), ballList(data.priciestBalls, (b) => `median ${fmt(b.median)}`)),
                ),
            );
        }
        if (data.recentSales.length) parts.push(h("h3.spc-mkt-h", "Recent sales"), ballList(data.recentSales, (s) => `${fmt(s.price)} · ${timeAgo(s.endsAt)}`));
        if (!data.totalSales && !recent && !all) parts.push(h("p.subtle", "No sales of this special on the Ballsdex market yet."));
        parts.push(
            h(
                "p.hint",
                "From completed single-ball auctions on the Ballsdex market. Cheapest and most expensive count balls with at least 2 sales.",
                data.multiItemLots ? ` ${fmt(data.multiItemLots)} multi-ball lot${data.multiItemLots === 1 ? " isn't" : "s aren't"} counted.` : "",
            ),
        );
        return h("div.spc-mkt", parts);
    }

    async function openMarket(special) {
        const content = h("div.spc-mkt-loading", spinner());
        openDialog({ title: `${special.alias || special.name} · market`, body: content, wide: true });
        try {
            const data = await api("specials", { query: { market: special.id } });
            content.replaceWith(renderMarket(special, data));
        } catch (error) {
            content.replaceWith(h("p", error.message));
        }
    }

    const SPECIAL_FIELDS = [
        ["alias", "Alias", "e.g. Pumpkin", 60],
        ["emoji", "Emoji", "e.g. 🎃", 40],
        ["priceAverage", "Common price: average", "e.g. 10", 40],
        ["priceHighest", "Common price: highest", "e.g. 20", 40],
        ["spawnRate", "Spawn rate", "e.g. 3%", 120],
        ["duration", "Duration", "e.g. 14 days", 120],
    ];

    function editSpecial(special) {
        const inputs = {};
        const fields = SPECIAL_FIELDS.map(([key, label, placeholder, max]) => {
            inputs[key] = h("input.input", { id: `spc-${key}`, type: "text", value: special[key] || "", placeholder, maxLength: max, autocomplete: "off" });
            return h("div.field", h("label.label", { for: `spc-${key}` }, label), inputs[key]);
        });
        inputs.notes = h("textarea.textarea", { id: "spc-notes", maxLength: 500, placeholder: "Anything else worth knowing" });
        inputs.notes.value = special.notes || "";

        const saveBtn = h("button.btn.btn-primary", { type: "submit", form: "spc-form" }, icon("check"), h("span", "Save"));
        const form = h(
            "form.spc-form",
            { id: "spc-form" },
            h("p.hint", `${special.name || "Unnamed"} · #${special.id}. Leave a field empty to hide it.`),
            h("div.spc-form-grid", fields),
            h("div.field", h("label.label", { for: "spc-notes" }, "Notes"), inputs.notes),
        );
        const dialog = openDialog({ title: `Edit ${special.alias || special.name || `#${special.id}`}`, body: form, footer: h("div.row", h("button.btn", { type: "button", onclick: () => dialog.close() }, "Cancel"), saveBtn) });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            saveBtn.disabled = true;
            try {
                const patch = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value.trim()]));
                await api("specials", { method: "POST", body: { id: special.id, fields: patch } });
                toast("Special saved.", "success");
                dialog.close();
                refresh({ quiet: true });
            } catch (error) {
                saveBtn.disabled = false;
                if (!handleAuthError(error)) toast(error.message, "error");
            }
        });
    }

    async function loadRaws(token) {
        stopTimers();
        skeleton();
        let result;
        try {
            result = await api("ballsdex", { query: { view: "raws" } });
        } catch (error) {
            if (token !== renderToken) return null;
            if (handleAuthError(error)) return null;
            body.replaceChildren(
                h("div.card.empty", h("div.empty-icon", icon("triangle-alert", "icon-lg")), h("h2", "Couldn't load your raws"), h("p", error.message), h("button.btn", { type: "button", onclick: () => refresh() }, icon("refresh-cw"), h("span", "Try again"))),
            );
            return null;
        }
        if (token !== renderToken) return null;

        if (!result.available) {
            const copy = {
                NOT_LINKED: ["Connect your Ballsdex account first", "Raws are counted from your synced collection. Sign in with Ballsdex on the Profile tab."],
                NO_DATA: ["Sync your collection first", "Raws are counted from your synced collection. Start a sync on the Profile tab."],
                RESYNC: ["Sync once more to count raws", "Your saved collection is from before raws existed. One sync on the Profile tab fills this page."],
            }[result.reason] || ["No raws yet", ""];
            body.replaceChildren(
                h("div.card.empty", h("div.empty-icon", icon("gem", "icon-lg")), h("h2", copy[0]), h("p", copy[1]), h("a.btn.btn-primary", { href: "#/ballsdex" }, icon("user-round"), h("span", "Go to Profile"))),
            );
            return null;
        }
        renderRaws(result.raws, result.lastSyncedAt);
        return result;
    }

    function renderRaws(raws, lastSyncedAt) {
        const missingToggle = h("input", { type: "checkbox", checked: showMissing });
        const list = h("div.raws-list");

        function paintList() {
            const nodes = [];
            for (const tier of raws.tiers) {
                const rows = raws.rows.filter((row) => row.tier === tier.tier && (showMissing || row.count > 0));
                if (!rows.length) continue;
                nodes.push(
                    h(
                        "section.raws-tier",
                        h(
                            "header.raws-tier-head",
                            h("span.raws-tier-name", `T${tier.tier}`),
                            h("span.subtle", `×${tier.value} each`),
                            h("span.raws-tier-total.num", tier.count ? `${fmt(tier.count)} × ${tier.value} = ${fmt2(tier.total)}` : "0"),
                        ),
                        h(
                            "ul.raws-rows",
                            rows.map((row) =>
                                h(
                                    "li.raws-row",
                                    { class: row.count ? "" : "is-missing" },
                                    img(compressedArtUrl("Ballsdex", row.name), "", "raws-thumb"),
                                    h("span.raws-name", row.name),
                                    h("span.raws-count.num", row.count ? `×${fmt(row.count)}` : "—"),
                                    h("span.raws-value.num", row.count ? fmt2(row.total) : ""),
                                ),
                            ),
                        ),
                    ),
                );
            }
            list.replaceChildren(...(nodes.length ? nodes : [h("p.subtle", { style: { padding: "16px 0" } }, "You don't have any rare non-special balls yet.")]));
        }
        missingToggle.addEventListener("change", () => {
            showMissing = missingToggle.checked;
            paintList();
        });
        paintList();

        body.replaceChildren(
            h(
                "div.card.panel.raws-summary",
                h(
                    "dl.kv.cols-4",
                    h("div", h("dt", "Raws value"), h("dd.raws-total", fmt2(raws.total))),
                    h("div", h("dt", "Rare non-special balls"), h("dd", fmt(raws.rareCount))),
                    h("div", h("dt", "Different rare balls"), h("dd", `${raws.ownedKinds} / ${raws.kinds}`)),
                    h("div", h("dt", "Last synced"), h("dd.text", lastSyncedAt ? timeAgo(lastSyncedAt) : "—")),
                ),
                h("p.subtle", "Rare = tiers T1 to T23, specials not counted. Each ball is worth: T1 1 · T4 0.8 · T6 0.75 · T7 0.5 · T10 0.4 · T12 0.25 · T15 0.2 · T18 0.15 · T19 to T23 0.1."),
            ),
            h(
                "div.card.panel",
                { style: { "margin-top": "16px" } },
                h("div.row", { style: { "justify-content": "space-between" } }, h("h2", icon("gem"), "By tier"), h("label.switch.raws-missing", h("span", "Show balls I don't have"), missingToggle)),
                list,
            ),
        );
    }

    /* ----- Actions ----- */

    /* ----- Fast Sync (file import) ----- */

    function openFastSync() {
        const user = getUser();
        if (!user) return;

        const input = h("input.input", { id: "fs-link", type: "url", autocomplete: "off", spellcheck: false, placeholder: "https://cdn.discordapp.com/attachments/…/player_data.zip?ex=…" });
        const result = h("div.fs-result", { "aria-live": "polite" });
        const importBtn = h("button.btn.btn-primary", { type: "button", disabled: true }, icon("upload"), h("span", "Import"));

        const body = h(
            "div.stack.fs-body",
            h("p", "Import your whole collection in a few seconds from the export Ballsdex sends you, instead of pulling it from the API 25 balls at a time."),
            h(
                "ol.fs-steps",
                h("li", "In any server with Ballsdex, run ", h("code", "/player settings"), " and export your countryballs. Ballsdex sends ", h("code", "player_data.zip"), " in your DMs."),
                h("li", "Right-click the file (on a phone: hold it) and choose ", h("b", "Copy Link"), ". Don't download or change it."),
                h("li", "Paste the link here. BallIdentifier downloads the file straight from Discord, checks it and compares it with your Ballsdex account."),
            ),
            h("div.field", h("label.label", { for: "fs-link" }, "Link to player_data.zip"), input),
            result,
            h("p.hint", "The export has no favorites, frames or catch times; a normal sync fills those in. Fast Sync can be used once every 30 minutes, with an export from the last 24 hours. Random balls from the file are checked in your Ballsdex account, and adding yourself as a collector checks that ball again."),
        );
        const dialog = openDialog({ title: "Fast Sync", body, footer: [h("button.btn.btn-ghost", { type: "button", onclick: () => dialog.close() }, "Cancel"), importBtn] });

        function check() {
            const value = input.value.trim();
            importBtn.disabled = true;
            if (!value) return result.replaceChildren();
            const match = EXPORT_LINK.exec(value);
            let problem = "";
            if (!match) problem = "That isn't a Discord link to player_data.zip. Copy the link of the file Ballsdex sent you (it ends with ?ex=…&is=…&hm=…).";
            else if (Date.now() - exportUploadedAt(match[2]) > 24 * 60 * 60 * 1000) problem = "This export is more than a day old. Run /player settings again and use the new file.";
            if (problem) return result.replaceChildren(h("p.callout.callout-danger", icon("circle-x", "icon-sm"), h("span", problem)));
            result.replaceChildren(h("p.callout.callout-success", icon("circle-check", "icon-sm"), h("span", `Export from ${timeAgo(exportUploadedAt(match[2]))}. Ready to import.`)));
            importBtn.disabled = false;
        }
        input.addEventListener("input", check);

        importBtn.addEventListener("click", async () => {
            importBtn.disabled = true;
            input.disabled = true;
            try {
                const done = await api("ballsdex", { method: "POST", body: { action: "fast-sync", url: input.value.trim() } });
                dialog.close();
                data = { ...data, sync: done.sync || { inProgress: true, source: "file" } };
                render();
            } catch (error) {
                if (handleAuthError(error)) return dialog.close();
                input.disabled = false;
                importBtn.disabled = false;
                result.replaceChildren(h("p.callout.callout-danger", icon("circle-x", "icon-sm"), h("span", error.message)));
            }
        });
        input.focus();
    }

    async function startSync({ auto = false } = {}) {
        try {
            const result = await api("ballsdex", { method: "POST", body: { action: "sync" } });
            data = { ...data, sync: result.sync || { inProgress: true } };
            render();
        } catch (error) {
            if (handleAuthError(error)) return;
            if (error.code === "BUSY") toast(error.message, "info", 8000);
            else if (!auto || error.code !== "COOLDOWN") toast(error.message, "error");
            await refresh({ quiet: true });
        }
    }

    async function cancelSync() {
        try {
            const result = await api("ballsdex", { method: "POST", body: { action: "cancel" } });
            data = { ...data, sync: result.sync || data.sync };
            render();
        } catch (error) {
            if (!handleAuthError(error)) toast(error.message, "error");
        }
    }

    async function poll() {
        const before = data;
        const next = await refresh({ quiet: true });
        if (!next || next.sync?.inProgress) return;
        if (before?.sync?.inProgress) {
            if (next.sync?.cancelled) toast("Sync cancelled. You can start a new one in 5 minutes.", "info");
            else if (next.sync?.paused) toast("Sync paused: today's Ballsdex API requests ran out. It continues by itself, nothing is lost.", "info", 8000);
            else if (next.sync?.error) toast(`${next.sync.source === "file" ? "Fast Sync" : "Sync"} failed: ${next.sync.error}`, "error");
            else toast(`${next.sync?.source === "file" ? "Imported" : "Synced"} ${fmt(next.sync?.ballCount ?? next.collection?.ballCount)} balls.`, "success");
            refreshNotifications();
        }
    }

    async function unlink() {
        const ok = await confirmDialog({
            title: "Unlink your Ballsdex account?",
            message: "BallIdentifier's access to your Ballsdex account and your saved collection data are removed. You can connect again any time.",
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
        show(params = []) {
            visible = true;
            const next = ["raws", "specials"].includes(params[0]) ? params[0] : "profile";
            if (next !== section) stopTimers();
            section = next;
            paintTabs();
            if (section === "specials") {
                // /ballsdex/specials/4 shows just that special (shared links)
                if (/^\d+$/.test(params[1] || "")) specialsQuery = `#${params[1]}`;
                refresh({ quiet: Boolean(specialsData) });
                return;
            }
            const query = new URLSearchParams(location.search);
            const result = query.get("bdx");
            const connect = query.get("connect") === "1";
            if (result || connect) history.replaceState(null, "", location.pathname);
            if (result) {
                let [message, type] = CONNECT_RESULTS[result] || CONNECT_RESULTS.error;
                if (result === "rate-limited") {
                    const wait = Number(query.get("wait"));
                    const who = query.get("scope") === "ip" ? "BallIdentifier's shared Ballsdex API limit (all users together)" : query.get("scope") === "key" ? "your Ballsdex account's API limit" : "the Ballsdex API limit";
                    message = `Couldn't connect: ${who} is used up for now. ${wait > 0 ? `Try again in ${waitText(wait)}.` : "Try again later."}`;
                }
                toast(message, type, type === "error" ? 9000 : 5000);
            }
            const afterLoad = (loaded) => {
                if (result === "linked" && loaded?.linked && !loaded.reconnect) startSync({ auto: true });
                // From "/ballsdex link" in Discord: straight to the Ballsdex sign-in when it's needed
                if (connect && loaded && (!loaded.linked || loaded.reconnect)) location.assign(CONNECT_URL);
            };
            if (!sessionReady()) {
                skeleton();
                loadSession().then(() => (getUser() ? refresh().then(afterLoad) : connect && location.assign(CONNECT_URL)));
                return;
            }
            if (!getUser()) {
                if (connect) return location.assign(CONNECT_URL);
                return refresh();
            }
            refresh({ quiet: Boolean(data) }).then(afterLoad);
        },
        hide() {
            visible = false;
            stopTimers();
        },
    };
}

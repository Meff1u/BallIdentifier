/**
 * Public profile (/u/<discord id>): who someone is, their showcase, what they collect and,
 * if they allow it, their Ballsdex stats. Owners edit their profile here; it stays private until they publish it.
 */

import { h, icon, img, fmt, formatDate, formatDuration, copyText, timeAgo } from "../core/dom.js";
import { toast, openDialog, confirmDialog } from "../core/ui.js";
import { api, ApiError } from "../core/api.js";
import { getUser, onAuthChange, login, sessionExpired, sessionReady, loadSession } from "../core/auth.js";
import { getDexList, getDex, dexIcon, compressedArtUrl } from "../core/data.js";
import { formatMs } from "./catch-stats.js";


const displayName = (p) => p.name || p.username || `User ${p.id.slice(-4)}`;
const profileUrl = (id) => `${location.origin}/u/${id}`;
const artHref = (dex, name) => `/arts/${encodeURIComponent(dex)}/${encodeURIComponent(name)}`;

export function createView() {
    let profileId = null;
    let profile = null;
    let viewer = null;
    let loadToken = 0;
    let wantEdit = false;

    const body = h("div.pf");
    const el = h("section.view", { dataset: { view: "profile" }, "aria-label": "Profile" }, body);

    /* ----- Loading ----- */

    async function load() {
        const token = ++loadToken;
        body.replaceChildren(skeleton());
        try {
            const result = await api("profile", { query: { id: profileId } });
            if (token !== loadToken) return;
            profile = result.profile;
            viewer = result.viewer;
            paint();
            if (wantEdit && isSelf()) {
                wantEdit = false;
                openEditor();
            }
        } catch (error) {
            if (token !== loadToken) return;
            profile = null;
            if (error instanceof ApiError && error.code === "NO_PROFILE") return paintSetup();
            body.replaceChildren(
                h(
                    "div.empty",
                    h("div.empty-icon", icon(error.status === 404 ? "lock" : "triangle-alert", "icon-lg")),
                    h("h2", error.status === 404 ? "This profile is private" : "Couldn't load this profile"),
                    h("p", error.status === 404 ? "It doesn't exist, or its owner hasn't made it public." : error.message),
                    h("a.btn", { href: "/users" }, icon("users"), h("span", "Browse users")),
                ),
            );
            document.title = "Profile · BallIdentifier";
        }
    }

    function skeleton() {
        return h("div.stack", h("div.skeleton.pf-skel-hero"), h("div.skeleton.pf-skel-row"), h("div.skeleton.pf-skel-row"));
    }

    const isSelf = () => Boolean(getUser() && getUser().id === profileId);

    /** Logged in, but no profile saved yet. */
    function paintSetup() {
        const user = getUser();
        document.title = "Your profile · BallIdentifier";
        body.replaceChildren(
            h(
                "div.card.pf-setup",
                img(user?.avatarUrl, "", "pf-avatar"),
                h("h1", "Set up your profile"),
                h("p.muted", "Show what you collect, your favorite balls and (if you want) your Ballsdex stats. Your profile stays private until you make it public."),
                h("button.btn.btn-primary", { type: "button", onclick: () => openEditor() }, icon("palette"), h("span", "Create my profile")),
            ),
        );
        if (wantEdit) {
            wantEdit = false;
            openEditor();
        }
    }

    /* ----- Rendering ----- */

    function paint() {
        const p = profile;
        document.title = `${displayName(p)} · BallIdentifier`;

        const copyBtn = h("button.btn.btn-sm", { type: "button", onclick: async () => toast((await copyText(profileUrl(p.id))) ? "Profile link copied." : "Couldn't copy the link.", "info") }, icon("link", "icon-sm"), h("span", "Copy link"));
        const actions = h(
            "div.pf-actions",
            copyBtn,
            h("a.btn.btn-sm", { href: `https://discord.com/users/${p.id}`, target: "_blank", rel: "noopener" }, icon("discord", "icon-sm"), h("span", "Discord")),
            isSelf() ? h("button.btn.btn-sm.btn-primary", { type: "button", onclick: () => openEditor() }, icon("palette", "icon-sm"), h("span", "Edit profile")) : null,
            viewer?.canModerate && !isSelf() ? h("button.btn.btn-sm", { type: "button", onclick: () => moderate() }, icon("shield-check", "icon-sm"), h("span", "Moderate")) : null,
        );

        const facts = [
            p.favoriteDex ? h("span.pf-fact", img(dexIcon(p.favoriteDex), "", "badge-ico"), `Plays ${p.favoriteDex}`) : null,
            p.identifyAmount ? h("span.pf-fact", icon("scan-search", "icon-sm"), `${fmt(p.identifyAmount)} spawns identified`) : null,
            p.createdAt ? h("span.pf-fact", icon("calendar-days", "icon-sm"), `Joined ${formatDate(p.createdAt, { month: "short", year: "numeric" })}`) : null,
        ].filter(Boolean);

        const collected = (p.collections || []).reduce((sum, group) => sum + group.balls.length, 0);
        // (replaceChildren would print an empty section as the text "null")
        const sections = [
            isSelf() && !p.public
                ? h(
                      "p.callout.callout-warning",
                      icon(p.blocked ? "shield-check" : "lock", "icon-sm"),
                      h("span", p.blocked ? "Your profile was hidden by the BallIdentifier owner. Only you can see it." : "Only you can see this. Turn on Public profile in Edit profile to share it."),
                  )
                : null,
            h(
                "header.card.pf-hero",
                h("div.pf-glow", { "aria-hidden": "true" }),
                img(p.avatarUrl, "", "pf-avatar", { width: 104, height: 104 }),
                h(
                    "div.pf-ident",
                    h("div.pf-name-row", h("h1", displayName(p)), p.pronouns ? h("span.badge", p.pronouns) : null),
                    p.username ? h("p.pf-username", `@${p.username}`) : null,
                    p.bio ? h("p.pf-bio", p.bio) : isSelf() ? h("p.pf-bio.subtle", "No bio yet. Add one in Edit profile.") : null,
                    facts.length ? h("div.pf-facts", facts) : null,
                ),
                h(
                    "div.pf-stats",
                    stat(fmt(collected), "Collecting", p.collections !== null),
                    p.ballsdex?.totalBalls !== undefined && p.ballsdex?.totalBalls !== null ? stat(fmt(p.ballsdex.totalBalls), "Ballsdex balls", true) : null,
                    p.showcase.length ? stat(fmt(p.showcase.length), "Showcase", true) : null,
                ),
                actions,
            ),
            showcaseSection(p),
            ballsdexSection(p),
            lastCatchesSection(p),
            catchSection(p),
            collectionsSection(p),
        ];
        body.replaceChildren(...sections.filter(Boolean));
    }

    function stat(value, label, show) {
        return show ? h("div.pf-stat", h("b", value), h("span", label)) : null;
    }

    function showcaseSection(p) {
        if (!p.showcase.length) return isSelf() ? hintCard("star", "Showcase", "Pick up to 6 favorite balls from any dex to show here.") : null;
        return h(
            "section.pf-section",
            h("h2.section-title", icon("star"), "Showcase"),
            h(
                "div.pf-showcase",
                p.showcase.map((ball) =>
                    h(
                        "a.pf-show-card",
                        { href: artHref(ball.dex, ball.name) },
                        h("span.pf-show-art", img(compressedArtUrl(ball.dex, ball.name), "", "", { width: 120, height: 120 })),
                        h("b", ball.name),
                        h("span.subtle", img(dexIcon(ball.dex), "", "badge-ico"), ball.rarity !== null && ball.rarity !== undefined ? `${ball.dex} · T${ball.rarity}` : ball.dex),
                    ),
                ),
            ),
        );
    }

    function ballsdexSection(p) {
        const s = p.ballsdex;
        if (!s) return isSelf() ? hintCard("layers", "Ballsdex", "Your Ballsdex stats are hidden. Link your account in the Ballsdex tab and turn on Show Ballsdex stats to show them here.") : null;
        if (s.unavailable) return null;
        const kv = (label, value, cls = "") => h("div", h("dt", label), h(`dd${cls}`, value ?? "—"));
        const completion = s.dexSize && s.uniqueBalls ? Math.min(100, Math.round((s.uniqueBalls / s.dexSize) * 100)) : null;
        const ranking = (title, entries) =>
            h(
                "div.rank-group",
                h("h3", title),
                entries?.length ? h("ol.rank", entries.map((e, i) => h("li", h("span.pos", i + 1), h("span.name", { title: e.name }, e.name), h("span.val.num", fmt(e.count))))) : h("p.subtle", "Nothing yet"),
            );
        return h(
            "section.pf-section",
            h("h2.section-title", icon("layers"), "Ballsdex", h("span.subtle.pf-synced", s.lastSyncedAt ? `Synced ${formatDate(s.lastSyncedAt)}${s.source === "file" ? " · Fast Sync" : ""}` : "")),
            h(
                "div.bdx-grid",
                h(
                    "section.card.panel.span-2",
                    h(
                        "dl.kv.cols-4",
                        kv("Total balls", fmt(s.totalBalls)),
                        // Official completion from the Ballsdex API when known, otherwise unique balls from the sync
                        s.completion?.percent != null
                            ? h(
                                  "div",
                                  h("dt", "Completion"),
                                  h("dd", `${Number(s.completion.percent).toFixed(1).replace(/\.0$/, "")}%`),
                                  h("p.subtle", `${fmt(s.completion.owned)} of ${fmt(s.completion.total)}`),
                                  h("div.pf-meter", h("div.meter-fill", { style: { width: `${Math.min(100, s.completion.percent)}%` } })),
                              )
                            : h("div", h("dt", "Unique"), h("dd", fmt(s.uniqueBalls)), completion !== null ? h("div.pf-meter", { title: `${completion}% of ${fmt(s.dexSize)} balls` }, h("div.meter-fill", { style: { width: `${completion}%` } })) : null),
                        h("div", h("dt", "Specials"), h("dd", fmt(s.specialCount)), s.specialKinds ? h("p.subtle", `${fmt(s.specialKinds)} different`) : null),
                        kv("Self-caught", fmt(s.selfCaughtCount)),
                        s.fastestCatch ? h("div", h("dt", "Fastest catch"), h("dd", formatDuration(s.fastestCatch.durationMs)), h("p.subtle", s.fastestCatch.ballName)) : kv("Fastest catch", "—"),
                        kv("Average catch", s.averageCatchMs ? formatDuration(s.averageCatchMs) : "—"),
                        kv("Playing since", s.oldestCaughtAt ? formatDate(s.oldestCaughtAt) : "—", ".text"),
                        kv("Best day", s.mostActiveCatchCount ? `${fmt(s.mostActiveCatchCount)} catches` : "—", ".text"),
                    ),
                ),
                h("section.card.panel.span-2", h("div.rank-cols.pf-ranks", ranking("Most owned", s.topCountries), ranking("Top specials", s.topSpecials))),
            ),
        );
    }

    function lastCatchesSection(p) {
        const list = p.lastCatches?.items;
        if (!list?.length) return null;
        return h(
            "section.pf-section",
            h("h2.section-title", icon("history"), "Last catches", h("span.subtle.pf-synced", "Ballsdex")),
            h(
                "div.pf-catches",
                list.map((ball) =>
                    h(
                        "a.pf-catch",
                        { href: artHref("Ballsdex", ball.name), title: ball.caughtAt ? `${ball.name} · ${new Date(ball.caughtAt).toLocaleString()}` : ball.name },
                        h("span.pf-catch-art", img(compressedArtUrl("Ballsdex", ball.name), "", "", { width: 64, height: 64 })),
                        h("b", ball.name),
                        ball.special ? h("span.badge.badge-accent", ball.special) : null,
                        h("span.subtle", ball.caughtAt ? timeAgo(ball.caughtAt) : ""),
                    ),
                ),
            ),
        );
    }

    function catchSection(p) {
        const c = p.catches;
        if (!c?.all) {
            if (!isSelf()) return null;
            return hintCard("timer", "Catch stats", c ? "No catches tracked yet. They count on servers where an admin turned on Catch stats." : "Catch tracking is off. Turn on Track my catches in Edit profile to start counting.", "/bot/catch-stats");
        }
        const kv = (label, value, sub) => h("div", h("dt", label), h("dd", value), sub ? h("p.subtle", sub) : null);
        const span = (w) => (w?.count ? `${fmt(w.count)} catches · best ${formatMs(w.bestMs)}` : "No catches");
        const balls = c.all.fastestBalls || [];
        return h(
            "section.pf-section",
            h("h2.section-title", icon("timer"), "Catch stats", isSelf() ? h("span.subtle.pf-synced", c.public ? "Public" : "Only you can see this") : null),
            h(
                "div.bdx-grid",
                h(
                    "section.card.panel.span-2",
                    h(
                        "dl.kv.cols-4",
                        kv("Catches", fmt(c.all.count), c.all.uniqueBalls ? `${fmt(c.all.uniqueBalls)} different balls` : null),
                        kv("Average", formatMs(c.all.averageMs)),
                        kv("Fastest", formatMs(c.all.bestMs), c.all.best?.ball || null),
                        kv("Last 30 days", c.last30?.count ? formatMs(c.last30.averageMs) : "—", span(c.last30)),
                    ),
                ),
                balls.length
                    ? h(
                          "section.card.panel.span-2",
                          h(
                              "div.rank-group",
                              h("h3", "Fastest balls (average, 3+ catches)"),
                              h("ol.rank", balls.map((b, i) => h("li", h("span.pos", i + 1), h("span.name", { title: b.dex ? `${b.ball} · ${b.dex}` : b.ball }, b.ball), h("span.val.num", formatMs(b.averageMs))))),
                          ),
                      )
                    : null,
            ),
        );
    }

    function collectionsSection(p) {
        if (p.collections === null) return null;
        if (!p.collections.length) return isSelf() ? hintCard("crown", "Collecting", "You don't collect anything yet. Add yourself to the balls you collect on the Collectors page.", "/collectors") : null;
        return h(
            "section.pf-section",
            h("h2.section-title", icon("crown"), "Collecting"),
            h(
                "div.pf-collections",
                p.collections.map((group) =>
                    h(
                        "div.card.pf-col-group",
                        h("h3", img(dexIcon(group.dex), "", "badge-ico"), group.dex, h("span.subtle", fmt(group.balls.length))),
                        h(
                            "div.pf-col-list",
                            group.balls.map((ball) =>
                                h(
                                    "a.pf-col-ball",
                                    { href: artHref(group.dex, ball.name), title: ball.verified ? `${ball.name} · verified collector` : ball.name },
                                    img(compressedArtUrl(group.dex, ball.name), "", "", { width: 36, height: 36 }),
                                    h("span", ball.name),
                                    ball.verified ? icon("shield-check", "icon-sm pf-verified") : null,
                                ),
                            ),
                        ),
                    ),
                ),
            ),
        );
    }

    function hintCard(iconName, title, text, href) {
        return h(
            "section.pf-section",
            h("h2.section-title", icon(iconName), title),
            h("div.card.pf-hint", h("p.muted", text), href ? h("a.btn.btn-sm", { href }, h("span", "Open"), icon("chevron-right", "icon-sm")) : h("button.btn.btn-sm", { type: "button", onclick: () => openEditor() }, icon("palette", "icon-sm"), h("span", "Edit profile"))),
        );
    }

    /* ----- Editor ----- */

    async function openEditor() {
        let data;
        try {
            data = await api("profile", { query: { action: "me" } });
        } catch (error) {
            return handleError(error);
        }
        const s = { ...data.settings, showcase: [...data.settings.showcase] };
        const { dexes } = await getDexList();

        const publicInput = h("input", { type: "checkbox", checked: s.public, disabled: data.blocked });
        const bdxInput = h("input", { type: "checkbox", checked: s.showBallsdex });
        const colInput = h("input", { type: "checkbox", checked: s.showCollections });
        const lastInput = h("input", { type: "checkbox", checked: s.showLastCatches !== false });
        const catchSettings = data.catchStats || { public: false, tracking: true };
        const catchPublicInput = h("input", { type: "checkbox", checked: catchSettings.public });
        const catchTrackInput = h("input", { type: "checkbox", checked: catchSettings.tracking });
        const bio = h("textarea.textarea", { maxLength: data.limits.bio, rows: 4, placeholder: "A few words about you, what you collect, your trade rules…", value: s.bio });
        const bioCount = h("span.hint");
        const updateCount = () => (bioCount.textContent = `${bio.value.length} / ${data.limits.bio}`);
        bio.addEventListener("input", updateCount);
        updateCount();
        const pronouns = h("input.input", { type: "text", maxLength: data.limits.pronouns, placeholder: "e.g. he/him", value: s.pronouns, autocomplete: "off" });
        const favDex = h("select.select", h("option", { value: "" }, "None"), dexes.map((dex) => h("option", { value: dex, selected: s.favoriteDex === dex }, dex)));

        // Showcase: up to 6 balls from any dex
        const showList = h("div.pf-show-edit");
        const showDex = h("select.select", { "aria-label": "Dex" }, dexes.map((dex) => h("option", { value: dex, selected: dex === (s.favoriteDex || "Ballsdex") }, dex)));
        const listId = `pf-balls-${Math.random().toString(36).slice(2, 7)}`;
        const ballList = h("datalist", { id: listId });
        const ballInput = h("input.input", { type: "text", placeholder: "Ball name", autocomplete: "off", spellcheck: false });
        ballInput.setAttribute("list", listId);
        const addBtn = h("button.btn", { type: "button" }, icon("plus"), h("span", "Add"));
        let dexNames = [];
        async function fillBalls() {
            dexNames = Object.keys(await getDex(showDex.value)).sort((a, b) => a.localeCompare(b));
            ballList.replaceChildren(...dexNames.map((name) => h("option", { value: name })));
        }
        showDex.addEventListener("change", fillBalls);
        fillBalls();
        function paintShowcase() {
            showList.replaceChildren(
                ...(s.showcase.length
                    ? s.showcase.map((item, index) =>
                          h(
                              "div.pf-show-item",
                              img(compressedArtUrl(item.dex, item.name), "", "", { width: 40, height: 40 }),
                              h("div", h("b", item.name), h("span.subtle", item.dex)),
                              h("button.icon-btn", { type: "button", "aria-label": `Remove ${item.name}`, onclick: () => (s.showcase.splice(index, 1), paintShowcase()) }, icon("x")),
                          ),
                      )
                    : [h("p.subtle", "Nothing picked yet.")]),
            );
            addBtn.disabled = s.showcase.length >= data.limits.showcase;
        }
        function addBall() {
            const name = dexNames.find((n) => n.toLowerCase() === ballInput.value.trim().toLowerCase());
            if (!name) return toast(`No ball called "${ballInput.value.trim()}" in ${showDex.value}.`, "error");
            if (s.showcase.some((item) => item.dex === showDex.value && item.name === name)) return toast("It's already in your showcase.", "info");
            s.showcase.push({ dex: showDex.value, name });
            ballInput.value = "";
            paintShowcase();
        }
        addBtn.addEventListener("click", addBall);
        ballInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                addBall();
            }
        });
        paintShowcase();

        const saveBtn = h("button.btn.btn-primary", { type: "button" }, icon("check"), h("span", "Save"));
        const dialog = openDialog({
            title: "Edit profile",
            className: "pf-editor",
            body: [
                h(
                    "section.pf-edit-block",
                    h("label.switch", h("span", h("b", "Public profile"), h("small.hint", data.blocked ? "Hidden by the BallIdentifier owner." : "Anyone with the link can see it, and you show up in Users.")), publicInput),
                    h("p.subtle.pf-url", icon("link", "icon-sm"), profileUrl(getUser().id)),
                ),
                h("div.field", h("label.label", "Bio"), bio, bioCount),
                h("div.grid-2", h("div.field", h("label.label", "Pronouns"), pronouns), h("div.field", h("label.label", "Favorite dex"), favDex)),
                h("div.field", h("span.label", `Showcase (up to ${data.limits.showcase})`), showList, h("div.pf-show-add", showDex, ballInput, ballList, addBtn)),
                h(
                    "section.pf-edit-block",
                    h(
                        "label.switch",
                        h("span", h("b", "Show Ballsdex stats"), h("small.hint", data.ballsdexLinked ? "Totals, specials, catch speed and rankings from your last sync. Never your API key or ball IDs." : "Link your Ballsdex account in the Ballsdex tab first.")),
                        bdxInput,
                    ),
                    h("label.switch", h("span", h("b", "Show what I collect"), h("small.hint", "The balls you're a collector of, from the Collectors page.")), colInput),
                    h(
                        "label.switch",
                        h("span", h("b", "Show my last catches"), h("small.hint", data.ballsdexLinked ? "Your newest Ballsdex catches, refreshed every 15 minutes at most." : "Link your Ballsdex account in the Ballsdex tab first.")),
                        lastInput,
                    ),
                ),
                h(
                    "section.pf-edit-block",
                    h("label.switch", h("span", h("b", "Show my catch stats publicly"), h("small.hint", "Your catch times on your profile and in the Catch stats rankings. Off: only you see them.")), catchPublicInput),
                    h("label.switch", h("span", h("b", "Track my catches"), h("small.hint", "Off stops Catch stats for you and deletes your catch data.")), catchTrackInput),
                ),
            ],
            footer: [h("button.btn", { type: "button", onclick: () => dialog.close() }, "Cancel"), saveBtn],
        });

        saveBtn.addEventListener("click", async () => {
            saveBtn.disabled = true;
            const settings = {
                public: publicInput.checked,
                bio: bio.value,
                pronouns: pronouns.value,
                favoriteDex: favDex.value || null,
                showcase: s.showcase,
                showBallsdex: bdxInput.checked,
                showCollections: colInput.checked,
                showLastCatches: lastInput.checked,
            };
            const catchChanges = { public: catchPublicInput.checked, tracking: catchTrackInput.checked };
            if (catchSettings.tracking && !catchChanges.tracking) {
                const ok = await confirmDialog({ title: "Stop tracking your catches?", message: "Your catch data is deleted right away and the bot won't answer your catches anymore.", confirmLabel: "Stop and delete", danger: true });
                if (!ok) {
                    saveBtn.disabled = false;
                    return;
                }
            }
            try {
                const result = await api("profile", { method: "POST", body: { action: "save", settings, catchStats: catchChanges } });
                dialog.close();
                toast(settings.public && !s.public ? "Your profile is public now." : "Profile saved.", "success");
                if (profileId === getUser()?.id && result.profile) {
                    profile = result.profile;
                    paint();
                }
            } catch (error) {
                handleError(error);
                saveBtn.disabled = false;
            }
        });
    }

    /* ----- Owner moderation ----- */

    async function moderate() {
        const op = profile.blocked ? "unhide" : "hide";
        const ok = await confirmDialog({
            title: op === "hide" ? "Hide this profile?" : "Allow this profile again?",
            message: op === "hide" ? `${displayName(profile)}'s profile becomes private and they can't make it public again until you allow it.` : "They will be able to make their profile public again.",
            confirmLabel: op === "hide" ? "Hide profile" : "Allow",
            danger: op === "hide",
        });
        if (!ok) return;
        try {
            await api("profile", { method: "POST", body: { action: "moderate", id: profile.id, op } });
            toast(op === "hide" ? "Profile hidden." : "Profile allowed again.", "success");
            load();
        } catch (error) {
            handleError(error);
        }
    }

    function handleError(error) {
        if (error instanceof ApiError && error.status === 401) {
            sessionExpired();
            toast("Your session expired. Log in again.", "info");
            return;
        }
        toast(error.message, "error");
    }

    /* ----- Route ----- */

    async function show(params = [], { changed } = {}) {
        wantEdit = new URLSearchParams(location.search).get("edit") === "1";
        if (wantEdit) history.replaceState(null, "", location.pathname);
        const requested = params[0] || "";
        if (!requested || requested === "me") {
            if (!sessionReady()) await loadSession();
            const user = getUser();
            if (!user) {
                document.title = "Profile · BallIdentifier";
                body.replaceChildren(
                    h(
                        "div.empty",
                        h("div.empty-icon", icon("user-round", "icon-lg")),
                        h("h2", "Your profile"),
                        h("p", "Log in with Discord to create your public profile."),
                        h("button.btn.btn-discord", { type: "button", onclick: () => login("#/u") }, icon("discord"), h("span", "Log in with Discord")),
                    ),
                );
                return;
            }
            history.replaceState(null, "", `/u/${user.id}`);
            profileId = user.id;
            return load();
        }
        if (!/^\d{17,20}$/.test(requested)) {
            body.replaceChildren(h("div.empty", h("div.empty-icon", icon("user-round", "icon-lg")), h("h2", "No such user"), h("p", "Profile links look like ballidentifier.xyz/u/ followed by a Discord user ID.")));
            return;
        }
        if (requested !== profileId || changed || wantEdit) {
            profileId = requested;
            load();
        }
    }

    onAuthChange(() => {
        if (!el.hidden && profileId) load();
    });

    return { el, show };
}

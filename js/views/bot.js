/**
 * Bot — overview (every feature and command, invite, live stats) and the Notifier settings,
 * which need a Discord login: server list -> per-server configuration with live preview.
 */

import { h, icon, img, fmt, initials, timeAgo, spinner } from "../core/dom.js";
import { toast, openDialog, confirmDialog } from "../core/ui.js";
import { api, ApiError } from "../core/api.js";
import { getUser, onAuthChange, loadSession, login, sessionExpired, sessionReady } from "../core/auth.js";
import { dexIcon } from "../core/data.js";
import { renderDiscordMarkdown } from "../core/discord-md.js";
import { openNotifications } from "../notifications.js";
import { catchStatsPanel } from "./catch-stats.js";

const CLIENT_ID = "510775326310268930";
const INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}`;
const inviteFor = (guildId) => `${INVITE_URL}&guild_id=${guildId}&disable_guild_select=true`;
const MAX_MESSAGE = 200;
const DEFAULT_MESSAGE = "{role} Catch that ball! - **{ball}**";
const PLACEHOLDERS = [
    ["{role}", "Pings the role (required)"],
    ["{ball}", "Ball name"],
    ["{rarity}", "Rarity"],
    ["{artist}", "Artist"],
];
const SAMPLE = { "{ball}": "Poland", "{rarity}": "12", "{artist}": "Artist" };

// Two notifiers per server, saved separately: spawns, and the wandering tradesman
const KINDS = [
    {
        id: "spawn",
        key: "notifier",
        label: "Spawn notifier",
        icon: "bell-ring",
        botsHint: "Spawns from these bots trigger a ping.",
        defaultMessage: DEFAULT_MESSAGE,
        placeholders: PLACEHOLDERS,
        sample: SAMPLE,
        replyText: "A wild countryball appeared!",
    },
    {
        id: "tradesman",
        key: "tradesman",
        label: "Tradesman notifier",
        icon: "megaphone",
        botsHint: "A wandering tradesman from these bots triggers a ping.",
        defaultMessage: "{role} The tradesman is here! Selling: {offers}",
        placeholders: [
            ["{role}", "Pings the role (required)"],
            ["{offers}", "Balls for sale, with prices"],
        ],
        sample: { "{offers}": "✨ Ethiopia · 3,636 ballsbux, 💀 Tonga · 48,387 ballsbux" },
        replyText: "The tradesman has arrived.",
    },
];

export function createView() {
    let section = "overview";
    let params = [];
    let statsLoaded = false;
    let guildCache = null; // last loaded server list
    let renderToken = 0;

    /* ----- Hero ----- */

    const statEls = { guilds: h("strong.num", "—"), users: h("strong.num", "—"), identified: h("strong.num", "—") };
    const hero = h(
        "div.card",
        { style: { overflow: "hidden" } },
        h(
            "div.bot-hero",
            h("img.bot-avatar", { src: "assets/brand/avatar-512.png", alt: "", width: 104, height: 104 }),
            h(
                "div.bot-id",
                h("h1", "BallIdentifier", h("span.badge.badge-accent", "Discord bot")),
                h("p", "Identify spawns, get pinged for new ones and keep track of your Ballsdex collection, right inside Discord."),
            ),
            h(
                "div.bot-actions",
                h("a.btn.btn-discord", { href: INVITE_URL, target: "_blank", rel: "noopener" }, icon("discord"), h("span", "Add to Discord")),
                h("a.btn", { href: "#/bot/notifier" }, icon("settings-2"), h("span", "Notifier settings")),
            ),
        ),
        h(
            "div.stat-strip",
            h("div", statEls.guilds, h("span", icon("server", "icon-sm"), "Servers")),
            h("div", statEls.users, h("span", icon("users", "icon-sm"), "Users")),
            h("div", statEls.identified, h("span", icon("scan-search", "icon-sm"), "Identified")),
        ),
    );

    const tabOverview = h("a", { href: "#/bot" }, icon("info", "icon-sm"), "Overview");
    const tabNotifier = h("a", { href: "#/bot/notifier" }, icon("bell-ring", "icon-sm"), "Notifier");
    const tabCatch = h("a", { href: "#/bot/catch-stats" }, icon("timer", "icon-sm"), "Catch stats");
    const panel = h("div");
    const el = h(
        "section.view",
        { dataset: { view: "bot" }, "aria-label": "Bot" },
        hero,
        h("div.tabs-bar", h("nav.segmented", { "aria-label": "Bot sections" }, tabOverview, tabNotifier, tabCatch)),
        panel,
    );

    async function loadStats() {
        if (statsLoaded) return;
        statsLoaded = true;
        try {
            const { data } = await api("get-bot-stats");
            const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
            for (const [key, value] of [["guilds", data?.guilds], ["users", data?.users], ["identified", data?.identifiedBalls]]) {
                statEls[key].textContent = Number(value) >= 100000 ? compact.format(value) : fmt(value);
                statEls[key].title = fmt(value);
            }
        } catch {
            statsLoaded = false;
        }
    }

    /* ----- Overview ----- */

    function shot(src, label) {
        return h(
            "button.shot",
            { type: "button", "aria-label": `Enlarge: ${label}`, onclick: () => openDialog({ title: label, wide: true, body: h("img.enlarged-art", { src, alt: label }) }) },
            h("img", { src, alt: "", loading: "lazy" }),
            h("span", label),
        );
    }

    function featureHead(iconName, title) {
        return h("h2", h("span.icon-wrap", icon(iconName)), title);
    }

    const DEXES = ["Ballsdex", "FoodDex", "HistoryDex", "JoJoDex", "Empireballs Reboot", "MapsDex", "FlagsDex"];
    const code = (text) => h("code", text);

    function infoCard(iconName, title, intro, points, action) {
        return h(
            "article.card.card-pad.more-card",
            h("h3", h("span.icon-wrap", icon(iconName)), title),
            h("p", intro),
            h("ul.more-points", points.map((point) => h("li", point))),
            action ? h("div.more-action", action) : null,
        );
    }

    const COMMANDS = [
        [[h("b", "Identify")], "Right-click a spawn → Apps", "Names the ball in a spawn message, with similarity, rarity and artist. Once every 10 minutes, no cooldown for upvoters.", "Servers"],
        [[h("b", "Check collections")], "Right-click a member → Apps", "Lists the balls that member is a collector of, in every supported dex.", "Servers"],
        [[code("/info"), " ", h("span.cmd-arg", "dex"), " ", h("span.cmd-arg", "name or ID")], null, "Rarity, wave, common value, collector requirement and demand tier of one entry, with a button to see its collectors.", "Anywhere"],
        [[code("/collectors"), " ", h("span.cmd-arg", "dex")], null, "Browse the entries of a dex that have collectors, or search one by name or ID.", "Anywhere"],
        [[code("/ballsdex link"), " · ", code("unlink")], null, "Connect your Ballsdex account with Sign in with Ballsdex, or disconnect it (this also deletes your saved collection data).", "Anywhere"],
        [[code("/ballsdex sync")], null, "Import your Ballsdex collection, with live progress and a cancel button. Once every 24 hours.", "Anywhere"],
        [[code("/ballsdex collection")], null, "Totals, specials, rankings and catch times from your last sync.", "Anywhere"],
        [[code("/ballsdex raws")], null, "Value of your rare (T1 to T23) non-special balls, counted per tier.", "Anywhere"],
        [[code("/catchstats"), " ", h("span.cmd-arg", "me · server · settings")], null, "Your catch times, the server's fastest catchers, and who can see your stats.", "Anywhere"],
        [[code("/help")], null, "Supported dexes, bot statistics, whether you've upvoted, and useful links.", "Anywhere"],
    ];

    const overview = h(
        "div.bot-overview",
        h(
            "div.card.card-pad",
            h(
                "div.works-with",
                h("span.eyebrow", "Works with"),
                h("ul.dex-list", DEXES.map((dex) => h("li", img(dexIcon(dex), "", "dex-ico", { width: 24, height: 24 }), dex))),
            ),
            h(
                "article.feature",
                h(
                    "div.feature-copy",
                    featureHead("scan-search", "Identify in two clicks"),
                    h("p", "Right-click a spawn message, open ", h("b", "Apps"), " and pick ", h("b", "Identify"), ". Only you see the answer, so you can use it in any server channel without spamming it."),
                    h("ol.steps", h("li", "Right-click the spawn message"), h("li", "Choose Apps → Identify"), h("li", "Read the name, rarity and artist")),
                    h(
                        "ul.checks",
                        h("li", icon("check", "icon-sm"), h("span", "Shows how similar the spawn is to the matched art, and how many balls you've identified so far.")),
                        h("li", icon("check", "icon-sm"), h("span", "One identify every 10 minutes. ", h("b", "No cooldown"), " for 12 hours after you upvote the bot.")),
                        h("li", icon("check", "icon-sm"), h("span", "Unsure matches (usually brand-new spawn arts) are reported automatically, so the art gets added quickly.")),
                    ),
                    h("div", h("a.btn", { href: "https://discordbotlist.com/bots/ballidentifier/upvote", target: "_blank", rel: "noopener" }, icon("thumbs-up"), h("span", "Upvote the bot"))),
                ),
                h("div.shots", { style: { "--cols": "2" } }, shot("assets/bot/identifier/1.png", "Ballsdex result"), shot("assets/bot/identifier/2.png", "JoJoDex result")),
            ),
            h(
                "article.feature",
                h(
                    "div.feature-copy",
                    featureHead("megaphone", "Spawn Notifier"),
                    h("p", "Never miss a spawn. When a dex you picked spawns a ball on your server, the bot replies to it with the ball's name and pings your role."),
                    h(
                        "ul.checks",
                        h("li", icon("check", "icon-sm"), h("span", "Pick which dexes to watch and which role to ping.")),
                        h("li", icon("check", "icon-sm"), h("span", "Write your own message with ", code("{ball}"), ", ", code("{rarity}"), ", ", code("{artist}"), " and ", code("{role}"), ".")),
                        h("li", icon("check", "icon-sm"), h("span", "Only the chosen role can be pinged, never @everyone.")),
                        h("li", icon("check", "icon-sm"), h("span", "New spawn arts show as “Unknown” and are reported for an update.")),
                    ),
                    h("p.subtle", "You need Administrator on the server, and the bot has to be in it."),
                    h("div", h("a.btn.btn-primary", { href: "#/bot/notifier" }, icon("settings-2"), h("span", "Set up the Notifier"))),
                ),
                h("div.shots", { style: { "--cols": "1" } }, shot("assets/bot/notifier/1.png", "Notification example")),
            ),
        ),
        h(
            "div.more-grid",
            infoCard(
                "layers",
                "Your Ballsdex collection",
                "Connect your Ballsdex account once with Sign in with Ballsdex, then see your collection in the bot and on this website.",
                [
                    "Sync imports every ball you own. One sync runs at a time, and you can sync again 24 hours later.",
                    "Collection shows totals, specials and your top 5 most owned balls and specials.",
                    "Raws adds up your rare non-special balls (T1 to T23), weighted by tier.",
                    "BallIdentifier gets read-only access, stored encrypted. Disconnecting removes that access and your saved data.",
                ],
                h("a.btn", { href: "#/ballsdex" }, icon("layers"), h("span", "Open Ballsdex tab")),
            ),
            infoCard(
                "timer",
                "Catch stats",
                "How fast do you catch? On servers where an admin turns it on, the bot answers each catch with your time.",
                [
                    "Your average, your average and best for that ball, and a shout when you beat a record.",
                    "Rankings of the fastest catchers: all time, 30 days and 7 days, per server or everywhere.",
                    "Private by default. Make your stats public in your profile, or opt out any time.",
                ],
                h("a.btn", { href: "#/bot/catch-stats" }, icon("timer"), h("span", "Catch stats settings")),
            ),
            infoCard(
                "bell",
                "Notifications",
                "Everything the bot tells you lands under the bell on this website. Choose what you get, and which ones also come as a Discord DM.",
                [
                    "Upvote thanks, and a reminder when your upvote runs out.",
                    "Ballsdex: sync finished, sync available again, key linked or removed.",
                    "Dex updates and new website or bot features.",
                ],
                h("button.btn", { type: "button", onclick: () => openNotifications() }, icon("bell"), h("span", "Open notifications")),
            ),
            infoCard(
                "book-open",
                "Dex lookups",
                "Look up any entry of a supported dex without leaving Discord.",
                [
                    h("span", code("/info"), " gives rarity, wave, common value, collector requirement and demand tier."),
                    h("span", code("/collectors"), " lists who owns each collector ball, with search by name or ID."),
                    h("span", "Right-click a member → Apps → ", h("b", "Check collections"), " to see their collector balls."),
                ],
            ),
            infoCard(
                "fingerprint",
                "How it works",
                "The bot never guesses from names. It compares the spawn picture itself.",
                [
                    "Each spawn image is turned into a small fingerprint (an image hash) and compared with every known art of that dex.",
                    "Dex data and new arts are downloaded every hour, so updates need no bot restart.",
                    "Similarity below the safe threshold means the art is probably new, and it gets reported for checking.",
                ],
            ),
        ),
        h(
            "section.card.card-pad.cmd-card",
            { "aria-labelledby": "cmd-title" },
            h("h2", { id: "cmd-title" }, h("span.icon-wrap", icon("square-terminal")), "All commands"),
            h(
                "ul.cmd-list",
                COMMANDS.map(([name, how, what, where]) =>
                    h(
                        "li",
                        h("div.cmd-name", name, how ? h("span.cmd-how", icon("mouse-pointer-click", "icon-sm"), how) : null),
                        h("p", what),
                        h(`span.badge${where === "Servers" ? "" : ".badge-accent"}`, where),
                    ),
                ),
            ),
        ),
    );

    /* ----- Routing inside the tab ----- */

    function render() {
        const token = ++renderToken;
        const isNotifier = section === "notifier";
        hero.hidden = section !== "overview";
        for (const [tab, on] of [[tabOverview, section === "overview"], [tabNotifier, isNotifier], [tabCatch, section === "catch-stats"]]) {
            if (on) tab.setAttribute("aria-current", "page");
            else tab.removeAttribute("aria-current");
        }

        if (section === "catch-stats") {
            if (!sessionReady()) return panel.replaceChildren(h("div.card.card-pad", { "aria-busy": "true" }, h("div.skeleton", { style: { height: "120px" } })));
            document.title = "Catch stats · Bot · BallIdentifier";
            return panel.replaceChildren(catchStatsPanel({ inviteFor }));
        }
        if (!isNotifier) return panel.replaceChildren(overview);
        if (!sessionReady()) {
            return panel.replaceChildren(h("div.card.card-pad", { "aria-busy": "true" }, h("div.skeleton", { style: { height: "120px" } })));
        }
        const user = getUser();
        if (!user) return panel.replaceChildren(loginPrompt());
        if (params[0]) return renderConfig(params[0], token);
        return renderServers(token);
    }

    onAuthChange(() => {
        if (!el.hidden && section !== "overview") render();
    });

    function loginPrompt() {
        return h(
            "div.card.empty",
            h("div.empty-icon", icon("bell-ring", "icon-lg")),
            h("h2", "Log in to set up the Notifier"),
            h("p", "Pick a server you manage and choose which spawns ping which role. You need Administrator on that server."),
            h("button.btn.btn-discord.btn-lg", { type: "button", onclick: () => login("#/bot/notifier") }, icon("discord"), h("span", "Log in with Discord")),
            h("p.subtle", icon("lock", "icon-sm"), " BallIdentifier only reads your username and server list."),
        );
    }

    function errorState(message, retry) {
        return h(
            "div.card.empty",
            h("div.empty-icon", icon("triangle-alert", "icon-lg")),
            h("h2", "Something went wrong"),
            h("p", message),
            h("button.btn", { type: "button", onclick: retry }, icon("refresh-cw"), h("span", "Try again")),
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

    /* ----- Server list ----- */

    function serverIcon(guild) {
        return guild.icon ? img(guild.icon, "", "server-icon") : h("span.server-icon", { "aria-hidden": "true" }, initials(guild.name));
    }

    async function renderServers(token, { refresh = false } = {}) {
        const refreshBtn = h("button.icon-btn", { type: "button", "aria-label": "Refresh server list" }, icon("refresh-cw"));
        refreshBtn.addEventListener("click", () => renderServers(++renderToken, { refresh: true }));
        const listEl = h("div.server-list", { "aria-busy": "true" }, Array.from({ length: 4 }, () => h("div.server", h("span.server-icon.skeleton"), h("div.server-body", h("div.skeleton", { style: { height: "14px", width: "60%" } })))));
        const head = h(
            "div.row",
            { style: { "justify-content": "space-between", "margin-bottom": "12px" } },
            h("div", h("h2.section-title", { style: { margin: "0" } }, "Choose a server"), h("p.subtle", "Servers where you have Administrator.")),
            refreshBtn,
        );
        panel.replaceChildren(head, listEl);

        let data = guildCache;
        if (!data || refresh) {
            try {
                data = await api("get-bot-guilds");
                guildCache = data;
            } catch (error) {
                if (token !== renderToken) return;
                if (handleAuthError(error)) return;
                return panel.replaceChildren(errorState(error.message, () => renderServers(++renderToken, { refresh: true })));
            }
        }
        if (token !== renderToken) return;

        const guilds = data.guilds || [];
        if (!guilds.length) {
            return panel.replaceChildren(
                head,
                h("div.card.empty", h("div.empty-icon", icon("server", "icon-lg")), h("h2", "No servers to manage"), h("p", "You need Administrator (or to be the owner) on a server to set up the Notifier there.")),
            );
        }

        listEl.removeAttribute("aria-busy");
        listEl.replaceChildren(
            ...guilds.map((guild) =>
                guild.hasBot
                    ? h(
                          "a.server",
                          { href: `#/bot/notifier/${guild.id}` },
                          serverIcon(guild),
                          h("div.server-body", h("span.server-name", guild.name), h("span.subtle", "Ready to configure")),
                          icon("chevron-right"),
                      )
                    : h(
                          "div.server",
                          serverIcon(guild),
                          h("div.server-body", h("span.server-name", guild.name), h("span.subtle", "Bot not added yet")),
                          h("a.btn.btn-sm", { href: inviteFor(guild.id), target: "_blank", rel: "noopener" }, icon("plus", "icon-sm"), h("span", "Add bot")),
                      ),
            ),
        );
        if (data.botListAvailable === false) {
            panel.append(h("p.callout.callout-warning", { style: { "margin-top": "12px" } }, icon("triangle-alert", "icon-sm"), h("span", "Couldn't check which servers already have the bot. Refresh in a moment.")));
        }
    }

    /* ----- Server configuration ----- */

    async function renderConfig(guildId, token) {
        const known = guildCache?.guilds?.find((g) => g.id === guildId);
        const back = h("a.btn.btn-ghost.btn-sm", { href: "#/bot/notifier", style: { "margin-bottom": "12px", "margin-left": "-8px" } }, icon("chevron-left", "icon-sm"), h("span", "All servers"));
        const title = h("h1", known?.name || "Server settings");
        const head = h("div.config-head", known ? serverIcon(known) : h("span.server-icon.skeleton"), title);
        panel.replaceChildren(back, head, h("div.card.card-pad", { "aria-busy": "true" }, h("div.stack", h("div.skeleton", { style: { height: "18px", width: "40%" } }), h("div.skeleton", { style: { height: "44px" } }), h("div.skeleton", { style: { height: "104px" } }))));

        let data;
        try {
            data = await api("get-guild-config", { query: { guildId } });
        } catch (error) {
            if (token !== renderToken) return;
            if (handleAuthError(error)) return;
            if (error.code === "BOT_MISSING") {
                return panel.replaceChildren(
                    back,
                    h(
                        "div.card.empty",
                        h("div.empty-icon", icon("bot", "icon-lg")),
                        h("h2", "BallIdentifier isn't on this server"),
                        h("p", "Add the bot first, then come back to set up the Notifier."),
                        h("a.btn.btn-discord", { href: inviteFor(guildId), target: "_blank", rel: "noopener" }, icon("discord"), h("span", "Add to this server")),
                    ),
                );
            }
            return panel.replaceChildren(back, errorState(error.message, () => renderConfig(guildId, ++renderToken)));
        }
        if (token !== renderToken) return;

        title.textContent = data.guildName || known?.name || "Server settings";
        if (!known) head.firstChild.replaceWith(serverIcon({ name: title.textContent, icon: null }));
        document.title = `${title.textContent} · Notifier · BallIdentifier`;

        if (!data.supportedBots?.length) {
            return panel.replaceChildren(
                back,
                head,
                h(
                    "div.card.empty",
                    h("div.empty-icon", icon("layers", "icon-lg")),
                    h("h2", "No supported dex bot here"),
                    h("p", "The Notifier watches spawns from dex bots like Ballsdex. Add one of them to this server, then refresh this page."),
                ),
            );
        }

        // Spawn / Tradesman switch; both forms stay in the page so unsaved edits survive switching
        const forms = KINDS.map((kind) => configForm(guildId, data, kind));
        const switchButtons = KINDS.map((kind, index) =>
            h("button", { type: "button", "aria-pressed": String(index === 0), onclick: () => pick(index) }, icon(kind.icon, "icon-sm"), kind.label),
        );
        function pick(index) {
            switchButtons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === index)));
            forms.forEach((form, i) => (form.hidden = i !== index));
        }
        pick(0);
        panel.replaceChildren(back, head, h("div.tabs-bar.nf-kinds", h("nav.segmented", { "aria-label": "Notifier type" }, switchButtons)), ...forms);
    }

    function configForm(guildId, data, kind) {
        const existing = data.configuration?.[kind.key] || null;
        const DEFAULT_MESSAGE = kind.defaultMessage;
        const PLACEHOLDERS = kind.placeholders;
        const SAMPLE = kind.sample;
        const ids = { role: `${kind.id}-role`, message: `${kind.id}-message`, help: `${kind.id}-message-help`, error: `${kind.id}-message-error` };
        const state = {
            bots: new Set(existing?.selectedBots || []),
            role: existing?.selectedRole || "",
            message: existing?.customMessage || DEFAULT_MESSAGE,
        };
        let savedSnapshot = existing ? JSON.stringify({ bots: [...state.bots].sort(), role: state.role, message: state.message.trim() }) : null;

        /* Bots */
        const botChips = h(
            "div.bot-toggles",
            { role: "group", "aria-label": "Bots to watch" },
            data.supportedBots.map((bot) => {
                const chip = h("button.chip", { type: "button", "aria-pressed": String(state.bots.has(bot.id)) }, img(dexIcon(bot.name), ""), h("span", bot.name));
                chip.addEventListener("click", () => {
                    if (state.bots.has(bot.id)) state.bots.delete(bot.id);
                    else state.bots.add(bot.id);
                    chip.setAttribute("aria-pressed", String(state.bots.has(bot.id)));
                    update();
                });
                return chip;
            }),
        );

        /* Role */
        const roles = data.availableRoles || [];
        const roleSelect = h(
            "select.select",
            { id: ids.role },
            h("option", { value: "" }, roles.length ? "Choose a role" : "No roles the bot can ping"),
            roles.map((role) => h("option", { value: role.id, selected: role.id === state.role }, role.name)),
        );
        roleSelect.addEventListener("change", () => {
            state.role = roleSelect.value;
            update();
        });

        /* Message */
        const textarea = h("textarea.textarea", { id: ids.message, maxLength: String(MAX_MESSAGE + 50), value: state.message, rows: 3, "aria-describedby": `${ids.help} ${ids.error}` });
        const count = h("span.char-count");
        const messageError = h("p.form-error", { id: ids.error, role: "alert" });
        textarea.addEventListener("input", () => {
            state.message = textarea.value;
            update();
        });
        const placeholderChips = h(
            "div.placeholder-chips",
            PLACEHOLDERS.map(([token, label]) =>
                h(
                    "button",
                    {
                        type: "button",
                        title: label,
                        "aria-label": `Insert ${token}: ${label}`,
                        onclick: () => {
                            textarea.focus();
                            textarea.setRangeText(token, textarea.selectionStart, textarea.selectionEnd, "end");
                            state.message = textarea.value;
                            update();
                        },
                    },
                    token,
                ),
            ),
        );

        /* Footer */
        const saveBtn = h("button.btn.btn-primary", { type: "submit" }, icon("check"), h("span", "Save changes"));
        const deleteBtn = h("button.btn.btn-danger", { type: "button", hidden: !existing }, icon("trash-2"), h("span", "Remove"));
        const lastUpdate = h("p.subtle");
        const setLastUpdate = (cfg) => {
            lastUpdate.textContent = cfg?.setupAt ? `Last saved ${timeAgo(cfg.setupAt)} by ${cfg.setupBy || "unknown"}` : "Not set up yet";
        };
        setLastUpdate(existing);

        /* Preview */
        const roleName = () => roles.find((r) => r.id === state.role)?.name || "role";
        const previewText = h("div.t-text");
        const preview = h(
            "div.card.card-pad.preview-card",
            h("h2.section-title", "Preview"),
            h(
                "div.discord-preview",
                h(
                    "div.t-msg",
                    h("span.t-reply", icon("chevron-right", "icon-sm"), h("b", "Ballsdex"), h("span.t-reply-text", kind.replyText)),
                    h("img.t-avatar", { src: "assets/brand/bot-avatar.png", alt: "" }),
                    h("div", { style: { "min-width": "0" } }, h("div.t-msg-head", h("span.t-author.is-bot", "BallIdentifier"), h("span.t-time", "Today")), previewText),
                ),
            ),
            h(
                "p.subtle",
                { style: { "margin-top": "12px" } },
                "Sample values: ",
                Object.entries(SAMPLE).map(([token, value], index, all) => [h("b", token), ` ${value}${index < all.length - 1 ? ", " : "."}`]),
            ),
        );

        function renderPlaceholders(text) {
            const tokens = PLACEHOLDERS.map(([token]) => token.replace(/[{}]/g, "\\$&")).join("|");
            return text.split(new RegExp(`(${tokens})`)).map((part) => {
                if (part === "{role}") return h("span.t-mention", `@${roleName()}`);
                return SAMPLE[part] ?? part;
            });
        }

        function renderPreview() {
            const text = state.message.trim() || DEFAULT_MESSAGE;
            previewText.replaceChildren(...renderDiscordMarkdown(text, renderPlaceholders));
        }

        function validate() {
            const message = state.message.trim();
            if (!message) return "Write a message.";
            if (message.length > MAX_MESSAGE) return `Keep it under ${MAX_MESSAGE} characters.`;
            if (!message.includes("{role}")) return "Add {role} so the role actually gets pinged.";
            if (/<script|<iframe|javascript:|on\w+\s*=/i.test(message)) return "The message contains blocked content.";
            if (/@(everyone|here)/i.test(message) || /<@[!&]?\d+>/.test(message)) return "Mentions aren't allowed. Use {role} instead.";
            if (/(https?:\/\/|www\.|\[.*?\]\(.*?\))/i.test(message)) return "Links aren't allowed in the message.";
            return "";
        }

        function snapshot() {
            return JSON.stringify({ bots: [...state.bots].sort(), role: state.role, message: state.message.trim() });
        }

        function update() {
            const length = state.message.trim().length;
            count.textContent = `${length} / ${MAX_MESSAGE}`;
            count.classList.toggle("over", length > MAX_MESSAGE);
            const error = validate();
            messageError.textContent = state.message.trim() ? error : "";
            textarea.setAttribute("aria-invalid", String(Boolean(error && state.message.trim())));
            const dirty = snapshot() !== savedSnapshot;
            saveBtn.disabled = !dirty;
            renderPreview();
        }

        const form = h(
            "form.card",
            { noValidate: true },
            h(
                "div.config-section",
                h("h2", "Bots to watch"),
                h("p.subtle", kind.botsHint),
                botChips,
            ),
            h("div.config-section", h("h2", h("label", { htmlFor: ids.role }, "Role to ping")), roleSelect, h("p.hint", "Only roles below BallIdentifier's highest role are listed.")),
            h(
                "div.config-section",
                h("div.row", { style: { "justify-content": "space-between" } }, h("h2", h("label", { htmlFor: ids.message }, "Message")), count),
                textarea,
                messageError,
                h("p.hint", { id: ids.help }, "Tap to insert. Discord formatting works: ", h("code", "**bold**"), " ", h("code", "`code`"), " ", h("code", "-# small"), " and new lines."),
                placeholderChips,
            ),
            h("div.save-bar", lastUpdate, h("div.row", { style: { gap: "8px" } }, deleteBtn, saveBtn)),
        );

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!state.bots.size) return toast("Pick at least one bot to watch.", "error");
            if (!state.role) {
                roleSelect.focus();
                return toast("Pick the role to ping.", "error");
            }
            const error = validate();
            if (error) {
                textarea.focus();
                return toast(error, "error");
            }
            saveBtn.disabled = true;
            saveBtn.replaceChildren(spinner(), h("span", "Saving…"));
            try {
                const result = await api("save-guild-config", {
                    method: "POST",
                    body: { guildId, kind: kind.id, selectedBots: [...state.bots], selectedRole: state.role, customMessage: state.message.trim() },
                });
                state.message = state.message.trim();
                savedSnapshot = snapshot();
                setLastUpdate(result.configuration || { setupAt: Date.now(), setupBy: getUser()?.username });
                deleteBtn.hidden = false;
                toast(`${kind.label} saved.`, "success");
            } catch (err) {
                if (!handleAuthError(err)) toast(err.message, "error");
            } finally {
                saveBtn.replaceChildren(icon("check"), h("span", "Save changes"));
                update();
            }
        });

        deleteBtn.addEventListener("click", async () => {
            const ok = await confirmDialog({
                title: `Remove the ${kind.label}?`,
                message: `The bot stops pinging for ${kind.id === "tradesman" ? "the tradesman" : "spawns"} on this server. You can set it up again any time.`,
                confirmLabel: "Remove",
                danger: true,
            });
            if (!ok) return;
            deleteBtn.disabled = true;
            try {
                await api("save-guild-config", { method: "POST", body: { guildId, kind: kind.id, isDelete: true } });
                toast(`${kind.label} removed.`, "success");
                state.bots.clear();
                state.role = "";
                state.message = DEFAULT_MESSAGE;
                textarea.value = DEFAULT_MESSAGE;
                roleSelect.value = "";
                botChips.querySelectorAll(".chip").forEach((chip) => chip.setAttribute("aria-pressed", "false"));
                savedSnapshot = null;
                deleteBtn.hidden = true;
                setLastUpdate(null);
                update();
            } catch (err) {
                if (!handleAuthError(err)) toast(err.message, "error");
            } finally {
                deleteBtn.disabled = false;
            }
        });

        update();
        return h("div.config-grid", form, preview);
    }

    return {
        el,
        show(routeParams = []) {
            section = ["notifier", "catch-stats"].includes(routeParams[0]) ? routeParams[0] : "overview";
            params = routeParams.slice(1).filter((p) => /^\d{17,20}$/.test(p));
            loadStats();
            render();
            if (section !== "overview" && !sessionReady()) loadSession().then(render);
        },
    };
}

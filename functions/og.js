/**
 * Link preview images (1200x630 PNG) for shared links, drawn from the site's own data.
 *
 * GET /.netlify/functions/og?type=ball&dex=Ballsdex&name=Poland   spawn art + rarity, wave, id, artist, collectors, values
 * GET /.netlify/functions/og?type=special&id=59                   special emoji + alias, price, spawn rate, dates
 * GET /.netlify/functions/og?type=page&page=<name>&v=<day>        identify, arts, trainer, bot, collectors, specials
 * GET /.netlify/functions/og?type=profile&id=<discord id>&v=<hash>  public profile: avatar, bio, showcase, stats
 *
 * Used as og:image by netlify/edge-functions/page-meta.js. Layout with satori (text becomes vector shapes,
 * so no system fonts are needed), PNG with resvg (kept off sharp so the function stays small). Cached by
 * Netlify's CDN for a day; the edge function adds a version parameter that changes with the data (pages: the day),
 * so new previews show fresh numbers.
 */

const fs = require("fs");
const path = require("path");
const satori = require("satori").default;
const { Resvg } = require("@resvg/resvg-js");
const { botApiFetch, botApiPublicFetch } = require("../lib/bot-api");

const RAW = "https://raw.githubusercontent.com/Meff1u/BallIdentifier/refs/heads/main/assets";
const SITE = process.env.URL || "https://ballidentifier.xyz";
const DEX_KEYS = { Ballsdex: "BD", HistoryDex: "HD", JoJoDex: "JD", "Empireballs Reboot": "EB", MapsDex: "MD", FlagsDex: "FD" };
const DEXES = Object.keys(DEX_KEYS);
const WAVE_COLORS = { 1: "#FF7769", 1.1: "#424242", 2: "#F56300", 3: "#824300", 4: "#219540", 4.1: "#333333", 5: "#006D83", 5.1: "#666666", 5.2: "#999999", 6: "#4386F5", 7: "#B299F2", 7.1: "#484848", 7.2: "#484848", 8: "#FFBEBE", 8.1: "#666666" };
const C = { bg: "#0E0B14", surface: "#1A1524", surface2: "#221C2E", border: "#2E2740", text: "#F1EDF7", text2: "#BBB3CB", text3: "#958DA8", accent: "#9B3ABF", accentText: "#CE8CEB", green: "#3BA55C" };
const W = 1200;
const H = 630;

// Netlify runs functions with the site root as cwd. Each folder is spelled out on purpose: with a variable
// folder the bundler would pack the whole assets/ folder (every spawn art) into the function.
const fontFile = (weight) => fs.readFileSync(path.join(process.cwd(), "assets/og", `outfit-latin-${weight}-normal.woff`));
const iconFile = (dex) => fs.readFileSync(path.join(process.cwd(), "assets/icons", `${dex}.png`));
const dexFile = (dex) => fs.readFileSync(path.join(process.cwd(), "assets/jsons", `${dex}.json`), "utf8");
const logoFile = () => fs.readFileSync(path.join(process.cwd(), "assets/brand/logo-mark.svg"));

let fonts = null;
function getFonts() {
    fonts ??= [400, 600, 800].map((weight) => ({ name: "Outfit", weight, style: "normal", data: fontFile(weight) }));
    return fonts;
}

const dexCache = new Map();
function getDexData(dex) {
    if (!dexCache.has(dex)) dexCache.set(dex, JSON.parse(dexFile(dex)));
    return dexCache.get(dex);
}
const ballNames = (data) => Object.keys(data).filter((key) => key !== "hashes" && data[key] && typeof data[key] === "object");
const totalBalls = () => DEXES.reduce((sum, dex) => sum + ballNames(getDexData(dex)).length, 0);

const dataUri = (buffer, type) => `data:${type};base64,${buffer.toString("base64")}`;
const fmt = (value) => Number(value).toLocaleString("en-US");

async function fetchBuffer(url, timeout = 6000) {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return Buffer.from(await response.arrayBuffer());
}

/** Bot API answer, or null when it is slow or down (cards then leave that number out). */
async function fromBot(request) {
    try {
        const response = await Promise.race([request(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000))]);
        return response.ok ? await response.json() : null;
    } catch {
        return null;
    }
}

/** Picture as a data URI (satori scales it into its box; it reads PNG, JPEG, GIF and SVG). */
function picture(buffer) {
    const type = buffer.subarray(0, 4).toString("hex") === "89504e47" ? "image/png" : "image/jpeg";
    return dataUri(buffer, type);
}

/** Spawn art scaled down by Netlify's image CDN (falls back to the full PNG on GitHub). */
async function artImage(dex, name, width) {
    const file = `/assets/dexes/${encodeURIComponent(dex)}/${encodeURIComponent(name)}.png`;
    try {
        return picture(await fetchBuffer(`${SITE}/.netlify/images?url=${encodeURIComponent(file)}&w=${width}&fm=png`, 4000));
    } catch {
        return picture(await fetchBuffer(`${RAW}/dexes/${encodeURIComponent(dex)}/${encodeURIComponent(name)}.png`));
    }
}

/** Emoji -> Twemoji SVG (satori draws no color emoji by itself). */
async function emojiImage(emoji) {
    const code = [...emoji].map((c) => c.codePointAt(0).toString(16)).filter((c) => c !== "fe0f").join("-");
    const svg = await fetchBuffer(`https://raw.githubusercontent.com/jdecked/twemoji/v15.1.0/assets/svg/${code}.svg`);
    return dataUri(svg, "image/svg+xml");
}

/** A special's emoji as an image: its own emoji, the official custom emoji or the official unicode one. */
async function specialEmoji(special, size) {
    const custom = /^<a?:\w+:(\d+)>$/.exec(special.officialEmoji || "");
    try {
        if (special.emoji) return await emojiImage(special.emoji);
        if (custom) return picture(await fetchBuffer(`https://cdn.discordapp.com/emojis/${custom[1]}.png?size=${size}`));
        if (special.officialEmoji) return await emojiImage(special.officialEmoji);
    } catch {
        /* no picture */
    }
    return null;
}

const dexIcon = (dex) => {
    try {
        return picture(iconFile(dex));
    } catch {
        return null;
    }
};

/** Same random picks all day (the day comes in as the version), different the next day. */
function seeded(seedText) {
    let hash = 2166136261;
    for (const char of String(seedText)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return () => {
        hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
        hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
        hash ^= hash >>> 16;
        return (hash >>> 0) / 4294967296;
    };
}
const pickFrom = (random, list) => list[Math.floor(random() * list.length)];

/* ----- tiny element helper (satori takes React-like objects) ----- */
function el(type, style = {}, ...children) {
    const kids = children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false && child !== "");
    const props = { style: { display: "flex", ...style } };
    props.children = kids.length === 1 ? kids[0] : kids;
    return { type, props };
}
const img = (src, width, height, style = {}) => ({ type: "img", props: { src, width, height, style: { objectFit: "contain", ...style } } });
const text = (value, style = {}) => el("div", style, String(value));

const chip = (label, { color = C.accentText, background = "rgba(155,58,191,0.18)", dot = null, size = 26 } = {}) =>
    el(
        "div",
        { alignItems: "center", gap: 10, padding: size < 26 ? "5px 14px" : "8px 20px", borderRadius: 999, background, color, fontSize: size, fontWeight: 600 },
        dot ? el("div", { width: 14, height: 14, borderRadius: 999, background: dot }) : null,
        label,
    );
const greyChip = (label) => chip(label, { color: C.text, background: C.surface2 });
const CHECK_SVG = dataUri(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'), "image/svg+xml");
const check = (size) => el("div", { width: size, height: size, borderRadius: 999, background: C.green, alignItems: "center", justifyContent: "center" }, img(CHECK_SVG, Math.round(size * 0.7), Math.round(size * 0.7)));

const row = (label, value, wide = false) =>
    value === undefined || value === null || value === ""
        ? null
        : el(
              "div",
              { flexDirection: "column", gap: 2, width: wide ? "100%" : "48%" },
              text(label, { color: C.text3, fontSize: 21, fontWeight: 400 }),
              text(value, { color: C.text, fontSize: 30, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: wide ? 600 : 290 }),
          );

const titleSize = (value) => (value.length <= 12 ? 76 : value.length <= 18 ? 64 : value.length <= 26 ? 52 : 42);
const kickerRow = (label, icon = null) => el("div", { alignItems: "center", gap: 14, color: C.text2, fontSize: 28, fontWeight: 600 }, icon ? img(icon, 40, 40, { borderRadius: 10 }) : null, label);
const brand = (size = 24) => el("div", { alignItems: "center", gap: 12, color: C.text3, fontSize: size }, img(dataUri(logoFile(), "image/svg+xml"), size + 10, size + 10), "ballidentifier.xyz");
const background = {
    backgroundColor: C.bg,
    backgroundImage: "radial-gradient(circle at 12% 18%, rgba(155,58,191,0.32) 0%, rgba(14,11,20,0) 55%), radial-gradient(circle at 95% 105%, rgba(155,58,191,0.18) 0%, rgba(14,11,20,0) 45%)",
};

function frame({ visual, kicker, title, subtitle, chips = [], rows = [] }) {
    return el(
        "div",
        { width: W, height: H, padding: 48, gap: 48, alignItems: "center", fontFamily: "Outfit", color: C.text, ...background },
        el(
            "div",
            { width: 500, height: 534, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 36, background: C.surface, border: `2px solid ${C.border}`, overflow: "hidden" },
            visual,
        ),
        el(
            "div",
            { flex: 1, height: 534, flexDirection: "column", justifyContent: "space-between", minWidth: 0 },
            el(
                "div",
                { flexDirection: "column", gap: 18 },
                kicker,
                el(
                    "div",
                    { flexDirection: "column", gap: 6 },
                    text(title, { fontSize: titleSize(title), fontWeight: 800, lineHeight: 1.05, letterSpacing: -1 }),
                    subtitle ? text(subtitle, { fontSize: 26, color: C.text2, fontWeight: 400, lineHeight: 1.3 }) : null,
                ),
                chips.length ? el("div", { gap: 12, flexWrap: "wrap" }, chips) : null,
            ),
            el("div", { flexWrap: "wrap", rowGap: 18, columnGap: "4%", marginTop: 12 }, rows.filter(Boolean).slice(0, 6)),
            brand(),
        ),
    );
}

const dexIconsRow = (size = 44) => el("div", { gap: 10, alignItems: "center" }, DEXES.map(dexIcon).filter(Boolean).map((icon) => img(icon, size, size, { borderRadius: size / 4 })));

/* ----- ball and special cards ----- */

async function ballCard(dexParam, nameParam) {
    const dex = DEXES.find((name) => name.toLowerCase() === String(dexParam || "").toLowerCase());
    if (!dex) return null;
    const data = getDexData(dex);
    const name = ballNames(data).find((key) => key.toLowerCase() === String(nameParam || "").toLowerCase());
    if (!name) return null;
    const ball = data[name];

    const [art, collectors] = await Promise.all([
        artImage(dex, name, 880),
        // Same list as the Collectors section on the website (left out if the bot doesn't answer)
        fromBot(() => botApiFetch(`/api/collectors/${DEX_KEYS[dex]}`)).then((result) => (result?.entries ? (result.entries[ball.id] || []).length : null)),
    ]);
    const chips = [
        ball.rarity !== undefined ? chip(`T${ball.rarity}`) : null,
        ball.wave !== undefined ? chip(`Wave ${ball.wave}`, { color: C.text, background: C.surface2, dot: WAVE_COLORS[ball.wave] || "#808080" }) : null,
        ball.id !== undefined ? chip(`#${ball.id}`, { color: C.text2, background: C.surface2 }) : null,
    ].filter(Boolean);

    return frame({
        visual: img(art, 440, 440),
        kicker: kickerRow(`${dex} spawn art`, dexIcon(dex)),
        title: name,
        chips,
        rows: [
            row("Artist", ball.artist || "Unknown"),
            row("Collectors", collectors === null ? null : fmt(collectors)),
            row("Common value", ball.common_value),
            row("Collector (CC)", ball.cc),
            row("Demand", ball.demand),
        ],
    });
}

const shortDate = (value) => (value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null);

async function getSpecials() {
    const result = await fromBot(() => botApiFetch("/api/specials"));
    if (!result) throw new Error("specials unavailable");
    return result;
}

async function specialCard(idParam) {
    const id = Number(idParam);
    if (!Number.isInteger(id)) return null;
    const { specials = [], marketWindowDays } = await getSpecials();
    const special = specials.find((s) => s.id === id);
    if (!special) return null;

    const emoji = await specialEmoji(special, 256);
    const visual = emoji
        ? img(emoji, 300, 300)
        : el(
              "div",
              { width: 260, height: 260, borderRadius: 999, alignItems: "center", justifyContent: "center", background: "rgba(155,58,191,0.18)", border: `4px solid ${C.accent}`, color: C.accentText, fontSize: 96, fontWeight: 800 },
              `#${id}`,
          );

    const title = special.alias || special.name || `Special #${id}`;
    const avg = special.priceAverage;
    const high = special.priceHighest;
    const price = avg && high && avg !== high ? `${avg} avg · ${high} max` : avg || high;
    const dates = special.startDate || special.endDate ? [shortDate(special.startDate), shortDate(special.endDate)].filter(Boolean) : [];
    const market = special.market;

    return frame({
        visual,
        kicker: kickerRow("Ballsdex special"),
        title,
        subtitle: special.alias && special.name && special.alias !== special.name ? special.name : null,
        chips: [
            chip(`#${id}`, { color: C.text2, background: C.surface2 }),
            special.tradeable === false || avg === "Untradable" ? chip("Untradeable", { color: "#F5B94A", background: "rgba(245,185,74,0.14)" }) : null,
        ].filter(Boolean),
        rows: [
            row("Common price", price),
            row("Spawn rate", special.spawnRate),
            row("Duration", special.duration),
            market?.median ? row(`Market median (${marketWindowDays || 30}d)`, `${fmt(market.median)} · ${fmt(market.sales)} sold`) : null,
            row(dates.length > 1 && dates[0] !== dates[1] ? "Dates" : "Date", dates.length > 1 && dates[0] !== dates[1] ? `${dates[0]} – ${dates[1]}` : dates[0], true),
        ],
    });
}

/* ----- page cards ----- */

const botStats = () => fromBot(() => botApiPublicFetch("/api/stats"));

/** Identify: a spawn being "scanned" with its result, plus how much the identifier knows. */
async function identifyCard(seed) {
    const random = seeded(`identify-${seed}`);
    const data = getDexData("Ballsdex");
    const name = pickFrom(random, ballNames(data).filter((n) => Number(data[n].rarity) <= 60));
    const [art, stats] = await Promise.all([artImage("Ballsdex", name, 600), botStats()]);

    const corner = (position) =>
        el("div", {
            position: "absolute",
            width: 64,
            height: 64,
            borderColor: C.accentText,
            borderStyle: "solid",
            borderWidth: 0,
            ...position,
        });
    const visual = el(
        "div",
        { flexDirection: "column", alignItems: "center", gap: 26 },
        el(
            "div",
            { position: "relative", width: 360, height: 360, alignItems: "center", justifyContent: "center" },
            img(art, 300, 300),
            corner({ top: 0, left: 0, borderTopWidth: 6, borderLeftWidth: 6, borderTopLeftRadius: 22 }),
            corner({ top: 0, right: 0, borderTopWidth: 6, borderRightWidth: 6, borderTopRightRadius: 22 }),
            corner({ bottom: 0, left: 0, borderBottomWidth: 6, borderLeftWidth: 6, borderBottomLeftRadius: 22 }),
            corner({ bottom: 0, right: 0, borderBottomWidth: 6, borderRightWidth: 6, borderBottomRightRadius: 22 }),
            el("div", { position: "absolute", left: 20, right: 20, top: 190, height: 4, borderRadius: 4, backgroundImage: `linear-gradient(90deg, rgba(206,140,235,0), ${C.accentText}, rgba(206,140,235,0))` }),
        ),
        el(
            "div",
            { alignItems: "center", gap: 14, padding: "12px 26px", borderRadius: 999, background: C.surface2, border: `2px solid ${C.border}`, maxWidth: 440 },
            check(30),
            text(name, { fontSize: 28, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 }),
            text("Ballsdex", { fontSize: 22, color: C.text3 }),
        ),
    );

    return frame({
        visual,
        kicker: kickerRow("Spawn identifier"),
        title: "Identify any spawn",
        subtitle: "Upload or paste a spawn image and get the ball in a second.",
        chips: [dexIconsRow()],
        rows: [
            row("Dexes", fmt(DEXES.length)),
            row("Balls known", fmt(totalBalls())),
            stats?.identifiedBalls ? row("Spawns identified", fmt(stats.identifiedBalls)) : null,
            stats?.guilds ? row("Discord servers", fmt(stats.guilds)) : null,
        ],
    });
}

/** Spawn Arts: a slice of the catalog (12 arts from every dex, new picks each day). */
async function artsCard(seed) {
    const random = seeded(`arts-${seed}`);
    const picks = [];
    const used = new Set();
    while (picks.length < 12) {
        const dex = picks.length < DEXES.length ? DEXES[picks.length] : pickFrom(random, DEXES);
        const data = getDexData(dex);
        const name = pickFrom(random, ballNames(data));
        if (used.has(`${dex}/${name}`)) continue;
        used.add(`${dex}/${name}`);
        picks.push({ dex, name, rarity: data[name].rarity });
    }
    picks.sort(() => random() - 0.5);
    const arts = await Promise.all(picks.map((p) => artImage(p.dex, p.name, 280).catch(() => null)));

    const tile = (p, art) =>
        el(
            "div",
            { width: 172, height: 196, flexDirection: "column", alignItems: "center", padding: "12px 10px 10px", gap: 6, borderRadius: 20, background: C.surface, border: `2px solid ${C.border}` },
            el("div", { width: 148, height: 120, alignItems: "center", justifyContent: "center" }, art ? img(art, 140, 116) : null),
            text(p.name, { fontSize: 18, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }),
            el(
                "div",
                { alignItems: "center", gap: 6 },
                dexIcon(p.dex) ? img(dexIcon(p.dex), 20, 20, { borderRadius: 5 }) : null,
                p.rarity !== undefined ? text(`T${p.rarity}`, { fontSize: 16, color: C.accentText, fontWeight: 600 }) : null,
            ),
        );

    return el(
        "div",
        { width: W, height: H, padding: "40px 44px", flexDirection: "column", gap: 26, fontFamily: "Outfit", color: C.text, ...background },
        el(
            "div",
            { justifyContent: "space-between", alignItems: "flex-end" },
            el(
                "div",
                { flexDirection: "column", gap: 4 },
                text("Spawn Arts", { fontSize: 64, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }),
                text(`${fmt(totalBalls())} spawn arts from ${DEXES.length} dexes, with rarity, artist and collectors`, { fontSize: 24, color: C.text2 }),
            ),
            el("div", { flexDirection: "column", alignItems: "flex-end", gap: 12 }, dexIconsRow(36), brand(20)),
        ),
        el("div", { flexWrap: "wrap", gap: 16 }, picks.map((p, i) => tile(p, arts[i]))),
    );
}

/** Catch Trainer: a mock spawn message in a Discord channel, caught. */
async function trainerCard(seed) {
    const random = seeded(`trainer-${seed}`);
    const data = getDexData("Ballsdex");
    const name = pickFrom(random, ballNames(data).filter((n) => Number(data[n].rarity) <= 80));
    const art = await artImage("Ballsdex", name, 480);
    const seconds = (1.2 + random() * 1.6).toFixed(1);

    const visual = el(
        "div",
        { width: 500, height: 534, flexDirection: "column", padding: "30px 30px", gap: 14, background: "#313338" },
        el("div", { alignItems: "center", gap: 10, color: "#949BA4", fontSize: 22, fontWeight: 600 }, "#", text("spawn-channel", { color: "#DBDEE1" })),
        el("div", { height: 2, background: "#3F4147" }),
        el(
            "div",
            { gap: 16 },
            dexIcon("Ballsdex") ? img(dexIcon("Ballsdex"), 52, 52, { borderRadius: 999 }) : null,
            el(
                "div",
                { flexDirection: "column", gap: 8, flex: 1 },
                el(
                    "div",
                    { alignItems: "center", gap: 8 },
                    text("Ballsdex", { fontSize: 22, fontWeight: 600, color: "#F2F3F5" }),
                    text("APP", { fontSize: 13, fontWeight: 800, color: "#fff", background: "#5865F2", padding: "2px 6px", borderRadius: 4 }),
                    text("Today", { fontSize: 16, color: "#949BA4" }),
                ),
                text("A wild countryball appeared!", { fontSize: 20, color: "#DBDEE1" }),
                el("div", { width: 330, height: 220, borderRadius: 8, background: "#2B2D31", alignItems: "center", justifyContent: "center" }, img(art, 300, 200)),
                el("div", { alignSelf: "flex-start", padding: "8px 18px", borderRadius: 6, background: "#4E5058", color: "#fff", fontSize: 18, fontWeight: 600 }, "Catch me!"),
            ),
        ),
        el(
            "div",
            { alignItems: "center", gap: 10, marginTop: 4, padding: "10px 14px", borderRadius: 8, background: "rgba(59,165,92,0.16)", color: "#DBDEE1", fontSize: 19 },
            check(24),
            el("div", { gap: 6 }, text("You caught", {}), text(name, { fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 170 }), text(`in ${seconds}s`, { color: "#57F287", fontWeight: 600 })),
        ),
    );

    return frame({
        visual,
        kicker: kickerRow("Catch Trainer"),
        title: "Practice catching",
        subtitle: "Balls spawn at random, other players chat and race you. Be the fastest.",
        chips: [greyChip("Easy"), chip("Medium"), greyChip("Hard")],
        rows: [row("Dexes", fmt(DEXES.length)), row("Balls to learn", fmt(totalBalls())), row("Spawns every", "5–60 s"), row("After a round", "Your stats")],
    });
}

/** Bot: what it does and how many use it. */
async function botCard() {
    const stats = await botStats();
    const visual = el(
        "div",
        { flexDirection: "column", alignItems: "center", gap: 26 },
        el(
            "div",
            { width: 300, height: 300, borderRadius: 999, alignItems: "center", justifyContent: "center", background: "rgba(155,58,191,0.16)", border: `3px solid ${C.border}` },
            img(dataUri(logoFile(), "image/svg+xml"), 210, 210),
        ),
        el(
            "div",
            { alignItems: "center", gap: 10, padding: "10px 22px", borderRadius: 999, background: "#5865F2", color: "#fff", fontSize: 24, fontWeight: 700 },
            "Add to Discord",
        ),
    );
    return frame({
        visual,
        kicker: kickerRow("Discord bot"),
        title: "BallIdentifier bot",
        subtitle: "Identify spawns in two clicks, right in Discord.",
        chips: [chip("Identify", { size: 22 }), chip("Spawn notifier", { size: 22 }), chip("Ballsdex sync", { size: 22 }), chip("Tradesman alerts", { size: 22 })],
        rows: [
            stats?.guilds ? row("Servers", fmt(stats.guilds)) : null,
            stats?.users ? row("Users", fmt(stats.users)) : null,
            stats?.identifiedBalls ? row("Spawns identified", fmt(stats.identifiedBalls)) : null,
            row("Dexes", fmt(DEXES.length)),
        ],
    });
}

/** Collectors: totals over every dex and the biggest collectors' avatars. */
async function collectorsCard() {
    const results = await Promise.all(DEXES.map((dex) => fromBot(() => botApiFetch(`/api/collectors/${DEX_KEYS[dex]}`))));
    if (results.every((result) => !result?.entries)) throw new Error("collectors unavailable");

    const people = new Map(); // id -> { count, avatarUrl, name }
    let claims = 0;
    let balls = 0;
    results.forEach((result) => {
        for (const list of Object.values(result?.entries || {})) {
            if (!list.length) continue;
            balls++;
            for (const collector of list) {
                claims++;
                const person = people.get(collector.id) || { count: 0, avatarUrl: collector.avatarUrl, name: collector.name || collector.username };
                person.count++;
                people.set(collector.id, person);
            }
        }
    });
    const top = [...people.values()].sort((a, b) => b.count - a.count);
    const avatars = await Promise.all(top.slice(0, 9).map((p) => (p.avatarUrl ? fetchBuffer(p.avatarUrl, 4000).then(picture).catch(() => null) : null)));

    const visual = el(
        "div",
        { flexWrap: "wrap", width: 414, gap: 18, justifyContent: "center" },
        top.slice(0, 9).map((person, i) =>
            el(
                "div",
                { position: "relative", width: 126, height: 126 },
                avatars[i]
                    ? img(avatars[i], 126, 126, { borderRadius: 999, objectFit: "cover", border: `3px solid ${C.border}` })
                    : el("div", { width: 126, height: 126, borderRadius: 999, background: C.surface2 }),
                el(
                    "div",
                    { position: "absolute", right: -4, bottom: -4, minWidth: 44, height: 40, padding: "0 10px", borderRadius: 999, alignItems: "center", justifyContent: "center", background: C.accent, color: "#fff", fontSize: 20, fontWeight: 800, border: `3px solid ${C.surface}` },
                    fmt(person.count),
                ),
            ),
        ),
    );

    return frame({
        visual,
        kicker: kickerRow("Collectors"),
        title: "Who collects what",
        subtitle: `Collectors of every ball in ${DEXES.length} dexes. Add yourself to the balls you collect.`,
        rows: [
            row("Collectors", fmt(people.size)),
            row("Collections", fmt(claims)),
            row("Balls collected", fmt(balls)),
            top[0]?.name ? row("Top collector", `${top[0].name} · ${fmt(top[0].count)}`) : null,
        ],
    });
}

/** Specials: newest emojis in a grid and a summary of every special. */
async function specialsCard() {
    const { specials = [], marketWindowDays } = await getSpecials();
    if (!specials.length) throw new Error("no specials");
    const newest = specials.filter((s) => s.emoji || s.officialEmoji).slice(0, 16);
    const emojis = await Promise.all(newest.map((s) => specialEmoji(s, 128)));
    const withMarket = specials.filter((s) => s.market?.sales);
    const mostTraded = [...withMarket].sort((a, b) => b.market.sales - a.market.sales)[0];
    const priciest = [...withMarket].filter((s) => s.market.median).sort((a, b) => b.market.median - a.market.median)[0];
    const label = (s) => s.alias || s.name || `#${s.id}`;
    const days = marketWindowDays || 30;

    const visual = el(
        "div",
        { flexWrap: "wrap", width: 440, gap: 16, justifyContent: "center" },
        emojis
            .filter(Boolean)
            .slice(0, 16)
            .map((emoji) => el("div", { width: 96, height: 96, borderRadius: 22, background: C.surface2, alignItems: "center", justifyContent: "center" }, img(emoji, 64, 64))),
    );

    return frame({
        visual,
        kicker: kickerRow("Ballsdex"),
        title: "Specials",
        subtitle: "Every special with its nickname, common price, spawn rate, dates and market data.",
        rows: [
            row("Specials", fmt(specials.length)),
            row("Tradeable", fmt(specials.filter((s) => s.tradeable !== false && s.priceAverage !== "Untradable").length)),
            row("Newest", label(specials[0]), true),
            mostTraded ? row(`Most traded (${days}d)`, `${label(mostTraded)} · ${fmt(mostTraded.market.sales)}`) : null,
            priciest ? row(`Highest median (${days}d)`, `${label(priciest)} · ${fmt(priciest.market.median)}`) : null,
        ],
    });
}

/* ----- profile card ----- */


/** Public profile: avatar, name, bio, showcase strip and the numbers the user chose to show. */
async function profileCard(idParam) {
    if (!/^\d{17,20}$/.test(String(idParam || ""))) return null;
    const result = await fromBot(() => botApiFetch(`/api/profiles/${idParam}`));
    const p = result?.profile;
    if (!p) return null;
    const accent = C.accent;
    const avatarUrl = String(p.avatarUrl || "").replace(/([?&])size=\d+/, "$1size=256");
    const [avatar, ...showcase] = await Promise.all([
        fetchBuffer(avatarUrl, 4000).then(picture).catch(() => null),
        ...p.showcase.slice(0, 6).map((ball) => artImage(ball.dex, ball.name, 160).catch(() => null)),
    ]);

    const name = p.name || p.username || "BallIdentifier user";
    const bio = (p.bio || "").replace(/\s+/g, " ").trim();
    const collecting = (p.collections || []).reduce((sum, group) => sum + group.balls.length, 0);
    const b = p.ballsdex && !p.ballsdex.unavailable ? p.ballsdex : null;

    const visual = el(
        "div",
        { flexDirection: "column", alignItems: "center", gap: 26 },
        el(
            "div",
            { width: 300, height: 300, borderRadius: 999, padding: 10, background: accent, alignItems: "center", justifyContent: "center" },
            avatar
                ? img(avatar, 280, 280, { borderRadius: 999, objectFit: "cover", border: `6px solid ${C.surface}` })
                : el("div", { width: 280, height: 280, borderRadius: 999, background: C.surface2, border: `6px solid ${C.surface}` }),
        ),
        p.favoriteDex
            ? el(
                  "div",
                  { alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 999, background: C.surface2, color: C.text2, fontSize: 22, fontWeight: 600 },
                  dexIcon(p.favoriteDex) ? img(dexIcon(p.favoriteDex), 30, 30, { borderRadius: 8 }) : null,
                  `Plays ${p.favoriteDex}`,
              )
            : null,
    );

    const strip = showcase.filter(Boolean).length
        ? el(
              "div",
              { gap: 10 },
              showcase
                  .filter(Boolean)
                  .map((art) => el("div", { width: 76, height: 76, borderRadius: 16, background: C.surface2, border: `2px solid ${C.border}`, alignItems: "center", justifyContent: "center" }, img(art, 64, 64))),
          )
        : null;

    return frame({
        visual,
        kicker: el("div", { alignItems: "center", gap: 12, color: C.text2, fontSize: 26, fontWeight: 600 }, el("div", { width: 14, height: 14, borderRadius: 999, background: accent }), p.username ? `@${p.username}` : "Profile", p.pronouns ? text(`· ${p.pronouns}`, { color: C.text3, fontWeight: 400 }) : null),
        title: name,
        subtitle: bio ? (bio.length > 90 ? `${bio.slice(0, 88).trimEnd()}…` : bio) : null,
        chips: strip ? [strip] : [],
        rows: [
            p.collections !== null ? row("Collecting", `${fmt(collecting)} ${collecting === 1 ? "ball" : "balls"}`) : null,
            b?.totalBalls !== null && b?.totalBalls !== undefined ? row("Ballsdex balls", fmt(b.totalBalls)) : null,
            b?.uniqueBalls ? row("Unique", b.dexSize ? `${fmt(b.uniqueBalls)} / ${fmt(b.dexSize)}` : fmt(b.uniqueBalls)) : null,
            b?.specialCount ? row("Specials", fmt(b.specialCount)) : null,
            p.identifyAmount ? row("Spawns identified", fmt(p.identifyAmount)) : null,
        ]
            .filter(Boolean)
            .slice(0, 4),
    });
}

const PAGE_CARDS = { identify: identifyCard, arts: artsCard, trainer: trainerCard, bot: botCard, collectors: collectorsCard, specials: specialsCard };

async function render(tree) {
    const svg = await satori(tree, { width: W, height: H, fonts: getFonts() });
    return new Resvg(svg, { fitTo: { mode: "original" } }).render().asPng();
}

exports.handler = async (event) => {
    const query = event.queryStringParameters || {};
    try {
        let tree = null;
        if (query.type === "ball") tree = await ballCard(query.dex, query.name);
        else if (query.type === "special") tree = await specialCard(query.id);
        else if (query.type === "profile") tree = await profileCard(query.id);
        else if (query.type === "page" && Object.hasOwn(PAGE_CARDS, query.page)) tree = await PAGE_CARDS[query.page](query.v || new Date().toISOString().slice(0, 10));
        if (!tree) return { statusCode: 302, headers: { Location: "/assets/brand/og-image.png", "Cache-Control": "public, max-age=300" }, body: "" };

        const png = await render(tree);
        return {
            statusCode: 200,
            headers: {
                "Content-Type": "image/png",
                "Cache-Control": "public, max-age=86400",
                "Netlify-CDN-Cache-Control": "public, durable, s-maxage=86400, stale-while-revalidate=604800",
            },
            body: png.toString("base64"),
            isBase64Encoded: true,
        };
    } catch (error) {
        console.error("OG image error:", error);
        return { statusCode: 302, headers: { Location: "/assets/brand/og-image.png", "Cache-Control": "no-store" }, body: "" };
    }
};

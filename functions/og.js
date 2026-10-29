/**
 * Link preview images (1200x630 PNG) for shared links, drawn from the site's own data.
 *
 * GET /.netlify/functions/og?type=ball&dex=Ballsdex&name=Poland   spawn art + rarity, wave, id, artist, collectors, values
 * GET /.netlify/functions/og?type=special&id=59                   special emoji + alias, price, spawn rate, dates
 *
 * Used as og:image by netlify/edge-functions/page-meta.js. Layout with satori (text becomes vector shapes,
 * so no system fonts are needed), PNG with resvg (kept off sharp so the function stays small). Cached by Netlify's CDN for a day; the edge function adds
 * a version parameter that changes with the data, so edits show up in new previews right away.
 */

const fs = require("fs");
const path = require("path");
const satori = require("satori").default;
const { Resvg } = require("@resvg/resvg-js");
const { botApiFetch } = require("../lib/bot-api");

const RAW = "https://raw.githubusercontent.com/Meff1u/BallIdentifier/refs/heads/main/assets";
const DEX_KEYS = { Ballsdex: "BD", FoodDex: "FOD", HistoryDex: "HD", JoJoDex: "JD", "Empireballs Reboot": "EB", MapsDex: "MD", FlagsDex: "FD" };
const DEXES = Object.keys(DEX_KEYS);
const WAVE_COLORS = { 1: "#FF7769", 1.1: "#424242", 2: "#F56300", 3: "#824300", 4: "#219540", 4.1: "#333333", 5: "#006D83", 5.1: "#666666", 5.2: "#999999", 6: "#4386F5", 7: "#B299F2", 7.1: "#484848", 7.2: "#484848", 8: "#FFBEBE", 8.1: "#666666" };
const C = { bg: "#0E0B14", surface: "#1A1524", surface2: "#221C2E", border: "#2E2740", text: "#F1EDF7", text2: "#BBB3CB", text3: "#958DA8", accent: "#9B3ABF", accentText: "#CE8CEB" };
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

const dataUri = (buffer, type) => `data:${type};base64,${buffer.toString("base64")}`;

async function fetchBuffer(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return Buffer.from(await response.arrayBuffer());
}

/** Picture as a data URI (satori scales it into its box). */
function picture(buffer) {
    const type = buffer.subarray(0, 4).toString("hex") === "89504e47" ? "image/png" : buffer.subarray(8, 12).toString() === "WEBP" ? "image/webp" : "image/jpeg";
    return dataUri(buffer, type);
}

/** Emoji -> Twemoji SVG (satori draws no color emoji by itself). */
async function emojiImage(emoji) {
    const code = [...emoji].map((c) => c.codePointAt(0).toString(16)).filter((c) => c !== "fe0f").join("-");
    const svg = await fetchBuffer(`https://raw.githubusercontent.com/jdecked/twemoji/v15.1.0/assets/svg/${code}.svg`);
    return dataUri(svg, "image/svg+xml");
}

/* ----- tiny element helper (satori takes React-like objects) ----- */
function el(type, style = {}, ...children) {
    const kids = children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false && child !== "");
    const props = { style: { display: "flex", ...style } };
    props.children = kids.length === 1 ? kids[0] : kids;
    return { type, props };
}
const img = (src, width, height, style = {}) => ({ type: "img", props: { src, width, height, style: { objectFit: "contain", ...style } } });
const text = (value, style = {}) => el("div", style, String(value));

const chip = (label, { color = C.accentText, background = "rgba(155,58,191,0.18)", dot = null } = {}) =>
    el(
        "div",
        { alignItems: "center", gap: 10, padding: "8px 20px", borderRadius: 999, background, color, fontSize: 26, fontWeight: 600 },
        dot ? el("div", { width: 14, height: 14, borderRadius: 999, background: dot }) : null,
        label,
    );

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

function frame({ visual, kicker, title, subtitle, chips, rows }) {
    const logo = dataUri(logoFile(), "image/svg+xml");
    return el(
        "div",
        {
            width: W,
            height: H,
            padding: 48,
            gap: 48,
            alignItems: "center",
            fontFamily: "Outfit",
            color: C.text,
            backgroundColor: C.bg,
            backgroundImage: "radial-gradient(circle at 12% 18%, rgba(155,58,191,0.32) 0%, rgba(14,11,20,0) 55%), radial-gradient(circle at 95% 105%, rgba(155,58,191,0.18) 0%, rgba(14,11,20,0) 45%)",
        },
        el(
            "div",
            { width: 500, height: 534, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 36, background: C.surface, border: `2px solid ${C.border}` },
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
                    { flexDirection: "column", gap: 4 },
                    text(title, { fontSize: titleSize(title), fontWeight: 800, lineHeight: 1.05, letterSpacing: -1 }),
                    subtitle ? text(subtitle, { fontSize: 28, color: C.text2, fontWeight: 400 }) : null,
                ),
                chips.length ? el("div", { gap: 12, flexWrap: "wrap" }, chips) : null,
            ),
            el("div", { flexWrap: "wrap", rowGap: 18, columnGap: "4%", marginTop: 12 }, rows.filter(Boolean).slice(0, 6)),
            el("div", { alignItems: "center", gap: 12, color: C.text3, fontSize: 24 }, img(logo, 34, 34), "ballidentifier.xyz"),
        ),
    );
}

/* ----- cards ----- */

async function ballCard(dexParam, nameParam) {
    const dex = DEXES.find((name) => name.toLowerCase() === String(dexParam || "").toLowerCase());
    if (!dex) return null;
    const data = JSON.parse(dexFile(dex));
    const name = Object.keys(data).find((key) => key !== "hashes" && key.toLowerCase() === String(nameParam || "").toLowerCase());
    if (!name) return null;
    const ball = data[name];

    const [art, icon, collectors] = await Promise.all([
        fetchBuffer(`${RAW}/dexes/${encodeURIComponent(dex)}/${encodeURIComponent(name)}.png`).then(picture),
        Promise.resolve().then(() => picture(iconFile(dex))).catch(() => null),
        // Same list as the Collectors section on the website (left out if the bot doesn't answer)
        botApiFetch(`/api/collectors/${DEX_KEYS[dex]}`)
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => (data?.entries ? (data.entries[ball.id] || []).length : null))
            .catch(() => null),
    ]);
    const chips = [
        ball.rarity !== undefined ? chip(`T${ball.rarity}`) : null,
        ball.wave !== undefined ? chip(`Wave ${ball.wave}`, { color: C.text, background: C.surface2, dot: WAVE_COLORS[ball.wave] || "#808080" }) : null,
        ball.id !== undefined ? chip(`#${ball.id}`, { color: C.text2, background: C.surface2 }) : null,
    ].filter(Boolean);

    return frame({
        visual: img(art, 440, 440),
        kicker: el("div", { alignItems: "center", gap: 14, color: C.text2, fontSize: 28, fontWeight: 600 }, icon ? img(icon, 40, 40, { borderRadius: 10 }) : null, `${dex} spawn art`),
        title: name,
        chips,
        rows: [
            row("Artist", ball.artist || "Unknown"),
            row("Collectors", collectors === null ? null : collectors.toLocaleString("en-US")),
            row("Common value", ball.common_value),
            row("Collector (CC)", ball.cc),
            row("Demand", ball.demand),
        ],
    });
}

const shortDate = (value) => (value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null);

async function specialCard(idParam) {
    const id = Number(idParam);
    if (!Number.isInteger(id)) return null;
    const response = await botApiFetch("/api/specials");
    if (!response.ok) throw new Error(`bot ${response.status}`);
    const special = ((await response.json()).specials || []).find((s) => s.id === id);
    if (!special) return null;

    let visual = null;
    const custom = /^<a?:\w+:(\d+)>$/.exec(special.officialEmoji || "");
    try {
        if (special.emoji) visual = img(await emojiImage(special.emoji), 300, 300);
        else if (custom) visual = img(picture(await fetchBuffer(`https://cdn.discordapp.com/emojis/${custom[1]}.png?size=256`)), 300, 300);
        else if (special.officialEmoji) visual = img(await emojiImage(special.officialEmoji), 300, 300);
    } catch {
        visual = null;
    }
    visual ??= el(
        "div",
        { width: 260, height: 260, borderRadius: 999, alignItems: "center", justifyContent: "center", background: "rgba(155,58,191,0.18)", border: `4px solid ${C.accent}`, color: C.accentText, fontSize: 96, fontWeight: 800 },
        `#${id}`,
    );

    const title = special.alias || special.name || `Special #${id}`;
    const avg = special.priceAverage;
    const high = special.priceHighest;
    const price = avg && high && avg !== high ? `${avg} avg · ${high} max` : avg || high;
    const dates = special.startDate || special.endDate ? [shortDate(special.startDate), shortDate(special.endDate)].filter(Boolean) : [];
    const market = special.market?.recent;

    return frame({
        visual,
        kicker: el("div", { alignItems: "center", gap: 14, color: C.text2, fontSize: 28, fontWeight: 600 }, "Ballsdex special"),
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
            market?.median ? row("Market median (30d)", `${market.median.toLocaleString("en-US")} · ${market.sales} sold`) : null,
            row(dates.length > 1 && dates[0] !== dates[1] ? "Dates" : "Date", dates.length > 1 && dates[0] !== dates[1] ? `${dates[0]} – ${dates[1]}` : dates[0], true),
        ],
    });
}

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

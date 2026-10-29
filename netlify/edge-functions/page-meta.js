/**
 * Link previews (Discord, Twitter, ...) per page: every app page loads the same index.html,
 * so this swaps its title, description and image for the page the link points to.
 *
 * Static pages: /arts, /bot/notifier, /ballsdex/specials, ...
 * Dynamic:      /arts/<dex>/<ball> and /ballsdex/specials/<id> get a generated card image (functions/og.js)
 *
 * meta.image: a URL (shown instead of the banner), null (no image), or undefined (keep the site banner).
 * meta.card: true when the image is a generated 1200x630 card (large preview).
 */

const DEXES = ["Ballsdex", "FoodDex", "HistoryDex", "JoJoDex", "Empireballs Reboot", "MapsDex", "FlagsDex"];
const DATA_TTL_MS = 10 * 60 * 1000;

const PAGES = {
    arts: ["Spawn Arts", "Every spawn art of Ballsdex, FoodDex, HistoryDex, JoJoDex, Empireballs Reboot, MapsDex and FlagsDex, with rarity, artist, wave and collectors."],
    trainer: ["Catch Trainer", "Practice catching: name the ball from its spawn art as fast as you can."],
    bot: ["BallIdentifier Discord bot", "Identify spawns in two clicks, get spawn notifications, track your Ballsdex collection and more, right in Discord."],
    "bot/notifier": ["Spawn Notifier settings", "Set up spawn notifications for your Discord servers."],
    collectors: ["Collectors", "See who collects which ball in every dex, and add yourself as a collector."],
    ballsdex: ["Ballsdex", "Link your Ballsdex account, sync your collection and see your stats, raws and every special."],
    "ballsdex/raws": ["Ballsdex raws", "Count your raws from your synced Ballsdex collection."],
    "ballsdex/specials": ["Ballsdex Specials", "Every Ballsdex special with its nickname, estimated common price, spawn rate, event length and market data."],
    moderation: ["Moderation", "BallIdentifier moderation."],
};

const cache = new Map(); // url -> { at, promise }

function getJson(url) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < DATA_TTL_MS) return hit.promise;
    const promise = fetch(url).then((response) => {
        if (!response.ok) throw new Error(`${response.status}`);
        return response.json();
    });
    promise.catch(() => cache.delete(url));
    cache.set(url, { at: Date.now(), promise });
    return promise;
}

const decode = (part) => {
    try {
        return decodeURIComponent(part);
    } catch {
        return part;
    }
};

/** Short hash of the data shown on a card, so previews refresh when it changes (the card is cached for a day). */
function version(value) {
    let hash = 2166136261;
    for (const char of JSON.stringify(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return (hash >>> 0).toString(36);
}

const cardUrl = (origin, params) => `${origin}/.netlify/functions/og?${new URLSearchParams(params)}`;

const escape = (text) => String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function ballMeta(origin, dexParam, ballParam) {
    const dex = DEXES.find((name) => name.toLowerCase() === dexParam.toLowerCase());
    if (!dex) return null;
    if (!ballParam) return { title: `${dex} spawn arts`, description: `Every ${dex} spawn art with rarity, artist and collectors.`, image: null };

    const data = await getJson(`${origin}/assets/jsons/${encodeURIComponent(dex)}.json`);
    const name = Object.keys(data).find((key) => key !== "hashes" && key.toLowerCase() === ballParam.toLowerCase());
    if (!name) return null;
    // The art's fingerprint changes with a new art, the details with any edit
    const artHash = await getJson(`${origin}/assets/jsons/${encodeURIComponent(dex)}Hashes.json`)
        .then((hashes) => hashes[name] || "")
        .catch(() => "");
    return {
        title: `${name} · ${dex}`,
        description: "Spawn art, details and collectors on BallIdentifier.",
        image: cardUrl(origin, { type: "ball", dex, name, v: version([data[name], artHash]) }),
        card: true,
    };
}

async function specialMeta(origin, idParam) {
    const id = Number(idParam);
    if (!Number.isInteger(id)) return null;
    const { specials = [] } = await getJson(`${origin}/.netlify/functions/specials`);
    const special = specials.find((s) => s.id === id);
    if (!special) return null;
    const label = special.alias || special.name || `Special #${id}`;
    const emoji = special.emoji || (special.officialEmoji && !special.officialEmoji.startsWith("<") ? special.officialEmoji : "");
    return {
        title: `${emoji ? `${emoji} ` : ""}${label} · Ballsdex special`,
        description: "Price, spawn rate, dates and market data on BallIdentifier.",
        image: cardUrl(origin, { type: "special", id, v: version(special) }),
        card: true,
    };
}

async function pageMeta(url) {
    const parts = url.pathname.split("/").filter(Boolean).map(decode);
    if (parts[0] === "arts" && parts[1]) return ballMeta(url.origin, parts[1], parts[2]);
    if (parts[0] === "ballsdex" && parts[1] === "specials" && parts[2]) return specialMeta(url.origin, parts[2]);
    const page = PAGES[parts.slice(0, 2).join("/")] || PAGES[parts[0]];
    return page ? { title: page[0], description: page[1] } : null;
}

function setMeta(html, attr, key, value) {
    const pattern = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`);
    return html.replace(pattern, `$1${escape(value)}$2`);
}

export default async (request, context) => {
    const response = await context.next();
    if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return response;

    const url = new URL(request.url);
    let meta = null;
    try {
        meta = await pageMeta(url);
    } catch {
        /* keep the default preview */
    }
    if (!meta) return response;

    const pageTitle = `${meta.title} · BallIdentifier`;
    let html = await response.text();
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${escape(pageTitle)}</title>`);
    html = setMeta(html, "name", "description", meta.description);
    html = setMeta(html, "property", "og:title", meta.title);
    html = setMeta(html, "property", "og:description", meta.description);
    html = setMeta(html, "property", "og:url", `${url.origin}${url.pathname}`);
    if (meta.card) {
        html = setMeta(html, "property", "og:image", meta.image);
        html = setMeta(html, "name", "twitter:card", "summary_large_image");
    } else if (meta.image !== undefined) {
        html = html.replace(/\s*<meta property="og:image:(width|height)" content="[^"]*" \/>/g, "");
        if (meta.image) html = setMeta(html, "property", "og:image", meta.image);
        else {
            html = html.replace(/\s*<meta property="og:image" content="[^"]*" \/>/, "");
            html = setMeta(html, "name", "twitter:card", "summary");
        }
    }

    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(html, { status: response.status, headers });
};

export const config = {
    path: ["/arts", "/arts/*", "/trainer", "/bot", "/bot/*", "/collectors", "/ballsdex", "/ballsdex/*", "/moderation"],
};

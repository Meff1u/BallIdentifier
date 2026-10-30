/**
 * Link previews (Discord, Twitter, ...) per page: every app page loads the same index.html,
 * so this swaps its title, description and image for the page the link points to.
 *
 * Static pages: /arts, /bot/notifier, /ballsdex/specials, ... (most get a generated card with live numbers, refreshed daily)
 * Dynamic:      /arts/<dex>/<ball> and /ballsdex/specials/<id> get a generated card image (functions/og.js)
 *
 * meta.image: a URL (shown instead of the banner), null (no image), or undefined (keep the site banner).
 * meta.card: true when the image is a generated 1200x630 card (large preview).
 */

const DEXES = ["Ballsdex", "HistoryDex", "JoJoDex", "Empireballs Reboot", "MapsDex", "FlagsDex"];
const DATA_TTL_MS = 10 * 60 * 1000;

const PAGES = {
    arts: ["Spawn Arts", "Every spawn art of Ballsdex, HistoryDex, JoJoDex, Empireballs Reboot, MapsDex and FlagsDex, with rarity, artist, wave and collectors."],
    trainer: ["Catch Trainer", "Practice catching: name the ball from its spawn art as fast as you can."],
    bot: ["BallIdentifier Discord bot", "Identify spawns in two clicks, get spawn notifications, track your Ballsdex collection and more, right in Discord."],
    "bot/notifier": ["Spawn Notifier settings", "Set up spawn notifications for your Discord servers."],
    "bot/catch-stats": ["Catch stats", "How fast do you catch? Catch times, averages and records for every catch, plus rankings of the fastest catchers."],
    collectors: ["Collectors", "See who collects which ball in every dex, and add yourself as a collector."],
    users: ["Users", "Find BallIdentifier users with a public profile: what they collect, their showcase and Ballsdex stats."],
    u: ["Profile", "Public BallIdentifier profiles: what someone collects, their showcase and Ballsdex stats."],
    ballsdex: ["Ballsdex", "Link your Ballsdex account, sync your collection and see your stats, raws and every special."],
    "ballsdex/raws": ["Ballsdex raws", "Count your raws from your synced Ballsdex collection."],
    "ballsdex/limits": ["Ballsdex API limits", "How much of BallIdentifier's shared Ballsdex API limits is used right now, and your own account's limits."],
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
    // The card changes with a new art (its fingerprint), any detail edit and the collector count
    const [artHash, collectors] = await Promise.all([
        getJson(`${origin}/assets/jsons/${encodeURIComponent(dex)}Hashes.json`)
            .then((hashes) => hashes[name] || "")
            .catch(() => ""),
        getJson(`${origin}/.netlify/functions/collectors?dex=${encodeURIComponent(dex)}`)
            .then((result) => (result.entries?.[data[name].id] || []).length)
            .catch(() => null),
    ]);
    return {
        title: `${name} · ${dex}`,
        description: "Spawn art, details and collectors on BallIdentifier.",
        image: cardUrl(origin, { type: "ball", dex, name, v: version([data[name], artHash, collectors]) }),
        card: true,
    };
}

/** Public profile: their name as the title and a card with avatar, bio and stats. Private ones keep the default preview. */
async function profileMeta(origin, idParam) {
    if (!/^\d{17,20}$/.test(idParam)) return null;
    const { profile } = await getJson(`${origin}/.netlify/functions/profile?id=${idParam}`);
    if (!profile) return null;
    const name = profile.name || profile.username || "BallIdentifier user";
    const collecting = (profile.collections || []).reduce((sum, group) => sum + group.balls.length, 0);
    return {
        title: `${name}${profile.username ? ` (@${profile.username})` : ""}`,
        description: profile.bio ? profile.bio.replace(/\s+/g, " ").slice(0, 160) : "BallIdentifier profile: showcase, collections and stats.",
        image: cardUrl(origin, {
            type: "profile",
            id: idParam,
            v: version([profile.updatedAt, profile.name, profile.avatarUrl, collecting, profile.ballsdex?.lastSyncedAt, profile.identifyAmount]),
        }),
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

// Pages with a generated card (functions/og.js); "" = the home page (Identify)
const PAGE_CARDS = { "": "identify", identify: "identify", arts: "arts", trainer: "trainer", bot: "bot", "bot/notifier": "bot", "bot/catch-stats": "bot", collectors: "collectors", "ballsdex/specials": "specials" };

async function pageMeta(url) {
    const parts = url.pathname.split("/").filter(Boolean).map(decode);
    if (parts[0] === "arts" && parts[1]) return ballMeta(url.origin, parts[1], parts[2]);
    if (parts[0] === "ballsdex" && parts[1] === "specials" && parts[2]) return specialMeta(url.origin, parts[2]);
    if (parts[0] === "u" && parts[1]) return profileMeta(url.origin, parts[1]);
    const key = PAGES[parts.slice(0, 2).join("/")] ? parts.slice(0, 2).join("/") : parts[0] || "";
    const page = PAGES[key];
    const card = PAGE_CARDS[key] ?? PAGE_CARDS[parts[0] || ""];
    if (!page && !card) return null;
    // Numbers on these cards change slowly: a new card each day is enough
    const meta = card ? { image: cardUrl(url.origin, { type: "page", page: card, v: new Date().toISOString().slice(0, 10) }), card: true } : {};
    return page ? { ...meta, title: page[0], description: page[1] } : meta;
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

    let html = await response.text();
    if (meta.title) {
        // The home page keeps the site's own title and description
        html = html.replace(/<title>[^<]*<\/title>/, `<title>${escape(`${meta.title} · BallIdentifier`)}</title>`);
        html = setMeta(html, "name", "description", meta.description);
        html = setMeta(html, "property", "og:title", meta.title);
        html = setMeta(html, "property", "og:description", meta.description);
    }
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
    path: ["/", "/identify", "/arts", "/arts/*", "/trainer", "/bot", "/bot/*", "/collectors", "/users", "/u", "/u/*", "/ballsdex", "/ballsdex/*", "/moderation"],
};

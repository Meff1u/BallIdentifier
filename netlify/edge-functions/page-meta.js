/**
 * Link previews (Discord, Twitter, ...) per page: every app page loads the same index.html,
 * so this swaps its title, description and image for the page the link points to.
 *
 * Static pages: /arts, /bot/notifier, /ballsdex/specials, ...
 * Dynamic:      /arts/<dex>/<ball> (the ball's art and details), /ballsdex/specials/<id> (the special)
 *
 * meta.image: a URL (shown instead of the banner), null (no image), or undefined (keep the site banner).
 */

const DEXES = ["Ballsdex", "FoodDex", "HistoryDex", "JoJoDex", "Empireballs Reboot", "MapsDex", "FlagsDex"];
const RAW = "https://raw.githubusercontent.com/Meff1u/BallIdentifier/refs/heads/main/assets";
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

const escape = (text) => String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function ballMeta(origin, dexParam, ballParam) {
    const dex = DEXES.find((name) => name.toLowerCase() === dexParam.toLowerCase());
    if (!dex) return null;
    if (!ballParam) return { title: `${dex} spawn arts`, description: `Every ${dex} spawn art with rarity, artist and collectors.`, image: null };

    const data = await getJson(`${origin}/assets/jsons/${encodeURIComponent(dex)}.json`);
    const name = Object.keys(data).find((key) => key !== "hashes" && key.toLowerCase() === ballParam.toLowerCase());
    if (!name) return null;
    const ball = data[name];
    const facts = [
        ball.rarity !== undefined ? `Rarity: T${ball.rarity}` : null,
        ball.artist ? `Artist: ${ball.artist}` : null,
        ball.wave !== undefined ? `Wave ${ball.wave}` : null,
        ball.common_value ? `Common value: ${ball.common_value}` : null,
        ball.id !== undefined ? `ID #${ball.id}` : null,
    ].filter(Boolean);
    return {
        title: `${name} · ${dex}`,
        description: `${facts.join(" · ")}\nSpawn art, details and collectors on BallIdentifier.`,
        image: `${RAW}/dexes/${encodeURIComponent(dex)}/${encodeURIComponent(name)}.png`,
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
    const avg = special.priceAverage;
    const high = special.priceHighest;
    const price = avg && high && avg !== high ? `${avg} avg / ${high} highest` : avg || high;
    const facts = [
        price ? `Common price: ${price}` : null,
        special.spawnRate ? `Spawn rate: ${special.spawnRate}` : null,
        special.duration ? `Duration: ${special.duration}` : null,
        `Special #${id}`,
    ].filter(Boolean);
    return {
        title: `${emoji ? `${emoji} ` : ""}${label}${special.alias && special.name && special.alias !== special.name ? ` (${special.name})` : ""} · Ballsdex special`,
        description: `${facts.join(" · ")}${special.notes ? `\n${special.notes}` : ""}`,
        image: null,
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
    if (meta.image !== undefined) {
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

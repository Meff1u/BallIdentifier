/**
 * Static dex data shipped with the site (assets/jsons). Cached per page load.
 */

const RAW = "https://raw.githubusercontent.com/Meff1u/BallIdentifier/refs/heads/main/assets";
const cache = new Map();

function getJson(path) {
    if (!cache.has(path)) {
        const promise = fetch(path).then((response) => {
            if (!response.ok) throw new Error(`Failed to load ${path}`);
            return response.json();
        });
        promise.catch(() => cache.delete(path));
        cache.set(path, promise);
    }
    return cache.get(path);
}

export async function getDexList() {
    try {
        const data = await getJson("assets/jsons/dexes.json");
        return { dexes: data.dexes || [], incomplete: data.incompleteAbbreviations || [] };
    } catch {
        return { dexes: ["Ballsdex", "HistoryDex", "JoJoDex", "Empireballs Reboot", "MapsDex", "FlagsDex"], incomplete: [] };
    }
}

/** { [ballName]: { rarity, artist, wave?, id, ... } } */
export async function getDex(dex) {
    const data = await getJson(`assets/jsons/${encodeURIComponent(dex)}.json`);
    if (data && typeof data === "object") delete data.hashes;
    return data;
}

export const getPreviousArts = () => getJson("assets/jsons/previous-arts.json");
export const getTrainerData = () => getJson("assets/trainer/data.json");
export const getChangelog = () => getJson("changelog.json");

export const dexIcon = (dex) => `assets/icons/${encodeURIComponent(dex)}.png`;
export const artUrl = (dex, ball) => `${RAW}/dexes/${encodeURIComponent(dex)}/${encodeURIComponent(ball)}.png`;
export const compressedArtUrl = (dex, ball) => `${RAW}/dexes/${encodeURIComponent(dex)}/compressed/${encodeURIComponent(ball)}.webp`;
export const previousArtUrl = (ball, index, ext = "webp") =>
    `${RAW}/dexes/Ballsdex/previous/${encodeURIComponent(ball)}/${index + 1}.${ext}`;

export const DEX_WITH_WAVES = ["Ballsdex"];
export const DEX_WITH_PREVIOUS_ARTS = ["Ballsdex"];
export const WAVE_COLORS = {
    1: "#FF7769", 1.1: "#424242", 2: "#F56300", 3: "#824300",
    4: "#219540", 4.1: "#333333", 5: "#006D83", 5.1: "#666666",
    5.2: "#999999", 6: "#4386F5", 7: "#B299F2", 7.1: "#484848",
    7.2: "#484848", 8: "#FFBEBE", 8.1: "#666666",
};

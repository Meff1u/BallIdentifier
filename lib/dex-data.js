/**
 * Dex data access for Netlify functions (dexes.json, <Dex>.json, <Dex>Hashes.json).
 * Files are parsed once and cached per warm function instance.
 * Kept separate from identify-core.js so endpoints like `balls` don't bundle sharp.
 */

const fs = require("fs");
const path = require("path");

// Resolved on use (not at load time) - Netlify runs functions with the site root as cwd
const getJsonsPath = () => path.join(process.cwd(), "assets/jsons");

/**
 * Error with an HTTP status code and a message safe to show to the user.
 */
class IdentifyError extends Error {
    constructor(message, statusCode = 400, details) {
        super(message);
        this.name = "IdentifyError";
        this.statusCode = statusCode;
        if (details) this.details = details;
    }
}

const jsonCache = new Map();

function readJsonCached(fileName) {
    if (!jsonCache.has(fileName)) {
        jsonCache.set(fileName, JSON.parse(fs.readFileSync(path.join(getJsonsPath(), fileName), "utf8")));
    }
    return jsonCache.get(fileName);
}

function getAvailableDexes() {
    return readJsonCached("dexes.json").dexes;
}

/** Short data key the bot uses for an enabled dex (e.g. "BD"), or null. */
function getDexKey(dex) {
    const entry = (readJsonCached("dexes.json").registry || []).find((item) => item.name === dex && item.enabled !== false);
    return entry ? entry.key : null;
}

function assertValidDex(dex) {
    const availableDexes = getAvailableDexes();
    if (!dex || !availableDexes.includes(dex)) {
        throw new IdentifyError("Invalid dex", 400, { availableDexes });
    }
}

function getDexHashes(dex) {
    assertValidDex(dex);
    return readJsonCached(`${dex}Hashes.json`);
}

function getDexData(dex) {
    assertValidDex(dex);
    return readJsonCached(`${dex}.json`);
}

module.exports = {
    IdentifyError,
    getAvailableDexes,
    getDexKey,
    assertValidDex,
    getDexHashes,
    getDexData,
};

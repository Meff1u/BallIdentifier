#!/usr/bin/env node
/**
 * Dex data tool: checks and builds everything the website and the bot read about dexes.
 *
 *   npm run dex:check                  check every dex (exits with 1 on errors)
 *   npm run dex:build                  build what's missing or changed, in every dex
 *   npm run dex:build -- Ballsdex      only one dex (several names are fine)
 *   npm run dex:build -- --all         rebuild every compressed art and hash
 *
 * Layout (per dex, <Dex> = name from assets/jsons/dexes.json):
 *   assets/dexes/<Dex>/<Name>.png               full spawn art (the source of truth)
 *   assets/dexes/<Dex>/compressed/<Name>.webp   200 px wide preview          (built)
 *   assets/jsons/<Dex>.json                     details: { "<Name>": { rarity, artist, id, ... } }
 *   assets/jsons/<Dex>Hashes.json               perceptual hash of every art (built)
 *   assets/dexes/Ballsdex/previous/<Name>/<n>.webp + assets/jsons/previous-arts.json   older Ballsdex arts
 *
 * The hash pipeline must stay identical to the bot's (utils/helpers.js hashImageBuffer)
 * and the website's (lib/identify-core.js): resize 100x100, flatten on black, PNG, 20-bit precise imageHash.
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { imageHash } = require("image-hash");

const ROOT = path.join(__dirname, "..");
const DEXES_DIR = path.join(ROOT, "assets", "dexes");
const JSONS_DIR = path.join(ROOT, "assets", "jsons");
const ART_SOURCE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".tiff"];
const PREVIEW_WIDTH = 200;

// Every entry needs these; the optional ones are checked only when present.
// "collectors" is managed from the website (Collectors tab), contributors don't edit it.
const REQUIRED_FIELDS = { rarity: "number", artist: "string", id: "integer" };
const OPTIONAL_FIELDS = { wave: "number", common_value: "string", demand: "string", cc: "string", collectors: "collectors" };

/* ---------- helpers ---------- */

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback);
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 4) + "\n");
const sortKeys = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b, "en")));

function getDexes() {
    return readJson(path.join(JSONS_DIR, "dexes.json"), { dexes: [] }).dexes;
}

function listArts(dex) {
    const dir = path.join(DEXES_DIR, dex);
    if (!fs.existsSync(dir)) return [];
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && ART_SOURCE_EXTENSIONS.includes(path.extname(entry.name).toLowerCase()))
        .map((entry) => ({ name: path.parse(entry.name).name, file: path.join(dir, entry.name), ext: path.extname(entry.name).toLowerCase() }));
}

function listPreviews(dex) {
    const dir = path.join(DEXES_DIR, dex, "compressed");
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((file) => file.endsWith(".webp")).map((file) => path.parse(file).name);
}

function checkType(value, type) {
    if (type === "integer") return Number.isInteger(value);
    if (type === "collectors") return Array.isArray(value) && value.every((id) => typeof id === "string" && /^\d{17,20}$/.test(id));
    return typeof value === type && (type !== "string" || value.trim() !== "");
}

async function hashArt(buffer) {
    const png = await sharp(buffer).resize(100, 100).flatten({ background: { r: 0, g: 0, b: 0 } }).png().toBuffer();
    return new Promise((resolve, reject) => {
        imageHash({ ext: "image/png", data: png }, 20, true, (error, data) => (error ? reject(error) : resolve(data)));
    });
}

function progress(done, total, label) {
    if (!process.stdout.isTTY) return;
    const width = 20;
    const filled = Math.round((done / total) * width);
    process.stdout.write(`\r  [${"█".repeat(filled)}${"░".repeat(width - filled)}] ${done}/${total} ${label.slice(0, 40)}\x1b[K`);
    if (done === total) process.stdout.write("\n");
}

/* ---------- check ---------- */

function checkDex(dex) {
    const errors = [];
    const warnings = [];
    const data = readJson(path.join(JSONS_DIR, `${dex}.json`), null);
    if (!data) return { errors: [`assets/jsons/${dex}.json is missing`], warnings };
    const hashes = readJson(path.join(JSONS_DIR, `${dex}Hashes.json`), {});
    const arts = listArts(dex);
    const artNames = new Set(arts.map((art) => art.name));
    const previews = new Set(listPreviews(dex));
    const required = REQUIRED_FIELDS;
    const ids = new Map();

    for (const [name, entry] of Object.entries(data)) {
        if (name !== name.trim()) errors.push(`"${name}": name has leading/trailing spaces`);
        if (/[\\/:*?"<>|]/.test(name)) errors.push(`"${name}": name has characters that can't be in a file name`);
        for (const [field, type] of Object.entries(required)) {
            if (!(field in entry)) errors.push(`${name}: missing "${field}"`);
            else if (!checkType(entry[field], type)) errors.push(`${name}: "${field}" should be ${type === "integer" ? "a whole number" : `a ${type}`}`);
        }
        for (const [field, value] of Object.entries(entry)) {
            if (field in required) continue;
            if (!(field in OPTIONAL_FIELDS)) warnings.push(`${name}: unknown field "${field}"`);
            else if (!checkType(value, OPTIONAL_FIELDS[field])) errors.push(`${name}: "${field}" has the wrong format`);
        }
        if (Number.isInteger(entry.id)) {
            if (ids.has(entry.id)) errors.push(`${name}: id ${entry.id} is also used by ${ids.get(entry.id)}`);
            else ids.set(entry.id, name);
        }
        if (!artNames.has(name)) errors.push(`${name}: no art (expected assets/dexes/${dex}/${name}.png)`);
    }

    for (const art of arts) {
        if (!(art.name in data)) errors.push(`${path.basename(art.file)}: art without an entry in ${dex}.json (check the spelling)`);
        if (art.ext !== ".png") errors.push(`${path.basename(art.file)}: arts must be .png (npm run dex:build converts it)`);
        if (!previews.has(art.name)) errors.push(`${art.name}: no compressed preview (run npm run dex:build -- "${dex}")`);
        if (!hashes[art.name]) errors.push(`${art.name}: no hash (run npm run dex:build -- "${dex}")`);
    }
    for (const name of previews) if (!artNames.has(name)) errors.push(`compressed/${name}.webp: preview without an art`);
    for (const name of Object.keys(hashes)) if (!artNames.has(name)) errors.push(`${dex}Hashes.json: hash for "${name}" without an art`);

    return { errors, warnings };
}

function checkPreviousArts() {
    const errors = [];
    const previous = readJson(path.join(JSONS_DIR, "previous-arts.json"), {});
    const ballsdex = readJson(path.join(JSONS_DIR, "Ballsdex.json"), {});
    for (const [name, arts] of Object.entries(previous)) {
        if (!(name in ballsdex)) errors.push(`previous-arts.json: "${name}" isn't in Ballsdex.json`);
        if (!Array.isArray(arts)) {
            errors.push(`previous-arts.json: "${name}" should be a list`);
            continue;
        }
        arts.forEach((art, index) => {
            if (!art?.artist || !art?.until) errors.push(`previous-arts.json: "${name}" #${index + 1} needs "artist" and "until"`);
            const dir = path.join(DEXES_DIR, "Ballsdex", "previous", name);
            const exists = ["webp", "gif"].some((ext) => fs.existsSync(path.join(dir, `${index + 1}.${ext}`)));
            if (!exists) errors.push(`previous arts: missing assets/dexes/Ballsdex/previous/${name}/${index + 1}.webp`);
        });
    }
    return errors;
}

function runCheck(dexes) {
    let errorCount = 0;
    const allDexes = getDexes();
    for (const dex of dexes) {
        if (!allDexes.includes(dex)) {
            console.log(`✖ ${dex}: not listed in assets/jsons/dexes.json`);
            errorCount++;
            continue;
        }
        const { errors, warnings } = checkDex(dex);
        console.log(`${errors.length ? "✖" : "✔"} ${dex}: ${errors.length} error(s), ${warnings.length} warning(s)`);
        errors.forEach((message) => console.log(`    error   ${message}`));
        warnings.forEach((message) => console.log(`    warning ${message}`));
        errorCount += errors.length;
    }
    if (dexes.includes("Ballsdex")) {
        const errors = checkPreviousArts();
        console.log(`${errors.length ? "✖" : "✔"} previous arts: ${errors.length} error(s)`);
        errors.forEach((message) => console.log(`    error   ${message}`));
        errorCount += errors.length;
    }
    return errorCount;
}

/* ---------- build ---------- */

async function buildDex(dex, { all = false } = {}) {
    console.log(`\n${dex}`);
    const dir = path.join(DEXES_DIR, dex);
    const previewDir = path.join(dir, "compressed");
    fs.mkdirSync(previewDir, { recursive: true });
    const hashesFile = path.join(JSONS_DIR, `${dex}Hashes.json`);
    const hashes = readJson(hashesFile, {});

    // 1. Every art becomes a .png (the site and the bot load <Name>.png)
    for (const art of listArts(dex)) {
        if (art.ext === ".png") continue;
        const target = path.join(dir, `${art.name}.png`);
        if (fs.existsSync(target)) {
            console.log(`  ! ${path.basename(art.file)} skipped: ${art.name}.png already exists, delete one of them`);
            continue;
        }
        await sharp(fs.readFileSync(art.file), { animated: false }).png().toFile(target);
        fs.unlinkSync(art.file);
        delete hashes[art.name]; // rebuild from the new file
        console.log(`  converted ${path.basename(art.file)} -> ${art.name}.png`);
    }

    // 2. Previews and hashes for new or changed arts
    const arts = listArts(dex).filter((art) => art.ext === ".png");
    const todo = arts.filter((art) => {
        const preview = path.join(previewDir, `${art.name}.webp`);
        return all || !hashes[art.name] || !fs.existsSync(preview) || fs.statSync(preview).mtimeMs < fs.statSync(art.file).mtimeMs;
    });
    let done = 0;
    for (const art of todo) {
        const buffer = fs.readFileSync(art.file);
        await sharp(buffer).resize({ width: PREVIEW_WIDTH }).webp().toFile(path.join(previewDir, `${art.name}.webp`));
        hashes[art.name] = await hashArt(buffer);
        progress(++done, todo.length, art.name);
    }
    console.log(`  ${todo.length} art(s) built, ${arts.length - todo.length} up to date`);

    // 3. Drop previews and hashes whose art is gone
    const names = new Set(arts.map((art) => art.name));
    for (const name of listPreviews(dex)) {
        if (names.has(name)) continue;
        fs.unlinkSync(path.join(previewDir, `${name}.webp`));
        console.log(`  removed compressed/${name}.webp (no art)`);
    }
    for (const name of Object.keys(hashes)) {
        if (names.has(name)) continue;
        delete hashes[name];
        console.log(`  removed hash of ${name} (no art)`);
    }

    fs.writeFileSync(hashesFile, JSON.stringify(sortKeys(hashes), null, 2) + "\n");
}

/* ---------- main ---------- */

async function main() {
    const [command, ...rest] = process.argv.slice(2);
    const all = rest.includes("--all");
    const named = rest.filter((arg) => !arg.startsWith("--"));
    const dexes = named.length ? named : getDexes();

    if (command === "check") {
        process.exit(runCheck(dexes) ? 1 : 0);
    } else if (command === "build") {
        for (const dex of dexes) await buildDex(dex, { all });
        console.log("");
        const errors = runCheck(dexes);
        console.log(errors ? `\n${errors} problem(s) left: fix them in the JSON files or the art names.` : "\nAll good.");
        process.exit(errors ? 1 : 0);
    } else {
        console.log("Usage: node scripts/dex.js <check|build> [Dex name ...] [--all]");
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

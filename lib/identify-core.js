/**
 * Core image identification logic shared by Netlify functions
 * (identify, findBall, compareImage, downloadImage).
 *
 * Functions call this module directly instead of calling each other over HTTP,
 * which removes extra function invocations, cold starts and base64 round-trips.
 * Dex JSON files are cached per warm function instance.
 */

const { IdentifyError, getAvailableDexes, assertValidDex, getDexHashes, getDexData } = require("./dex-data");
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MIN_IMAGE_BYTES = 100;
const DOWNLOAD_TIMEOUT_MS = 10000;

// Whitelist allowed domains for image downloads (SSRF prevention)
const ALLOWED_DOMAINS = [
    "cdn.discordapp.com",
    "media.discordapp.net",
    "discord.com",
    "canary.discord.com",
    "ptb.discord.com",
    "canary.discordapp.com",
    "ptb.discordapp.com",
];

const SUPPORTED_FORMATS = ["jpeg", "png", "webp", "gif", "svg", "tiff"];

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

function isAllowedImageUrl(urlString) {
    try {
        const parsedUrl = new URL(urlString);
        if (parsedUrl.protocol !== "https:") return false;

        const hostname = parsedUrl.hostname;
        return ALLOWED_DOMAINS.some((domain) => hostname === domain || hostname.endsWith("." + domain));
    } catch {
        return false;
    }
}

/**
 * Download an image from a whitelisted Discord URL.
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
async function downloadImage(url) {
    if (!url || typeof url !== "string") {
        throw new IdentifyError("Invalid URL parameter");
    }
    if (!isAllowedImageUrl(url)) {
        throw new IdentifyError("URL not allowed or invalid protocol");
    }

    let response;
    try {
        response = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
            signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        });
    } catch (error) {
        if (error.name === "TimeoutError") throw new IdentifyError("Image download timeout", 504);
        throw new IdentifyError(`Failed to fetch image: ${error.message}`, 502);
    }

    if (!response.ok) {
        // Pass through 403/404 so the website can explain expired / broken links
        const status = [403, 404].includes(response.status) ? response.status : 502;
        throw new IdentifyError(`Failed to fetch image: ${response.status} ${response.statusText}`, status);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
        throw new IdentifyError(`Invalid content type: ${contentType || "unknown"}. Expected an image.`);
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (contentLength > MAX_IMAGE_BYTES) {
        throw new IdentifyError("Image too large (>10MB)", 413);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) {
        throw new IdentifyError("Image too large (>10MB)", 413);
    }

    return { buffer, contentType };
}

// ---------------------------------------------------------------------------
// Validation + hashing
// ---------------------------------------------------------------------------

function formatMagicBytes(buffer) {
    return Array.from(buffer.subarray(0, 12))
        .map((b) => "0x" + b.toString(16).padStart(2, "0"))
        .join(" ");
}

/**
 * Validate that a buffer looks like a supported image (size + magic bytes).
 */
function validateImageBuffer(buffer) {
    if (!buffer || buffer.length === 0) {
        throw new IdentifyError("Empty or invalid file buffer");
    }
    if (buffer.length < MIN_IMAGE_BYTES) {
        throw new IdentifyError("File too small to be a valid image");
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
        throw new IdentifyError("Image too large (>10MB)", 413);
    }

    const m = buffer.subarray(0, 12);
    const isPNG = m[0] === 0x89 && m[1] === 0x50 && m[2] === 0x4e && m[3] === 0x47;
    const isJPEG = m[0] === 0xff && m[1] === 0xd8;
    const isWebP = m[8] === 0x57 && m[9] === 0x45 && m[10] === 0x42 && m[11] === 0x50;
    const isGIF = m[0] === 0x47 && m[1] === 0x49 && m[2] === 0x46;

    if (!isPNG && !isJPEG && !isWebP && !isGIF) {
        throw new IdentifyError("File does not appear to be a valid image. Magic bytes check failed.", 400, `First 12 bytes: ${formatMagicBytes(buffer)}`);
    }
}

/**
 * Perceptual hash - same pipeline as the bot and the asset tools:
 * resize 100x100, flatten on black, PNG, imageHash 20 bits precise.
 * Hashing from a buffer gives identical results to hashing a temp file, without disk I/O.
 */
async function hashImage(buffer) {
    // Loaded lazily so download-only functions don't load the native image libraries
    const sharp = require("sharp");
    const { imageHash } = require("image-hash");

    let png;
    try {
        const metadata = await sharp(buffer).metadata();
        if (!metadata.format || !SUPPORTED_FORMATS.includes(metadata.format)) {
            throw new IdentifyError("Unsupported image format. Please use JPEG, PNG, WebP, or GIF.");
        }

        png = await sharp(buffer)
            .resize(100, 100)
            .flatten({ background: { r: 0, g: 0, b: 0 } })
            .png()
            .toBuffer();
    } catch (error) {
        if (error instanceof IdentifyError) throw error;
        throw new IdentifyError("Invalid image file. Please upload a valid image (JPEG, PNG, WebP, or GIF).", 400, error.message);
    }

    return new Promise((resolve, reject) => {
        imageHash({ ext: "image/png", data: png }, 20, true, (error, data) => {
            if (error) reject(new IdentifyError("Failed to generate image hash", 500));
            else resolve(data);
        });
    });
}

function hashDiff(hash1, hash2) {
    let diff = 0;
    for (let i = 0; i < hash1.length; i++) {
        if (hash1[i] !== hash2[i]) diff++;
    }
    return diff;
}

/**
 * Identify an image buffer against a dex.
 * @returns {Promise<{country: string, diff: number}>}
 */
async function identifyBuffer(buffer, dex) {
    const hashes = getDexHashes(dex);
    validateImageBuffer(buffer);
    const hash = await hashImage(buffer);

    let best = { country: undefined, diff: Infinity };
    for (const [country, referenceHash] of Object.entries(hashes)) {
        const diff = hashDiff(hash, referenceHash);
        if (diff < best.diff) best = { country, diff };
        if (diff === 0) break;
    }
    return best;
}

/**
 * Download + identify, including extra entry data (rarity, artist, ...).
 * @returns {Promise<{country: string, diff: number, extras: object|undefined}>}
 */
async function identifyUrl(url, dex) {
    assertValidDex(dex);
    const { buffer } = await downloadImage(url);
    const result = await identifyBuffer(buffer, dex);
    return { ...result, extras: getDexData(dex)[result.country] };
}

/**
 * Convert an error into a Netlify function response body/status.
 */
function errorToResponse(error, headers = {}) {
    const isClientError = error instanceof IdentifyError;
    if (!isClientError) console.error("Identification error:", error);

    const body = { error: isClientError ? error.message : "Internal server error" };
    if (isClientError && error.details) {
        if (typeof error.details === "string") body.details = error.details;
        else Object.assign(body, error.details);
    }

    return {
        statusCode: isClientError ? error.statusCode : 500,
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
    };
}

module.exports = {
    IdentifyError,
    getAvailableDexes,
    getDexData,
    downloadImage,
    identifyBuffer,
    identifyUrl,
    errorToResponse,
};

const fs = require('fs');
const path = require('path');
const busboy = require('busboy');

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const rateLimitStore = new Map();

function normalizeBaseUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
        return null;
    }

    return rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl;
}

function getInternalBaseUrl() {
    const deployUrl = normalizeBaseUrl(process.env.DEPLOY_URL);
    const deployPrimeUrl = normalizeBaseUrl(process.env.DEPLOY_PRIME_URL);
    const siteName = (process.env.SITE_NAME || '').trim();
    const siteUrl = normalizeBaseUrl(process.env.URL);

    if (deployUrl && !deployUrl.includes('localhost')) {
        return deployUrl;
    }

    if (deployPrimeUrl && !deployPrimeUrl.includes('localhost')) {
        return deployPrimeUrl;
    }

    if (siteName) {
        return `https://${siteName}.netlify.app`;
    }

    if (siteUrl && !siteUrl.includes('localhost')) {
        return siteUrl;
    }

    return 'http://localhost:8888';
}

async function parseJsonResponse(response, endpointName) {
    const contentType = response.headers.get('content-type') || '';
    const bodyText = await response.text();

    try {
        return JSON.parse(bodyText);
    } catch (error) {
        const preview = bodyText.slice(0, 120);
        const contentTypeNote = contentType ? `, content-type: ${contentType}` : '';
        throw new Error(`${endpointName} returned invalid JSON (${response.status}${contentTypeNote}): ${preview}`);
    }
}

function jsonResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(body)
    };
}

function getClientIp(event) {
    const forwardedFor = event.headers?.['x-forwarded-for'] || event.headers?.['X-Forwarded-For'] || '';
    return forwardedFor.split(',')[0].trim() || 'unknown';
}

function checkRateLimit(clientIp) {
    const now = Date.now();

    for (const [ip, entry] of rateLimitStore.entries()) {
        if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
            rateLimitStore.delete(ip);
        }
    }

    const existing = rateLimitStore.get(clientIp);
    if (!existing || now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
        rateLimitStore.set(clientIp, { windowStart: now, count: 1 });
        return { allowed: true };
    }

    if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
        return {
            allowed: false,
            retryAfterSec: Math.ceil((RATE_LIMIT_WINDOW_MS - (now - existing.windowStart)) / 1000)
        };
    }

    existing.count += 1;
    return { allowed: true };
}

async function parseMultipartFormData(event) {
    return new Promise((resolve, reject) => {
        try {
            const bb = busboy({ headers: event.headers || {} });
            const formData = {};

            bb.on('file', (fieldname, file, filename, encoding, mimetype) => {
                const chunks = [];
                file.on('data', (chunk) => chunks.push(chunk));
                file.on('end', () => {
                    formData[fieldname] = {
                        buffer: Buffer.concat(chunks),
                        filename: filename || 'upload-image',
                        mimetype: mimetype || 'application/octet-stream'
                    };
                });
            });

            bb.on('field', (fieldname, val) => {
                formData[fieldname] = val;
            });

            bb.on('finish', () => resolve(formData));
            bb.on('error', (error) => reject(error));

            const bodyBuffer = Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8');
            bb.end(bodyBuffer);
        } catch (error) {
            reject(error);
        }
    });
}

async function compareImagePrivate(imageBuffer, dex, apiKey) {
    const FormData = (await import('form-data')).default;
    const fetchFn = (await import('node-fetch')).default;
    const formData = new FormData();

    formData.append('file', imageBuffer, 'image');
    formData.append('dex', dex);

    const response = await fetchFn(`${getInternalBaseUrl()}/.netlify/functions/compareImage`, {
        method: 'POST',
        headers: {
            ...formData.getHeaders(),
            'x-api-key': apiKey
        },
        body: formData
    });

    const result = await parseJsonResponse(response, 'compareImage');
    if (!response.ok) {
        throw new Error(result.error || 'compareImage function failed');
    }

    return result;
}

async function findBallPrivate(url, dex, apiKey) {
    const fetchFn = (await import('node-fetch')).default;
    const encodedUrl = encodeURIComponent(url);
    const encodedDex = encodeURIComponent(dex);

    const response = await fetchFn(`${getInternalBaseUrl()}/.netlify/functions/findBall?url=${encodedUrl}&dex=${encodedDex}`, {
        method: 'GET',
        headers: {
            'x-api-key': apiKey
        }
    });

    const result = await parseJsonResponse(response, 'findBall');
    if (!response.ok) {
        throw new Error(result.message || result.error || 'findBall function failed');
    }

    return result;
}

function getDexes() {
    const jsonsPath = path.join(process.cwd(), 'assets/jsons');
    const dexesConfig = JSON.parse(fs.readFileSync(path.join(jsonsPath, 'dexes.json'), 'utf8'));
    return dexesConfig.dexes;
}

exports.handler = async (event) => {
    console.log('Received identify request');

    try {
        if (event.httpMethod === 'OPTIONS') {
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                body: ''
            };
        }

        const clientIp = getClientIp(event);
        const rateLimit = checkRateLimit(clientIp);
        if (!rateLimit.allowed) {
            return jsonResponse(429, {
                error: 'Too many requests. Please retry later.',
                retryAfterSec: rateLimit.retryAfterSec
            });
        }

        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            return jsonResponse(500, { error: 'Server configuration error' });
        }

        const availableDexes = getDexes();
        const contentType = event.headers?.['content-type'] || event.headers?.['Content-Type'] || '';

        let dex;
        let url;
        let imageBuffer;

        if (contentType.includes('multipart/form-data')) {
            const formData = await parseMultipartFormData(event);
            const file = formData.file;
            dex = formData.dex;

            if (!file || !file.buffer || file.buffer.length === 0) {
                return jsonResponse(400, { error: 'File is missing from the form data' });
            }

            imageBuffer = file.buffer;
        } else {
            const body = JSON.parse(event.body || '{}');
            url = body.url;
            dex = body.dex;

            if (!url || typeof url !== 'string') {
                return jsonResponse(400, { error: 'Missing or invalid URL' });
            }
        }

        if (!dex || !availableDexes.includes(dex)) {
            return jsonResponse(400, {
                error: 'Invalid dex',
                availableDexes
            });
        }

        if (url) {
            const result = await findBallPrivate(url, dex, apiKey);
            return jsonResponse(200, {
                success: true,
                country: result.name,
                diff: result.diff,
                extras: result.extras
            });
        }

        const compareResult = await compareImagePrivate(imageBuffer, dex, apiKey);
        return jsonResponse(200, {
            success: true,
            country: compareResult.country,
            diff: compareResult.diff
        });
    } catch (error) {
        console.error('identify handler error:', error);
        return jsonResponse(500, {
            error: 'Error processing request',
            message: error.message
        });
    }
};

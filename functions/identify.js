const { parseMultipartFormData } = require('../lib/multipart');
const { identifyBuffer, identifyUrl, getDexData, errorToResponse } = require('../lib/identify-core');

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const rateLimitStore = new Map();

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

function isAllowedPublicHost(event) {
    const rawHost = event.headers?.host || event.headers?.Host || '';
    const host = String(rawHost).toLowerCase().split(':')[0];

    if (!host) {
        return false;
    }

    if (host === 'localhost' || host === '127.0.0.1') {
        return true;
    }

    const allowedHosts = (process.env.ALLOWED_PUBLIC_HOSTS || 'ballidentifier.xyz,www.ballidentifier.xyz')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

    return allowedHosts.includes(host);
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

/**
 * Public identification endpoint used by the website.
 * - JSON body { url, dex }        -> download from Discord CDN and identify
 * - multipart { file, dex }       -> identify the uploaded image
 * Everything runs inside this one function (no internal HTTP calls to other functions).
 */
exports.handler = async (event) => {
    console.log('Received identify request');

    if (!isAllowedPublicHost(event)) {
        return jsonResponse(403, { error: 'Forbidden host' });
    }

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

    const rateLimit = checkRateLimit(getClientIp(event));
    if (!rateLimit.allowed) {
        return jsonResponse(429, {
            error: 'Too many requests. Please retry later.',
            retryAfterSec: rateLimit.retryAfterSec
        });
    }

    try {
        const contentType = event.headers?.['content-type'] || event.headers?.['Content-Type'] || '';

        if (contentType.includes('multipart/form-data')) {
            const formData = await parseMultipartFormData(event);
            const file = formData.file;

            if (!file?.buffer?.length) {
                return jsonResponse(400, { error: 'File is missing from the form data' });
            }

            const result = await identifyBuffer(file.buffer, formData.dex);
            return jsonResponse(200, {
                success: true,
                country: result.country,
                diff: result.diff,
                extras: getDexData(formData.dex)[result.country]
            });
        }

        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch {
            return jsonResponse(400, { error: 'Invalid JSON body' });
        }

        if (!body.url || typeof body.url !== 'string') {
            return jsonResponse(400, { error: 'Missing or invalid URL' });
        }

        const result = await identifyUrl(body.url, body.dex);
        return jsonResponse(200, {
            success: true,
            country: result.country,
            diff: result.diff,
            extras: result.extras
        });
    } catch (error) {
        if (error.statusCode === 413) {
            return jsonResponse(413, { error: error.message });
        }
        return errorToResponse(error, { 'Access-Control-Allow-Origin': '*' });
    }
};

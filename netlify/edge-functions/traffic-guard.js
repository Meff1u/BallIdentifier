const BLOCKED_PATH_PATTERNS = [
  /^\/wp-admin/i,
  /^\/wp-login\.php$/i,
  /^\/xmlrpc\.php$/i,
  /^\/phpmyadmin/i,
  /^\/\.env$/i,
  /^\/vendor\//i,
  /^\/cgi-bin\//i,
  /^\/HNAP1$/i,
  /^\/boaform\//i,
  /^\/\.git\//i,
  /^\/\.well-known\/acme-challenge\//i,
];

const BOT_UA_PATTERNS = [
  /curl\//i,
  /python-requests/i,
  /go-http-client/i,
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /zgrab/i,
];

const DEFAULT_SAMPLE_RATE = 0.05;

function getSampleRate() {
  const raw = Netlify.env.get('BOT_LOG_SAMPLE_RATE');
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    return DEFAULT_SAMPLE_RATE;
  }
  return parsed;
}

function shouldSample(rate) {
  return Math.random() < rate;
}

function getClientIp(req) {
  const nfIp = req.headers.get('x-nf-client-connection-ip');
  if (nfIp) return nfIp;

  const forwardedFor = req.headers.get('x-forwarded-for');
  if (!forwardedFor) return 'unknown';

  return forwardedFor.split(',')[0].trim() || 'unknown';
}

async function shortHash(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hash;
}

function isBlockedPath(pathname) {
  return BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

function isSuspiciousUserAgent(userAgent) {
  return BOT_UA_PATTERNS.some((pattern) => pattern.test(userAgent));
}

function safeReferrer(referrer) {
  if (!referrer) return '';
  try {
    const parsed = new URL(referrer);
    return parsed.origin;
  } catch {
    return '';
  }
}

export default async (request, context) => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method;
  const userAgent = request.headers.get('user-agent') || '';
  const sampleRate = getSampleRate();

  if (isBlockedPath(pathname)) {
    if (shouldSample(sampleRate)) {
      const ipHash = await shortHash(getClientIp(request));
      console.warn(
        JSON.stringify({
          type: 'blocked_probe',
          at: new Date().toISOString(),
          path: pathname,
          method,
          ua: userAgent.slice(0, 180),
          ipHash,
        })
      );
    }

    return new Response('Not found', {
      status: 404,
      headers: {
        'cache-control': 'public, max-age=300',
        'x-traffic-guard': 'blocked-path',
      },
    });
  }

  const response = await context.next();

  if (response.status === 404) {
    const suspicious = isSuspiciousUserAgent(userAgent);
    const shouldLog = suspicious || shouldSample(sampleRate);

    if (shouldLog) {
      const ipHash = await shortHash(getClientIp(request));
      console.info(
        JSON.stringify({
          type: 'not_found_request',
          at: new Date().toISOString(),
          path: pathname,
          query: url.search || '',
          method,
          status: 404,
          ua: userAgent.slice(0, 180),
          suspiciousUa: suspicious,
          referrer: safeReferrer(request.headers.get('referer') || ''),
          ipHash,
        })
      );
    }
  }

  return response;
};

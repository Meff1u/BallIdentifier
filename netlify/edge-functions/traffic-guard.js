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

function getClientIpInfo(req) {
  const nfIp = req.headers.get('x-nf-client-connection-ip');
  if (nfIp) return { ip: nfIp, source: 'x-nf-client-connection-ip' };

  const forwardedFor = req.headers.get('x-forwarded-for');
  if (!forwardedFor) return { ip: 'unknown', source: 'missing' };

  const firstIp = forwardedFor.split(',')[0].trim();
  return {
    ip: firstIp || 'unknown',
    source: firstIp ? 'x-forwarded-for' : 'missing'
  };
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
  const ipInfo = getClientIpInfo(request);

  if (isBlockedPath(pathname)) {
    if (shouldSample(sampleRate)) {
      console.warn(
        JSON.stringify({
          type: 'blocked_probe',
          at: new Date().toISOString(),
          path: pathname,
          method,
          ua: userAgent.slice(0, 180),
          clientIp: ipInfo.ip,
          ipSource: ipInfo.source,
          ipMissing: ipInfo.ip === 'unknown',
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
          clientIp: ipInfo.ip,
          ipSource: ipInfo.source,
          ipMissing: ipInfo.ip === 'unknown',
        })
      );
    }
  }

  return response;
};

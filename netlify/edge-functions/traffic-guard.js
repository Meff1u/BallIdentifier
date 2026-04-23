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

function logTraffic(request, pathname, method, userAgent, ipInfo, status, extra = {}) {
  console.info(
    JSON.stringify({
      type: 'traffic_request',
      at: new Date().toISOString(),
      path: pathname,
      query: new URL(request.url).search || '',
      method,
      status,
      ua: userAgent.slice(0, 180),
      suspiciousUa: isSuspiciousUserAgent(userAgent),
      referrer: safeReferrer(request.headers.get('referer') || ''),
      clientIp: ipInfo.ip,
      ipSource: ipInfo.source,
      ipMissing: ipInfo.ip === 'unknown',
      ...extra,
    })
  );
}

export default async (request, context) => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method;
  const userAgent = request.headers.get('user-agent') || '';
  const ipInfo = getClientIpInfo(request);

  if (isBlockedPath(pathname)) {
    logTraffic(request, pathname, method, userAgent, ipInfo, 404, {
      blockedPath: true,
      trafficGuard: 'blocked-path',
    });

    return new Response('Not found', {
      status: 404,
      headers: {
        'cache-control': 'public, max-age=300',
        'x-traffic-guard': 'blocked-path',
      },
    });
  }

  const response = await context.next();

  logTraffic(request, pathname, method, userAgent, ipInfo, response.status, {
    notFound: response.status === 404,
  });

  return response;
};

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

const ipCounts = new Map();

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

function getIpCount(ip) {
  const nextCount = (ipCounts.get(ip) || 0) + 1;
  ipCounts.set(ip, nextCount);
  return nextCount;
}

export default async (request, context) => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const ipInfo = getClientIpInfo(request);

  const ipCount = getIpCount(ipInfo.ip);

  console.info(
    JSON.stringify({
      ip: ipInfo.ip,
      ipCount,
      path: pathname,
    })
  );

  if (isBlockedPath(pathname)) {
    return new Response('Not found', {
      status: 404,
      headers: {
        'cache-control': 'public, max-age=300',
        'x-traffic-guard': 'blocked-path',
      },
    });
  }

  const response = await context.next();

  return response;
};

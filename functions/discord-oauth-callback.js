/**
 * Discord OAuth Callback Function
 * Exchanges authorization code for access token
 */

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { code } = event.queryStringParameters || {};

    if (!code) {
      // No code - redirect to dashboard with error
      return {
        statusCode: 302,
        headers: { 'Location': '/dashboard.html?error=no_code' },
        body: ''
      };
    }

    const DISCORD_CLIENT_ID = '510775326310268930';
    const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
    const REDIRECT_URI = process.env.REDIRECT_URI || 'https://ballidentifier.xyz/.netlify/functions/discord-oauth-callback';

    // Exchange code for access token
    const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
        scope: 'identify guilds'
      })
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Discord token exchange error:', error);
      return {
        statusCode: 302,
        headers: { 'Location': '/dashboard.html?error=token_exchange_failed' },
        body: ''
      };
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    const safeToken = JSON.stringify(accessToken);
    const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Processing Discord Login...</title>
  </head>
  <body>
    <script>
      (function () {
        const token = ${safeToken};
        const targetUrl = '/dashboard.html#access_token=' + encodeURIComponent(token);

        if (window.opener && !window.opener.closed) {
          try {
            window.opener.postMessage({ type: 'DISCORD_TOKEN', token }, window.location.origin);
            window.opener.location.replace(targetUrl);
            window.close();

            // Some browsers block close() if the window wasn't script-opened.
            setTimeout(function () {
              window.location.replace(targetUrl);
            }, 150);
            return;
          } catch (e) {
            // Fall through to redirect when opener communication fails.
          }
        }

        window.location.replace(targetUrl);
      })();
    </script>
  </body>
</html>`;
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html'
      },
      body: html
    };
  } catch (error) {
    console.error('OAuth callback error:', error);
    return {
      statusCode: 302,
      headers: {
        'Location': `/dashboard.html?error=${encodeURIComponent(error.message)}`
      },
      body: ''
    };
  }
};

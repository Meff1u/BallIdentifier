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

    // Redirect back to dashboard
    // Store token securely using postMessage from callback handler
    const html = '<!DOCTYPE html><html><head><title>Processing Discord Login...</title></head><body><script>if (window.opener) { window.opener.postMessage({ type: "DISCORD_TOKEN", token: "' + accessToken + '" }, window.location.origin); window.close(); } else { window.location.hash = "access_token=' + accessToken + '"; }</script></body></html>';
    
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

/**
 * Get Bot Statistics Function
 * Fetches bot statistics from Express bot API server
 * Serves as a CORS proxy to avoid cross-origin issues
 */

exports.handler = async (event) => {
  const timestamp = new Date().toISOString();

  // Set CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow GET
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Method Not Allowed',
        message: 'Only GET requests are supported',
        timestamp
      })
    };
  }

  try {
    const botUrl = 'https://f11.bot-hosting.net:21302';
    
    // Fetch stats from bot API
    const response = await fetch(`${botUrl}/api/stats`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Bot API Error',
          message: `Bot API returned status ${response.status}`,
          timestamp
        })
      };
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: data,
        timestamp
      })
    };
  } catch (error) {
    console.error('Error fetching bot stats:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Internal Server Error',
        message: error.message,
        timestamp
      })
    };
  }
};

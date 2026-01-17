const fs = require('fs');
const path = require('path');

function hammingDistance(hash1, hash2) {
  if (hash1.length !== hash2.length) {
    return Infinity;
  }

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) {
      distance++;
    }
  }
  return distance;
}

function calculateSimilarity(distance, hashLength) {
  return Math.round((1 - distance / hashLength) * 10000) / 100;
}

exports.handler = async (event) => {
  try {
    const jsonsPath = path.join(process.cwd(), 'assets/jsons');

    const dexesConfig = JSON.parse(fs.readFileSync(path.join(jsonsPath, 'dexes.json'), 'utf8'));
    const hashFiles = dexesConfig.dexes.map(dex => `${dex}Hashes.json`);

    const allHashes = [];
    const loadedSources = {};

    for (const file of hashFiles) {
      const filePath = path.join(jsonsPath, file);

      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const source = file.replace('Hashes.json', '');
        loadedSources[source] = Object.keys(data).length;

        for (const [hash, name] of Object.entries(data)) {
          allHashes.push({
            hash,
            name,
            source
          });
        }
      } catch (err) {
        console.error(`Error reading ${file}:`, err.message);
      }
    }

    const { hash, limit, threshold } = event.queryStringParameters || {};

    if (!hash) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Missing hash parameter',
          message: 'Hash parameter is required. Hash should be a string of hexadecimal characters.'
        })
      };
    }

    const topCount = Math.min(parseInt(limit) || 5, 50);
    const similarityThreshold = parseFloat(threshold) || 0;

    const results = [];
    const hashLength = hash.length;

    for (const item of allHashes) {
      const distance = hammingDistance(hash, item.hash);
      
      if (distance === Infinity) {
        continue;
      }

      const similarity = calculateSimilarity(distance, hashLength);

      if (similarity >= similarityThreshold) {
        results.push({
          name: item.name,
          source: item.source,
          similarity,
          distance,
          hash: item.hash
        });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);

    const topResults = results.slice(0, topCount);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        searchHash: hash,
        hashLength: hashLength,
        totalMatches: results.length,
        topMatches: topResults.length,
        results: topResults.map(r => ({
          name: r.name,
          source: r.source,
          similarity: r.similarity + '%',
          distance: r.distance,
          hash: r.hash
        })),
        stats: {
          totalBallsLoaded: allHashes.length,
          sourceBreakdown: loadedSources
        },
        usage: {
          endpoint: '/.netlify/functions/findBall',
          method: 'GET',
          parameters: {
            hash: '(required) Image perceptual hash to search for',
            limit: '(optional) Max results to return (default: 5, max: 50)',
            threshold: '(optional) Min similarity % to include (default: 0)'
          },
          examples: [
            '/.netlify/functions/findBall?hash=abc123... - Find ball by hash',
            '/.netlify/functions/findBall?hash=abc123...&limit=10 - Get top 10 matches',
            '/.netlify/functions/findBall?hash=abc123...&threshold=80 - Only 80%+ matches',
            '/.netlify/functions/findBall?hash=abc123...&limit=3&threshold=90 - Top 3, 90%+ only'
          ],
          notes: [
            'Hash is generated using perceptual hashing (pHash) algorithm',
            'Similarity is calculated using Hamming distance',
            'Lower distance = higher similarity'
          ]
        }
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Error processing request',
        message: error.message
      })
    };
  }
};

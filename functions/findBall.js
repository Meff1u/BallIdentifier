const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { imageHash } = require('image-hash');
const os = require('os');

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

async function hashImage(imgData) {
  const tempFilePath = path.join(os.tmpdir(), `tempFile_${Date.now()}.png`);

  try {
    await fs.promises.writeFile(tempFilePath, imgData);

    const hash = await new Promise((resolve, reject) => {
      imageHash(tempFilePath, 20, true, (error, data) => {
        if (error) reject(error);
        resolve(data);
      });
    });

    return hash;
  } catch (error) {
    console.error('Hash generation error:', error);
    throw new Error('Failed to generate image hash');
  } finally {
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError);
    }
  }
}

async function generateHashFromBase64(base64String) {
  try {
    const buffer = Buffer.from(base64String, 'base64');

    if (!buffer || buffer.length === 0) {
      throw new Error('Empty or invalid buffer');
    }

    const magicBytes = buffer.slice(0, 8);
    const isPNG = magicBytes[0] === 0x89 && magicBytes[1] === 0x50 && magicBytes[2] === 0x4E && magicBytes[3] === 0x47;
    const isJPEG = magicBytes[0] === 0xFF && magicBytes[1] === 0xD8;
    const isWebP = magicBytes[8] === 0x57 && magicBytes[9] === 0x45 && magicBytes[10] === 0x42 && magicBytes[11] === 0x50;
    const isGIF = magicBytes[0] === 0x47 && magicBytes[1] === 0x49 && magicBytes[2] === 0x46;

    if (!isPNG && !isJPEG && !isWebP && !isGIF) {
      throw new Error('Invalid image format');
    }

    const img = await sharp(buffer)
      .resize(100, 100)
      .flatten({ background: { r: 0, g: 0, b: 0 } })
      .png()
      .toBuffer({ resolveWithObject: true });

    const hash = await hashImage(img.data);
    return hash;
  } catch (error) {
    console.error('Base64 hash generation error:', error);
    throw new Error(`Failed to generate hash from image: ${error.message}`);
  }
}

function performSearch(hash, allHashes, limit, threshold) {
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
    totalMatches: results.length,
    topMatches: topResults.length,
    results: topResults,
    hashLength: hashLength
  };
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

    // Handle POST request with base64 image
    try {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      const { image, limit, threshold } = body;

      if (!image) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({
            error: 'Missing image parameter',
            message: 'Image parameter is required. Image should be base64 encoded.'
          })
        };
      }

      console.log('Generating hash from base64 image...');
      const hash = await generateHashFromBase64(image);
      console.log('Generated hash:', hash);

      const searchResult = performSearch(hash, allHashes, limit, threshold);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          searchHash: hash,
          hashLength: searchResult.hashLength,
          totalMatches: searchResult.totalMatches,
          topMatches: searchResult.topMatches,
          results: searchResult.results.map(r => ({
            name: r.name,
            source: r.source,
            similarity: r.similarity + '%',
            distance: r.distance,
            hash: r.hash
          })),
          stats: {
            totalBallsLoaded: allHashes.length,
            sourceBreakdown: loadedSources
          }
        })
      };
    } catch (error) {
      console.error('POST request error:', error);
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          error: 'Invalid image',
          message: error.message
        })
      };
    }
  } catch (error) {
    console.error('Handler error:', error);
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

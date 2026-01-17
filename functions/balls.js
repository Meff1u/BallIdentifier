const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  try {
    const jsonsPath = path.join(process.cwd(), 'assets/jsons');

    const dexesConfig = JSON.parse(fs.readFileSync(path.join(jsonsPath, 'dexes.json'), 'utf8'));
    const jsonFiles = dexesConfig.dexes.map(dex => `${dex}.json`);

    const allBalls = [];
    const loadedSources = {};

    for (const file of jsonFiles) {
      const filePath = path.join(jsonsPath, file);
      
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const source = file.replace('.json', '');
        loadedSources[source] = Object.keys(data).length;
        
        for (const [name, info] of Object.entries(data)) {
          allBalls.push({
            name,
            ...info,
            source: source
          });
        }
      } catch (err) {
        console.error(`Error reading ${file} (${filePath}):`, err.message);
      }
    }

    const { source, rarity, sort, id } = event.queryStringParameters || {};

    let result = [...allBalls];

    if (source) {
      result = result.filter(ball => 
        ball.source.toLowerCase() === source.toLowerCase()
      );
    }

    if (rarity) {
      const rarityNum = parseFloat(rarity);
      result = result.filter(ball => ball.rarity === rarityNum);
    }

    if (id) {
      const idNum = parseInt(id);
      result = result.filter(ball => ball.id === idNum);
    }

    if (sort === 'rarity-asc') {
      result.sort((a, b) => a.rarity - b.rarity);
    } else if (sort === 'rarity-desc') {
      result.sort((a, b) => b.rarity - a.rarity);
    } else if (sort === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'id') {
      result.sort((a, b) => a.id - b.id);
    }

    const duplicates = {};
    const uniqueNames = new Set();
    
    for (const ball of allBalls) {
      if (!duplicates[ball.name]) {
        duplicates[ball.name] = [];
      }
      duplicates[ball.name].push(ball.source);
      uniqueNames.add(ball.name);
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        total: result.length,
        balls: result,
        stats: {
          totalBallsLoaded: allBalls.length,
          uniqueNames: uniqueNames.size,
          sourceBreakdown: loadedSources,
          duplicates: Object.fromEntries(
            Object.entries(duplicates).filter(([_, sources]) => sources.length > 1)
          )
        },
        usage: {
          endpoint: '/.netlify/functions/balls',
          method: 'GET',
          parameters: {
            source: 'Filter by dex name (e.g., Ballsdex, FoodDex)',
            rarity: 'Filter by exact rarity number',
            id: 'Filter by exact ball ID',
            sort: 'Sort results: rarity-asc, rarity-desc, name, id'
          },
          examples: [
            '/.netlify/functions/balls - Get all balls',
            '/.netlify/functions/balls?source=Ballsdex - Get only Ballsdex balls',
            '/.netlify/functions/balls?rarity=1 - Get balls with rarity #1',
            '/.netlify/functions/balls?sort=name - Sort alphabetically',
            '/.netlify/functions/balls?source=FoodDex&sort=rarity-asc - Combined filters'
          ]
        }
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Error fetching data',
        message: error.message
      })
    };
  }
};

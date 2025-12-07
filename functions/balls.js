const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  try {
    const jsonsPath = path.join(__dirname, '../../assets/jsons');

    const jsonFiles = [
      'Ballsdex.json',
      'Dynastydex.json',
      'Empireballs.json',
      'HistoryDex.json'
    ];

    const allBalls = {};
    const sources = {};

    for (const file of jsonFiles) {
      const filePath = path.join(jsonsPath, file);
      
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        for (const [name, info] of Object.entries(data)) {
          allBalls[name] = {
            ...info,
            source: file.replace('.json', '')
          };
        }
      } catch (err) {
        console.error(`Błąd czytania ${file}:`, err.message);
      }
    }

    const { source, rarity, sort } = event.queryStringParameters || {};

    let result = Object.entries(allBalls).map(([name, data]) => ({
      name,
      ...data
    }));

    if (source) {
      result = result.filter(ball => 
        ball.source.toLowerCase() === source.toLowerCase()
      );
    }

    if (rarity) {
      const rarityNum = parseFloat(rarity);
      result = result.filter(ball => ball.rarity === rarityNum);
    }

    if (sort === 'rarity-asc') {
      result.sort((a, b) => a.rarity - b.rarity);
    } else if (sort === 'rarity-desc') {
      result.sort((a, b) => b.rarity - a.rarity);
    } else if (sort === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        total: result.length,
        balls: result
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Błąd podczas pobierania danych',
        message: error.message
      })
    };
  }
};

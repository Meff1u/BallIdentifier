const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
    const { dex } = JSON.parse(event.body);
    const folder = dex === 'Ballsdex' ? 'compareBalls' : 'compareBallsDD';
    const dirPath = path.join(__dirname, '../assets', folder);

    try {
        const files = fs.readdirSync(dirPath);
        const pngFiles = files.filter(file => file.endsWith('.png'));
        return {
            statusCode: 200,
            body: JSON.stringify({ count: pngFiles.length + 1 }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error reading directory' }),
        };
    }
};
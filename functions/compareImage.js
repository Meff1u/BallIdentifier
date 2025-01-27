const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
    const { file, dex } = JSON.parse(event.body);
    const buffer = Buffer.from(file, 'base64');
    console.log(fs.readdirSync(path.join('./assets')));
    const ballsDir = dex === 'Ballsdex' ? path.join('./assets/compareBalls') : path.join('./assets/compareBallsDD');
    const ballFiles = fs.readdirSync(ballsDir);
    const pixelmatch = (await import("pixelmatch")).default;

    let lowestDiff = 9999999999;
    let country;
    let foundSimilarity = false;

    const img1 = await sharp(buffer)
        .resize(100, 100)
        .raw()
        .toBuffer({ resolveWithObject: true });

    for (let file of ballFiles) {
        console.log(`File: ${file}`);
        const img2 = await sharp(path.join(ballsDir, file))
            .raw()
            .toBuffer({ resolveWithObject: true });
        console.log(`Image 1: ${img1.info.width}x${img1.info.height}`);
        console.log(`Image 2: ${img2.info.width}x${img2.info.height}`);
        console.log(`Image 1 data: ${img1.data}`);
        console.log(`Image 2 data: ${img2.data}`);

        const diff = new Uint8Array(img1.info.width * img1.info.height * 4);
        const numDiff = pixelmatch(img1.data, img2.data, diff, img1.info.width, img1.info.height, { threshold: 0.1 });

        if (numDiff < lowestDiff) {
            lowestDiff = numDiff;
            country = extractCountryName(file);
        }

        if (numDiff <= 333) {
            foundSimilarity = true;
            return {
                statusCode: 200,
                body: JSON.stringify({ country }),
            };
        }
    }

    if (!foundSimilarity) {
        return {
            statusCode: 200,
            body: JSON.stringify({ country }),
        };
    }
};

function extractCountryName(filename) {
    const match = filename.match(/^(.+?)(?:\.\d+)?\.png$/);
    if (match) {
        return match[1];
    }
    return null;
}
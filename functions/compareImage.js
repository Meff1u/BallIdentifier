const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
    // console.log('Event:', event);
    const { file } = JSON.parse(event.body);
    const buffer = Buffer.from(file, 'base64');
    const ballsDir = path.join('./assets/balls');
    const ballFiles = fs.readdirSync(ballsDir);
    console.log('ballFiles:', ballFiles);
    const pixelmatch = (await import("pixelmatch")).default;

    let lowestDiff = 9999999999;
    let country;
    let foundSimilarity = false;

    const img1 = await sharp(buffer)
        .resize(100, 100)
        .raw()
        .toBuffer({ resolveWithObject: true });

    for (let file of ballFiles) {
        const img2 = await sharp(path.join(ballsDir, file))
            .raw()
            .toBuffer({ resolveWithObject: true });

        const diff = new Uint8Array(img1.info.width * img1.info.height * 4);
        const numDiff = pixelmatch(img1.data, img2.data, diff, img1.info.width, img1.info.height, { threshold: 0.1 });

        if (numDiff < lowestDiff) {
            lowestDiff = numDiff;
            country = extractCountryName(file);
        }

        if (numDiff <= 666) {
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
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const busboy = require('busboy');

exports.handler = async (event) => {
    console.log('Received event.');
    const formData = await parseMultipartFormData(event);
    const file = formData.file;
    const dex = formData.dex;

    if (!file) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'File is missing from the form data' }),
        };
    }

    const buffer = Buffer.from(file, 'binary');
    const ballsDir = dex === 'Ballsdex' ? path.join('./assets/compareBalls') : path.join('./assets/compareBallsDD');
    const ballFiles = fs.readdirSync(ballsDir);
    const pixelmatch = (await import("pixelmatch")).default;

    console.log('Starting comparison...');

    let lowestDiff = 9999999999;
    let country;
    let foundSimilarity = false;

    const img1 = await sharp(buffer)
        .resize(100, 100)
        .removeAlpha()
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    for (let file of ballFiles) {
        const img2 = await sharp(path.join(ballsDir, file))
            .removeAlpha()
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const numDiff = pixelmatch(img1.data, img2.data, null, img1.info.width, img1.info.height, { threshold: 0.2 });
        console.log(`${file.split('.')[0]} | ${(((10000 - numDiff) / 10000) * 100).toFixed(2)}%`);
        
        if (numDiff < lowestDiff) {
            lowestDiff = numDiff;
            country = extractCountryName(file);
        }
        
        if (numDiff <= 333) {
            foundSimilarity = true;
            return {
                statusCode: 200,
                body: JSON.stringify({ country: country, diff: numDiff }),
            };
        }
    }

    if (!foundSimilarity) {
        return {
            statusCode: 200,
            body: JSON.stringify({ country: country, diff: lowestDiff }),
        };
    }
}

function extractCountryName(filename) {
    const match = filename.match(/^(.+?)(?:\.\d+)?\.png$/);
    if (match) {
        return match[1];
    }
    return null;
}

function parseMultipartFormData(event) {
    return new Promise((resolve, reject) => {
        const bb = busboy({ headers: event.headers });
        const formData = {};

        bb.on('file', (fieldname, file, filename, encoding, mimetype) => {
            let fileBuffer = [];
            file.on('data', (data) => {
                fileBuffer.push(data);
            }).on('end', () => {
                formData[fieldname] = Buffer.concat(fileBuffer);
            });
        });

        bb.on('field', (fieldname, val) => {
            formData[fieldname] = val;
        });

        bb.on('finish', () => {
            resolve(formData);
        });

        bb.on('error', (err) => {
            reject(err);
        });

        bb.end(Buffer.from(event.body, 'base64'));
    });
}
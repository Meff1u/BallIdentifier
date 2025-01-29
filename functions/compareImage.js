const busboy = require('busboy');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const os = require('os');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: 'Method Not Allowed',
        };
    }

    const bb = busboy({ headers: event.headers });
    let fileBuffer = null;
    let dex = null;
    let chunkIndex = null;
    let totalChunks = null;
    let tempFilePath = path.join(os.tmpdir(), 'upload.tmp');

    return new Promise((resolve, reject) => {
        bb.on('file', (fieldname, file, filename, encoding, mimetype) => {
            const chunks = [];
            file.on('data', (data) => {
                chunks.push(data);
            }).on('end', () => {
                fileBuffer = Buffer.concat(chunks);
            });
        });

        bb.on('field', (fieldname, val) => {
            if (fieldname === 'dex') {
                dex = val;
            } else if (fieldname === 'chunkIndex') {
                chunkIndex = parseInt(val, 10);
            } else if (fieldname === 'totalChunks') {
                totalChunks = parseInt(val, 10);
            }
        });

        bb.on('finish', async () => {
            if (!fileBuffer || dex === null || chunkIndex === null || totalChunks === null) {
                return resolve({
                    statusCode: 400,
                    body: 'Invalid form data',
                });
            }

            fs.appendFileSync(tempFilePath, fileBuffer);

            if (chunkIndex === totalChunks - 1) {
                try {
                    const ballsDir = dex === 'Ballsdex' ? path.join('./assets/compareBalls') : path.join('./assets/compareBallsDD');
                    const ballFiles = fs.readdirSync(ballsDir);
                    const pixelmatch = (await import("pixelmatch")).default;

                    let lowestDiff = 9999999999;
                    let country;
                    let foundSimilarity = false;

                    let img1;
                    try {
                        img1 = await sharp(tempFilePath)
                            .resize(100, 100)
                            .removeAlpha()
                            .ensureAlpha()
                            .raw()
                            .toBuffer({ resolveWithObject: true });
                    } catch (error) {
                        console.error('Error processing image:', error);
                        fs.unlinkSync(tempFilePath);
                        return resolve({
                            statusCode: 400,
                            body: 'Invalid image file',
                        });
                    }

                    for (let file of ballFiles) {
                        let img2;
                        try {
                            img2 = await sharp(path.join(ballsDir, file))
                                .removeAlpha()
                                .ensureAlpha()
                                .raw()
                                .toBuffer({ resolveWithObject: true });
                        } catch (error) {
                            console.error('Error processing comparison image:', error);
                            continue;
                        }

                        const numDiff = pixelmatch(img1.data, img2.data, null, img1.info.width, img1.info.height, { threshold: 0.2 });
                        console.log(`${file.split('.')[0]} | ${(((10000 - numDiff) / 10000) * 100).toFixed(2)}%`);

                        if (numDiff < lowestDiff) {
                            lowestDiff = numDiff;
                            country = extractCountryName(file);
                        }

                        if (numDiff <= 333) {
                            foundSimilarity = true;
                            fs.unlinkSync(tempFilePath);
                            return resolve({
                                statusCode: 200,
                                body: JSON.stringify({ country: country, diff: numDiff }),
                            });
                        }
                    }

                    if (!foundSimilarity) {
                        fs.unlinkSync(tempFilePath);
                        return resolve({
                            statusCode: 200,
                            body: JSON.stringify({ country: country, diff: lowestDiff }),
                        });
                    }
                } catch (error) {
                    console.error('Error:', error);
                    fs.unlinkSync(tempFilePath);
                    return resolve({
                        statusCode: 500,
                        body: 'Internal Server Error',
                    });
                }
            } else {
                return resolve({
                    statusCode: 200,
                    body: JSON.stringify({ message: 'Chunk received' }),
                });
            }
        });

        bb.end(Buffer.from(event.body, 'base64'));
    });
};

function extractCountryName(filename) {
    const match = filename.match(/^(.+?)(?:\.\d+)?\.png$/);
    if (match) {
        return match[1];
    }
    return null;
}
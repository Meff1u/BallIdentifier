const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const busboy = require('busboy');
const { imageHash } = require('image-hash');
const os = require('os');

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
    const ballHashes = fs.readFileSync(path.join(`./assets/jsons/${dex}Hashes.json`));

    console.log('Starting comparison...');

    let lowestDiff = Infinity;
    let country;

    const img1 = await sharp(buffer)
        .resize(100, 100)
        .flatten({ background: { r: 0, g: 0, b: 0 } })
        .png()
        .toBuffer({ resolveWithObject: true });

    const hash = await hashImage(img1.data);
    console.log('Hash:', hash);

    for (const [hashKey, countryName] of Object.entries(JSON.parse(ballHashes))) {
        const diff = hashDiff(hash, hashKey);
        console.log(`${countryName} | ${diff}`);
        if (diff < lowestDiff) {
            lowestDiff = diff;
            country = countryName;
        }
    }

    return {
        statusCode: 200,
        body: JSON.stringify({ country: country, diff: lowestDiff }),
    }
}

async function hashImage(imgData) {
    const tempFilePath = path.join(os.tmpdir(), `tempFile.png`);
    await fs.promises.writeFile(tempFilePath, imgData);

    const hash = await new Promise((resolve, reject) => {
        imageHash(tempFilePath, 20, true, (error, data) => {
            if (error) reject(error);
            resolve(data);
        });
    });

    fs.unlinkSync(tempFilePath);
    return hash;
}

function hashDiff(hash1, hash2) {
    const hash1Array = hash1.split('');
    const hash2Array = hash2.split('');
    let diff = 0;

    for (let i = 0; i < hash1Array.length; i++) {
        if (hash1Array[i] !== hash2Array[i]) {
            diff++;
        }
    }

    return diff;
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
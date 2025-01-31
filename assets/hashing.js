const fs = require('fs');
const path = require('path');
const { imageHash } = require('image-hash');
const sharp = require('sharp');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const ballsDir = path.join(__dirname, 'ballsDD');
const outputFilePath = path.join(__dirname, 'ballsHashesDD.json');

async function hashImagesInDirectory(directory) {
    const files = fs.readdirSync(directory);
    const hashes = {};

    for (const file of files) {
        const filePath = path.join(directory, file);
        const fileBuffer = fs.readFileSync(filePath);

        const imgBuffer = await sharp(fileBuffer)
            .resize(100, 100)
            .flatten({ background: { r: 0, g: 0, b: 0 } })
            .png()
            .toBuffer({ resolveWithObject: true });

        const hash = await generateImageHash(imgBuffer.data);
        const fileNameWithoutExtension = path.parse(file).name;

        hashes[hash] = fileNameWithoutExtension;
    }

    fs.writeFileSync(outputFilePath, JSON.stringify(hashes, null, 2));
    console.log('Hashes saved to', outputFilePath);
}

async function generateImageHash(imageData) {
    const tempFilePath = path.join(os.tmpdir(), `${uuidv4()}.png`);
    await fs.promises.writeFile(tempFilePath, imageData);

    const hash = await new Promise((resolve, reject) => {
        imageHash(tempFilePath, 20, true, (error, data) => {
            if (error) reject(error);
            resolve(data);
        });
    });

    fs.unlinkSync(tempFilePath); // Remove the temporary file
    return hash;
}

hashImagesInDirectory(ballsDir).catch(console.error);
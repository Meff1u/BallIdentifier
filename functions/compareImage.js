const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const busboy = require("busboy");
const { imageHash } = require("image-hash");
const os = require("os");

exports.handler = async (event) => {
    console.log("Received event.");
    try {
        const formData = await parseMultipartFormData(event);
        const file = formData.file;
        const dex = formData.dex;

        if (!file) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "File is missing from the form data" }),
            };
        }

        const buffer = Buffer.from(file, "binary");
        
        if (!buffer || buffer.length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Empty or invalid file buffer" }),
            };
        }
        
        if (buffer.length < 100) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "File too small to be a valid image" }),
            };
        }
        
        const magicBytes = buffer.slice(0, 8);
        const isPNG = magicBytes[0] === 0x89 && magicBytes[1] === 0x50 && magicBytes[2] === 0x4E && magicBytes[3] === 0x47;
        const isJPEG = magicBytes[0] === 0xFF && magicBytes[1] === 0xD8;
        const isWebP = magicBytes[8] === 0x57 && magicBytes[9] === 0x45 && magicBytes[10] === 0x42 && magicBytes[11] === 0x50;
        const isGIF = magicBytes[0] === 0x47 && magicBytes[1] === 0x49 && magicBytes[2] === 0x46;
        
        if (!isPNG && !isJPEG && !isWebP && !isGIF) {
            console.log("Invalid magic bytes:", Array.from(magicBytes.slice(0, 12)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
            return {
                statusCode: 400,
                body: JSON.stringify({ 
                    error: "File does not appear to be a valid image. Magic bytes check failed.",
                    details: `First 12 bytes: ${Array.from(magicBytes.slice(0, 12)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`
                }),
            };
        }
        
        const ballHashes = fs.readFileSync(path.join(`./assets/jsons/${dex}Hashes.json`));

        console.log("Starting comparison...");

        let lowestDiff = Infinity;
        let country;

        let img1;
        try {
            const metadata = await sharp(buffer).metadata();
            console.log("Image metadata:", metadata);

            if (
                !metadata.format ||
                !["jpeg", "png", "webp", "gif", "svg", "tiff"].includes(metadata.format)
            ) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        error: "Unsupported image format. Please use JPEG, PNG, WebP, or GIF.",
                    }),
                };
            }

            img1 = await sharp(buffer)
                .resize(100, 100)
                .flatten({ background: { r: 0, g: 0, b: 0 } })
                .png()
                .toBuffer({ resolveWithObject: true });
        } catch (sharpError) {
            console.error("Sharp processing error:", sharpError);
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: "Invalid image file. Please upload a valid image (JPEG, PNG, WebP, or GIF).",
                    details: sharpError.message,
                }),
            };
        }

        const hash = await hashImage(img1.data);
        console.log("Hash:", hash);

        for (const [hashKey, countryName] of Object.entries(JSON.parse(ballHashes))) {
            const diff = hashDiff(hash, hashKey);
            if (diff === 0) {
                console.log("Exact match found:", countryName);
                return {
                    statusCode: 200,
                    body: JSON.stringify({ country: countryName, diff: diff }),
                };
            }
            if (diff < lowestDiff) {
                lowestDiff = diff;
                country = countryName;
            }
        }

        console.log("Closest match:", country, "with diff:", lowestDiff);
        return {
            statusCode: 200,
            body: JSON.stringify({ country: country, diff: lowestDiff }),
        };
    } catch (error) {
        console.error("Handler error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal server error", details: error.message }),
        };
    }
};

async function hashImage(imgData) {
    const tempFilePath = path.join(os.tmpdir(), `tempFile.png`);

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
        console.error("Hash generation error:", error);
        throw new Error("Failed to generate image hash");
    } finally {
        try {
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
        } catch (cleanupError) {
            console.error("Cleanup error:", cleanupError);
        }
    }
}

function hashDiff(hash1, hash2) {
    const hash1Array = hash1.split("");
    const hash2Array = hash2.split("");
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
        try {
            const bb = busboy({ headers: event.headers });
            const formData = {};

            bb.on("file", (fieldname, file, filename, encoding, mimetype) => {
                console.log("Received file:", fieldname, filename, mimetype);
                let fileBuffer = [];
                file.on("data", (data) => {
                    fileBuffer.push(data);
                }).on("end", () => {
                    formData[fieldname] = Buffer.concat(fileBuffer);
                });
            });

            bb.on("field", (fieldname, val) => {
                formData[fieldname] = val;
            });

            bb.on("finish", () => {
                resolve(formData);
            });

            bb.on("error", (err) => {
                console.error("Busboy error:", err);
                reject(err);
            });

            bb.end(Buffer.from(event.body, "base64"));
        } catch (error) {
            console.error("Parse error:", error);
            reject(error);
        }
    });
}

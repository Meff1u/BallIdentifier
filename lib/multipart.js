const busboy = require("busboy");

/**
 * Parse a multipart/form-data Netlify event.
 * Files become { buffer, filename, mimetype }, fields become strings.
 */
function parseMultipartFormData(event, { maxFileBytes = 10 * 1024 * 1024 } = {}) {
    return new Promise((resolve, reject) => {
        try {
            const bb = busboy({ headers: event.headers || {}, limits: { fileSize: maxFileBytes, files: 1 } });
            const formData = {};

            bb.on("file", (fieldname, file, info) => {
                const chunks = [];
                file.on("data", (chunk) => chunks.push(chunk));
                file.on("limit", () => reject(Object.assign(new Error("Image too large (>10MB)"), { statusCode: 413 })));
                file.on("end", () => {
                    formData[fieldname] = {
                        buffer: Buffer.concat(chunks),
                        filename: info?.filename || "upload-image",
                        mimetype: info?.mimeType || "application/octet-stream",
                    };
                });
            });

            bb.on("field", (fieldname, value) => {
                formData[fieldname] = value;
            });

            bb.on("finish", () => resolve(formData));
            bb.on("error", reject);

            bb.end(Buffer.from(event.body || "", event.isBase64Encoded ? "base64" : "utf8"));
        } catch (error) {
            reject(error);
        }
    });
}

module.exports = { parseMultipartFormData };

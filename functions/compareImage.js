const { checkApiKey } = require("../lib/api-key");
const { parseMultipartFormData } = require("../lib/multipart");
const { identifyBuffer, errorToResponse } = require("../lib/identify-core");

/**
 * Compare an uploaded image (multipart: file, dex) against a dex's hashes.
 * Requires x-api-key. Response: { country, diff }
 */
exports.handler = async (event) => {
    const authError = checkApiKey(event, event.headers?.["x-api-key"]);
    if (authError) return authError;

    try {
        const formData = await parseMultipartFormData(event);
        const file = formData.file;

        if (!file?.buffer?.length) {
            return {
                statusCode: 400,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: "File is missing from the form data" }),
            };
        }

        const result = await identifyBuffer(file.buffer, formData.dex);
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ country: result.country, diff: result.diff }),
        };
    } catch (error) {
        return errorToResponse(error);
    }
};

const fs = require("fs");
const path = require("path");

// API Key validation middleware
function validateApiKey(event) {
    const providedKey = event.headers?.["x-api-key"] || event.queryStringParameters?.api_key;
    const validKey = process.env.API_KEY;

    if (!validKey) {
        console.error("API_KEY environment variable not set");
        return { valid: false, error: "Server configuration error" };
    }

    if (!providedKey) {
        return { valid: false, error: "API key required" };
    }

    if (providedKey !== validKey) {
        return { valid: false, error: "Invalid API key" };
    }

    return { valid: true };
}

exports.handler = async (event) => {
    console.log("Received event.");
    try {
        // Validate API key
        const apiKeyValidation = validateApiKey(event);
        if (!apiKeyValidation.valid) {
            console.warn("API key validation failed:", apiKeyValidation.error);
            console.warn(event);
            return {
                statusCode: 401,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ error: apiKeyValidation.error }),
            };
        }

        const jsonsPath = path.join(process.cwd(), "assets/jsons");

        const dexesConfig = JSON.parse(fs.readFileSync(path.join(jsonsPath, "dexes.json"), "utf8"));
        const jsonFiles = dexesConfig.dexes.map((dex) => `${dex}.json`);

        const allBalls = [];
        const loadedSources = {};

        for (const file of jsonFiles) {
            const filePath = path.join(jsonsPath, file);

            try {
                const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
                const source = file.replace(".json", "");
                loadedSources[source] = Object.keys(data).length;

                for (const [name, info] of Object.entries(data)) {
                    allBalls.push({
                        name,
                        ...info,
                        source: source,
                    });
                }
            } catch (err) {
                console.error(`Error reading ${file} (${filePath}):`, err.message);
            }
        }

        // Input Validation to prevent injection attacks
        const params = event.queryStringParameters || {};

        // Validate and sanitize parameters - limit length and type check
        const source = params.source ? String(params.source).slice(0, 50) : undefined;
        const rarity = params.rarity ? parseFloat(params.rarity) : undefined;
        const sort = params.sort ? String(params.sort).slice(0, 20) : undefined;
        const id = params.id ? parseInt(params.id, 10) : undefined;

        // Validate numeric parameters
        if (rarity !== undefined && (isNaN(rarity) || rarity < 0 || rarity > 100)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Invalid rarity value" }),
            };
        }

        if (id !== undefined && (isNaN(id) || id < 0)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Invalid id value" }),
            };
        }

        // Validate source parameter (only allow alphanumeric and underscore)
        if (source && !/^[a-z0-9_]+$/i.test(source)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Invalid source parameter" }),
            };
        }

        let result = [...allBalls];

        if (source) {
            result = result.filter((ball) => ball.source.toLowerCase() === source.toLowerCase());
        }

        if (rarity !== undefined) {
            result = result.filter((ball) => ball.rarity === rarity);
        }

        if (id !== undefined) {
            const idNum = id;
            result = result.filter((ball) => ball.id === idNum);
        }

        if (sort === "rarity-asc") {
            result.sort((a, b) => a.rarity - b.rarity);
        } else if (sort === "rarity-desc") {
            result.sort((a, b) => b.rarity - a.rarity);
        } else if (sort === "name") {
            result.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sort === "id") {
            result.sort((a, b) => a.id - b.id);
        }

        const duplicates = {};
        const uniqueNames = new Set();

        for (const ball of allBalls) {
            if (!duplicates[ball.name]) {
                duplicates[ball.name] = [];
            }
            duplicates[ball.name].push(ball.source);
            uniqueNames.add(ball.name);
        }

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify({
                total: result.length,
                results: result,
                stats: {
                    totalBallsLoaded: allBalls.length,
                    uniqueNames: uniqueNames.size,
                    sourceBreakdown: loadedSources,
                    duplicates: Object.fromEntries(
                        Object.entries(duplicates).filter(([_, sources]) => sources.length > 1),
                    ),
                },
                usage: {
                    endpoint: "/.netlify/functions/balls",
                    method: "GET",
                    parameters: {
                        source: "Filter by dex name (e.g., Ballsdex, FoodDex)",
                        rarity: "Filter by exact rarity number",
                        id: "Filter by exact ball ID",
                        sort: "Sort results: rarity-asc, rarity-desc, name, id",
                    },
                    examples: [
                        "/.netlify/functions/balls - Get all balls",
                        "/.netlify/functions/balls?source=Ballsdex - Get only Ballsdex balls",
                        "/.netlify/functions/balls?rarity=1 - Get balls with rarity #1",
                        "/.netlify/functions/balls?sort=name - Sort alphabetically",
                        "/.netlify/functions/balls?source=FoodDex&sort=rarity-asc - Combined filters",
                    ],
                },
            }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                error: "Error fetching data",
                message: error.message,
            }),
        };
    }
};

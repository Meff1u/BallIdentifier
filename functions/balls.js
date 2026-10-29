const { checkApiKey } = require("../lib/api-key");
const { getAvailableDexes, getDexData } = require("../lib/dex-data");

exports.handler = async (event) => {
    try {
        // Validate API key
        const authError = checkApiKey(event, event.headers?.["x-api-key"] || event.queryStringParameters?.api_key);
        if (authError) return authError;

        // Dex JSON files are cached per warm function instance
        const availableDexes = getAvailableDexes();
        const allBalls = [];
        const loadedSources = {};

        for (const source of availableDexes) {
            try {
                const data = getDexData(source);
                loadedSources[source] = Object.keys(data).length;

                for (const [name, info] of Object.entries(data)) {
                    allBalls.push({ name, ...info, source });
                }
            } catch (err) {
                console.error(`Error reading ${source}.json:`, err.message);
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

        // Validate source parameter against known dexes (allows names with spaces, e.g. "Empireballs Reboot")
        if (source && !availableDexes.some((dex) => dex.toLowerCase() === source.toLowerCase())) {
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

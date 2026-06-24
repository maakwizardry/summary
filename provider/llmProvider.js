const { GoogleGenerativeAI } = require("@google/generative-ai");
const OpenAI = require("openai");

const provider = process.env.LLM_PROVIDER;

let llmService;



// ===== FACTORY INITIALIZATION =====
if (provider === "GEMINI") {

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);


    const embeddingModel = genAI.getGenerativeModel({
        model: "gemini-embedding-001",
    });


    const chatModel = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 2200,
        }
    });





    const withRetry = async (fn, retries = 3, delayMs = 2000) => {
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            } catch (error) {
                const isUnavailable = error.message && (
                    error.message.includes("503") ||
                    error.message.includes("unavailable") ||
                    error.message.includes("429") ||
                    error.message.includes("overloaded")
                );
                if (isUnavailable && i < retries - 1) {
                    console.warn(`Gemini API unavailable or overloaded. Retrying in ${delayMs}ms... (Attempt ${i + 1} of ${retries})`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    continue;
                }
                throw error;
            }
        }
    };

    llmService = {

        async generateText(prompt, isJson = false) {
            let modelToUse = chatModel;
            if (isJson) {
                modelToUse = genAI.getGenerativeModel({
                    model: "gemini-2.5-flash",
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 2200,
                        responseMimeType: "application/json"
                    }
                });
            }

            return await withRetry(async () => {
                const result = await modelToUse.generateContent(prompt);
                return result.response.text();
            }, 3, 3000);
        },

        async generateEmbedding(text) {
            if (!text || !text.trim()) return null;

            const safeText = text.slice(0, 3000);

            try {
                return await withRetry(async () => {
                    const result = await embeddingModel.embedContent({
                        content: {
                            parts: [{ text: safeText }]
                        },
                        outputDimensionality: 768
                    });
                    return result.embedding.values;
                }, 3, 2000);
            } catch (err) {
                console.error("Embedding failed:", err.message);
                return null;
            }
        },

        async generateEmbeddingBatch(texts) {
            if (!texts || !texts.length) return [];

            try {
                const requests = texts.map(t => ({
                    content: { parts: [{ text: t.slice(0, 3000) }] }
                }));

                return await withRetry(async () => {
                    const result = await embeddingModel.batchEmbedContents({
                        requests: requests
                    });
                    return result.embeddings.map(e => e.values);
                }, 3, 2000);
            } catch (err) {
                console.error("Batch Embedding failed:", err.message);
                return null;
            }
        }
    };
}


if (provider === "OPENAI") {

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });

    llmService = {
        async generateText(prompt, isJson = false) {

            const payload = {
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.4
            };

            if (isJson) {
                payload.response_format = { type: "json_object" };
                payload.temperature = 0.1;
            }

            const response = await openai.chat.completions.create(payload);
            return response.choices[0].message.content;
        },

        async generateEmbedding(text) {


            const response = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: text
            });

            return response.data[0].embedding;
        },

        async generateEmbeddingBatch(texts) {
            if (!texts || !texts.length) return [];



            try {
                const response = await openai.embeddings.create({
                    model: "text-embedding-3-small",
                    input: texts
                });

                return response.data.map(d => d.embedding);
            } catch (err) {
                console.error("Batch Embedding failed:", err.message);
                return null;
            }
        }
    };
}

if (!llmService) {
    throw new Error("Invalid LLM_PROVIDER");
}

module.exports = llmService;

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



    llmService = {

        async generateText(prompt) {
            const result = await chatModel.generateContent(prompt);
            return result.response.text();
        },

        async generateEmbedding(text) {
            if (!text || !text.trim()) return null;

            const safeText = text.slice(0, 3000);

            try {
                const result = await embeddingModel.embedContent({
                    content: {
                        parts: [{ text: safeText }]
                    },
                    outputDimensionality: 768
                });

                return result.embedding.values;
            } catch (err) {
                console.error("Embedding failed:", err.message);
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
        async generateText(prompt) {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.4
            });

            return response.choices[0].message.content;
        },

        async generateEmbedding(text) {
            const response = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: text
            });

            return response.data[0].embedding;
        }
    };
}

if (!llmService) {
    throw new Error("Invalid LLM_PROVIDER");
}

module.exports = llmService;

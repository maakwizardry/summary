
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI("AIzaSyBejDQq3mW7aqLdNRCc8WkjhUy5qf0E7vA");

const embeddingModel = genAI.getGenerativeModel({
    model: "gemini-embedding-001",
});


async function generateText(prompt) {
    const result = await model.generateContent(prompt);
    return result.response.text();
}


async function embedText(text) {
    if (!text || !text.trim()) return null;

    const safeText = text.slice(0, 3000);

    try {
        const result = await embeddingModel.embedContent({
            content: {
                parts: [{ text: safeText }]
            },
            // outputDimensionality: 768
        });

        return result.embedding.values;
    } catch (err) {
        console.error("Embedding failed:", err.message);
        return null;
    }
}


const v = await embedText("hello world");
console.log(v.length); // MUST





module.exports = { embedText, generateText };

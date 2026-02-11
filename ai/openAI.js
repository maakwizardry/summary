const OpenAI = require("openai");

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function generateText(prompt) {
    const res = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
    });

    return res.choices[0].message.content;
}

async function embedText(text) {
    const res = await client.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
    });

    return res.data[0].embedding;
}

module.exports = { generateText, embedText };

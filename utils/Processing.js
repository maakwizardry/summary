const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const embeddingModel = genAI.getGenerativeModel({
    model: "gemini-embedding-001",
});


async function extractText(file) {
    const ext = file.originalname.split(".").pop().toLowerCase();

    // ✅ PDF
    if (ext === "pdf") {
        const data = await pdf(file.buffer);   // 🔥 await
        return data.text;                      // 🔥 return TEXT
    }

    // ✅ DOCX
    if (ext === "docx") {
        const result = await mammoth.extractRawText({
            buffer: file.buffer
        });
        return result.value;
    }

    // ✅ TXT
    if (ext === "txt") {
        return file.buffer.toString("utf-8");
    }

    // ❌ unsupported
    throw new Error("Unsupported file type");
}







// ---------------- CHUNKING ----------------

function chunkText(text, maxChars = 1200, overlap = 200) {
    if (!text || !text.trim()) return [];

    const clean = text
        .replace(/\r/g, "")
        .replace(/\n{2,}/g, "\n")
        .replace(/\s+/g, " ")
        .trim();

    // 🔥 If the document is small, keep it as ONE chunk
    if (clean.length <= maxChars) {
        return [clean];
    }

    const chunks = [];
    let start = 0;

    while (start < clean.length) {
        const end = start + maxChars;
        const chunk = clean.slice(start, end).trim();

        // Allow small chunks ONLY if it's the last one
        if (chunk.length > 50 || end >= clean.length) {
            chunks.push(chunk);
        }

        start += maxChars - overlap;
    }

    return chunks;
}


async function embedText(text) {
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


function cosineSimilarity(a, b) {

    if (!a || !b || a.length !== b.length) return -1;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] ** 2;
        normB += b[i] ** 2;
    }

    if (normA === 0 || normB === 0) return -1;

    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}



module.exports = { extractText, chunkText, embedText, cosineSimilarity };

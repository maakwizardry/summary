const mammoth = require("mammoth");
// ✅ PDF processing (layout-aware)
const JSZip = require("jszip");
const sharp = require("sharp");
const path = require("path");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf");
pdfjsLib.verbosity = pdfjsLib.VerbosityLevel.ERRORS;

// ✅ Canvas (needed for rendering PDF pages)
const { createCanvas } = require("canvas");

// ✅ OCR (for images / scanned PDFs)
const Tesseract = require("tesseract.js");

// ✅ DOCX parser
async function extractText(file) {
    const ext = file.originalname.split(".").pop().toLowerCase();

    // ✅ PDF
    if (ext === "pdf") {
        const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(file.buffer),
            standardFontDataUrl: path.join(
                __dirname,
                "node_modules/pdfjs-dist/standard_fonts/"
            )
        });

        const pdf = await loadingTask.promise;
        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);

            // =========================
            // 🔥 1. EXTRACT TEXT LAYER
            // =========================
            const textContent = await page.getTextContent();
            const textItems = textContent.items;

            const textLayer = textItems.map(i => i.str).join(" ").trim();

            // =========================
            // 🔥 2. DETECT IMAGE SIGNAL
            // =========================
            const operatorList = await page.getOperatorList();

            const hasImages = operatorList.fnArray.some(fn =>
                fn === pdfjsLib.OPS.paintImageXObject ||
                fn === pdfjsLib.OPS.paintJpegXObject
            );

            const textDensity = textItems.length;

            // =========================
            // 🔥 3. DECIDE TYPE
            // =========================
            const isTextHeavy = textDensity > 30;
            const isScanned = textDensity < 10 && hasImages;
            const isHybrid = hasImages && textDensity >= 10;

            let finalPageText = "";

            // =========================
            // 🔥 4. TEXT HEAVY → USE TEXT
            // =========================
            if (isTextHeavy) {
                finalPageText = textLayer;
            }

            // =========================
            // 🔥 5. SCANNED → USE OCR
            // =========================
            else if (isScanned) {
                const ocrText = await runOCR(page);
                finalPageText = ocrText;
            }

            // =========================
            // 🔥 6. HYBRID → MERGE BOTH
            // =========================
            else if (isHybrid) {
                const ocrText = await runOCR(page);

                finalPageText = mergeHybrid(textLayer, ocrText);
            }

            fullText += finalPageText + "\n\n";
        }

        return cleanFinal(fullText);
    }
    // ✅ DOCX
    if (ext === "docx") {
        // const result = await mammoth.extractRawText({
        //     buffer: file.buffer
        // });
        // return console.log(result.value);
        const result = await mammoth.convertToHtml({ buffer: file.buffer });
        let html = result.value;

        // =========================
        // 🔥 2. PRESERVE TABLE STRUCTURE
        // =========================
        html = html
            .replace(/<\/tr>/g, "\n")
            .replace(/<\/td>/g, " ")
            .replace(/<\/th>/g, " ")
            .replace(/<\/p>/g, "\n");

        // remove tags
        let text = html.replace(/<[^>]+>/g, "");

        // clean spacing
        text = text
            .replace(/\r/g, "")
            .replace(/ {2,}/g, " ")
            .replace(/\n+/g, "\n")
            .trim();

        // =========================
        // 🔥 3. IMAGE OCR (SAFE)
        // =========================
        const zip = await JSZip.loadAsync(file.buffer);
        const imageTexts = [];

        for (const fileName of Object.keys(zip.files)) {
            if (fileName.startsWith("word/media/")) {
                const imageBuffer = await zip.files[fileName].async("nodebuffer");

                const { data } = await Tesseract.recognize(imageBuffer, "eng+tam");
                const cleaned = data.text.replace(/[^a-zA-Z0-9:/.,()%\- ]/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();

                if (cleaned.length > 5) {
                    imageTexts.push(cleaned);
                }
            }
        }

        // =========================
        // 🔥 4. MERGE TEXT + OCR
        // =========================
        let combined = text;

        if (imageTexts.length > 0) {
            combined += "\n\n[Extracted from images]\n" + imageTexts.join("\n");
        }

        // =========================
        // 🔥 5. SAFE LINE MERGING (FIXED)
        // =========================
        const lines = combined.split("\n").map(l => l.trim())
            .filter(l => l.length > 0);
        const finalLines = [];

        for (let i = 0; i < lines.length; i++) {
            const current = lines[i].trim();
            const next = lines[i + 1]?.trim();

            // 🔥 safer merging (no data loss)
            if (
                next &&
                current.length <= 3 &&
                !/\d/.test(current) &&
                /\d/.test(next)
            ) {
                finalLines.push(current + " " + next);
                i++;
            } else {
                finalLines.push(current);
            }
        }

        let finalText = finalLines.join("\n");

        finalText = finalText
            .replace(/[^\x00-\x7F]/g, " ")
            .replace(/\s+/g, " ")
            .replace(/\n+/g, "\n")
            .trim();

        return finalText;




    }

    // ✅ TXT
    if (ext === "txt") {
        return file.buffer.toString("utf-8");
    }
    if (["png", "jpg", "jpeg"].includes(ext)) {
        const { data } = await Tesseract.recognize(file.buffer, "eng");
        return data.text;
    }

    // ❌ unsupported
    throw new Error("Unsupported file type");
}







// ---------------- CHUNKING ----------------

// function chunkText(text, maxChars = 500, overlapSentences = 1) {
//     if (!text || !text.trim()) return [];

//     const clean = text
//         .replace(/\r/g, "")
//         .replace(/[ \t]+/g, " ")
//         .trim();

//     const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];

//     const chunks = [];
//     let currentChunk = [];

//     for (let i = 0; i < sentences.length; i++) {
//         const sentence = sentences[i];
//         const combined = [...currentChunk, sentence].join(" ");

//         if (combined.length <= maxChars) {
//             currentChunk.push(sentence);
//         } else {
//             chunks.push(currentChunk.join(" ").trim());

//             // 🔥 overlap by last N sentences
//             currentChunk = currentChunk.slice(-overlapSentences);
//             currentChunk.push(sentence);
//         }
//     }

//     if (currentChunk.length > 0) {
//         chunks.push(currentChunk.join(" ").trim());
//     }

//     return chunks;
// }

function normalizeStructuredData(text) {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const result = [];

    for (let i = 0; i < lines.length - 1; i++) {
        if (!isNaN(lines[i + 1])) {
            result.push(`${lines[i]}: ${lines[i + 1]}`);
            i++;
        } else {
            result.push(lines[i]);
        }
    }

    return result.join("\n");
}

function chunkText(text, maxChars = 600, overlapSentences = 1) {
    if (!text) return [];

    const clean = text.replace(/\s+/g, " ").trim();

    const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];

    const chunks = [];
    let currentChunk = [];

    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];

        const combined = [...currentChunk, sentence].join(" ");

        if (combined.length <= maxChars) {
            currentChunk.push(sentence);
        } else {
            chunks.push(currentChunk.join(" ").trim());

            // ✅ overlap by sentence (SAFE)
            currentChunk = currentChunk.slice(-overlapSentences);
            currentChunk.push(sentence);
        }
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(" ").trim());
    }

    return chunks;
}
async function embedText(text) {
    if (!text || !text.trim()) return null;

    const normalized = text.replace(/\s+/g, " ").trim();

    const safeText = normalized.length > 3000
        ? normalized.slice(0, 3000) + "..."
        : normalized;



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

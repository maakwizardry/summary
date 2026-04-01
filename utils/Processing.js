const pdf = require("pdf-parse");
const mammoth = require("mammoth");
// ✅ PDF processing (layout-aware)
const JSZip = require("jszip");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf");

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
            data: new Uint8Array(file.buffer)
        });

        const pdf = await loadingTask.promise;
        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            // =========================
            // 🔥 1. GROUP BY ROW (SMART)
            // =========================
            const rows = [];

            textContent.items.forEach(item => {
                const y = item.transform[5];
                const x = item.transform[4];

                // tolerance-based grouping (IMPORTANT)
                let row = rows.find(r => Math.abs(r.y - y) < 6);

                if (!row) {
                    row = { y, items: [] };
                    rows.push(row);
                }

                row.items.push({ text: item.str, x });
            });

            // =========================
            // 🔥 2. SORT + BUILD LINES
            // =========================
            const sortedRows = rows
                .sort((a, b) => b.y - a.y)
                .map(row => {
                    const items = row.items.sort((a, b) => a.x - b.x);

                    let line = "";
                    let lastX = 0;

                    items.forEach(item => {
                        const gap = item.x - lastX;

                        // preserve spacing (IMPORTANT)
                        if (gap > 50) line += "    ";
                        else line += " ";

                        line += item.text;
                        lastX = item.x;
                    });

                    return line.trim();
                });

            // =========================
            // 🔥 3. MERGE SPLIT ROWS
            // =========================
            const mergedRows = [];

            for (let i = 0; i < sortedRows.length; i++) {
                const current = sortedRows[i];
                const next = sortedRows[i + 1];

                // short line → likely label → merge
                if (next && current.split(" ").length <= 2) {
                    mergedRows.push(current + " " + next);
                    i++; // skip next
                } else {
                    mergedRows.push(current);
                }
            }

            let pageText = mergedRows.join("\n");

            fullText += pageText + "\n";

            // =========================
            // 🔥 4. OCR FALLBACK
            // =========================
            if (pageText.trim().length < 50) {
                const viewport = page.getViewport({ scale: 2 });

                const canvas = createCanvas(viewport.width, viewport.height);
                const context = canvas.getContext("2d");

                await page.render({
                    canvasContext: context,
                    viewport
                }).promise;

                const imageBuffer = canvas.toBuffer();

                const { data } = await Tesseract.recognize(imageBuffer, "eng");

                fullText += data.text + "\n";
            }
        }

        console.log(fullText)
        return fullText; // ✅ FINAL OUTPUT
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
            .replace(/<\/td>/g, "    ")   // spacing like PDF columns
            .replace(/<\/th>/g, "    ")
            .replace(/<\/p>/g, "\n");

        // remove tags
        let text = html.replace(/<[^>]+>/g, "");

        // clean spacing
        text = text
            .replace(/\r/g, "")
            .replace(/ {2,}/g, "    ")
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

                const { data } = await Tesseract.recognize(imageBuffer, "eng");

                if (data.text.trim().length > 5) {
                    imageTexts.push(data.text.trim());
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
        const lines = combined.split("\n");
        const finalLines = [];

        for (let i = 0; i < lines.length; i++) {
            const current = lines[i].trim();
            const next = lines[i + 1]?.trim();

            // 🔥 safer merging (no data loss)
            if (
                next &&
                current.length <= 2 &&
                !/\d/.test(current) &&
                /\d/.test(next)
            ) {
                finalLines.push(current + " " + next);
                i++;
            } else {
                finalLines.push(current);
            }
        }

        return finalLines.join("\n");



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

function chunkText(text, maxChars = 500) {

    const lines = text
        .replace(/\r/g, "")
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean);

    const chunks = [];
    let current = "";

    for (const line of lines) {
        if ((current + " " + line).length <= maxChars) {
            current += " " + line;
        } else {
            chunks.push(current.trim());
            current = line;
        }
    }

    if (current) chunks.push(current.trim());

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

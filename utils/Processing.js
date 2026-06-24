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
const fs = require('fs');
async function extractText(file) {
    if (!file.buffer && file.path) {
        file.buffer = fs.readFileSync(file.path);
    }
    const ext = file.originalname.split(".").pop().toLowerCase();

    // =========================
    // ✅ PDF (LLM OPTIMIZED)
    // =========================
    if (ext === "pdf") {
        const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(file.buffer),
            useSystemFonts: true,
        });

        const pdf = await loadingTask.promise;
        let finalText = [];
        let ocrPages = 0;

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            try {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                const items = textContent.items;

                // =========================
                // 🔥 GROUP BY LINES (KEY FIX)
                // =========================
                const lines = {};

                items.forEach(item => {
                    const y = Math.round(item.transform[5]);
                    if (!lines[y]) lines[y] = [];
                    lines[y].push(item);
                });

                const sortedLines = Object.keys(lines)
                    .map(y => ({
                        y: Number(y),
                        items: lines[y].sort((a, b) => a.transform[4] - b.transform[4])
                    }))
                    .sort((a, b) => b.y - a.y);

                // =========================
                // 🔥 BUILD LLM-FRIENDLY TEXT
                // =========================
                let structuredLines = [];

                for (const line of sortedLines) {
                    const words = line.items.map(i => i.str.trim()).filter(Boolean);

                    if (words.length === 0) continue;

                    // Label: Value detection
                    if (words.length === 2 && !isNaN(words[1])) {
                        structuredLines.push(`${words[0]}: ${words[1]}`);
                    }
                    else if (words.length > 2) {
                        const last = words[words.length - 1];

                        if (!isNaN(last)) {
                            const label = words.slice(0, -1).join(" ");
                            structuredLines.push(`${label}: ${last}`);
                        } else {
                            structuredLines.push(words.join(" "));
                        }
                    }
                    else {
                        structuredLines.push(words.join(" "));
                    }
                }

                let pageText = structuredLines.join("\n");

                // =========================
                // 🔍 OCR (ONLY IF NEEDED)
                // =========================
                const isTextPoor = items.length < 10;

                if (isTextPoor) {
                    ocrPages++;
                    const viewport = page.getViewport({ scale: 2 });

                    const canvas = createCanvas(viewport.width, viewport.height);
                    const ctx = canvas.getContext("2d");

                    await page.render({
                        canvasContext: ctx,
                        viewport
                    }).promise;

                    const buffer = canvas.toBuffer("image/png");

                    const { data } = await Tesseract.recognize(buffer, "eng");

                    const ocrText = data.text.replace(/\s+/g, " ").trim();

                    if (!pageText) {
                        pageText = ocrText;
                    } else {
                        if (!ocrText.toLowerCase().includes(pageText.slice(0, 50).toLowerCase())) {
                            pageText += "\n" + ocrText;
                        }
                    }
                }

                finalText.push(pageText);

            } catch (err) {
                console.error(`Page ${pageNum} failed`, err);
            }
        }


        return cleanForLLM(finalText.join("\n\n"));
    }

    // =========================
    // ✅ DOCX
    // =========================
    if (ext === "docx") {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        let text = result.value;

        const zip = await JSZip.loadAsync(file.buffer);
        const imageTexts = [];

        for (const fileName of Object.keys(zip.files)) {
            if (fileName.startsWith("word/media/")) {
                const imageBuffer = await zip.files[fileName].async("nodebuffer");

                const { data } = await Tesseract.recognize(imageBuffer, "eng");

                const cleaned = data.text.replace(/\s+/g, " ").trim();

                if (cleaned.length > 5) {
                    imageTexts.push(cleaned);
                }
            }
        }

        if (imageTexts.length > 0) {
            text += "\n\n" + imageTexts.join("\n");
        }

        return cleanAndStructureForLLM(text);
    }

    // =========================
    // ✅ TXT
    // =========================
    if (ext === "txt") {
        return file.buffer.toString("utf-8");
    }

    if (["png", "jpg", "jpeg"].includes(ext)) {

        // Upscale + OCR friendly preprocessing
        const optimized = await sharp(file.buffer)
            .grayscale()
            .normalize()
            .sharpen()
            .resize({
                width: 3500,
                withoutEnlargement: false
            })
            .png()
            .toBuffer();

        const { data } = await Tesseract.recognize(
            optimized,
            "eng",
            {
                logger: () => { },
                tessedit_pageseg_mode: 11, // Sparse text mode
                preserve_interword_spaces: "1"
            }
        );

        // Extract individual words instead of relying only on data.text
        const words = (data.words || [])
            .filter(word =>
                word.text &&
                word.text.trim().length > 0 &&
                word.confidence > 30
            )
            .map(word => word.text.trim());

        let text = words.join(" ");

        // Fallback if words extraction fails
        if (text.length < 100) {
            text = data.text;
        }

        // Cleanup
        text = text
            .replace(/\s+/g, " ")
            .replace(/[^\S\r\n]+/g, " ")
            .trim();

        return cleanForLLM(text);
    }
    throw new Error("Unsupported file type");
}

function cleanForLLM(text) {
    return text
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{2,}/g, "\n")
        .trim();
}

function cleanAndStructureForLLM(text) {
    const lines = text
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean);

    const result = [];

    for (let i = 0; i < lines.length; i++) {
        const words = lines[i].split(" ").filter(Boolean);

        if (words.length === 0) continue;

        // Case 1: Subject Value
        if (words.length === 2 && !isNaN(words[1])) {
            result.push(`${words[0]}: ${words[1]}`);
        }

        // Case 2: Multiple subjects + values (danger case)
        else if (words.length > 2) {
            const nums = words.filter(w => !isNaN(w));
            const texts = words.filter(w => isNaN(w));

            if (nums.length === texts.length && nums.length > 0) {
                for (let j = 0; j < nums.length; j++) {
                    result.push(`${texts[j]}: ${nums[j]}`);
                }
            } else {
                result.push(words.join(" "));
            }
        }

        else {
            result.push(words.join(" "));
        }
    }

    return result.join("\n");
}
// function chunkText(text, chunkSize = 1000, overlap = 200) {

//     if (!text) return [];

//     const chunks = [];

//     let start = 0;

//     while (start < text.length) {

//         chunks.push(
//             text.slice(start, start + chunkSize)
//         );

//         start += (chunkSize - overlap);
//     }

//     return chunks;
// }

function chunkText(text, maxSize = 2000) {
    const paragraphs = text
        .split(/\n\s*\n/)
        .filter(Boolean);

    // console.log(paragraphs);

    const chunks = [];

    let current = "";

    for (const p of paragraphs) {

        // cosnole.log(current + "\n");

        if ((current + "\n\n" + p).length > maxSize) {


            chunks.push(current);

            current = p;

        } else {

            current += (current ? "\n\n" : "") + p;
        }
    }

    if (current) {
        chunks.push(current);
    }

    return chunks;
}



module.exports = { extractText, chunkText };

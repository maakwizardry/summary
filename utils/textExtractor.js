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

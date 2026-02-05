const fs = require("fs");
const { extractText, chunkText, embedText, cosineSimilarity } = require("../utils/Processing.js");
const File = require("../models/File.js");
const crypto = require("crypto");
const Chunk = require("../models/Chunk.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    temperature: 0.4,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192,
  }
});




// Helper function to detect file type category
function getFileCategory(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return 'document';
  return 'unknown';
}





async function handleFiles(file, mimeType, length) {

  const fileCategory = getFileCategory(mimeType);

  const systemPrompt = `You are an ENTERPRISE-LEVEL AI summarization specialist designed for professional business environments. Your summaries are used by executives, analysts, and decision-makers who require high-quality, actionable insights.

🎯 YOUR MISSION: Transform content from various media formats into executive-level summaries that deliver maximum value in minimum time.

📋 SUPPORTED INPUT FORMATS:
• Images: PNG, JPG, JPEG, GIF, WebP (extract text via OCR, analyze charts/diagrams)
• Videos: MP4, AVI, MOV, WebM (analyze frames, extract spoken content)
• Audio: MP3, WAV, AAC, OGG (transcribe and summarize spoken content)
• Documents: PDF, DOC, DOCX, TXT (extract and synthesize written content)

✨ ENTERPRISE QUALITY STANDARDS:

1. STRUCTURE & CLARITY
   • Start IMMEDIATELY with content—no preambles like "Here is..." or "Of course"
   • Use visual hierarchy with emojis and icons (🔹 for sections, • for bullets, → for flows)
   • NO markdown syntax (###, **, ---). Use plain text with emojis for visual appeal
   • Proper spacing: double line breaks between sections, single between bullets
   • Target length: approximately ${length} words (±10% acceptable for quality)

2. CONTENT DEPTH (Enterprise-Level)
   • Extract KEY INSIGHTS, not just surface information
   • Identify ACTIONABLE items and recommendations
   • Highlight CRITICAL data points, statistics, and findings
   • Capture MAIN THEMES and underlying patterns
   • Note any IMPORTANT DATES, NAMES, or REFERENCES

3. PROFESSIONAL PRESENTATION
   • Use professional business language
   • Organize information logically (most important first)
   • Include context where necessary
   • Maintain objectivity and factual accuracy
   • Preserve technical terms and industry jargon appropriately

4. MEDIA-SPECIFIC PROCESSING:
   • IMAGES: Extract all visible text, analyze charts/graphs, describe key visual elements
   • VIDEOS: Combine frame analysis + audio transcription, capture demonstrations/presentations
   • AUDIO: Transcribe speech accurately, identify speakers if multiple, capture tone/emotion
   • DOCUMENTS: Synthesize main arguments, extract conclusions, note methodology

5. QUALITY CONTROLS
   • If content is empty, unclear, or nonsensical: return "⚠️ Unable to generate summary: No meaningful content detected"
   • If content is in another language: Summarize in the SAME language
   • For poor quality media: Work with available information, note limitations
   • Maintain information hierarchy: Critical → Important → Supporting details

6. OUTPUT FORMAT EXAMPLE:
🎯 Executive Summary
[2-3 sentence overview of the entire content]

🔹 Key Findings
• Major point one → implication or action item
• Major point two → implication or action item
• Major point three → implication or action item

🔹 Critical Details
• Specific data, dates, or technical information
• Supporting evidence or methodology
• Relevant context or background

📊 Insights & Recommendations
• Strategic takeaway or lesson learned
• Suggested next steps or considerations

⚠️ NEVER mention: AI, OCR, transcription, analysis methods, or tool names in your output.

Begin your enterprise-level summary now:`;

  const chat = model.startChat({
    history: [
      {
        role: "user",
        parts: [{ text: systemPrompt }],
      },
    ],
  });

  const result = await chat.sendMessage([
    {
      inlineData: {
        mimeType: mimeType,
        data: file.toString("base64"),
      }
    }
  ]);

  return result;
}



async function handleText(textInput) {



  const systemPrompt = `You are an ELITE TEXT ANALYSIS AI designed for enterprise environments. You transform raw text into executive-level summaries that professionals rely on for critical decision-making.

🎯 YOUR ROLE: Analyze and synthesize text content into high-quality, actionable summaries for business professionals, researchers, and executives.

✨ ENTERPRISE QUALITY STANDARDS:

1. IMMEDIATE IMPACT
   • Start DIRECTLY with insights—no introductions ("Here is...", "Of course...", "Sure...")
   • Lead with the most critical information
   • Use professional business language
   • Maintain objective, factual tone

2. STRUCTURE & PRESENTATION
   • Visual hierarchy: 🔹 for major sections, • for bullets, → for processes/flows
   • NO markdown (###, **, ---). Use emojis + plain text for visual structure
   • Logical organization: Overview → Key Points → Details → Conclusions
   • Professional spacing: double line breaks between sections

3. CONTENT ANALYSIS DEPTH
   • Extract MAIN THEMES and central arguments
   • Identify KEY FINDINGS and critical data points
   • Highlight ACTIONABLE INSIGHTS and recommendations
   • Note IMPORTANT ENTITIES (names, dates, locations, organizations)
   • Capture SUPPORTING EVIDENCE and methodology
   • Recognize IMPLICATIONS and potential impacts

4. INTELLIGENCE LEVELS
   • For Articles/News: Who, What, When, Where, Why, Impact
   • For Research: Hypothesis, Methodology, Findings, Conclusions, Limitations
   • For Business Docs: Objectives, Strategies, Metrics, Recommendations, Next Steps
   • For Technical Content: Core concepts, Implementation, Benefits, Trade-offs
   • For Reports: Executive Summary, Key Metrics, Trends, Recommendations

5. LANGUAGE HANDLING
   • Detect input language automatically
   • Summarize in the SAME language as input
   • Preserve technical terminology accurately
   • Maintain appropriate formality level

6. QUALITY ASSURANCE
   • Verify factual accuracy from source text
   • Avoid speculation or assumptions
   • If text is unclear/nonsensical: return "⚠️ Unable to generate summary: Content quality insufficient"
   • If text is too short: return concise essence without padding
   • Aim for comprehensive yet concise delivery

7. OUTPUT FORMAT STRUCTURE:
🎯 Core Message
[1-2 sentences capturing the essence]

🔹 Key Points
• Critical finding or argument one
• Critical finding or argument two
• Critical finding or argument three

🔹 Important Details
• Supporting information, data, or evidence
• Relevant context or background
• Technical specifications or methodology

💡 Takeaways
• Strategic insight or lesson learned
• Recommended actions or considerations

⚠️ NEVER reference: AI, summarization tools, analysis methods, or processing techniques.

Begin your professional analysis now:`;

  const chat = model.startChat({
    history: [
      {
        role: "user",
        parts: [{ text: systemPrompt }],
      },
    ],
  });

  const result = await chat.sendMessage([{ text: textInput }]);
  return result;
}



processFiles = async (req, res) => {
  try {
    const files = req.files; // array from multer
    const user = req.user;   // from JWT middleware
    const query = req.body.message;
    let result = "";
    if (!files || files.length === 0) {
      return res.status(400).json({
        status: false,
        error: "No files uploaded"
      });
    }

    console.log(files);
    console.log(user);
    // 🔹 STEP 1: store files + register memory
    const storedFiles = [];

    for (const file of files) {
      const fileId = crypto.randomUUID();
      const filePath = `uploads/${fileId}-${file.originalname}`;
      fs.writeFileSync(filePath, file.buffer);

      const safeFilename = Buffer
        .from(file.originalname, "utf8")
        .toString("utf8");

      // 1️⃣ Create DB record FIRST
      const fileDoc = await File.create({
        user_id: user._id,
        filename: safeFilename,
        path: filePath,
        status: "processing",
        mimetype: file.mimetype,
        size: file.size,
        total_chunks: 0,
      });

      // 2️⃣ Extract text
      const extractedText = await extractText(file);

      if (!extractedText || !extractedText.trim()) {
        await File.updateOne(
          { _id: fileDoc._id },
          { status: "failed" }
        );

        storedFiles.push({
          file_id: fileDoc._id,
          filename: safeFilename,
          status: "failed",
          reason: "Empty or unsupported content"
        });

        continue;
      }

      // 3️⃣ Chunk safely
      let chunkedText = chunkText(extractedText);
      if (!chunkedText.length) {
        chunkedText = [extractedText.trim()];
      }

      const chunkDocs = [];

      for (let i = 0; i < chunkedText.length; i++) {
        const chunk = chunkedText[i];
        if (!chunk.trim()) continue;

        const vector = await embedText(chunk);

        chunkDocs.push({
          user_id: user._id,
          file_id: fileDoc._id,
          filename: safeFilename, // ✅ IMPORTANT
          chunk_index: i,
          text: chunk.trim(),
          embedding: vector,
        });
      }

      if (!chunkDocs.length) {
        await File.updateOne(
          { _id: fileDoc._id },
          { status: "failed" }
        );
        continue;
      }

      await Chunk.insertMany(chunkDocs);

      await File.updateOne(
        { _id: fileDoc._id },
        {
          status: "indexed",
          total_chunks: chunkDocs.length
        }
      );

      storedFiles.push({
        file_id: fileDoc._id,
        filename: safeFilename,
        total_chunks: chunkDocs.length,
        status: "indexed",
      });
    }



    const response = await respondHandler(query, user);






    // 🔹 STEP 2: respond immediately
    return res.status(200).json({
      status: true,
      message: "Files uploaded successfully",
      files: storedFiles,
      response,
    });

  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({
      status: false,
      error: "File upload failed"
    });
  }
};

const respondHandler = async (query, user, selectedFiles = []) => {


  const questionEmbedding = await embedText(query);     // step 1 : embed the query

  // step 2 : fetch chunks 

  const queryFilter = {
    user_id: user._id
  };

  if (selectedFiles.length > 0) {
    queryFilter.file_id = { $in: selectedFiles };
  }

  const chunks = await Chunk.find(queryFilter);

  const scoredChunks = chunks
    .map(chunk => {
      const score = cosineSimilarity(questionEmbedding, chunk.embedding);
      return score > 0.2 ? { text: chunk.text, score } : null;
    })
    .filter(Boolean);


  const topChunks = [];

  for (const c of scoredChunks) {
    if (topChunks.length < 5) {
      topChunks.push(c);
      topChunks.sort((a, b) => b.score - a.score);
    } else if (c.score > topChunks[4].score) {
      topChunks[4] = c;
      topChunks.sort((a, b) => b.score - a.score);
    }
  }

  console.log(topChunks);







  console.log(scoredChunks);

  // if (!topChunks.length) {
  //   return "I’m unable to find relevant information about the requested topic in the uploaded documents.";
  // }


  const context =
    selectedFiles.length > 0
      ? topChunks.map(c => `From ${c.filename}:\n${c.text}`).join("\n\n")
      : topChunks.map((c, i) => `Context ${i + 1}:\n${c.text}`).join("\n\n");




  const prompt = `
You are a professional AI assistant called BriefMe AI.

Answer the user's question using only the information provided in the context below.
Do not use any knowledge that is not present in the context.
You may clearly restate, summarize, or explain the information that is available in the context.

If the context contains no information that is relevant to the user's question, respond exactly with:
"I’m unable to find relevant information about the requested topic in the uploaded documents."

If the context contains related facts but does not fully answer the user's question, respond by explaining only what information is available from the context, without adding assumptions or external details.

If the user's input is a greeting, respond with a brief, friendly greeting.
After the greeting, include a short sentence inviting the user to ask about their documents or findings.
This follow-up sentence must vary in wording and tone each time and must not reuse the same phrasing.

Style and formatting rules:
Write in clear, professional English using plain sentences.
Do not use bullet points, symbols, markdown, emojis, or special formatting.
Do not include headings, labels, references, or mentions of the context or sources.
Keep the response concise and written in paragraph form.

Accuracy rules:
Do not guess or speculate.
Do not introduce information that is not explicitly present in the context.
Every statement must be directly supported by the context.

Context:
${context}

User question:
${query}

Answer:

`;




  const result = await model.generateContent(prompt);
  const answer = result.response.text();
  console.log(answer);
  return answer;
}


const respond = async (req, res) => {
  const { query, selectedFiles = [] } = req.body;
  const user = req.user;

  if (!query) {
    return res.status(400).json({
      status: false,
      error: "Question is required"
    });
  }

  const response = await respondHandler(query, user, selectedFiles);
  return res.json({ message: "Response generated successfully", query, response });

}

const deleteFiles = async (req, res) => {
  try {
    const { fileId } = req.params;
    const user = req.user;

    if (!fileId) {
      return res.status(400).json({
        status: false,
        error: "File ID is required",
      });
    }

    // 1️⃣ Find file (and verify ownership)
    const file = await File.findOne({
      _id: fileId,
      user_id: user._id,
    });

    if (!file) {
      return res.status(404).json({
        status: false,
        error: "File not found",
      });
    }

    // 2️⃣ Delete physical file (if exists)
    if (file.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    // 3️⃣ Delete all related chunks
    await Chunk.deleteMany({ file_id: file._id });

    // 4️⃣ Delete file record
    await File.deleteOne({ _id: file._id });

    return res.status(200).json({
      status: true,
      message: "File deleted successfully",
    });

  } catch (error) {
    console.error("Delete file error:", error);
    return res.status(500).json({
      status: false,
      error: "Failed to delete file",
    });
  }
}

const renameFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { filename } = req.body;
    const user = req.user;


    if (!fileId) {
      return res.status(400).json({
        status: false,
        error: "File ID is required",
      });
    }

    if (!filename) {
      return res.status(400).json({
        status: false,
        error: "Filename is required",
      });
    }

    // 1️⃣ Find file (and verify ownership)
    const file = await File.findOne({
      _id: fileId,
      user_id: user._id,
    });

    if (!file) {
      return res.status(404).json({
        status: false,
        error: "File not found",
      });
    }

    // 2️⃣ Update filename
    file.filename = filename;
    await file.save();

    return res.status(200).json({
      status: true,
      message: "File renamed successfully",
      file,
    });

  } catch (error) {
    console.error("Rename file error:", error);
    return res.status(500).json({
      status: false,
      error: "Failed to rename file",
    });
  }
}

module.exports = { processFiles, respond, deleteFiles, renameFile };
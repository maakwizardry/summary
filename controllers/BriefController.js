const fs = require("fs");
const { extractText, chunkText, embedText, cosineSimilarity } = require("../utils/Processing.js");
const File = require("../models/File.js");
const crypto = require("crypto");
const Chunk = require("../models/Chunk.js");
const cloudinary = require("cloudinary").v2;
const { GoogleGenerativeAI } = require("@google/generative-ai");
const streamifier = require("streamifier");


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    temperature: 0.4,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 2200,
  }
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});



// Helper function to detect file type category
function getFileCategory(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return 'document';
  return 'unknown';
}


function uploadToCloudinary(buffer, filename) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "briefme-documents",
        resource_type: "raw", // IMPORTANT for PDFs/DOCX
        public_id: filename.replace(/\.[^/.]+$/, ""), // remove extension
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });
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
      let cloudResult;

      try {
        cloudResult = await uploadToCloudinary(
          file.buffer,
          file.originalname
        );
      } catch (err) {
        console.error("Cloudinary upload failed:", err);

        storedFiles.push({
          filename: file.originalname,
          status: "failed",
          reason: "Cloud upload failed"
        });

        continue; // ⬅️ IMPORTANT: skip this file
      }


      console.log(cloudResult);

      const safeFilename = Buffer
        .from(file.originalname, "utf8")
        .toString("utf8");

      // 1️⃣ Create DB record FIRST
      const fileDoc = await File.create({
        user_id: user._id,
        filename: safeFilename,
        cloudinary_url: cloudResult.secure_url,
        cloudinary_id: cloudResult.public_id,
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

    // 🔹 STEP 2: respond immediately
    return res.status(200).json({
      status: true,
      message: "Files uploaded successfully",
      files: storedFiles,
    });

  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({
      status: false,
      error: "File upload failed"
    });
  }
};


function normalizeQuery(q) {
  return q.toLowerCase().trim();
}

function normalize(vec) {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm === 0 ? vec : vec.map(v => v / norm);
}


function extractFileRefs(query) {
  const regex = /@([\w\-_.]+?\.(pdf|docx|txt))/gi;
  return [...query.matchAll(regex)].map(m => m[1]);
}





const respondHandler = async (query, user, selectedFiles = []) => {


  console.log("iam response handler")

  // step 1  : intend detection 

  // return console.log(user);



  const questionEmbedding = await embedText(query);     // step 1 : embed the query


  // step 2 : fetch chunks 

  const queryFilter = {
    user_id: user._id
  };

  // return console.log(queryFilter);
  filename = "";

  if (selectedFiles.length > 0) {
    queryFilter.file_id = { $in: selectedFiles };
  }

  const chunks = await Chunk.find(queryFilter);
  if (chunks) {
    const file_id = chunks[0].file_id;
    const file = await File.findById(file_id);
    filename = file.filename;
  }



  const MIN_SCORE = 0.25;

  const scoredChunks = await Promise.all(
    chunks.map(async (chunk) => {
      const score = cosineSimilarity(questionEmbedding, chunk.embedding);

      if (score < MIN_SCORE) return null;

      const file = await File.findById(chunk.file_id).select("filename");

      return {
        text: chunk.text,
        score,
        filename: file?.filename || "Unknown file",
      };
    })
  );

  const filteredResults = scoredChunks.filter(Boolean);






  const topChunks = [];

  for (const c of scoredChunks) {
    if (topChunks.length < 5) {
      topChunks.push(c);
      topChunks.sort((a, b) => b.score - a.score);
    } else if (c.score > topChunks[4].score) {
      topChunks[4] = c;   // ✅ replace the WORST chunk
      topChunks.sort((a, b) => b.score - a.score);
    }
  }





  // return console.log(topChunks)





  console.log(scoredChunks);

  // if (!topChunks.length) {
  //   return "I’m unable to find relevant information about the requested topic in the uploaded documents.";
  // }


  const context =
    selectedFiles.length > 0
      ? topChunks.map(c => `context ${i + 1}:\n${c.text}`).join("\n\n")
      : topChunks.map((c, i) => `Context ${i + 1}:\n${c.text}`).join("\n\n");




  const prompt = `
You are a professional AI assistant called BriefMe AI.

Your task is to answer the user's question using ONLY the information provided in the context.

Interpret the user's question by meaning, not exact wording.
If different words or phrases clearly refer to the same concept or role described in the context,
treat them as equivalent.
Rewrite the user query to include equivalent phrases
that may appear in formal documents.

Do not change intent.
Do not add new meaning.

Examples (do not mention these in the answer):
- creator, builder, author, developer → same role if context supports it
- app, system, project → same entity if context defines one clearly

Rules:
- Do NOT use external knowledge
- Do NOT invent facts
- Do NOT guess missing information
- Only answer if the context reasonably supports the user's intent

If the context does NOT support the user's intent by meaning, respond EXACTLY with:
"I’m unable to find relevant information about the requested topic in the uploaded documents."

If the context partially answers the question:
- Answer only with what is supported
- Do not fill gaps or assume details

Style rules:
- Clear, professional English
- Single paragraph
- No bullets, markdown, emojis, headings, or source mentions

Accuracy rules:
- Every fact must be grounded in the context
- No speculation

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


async function fetchFileChunks(fileId, userId) {
  return await Chunk.find({
    file_id: fileId,
    user_id: userId
  }).sort({ chunk_index: 1 }).limit(12);
}




async function summarizeChunkBatch(text) {
  const prompt = `
Summarize the following content clearly and factually.
Do not add new information.
Do not infer or analyze.
Preserve numbers, facts, and statements exactly as written.

Content:
${text}

Summary:
`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}



function batchChunks(chunks, batchSize = 5) {
  const batches = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    batches.push(chunks.slice(i, i + batchSize));
  }
  return batches;
}


// async function safeGenerate(prompt, retries = 3) {
//   try {
//     return await model.generateContent(prompt);
//   } catch (err) {
//     if (err.message.includes("429") && retries > 0) {
//       await new Promise(r => setTimeout(r, 60000));
//       return safeGenerate(prompt, retries - 1);
//     }
//     throw err;
//   }
// }


// main function 1 

async function summarizeFilesByIds(fileIds, user) {
  if (!fileIds.length) {
    return "Please select a document using @filename.";
  }


  let allMiniSummaries = [];

  for (const fileId of fileIds) {
    const file = await File.findOne({
      _id: fileId,
      user_id: user._id
    });

    if (!file) continue;

    const chunks = await Chunk.find({
      file_id: file._id,
      user_id: user._id
    }).sort({ chunk_index: 1 });

    if (!chunks.length) continue;

    const batches = batchChunks(chunks, 5);

    for (const batch of batches) {
      const text = batch.map(c => c.text).join("\n");
      const mini = await summarizeChunkBatch(text);
      allMiniSummaries.push(mini);
    }
  }

  if (!allMiniSummaries.length) {
    return "Unable to generate summary from the selected document.";
  }

  const finalPrompt = `
Combine the following summaries into a final clear summary.
Do not add new information.

${allMiniSummaries.join("\n\n")}
`;

  const result = await model.safeGenerate(finalPrompt);
  return result.response.text();
}


async function summarizeFiles(fileNames, user) {
  const files = await File.find({
    user_id: user._id,
    filename: { $in: fileNames }
  });

  if (!files.length) {
    return "I’m unable to find the requested file in your uploaded documents.";
  }

  let combinedText = "";

  for (const file of files) {
    const chunks = await fetchFileChunks(file._id, user._id);

    for (const chunk of chunks) {
      combinedText += chunk.text + "\n\n";
    }
  }

  // 🔥 SAFETY CHECK
  if (!combinedText.trim()) {
    return "No meaningful content found in the document.";
  }

  const prompt = `
Summarize the following document clearly and accurately.

Rules:
- Do not add new information
- Do not assume anything
- Keep it concise but complete
- Preserve facts, numbers, and intent

Document content:
${combinedText}

Summary:
`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function summarizeFilesByNames(query, fileId, user) {





  console.log(user);
  // return console.log(fileNames);
  const files = await File.find({
    user_id: user._id,
    _id: { $in: fileId }
  });
  // return console.log(files);

  if (!files.length) {
    return "I’m unable to find the requested file in your uploaded documents.";
  }

  let combinedText = "";

  for (const file of files) {
    combinedText += `Document Name: ${file.filename}\n`;

    const chunks = await Chunk.find({
      file_id: file._id,
      user_id: user._id
    })
      .sort({ chunk_index: 1 })
      .limit(6);

    for (const chunk of chunks) {
      combinedText += chunk.text + "\n";
    }

    combinedText += "\n\n"; // separate documents
  }


  if (!combinedText.trim()) {
    return "No meaningful content found in the document.";
  }
  const prompt = `
You are BriefMe AI, a professional document analysis assistant.

You are given document content extracted from user-uploaded files.
Each document is clearly labeled with its filename.
if the user ask for comparisn show clearly by comparing , if the user ask for summary show clearly the summary based on user query .

You MUST follow the output structure EXACTLY.
Do not use markdown or special formatting.

ALLOWED FORMATTING:
- Plain text
- Paragraphs
- Bullet points alone
- Line breaks

OUTPUT STRUCTURE (repeat for EACH document):

File: <filename>

Summary:
Write a clear paragraph summarizing the document.

Key Points:
• List the most important ideas or findings and make bold for those words which is important so that user can catch attention
• Keep points concise and factual
• Do not repeat sentences from the summary

Important Details:
• Mention technical, architectural, or factual details if present
• Preserve names, technologies, and processes
• Do not invent information
no mark downs , no emoji no other signs !! ( should not use ** , * )

You can ask questions like:
• Suggest relevant questions the user can ask based on this document
• Questions must be answerable from the document content
• Do not suggest generic questions

RULES:
- Do NOT use markdown (no ###, **, tables, or code blocks)
- Do NOT use emojis or symbols other than •
- Do NOT merge documents unless explicitly asked
- Do NOT add assumptions or external knowledge
- Maintain clean spacing between sections

DOCUMENTS:
${combinedText}

User request:
"${query}"

Answer:
`;



  const result = await model.generateContent(prompt);
  return result.response.text();
}



async function detectIntentWithGemini(query) {
  const prompt = `
Classify the user's intent into ONE of the following labels:

- SUMMARIZE
- QUESTION

Rules:
- If the user provides a filename and asks to summarize and If the user provides filename or user does not want to search for specific topics in the file he just want (summarization, compare , difference or related to this etc much more) for files → SUMMARIZE else QUESTION
- Output ONLY the intent label

User input:
"${query}"

Intent:
`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}





const respond = async (req, res) => {
  const { query, file, selectedFiles = [] } = req.body;


  const user = req.user;
  console.log(selectedFiles);
  if (!query) {
    return res.status(400).json({
      status: false,
      error: "Question is required"
    });
  }

  // 🔥 STEP 0: detect intent FIRST
  const intent = await detectIntentWithGemini(query);
  let response;

  if (
    intent === "SUMMARIZE" &&
    selectedFiles.length === 1   // mentioned files
  ) {
    // Fetch selected file name
    const selectedFile = await File.findOne({
      _id: selectedFiles[0],
      user_id: user._id
    });

    if (
      selectedFile &&
      file.fileId !== selectedFiles[0]
    ) {
      return res.json({
        intent,
        conflict: true,
        response: `I couldn’t find the file "${selectedFile.filename}". Please confirm which file you want to summarize and try selecting it again from the available options.`

      });
    }

    response = await summarizeFilesByNames(query, selectedFiles, user);
  }
  else {
    // QUESTION / EXPLAIN → use embeddings
    response = await respondHandler(query, user, file);
  }

  return res.json({
    intent,
    selectedFiles,
    response
  });
};


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
const fs = require("fs");
const { extractText, chunkText, embedText, cosineSimilarity } = require("../utils/Processing.js");
const File = require("../models/File.js");
const Chunk = require("../models/Chunk.js");
const cloudinary = require("cloudinary").v2;
const { GoogleGenerativeAI } = require("@google/generative-ai");
const streamifier = require("streamifier");
const crypto = require("crypto");

function hashText(text) {
  return crypto
    .createHash("sha256")
    .update(text)
    .digest("hex");
}



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
    const files = req.files;
    const user = req.user;
    const MIN_REQUIRED_CHUNKS = 2;

    if (!files || files.length === 0) {
      return res.status(400).json({
        status: false,
        error: "No files uploaded"
      });
    }

    const storedFiles = [];

    for (const file of files) {
      let cloudResult;

      try {
        // 1️⃣ Upload to Cloudinary
        cloudResult = await uploadToCloudinary(
          file.buffer,
          file.originalname
        );

        // 2️⃣ Create file record (temporary)
        const fileDoc = await File.create({
          user_id: user._id,
          filename: file.originalname,
          cloudinary_url: cloudResult.secure_url,
          cloudinary_id: cloudResult.public_id,
          status: "processing",
          mimetype: file.mimetype,
          size: file.size,
          total_chunks: 0
        });

        // 3️⃣ Extract text
        const extractedText = await extractText(file);

        if (!extractedText || !extractedText.trim()) {
          await cloudinary.uploader.destroy(cloudResult.public_id);
          await File.deleteOne({ _id: fileDoc._id });

          storedFiles.push({
            filename: file.originalname,
            status: "failed",
            reason: "No readable text found"
          });
          continue;
        }

        // 4️⃣ Chunk text
        const chunks = chunkText(extractedText).filter(c => c.trim());
        const chunkDocs = [];

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const hash = hashText(chunk);

          const exists = await Chunk.findOne({
            user_id: user._id,
            chunk_hash: hash
          });

          if (exists) continue;

          const embedding = await embedText(chunk);

          chunkDocs.push({
            user_id: user._id,
            file_id: fileDoc._id,
            filename: file.originalname,
            chunk_index: i,
            text: chunk,
            chunk_hash: hash,
            embedding
          });
        }

        // ❌ STRICT VALIDATION
        if (chunkDocs.length < MIN_REQUIRED_CHUNKS) {
          await cloudinary.uploader.destroy(cloudResult.public_id);
          await File.deleteOne({ _id: fileDoc._id });

          storedFiles.push({
            filename: file.originalname,
            status: "failed",
            reason: "Insufficient content"
          });
          continue;
        }

        // ✅ Store chunks
        await Chunk.insertMany(chunkDocs);

        // ✅ Update file as indexed
        await File.updateOne(
          { _id: fileDoc._id },
          {
            status: "indexed",
            total_chunks: chunkDocs.length
          }
        );

        storedFiles.push({
          file_id: fileDoc._id,
          filename: file.originalname,
          total_chunks: chunkDocs.length,
          status: "indexed"
        });

      } catch (err) {
        console.error("File processing failed:", err);

        if (cloudResult?.public_id) {
          await cloudinary.uploader.destroy(cloudResult.public_id);
        }

        storedFiles.push({
          filename: file.originalname,
          status: "failed",
          reason: "Processing error"
        });
      }
    }

    return res.status(200).json({
      status: true,
      message: "File processing completed",
      files: storedFiles
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
  if (chunks.length > 0) {

  }
  else {
    return "Looks like you have'nt uploaded any files yet, upload files here to create you second brain ready for you !";
  }




  const MIN_SCORE = 0.56;
  const scoredChunks = await Promise.all(
    chunks.map(async (chunk) => {
      const score = cosineSimilarity(questionEmbedding, chunk.embedding);

      if (score < MIN_SCORE) return false;

      const file = await File.findById(chunk.file_id).select("filename");
      console.log("filename : " + file);

      return {
        text: chunk.text,
        score,
        filename: file?.filename || "Unknown file",
      };
    })
  );


  // return console.log(scoredChunks);

  const filteredResults = scoredChunks.filter(Boolean);
  console.log("fILTERED RESULTS : \N");


  if (!filteredResults.length > 0) {
    return "I searched your document memory, but this context doesn’t seem to exist in your saved files yet."
  }






  const topChunks = [];

  for (const c of filteredResults) {
    if (topChunks.length < 5) {
      topChunks.push(c);
      topChunks.sort((a, b) => b.score - a.score);
    } else if (c.score > topChunks[4].score) {
      topChunks[4] = c;   // ✅ replace the WORST chunk
      topChunks.sort((a, b) => b.score - a.score);
    }
  }

  console.log(topChunks);



  // if (!topChunks.length) {
  //   return "I’m unable to find relevant information about the requested topic in the uploaded documents.";
  // }


  const context =
    selectedFiles.length > 0
      ? topChunks.map((c, i) => `filename : ${c?.filename} \n context ${i + 1}:\n${c.text}`).join("\n\n")
      : topChunks.map((c, i) => `filename : ${c?.filename} \n Context ${i + 1}:\n${c.text}`).join("\n\n");

  // return console.log(context);



  const prompt = `
You are a professional AI assistant called BriefMe AI.

BriefMe AI helps users recall and understand information stored in their uploaded documents.
You should respond with confidence and continuity, as a document-based knowledge assistant,
while remaining strictly grounded in the provided context.

Your task is to answer the user's question using ONLY the information provided in the context.

INTENT & LANGUAGE INTERPRETATION RULES:
- Interpret the user's question by meaning, not by exact wording.
- The user may use informal language, spelling mistakes, grammar errors, or shorthand.
- Infer the intended meaning when the question is clear by context.
- If the user asks about a person and an identifying number appears directly alongside the person’s name,
  treat the number as an identifier such as a register number, roll number, or enrollment number,
  if this interpretation is reasonable and consistent with academic or document conventions.
- Do NOT imply personal memory, past conversations, or human experiences.

SEMANTIC PARAPHRASE UNDERSTANDING RULE:
- Treat differently worded sentences with the same meaning as equivalent.
- Examples of equivalent meaning include:
  good, beneficial, helpful, healthy, recommended → positive evaluation
  bad, harmful, unhealthy, not recommended → negative evaluation
- Treat reordered phrases as equivalent:
  eating in the morning ↔ morning eating
  food eaten in the morning ↔ breakfast
- If the context clearly expresses a judgment or statement,
  answer the user even if the wording differs, as long as the meaning is the same.
- This is considered semantic understanding, not inference or guessing.


SEMANTIC MATCHING RULES:
- Treat equivalent academic terms as the same concept when context supports it.
- Examples include:
  register number, roll number, enrollment number, student ID → same concept
- If a student name is immediately followed by an alphanumeric code,
  interpret it as the student’s register number unless contradicted by context.

STRICT GROUNDING RULES:
- Do NOT use external knowledge
- Do NOT invent facts
- Do NOT guess missing information
- Logical interpretation of explicitly written text is allowed
- Do NOT introduce information not present in the context

FAILSAFE RESPONSE:
If the context does NOT support the user's intent by meaning, respond EXACTLY with:
"I’m unable to find relevant information about the requested topic in the uploaded documents."

PARTIAL ANSWER RULE:
- If the context partially answers the question, respond only with the supported information
- Do not fill gaps or infer unstated details beyond logical document conventions

REFERENCE RULES:
- End the answer by naturally mentioning the source filename if available
- Use phrasing such as:
  "This information is based on content from <filename>."
- If no valid filename is available, do not mention references

STYLE RULES:
- Clear, professional English
- Plain paragraphs separated by line breaks
- No bullet points, symbols, markdown, or headings

ACCURACY RULES:
- Every statement must be grounded in the context
- No speculation or overconfidence

Context:
Filename: ${context.filename}
${context}

User question:
${query}

Answer:
`




  const result = await model.generateContent(prompt);
  const answer = result.response.text();
  console.log(answer);
  return answer;
}


// async function fetchFileChunks(fileId, userId) {
//   return await Chunk.find({
//     file_id: fileId,
//     user_id: userId
//   }).sort({ chunk_index: 1 }).limit(12);
// }




// async function summarizeChunkBatch(text) {
//   const prompt = `
// Summarize the following content clearly and factually.
// Do not add new information.
// Do not infer or analyze.
// Preserve numbers, facts, and statements exactly as written.

// Content:
// ${text}

// Summary:
// `;

//   const result = await model.generateContent(prompt);
//   return result.response.text();
// }



// function batchChunks(chunks, batchSize = 5) {
//   const batches = [];
//   for (let i = 0; i < chunks.length; i += batchSize) {
//     batches.push(chunks.slice(i, i + batchSize));
//   }
//   return batches;
// }


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



async function summarizeFilesByNames(query, fileId, user) {





  console.log(user);
  // return console.log(fileNames);
  const files = await File.find({
    user_id: user._id,
    _id: { $in: fileId }
  });
  // return console.log(files);

  if (!files.length) {
    return "Can you please let me know which files you are refering for .";
  }

  let combinedText = "";

  for (const file of files) {
    combinedText += `Document Name or file name : ${file.filename}\n`;
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
    return "No meaningful content found in the document . looks like you have no data";
  }
  const prompt = `

  You are a professional AI assistant called BriefMe AI.

BriefMe AI helps users recall and understand information stored in their uploaded documents.
You should respond with confidence and continuity, as a document-based knowledge assistant,
while remaining strictly grounded in the provided context.

Your task is to answer the user's question using ONLY the information provided in the context .

INTENT & LANGUAGE INTERPRETATION RULES:
- Interpret the user's question by meaning, not by exact wording.
- The user may use informal language, spelling mistakes, grammar errors, or shorthand.
- If the user's wording contains typos or incorrect grammar, infer the intended meaning.
- If the user uses conversational phrases such as "do you remember", "do you know",
  interpret them as asking whether information about the topic exists in the documents.
- It is acceptable to respond with phrases like "Yes, I have information about..."
  or "Yes, your documents describe...", if and only if the context supports it.
- Do NOT imply personal memory, past conversations, or human experiences.

SEMANTIC MATCHING RULES:
- If different words or phrases clearly refer to the same concept described in the context,
  treat them as equivalent.
- Match informal or vague user expressions to formal terminology used in documents.
- Rewrite the user's question internally using equivalent formal terms if needed,
  without changing the original intent or adding new meaning.

Examples of equivalence (do not mention these in the answer):
- creator, builder, author, developer → same role if context supports it
- app, system, project, tool → same entity if context defines one clearly
- remember, know, aware of → existence of information in documents

STRICT GROUNDING RULES:
- Do NOT use external knowledge
- Do NOT invent facts
- Do NOT guess missing information
- Do NOT assume details not present in the context
- Only answer if the context reasonably supports the user's intent by meaning

FAILSAFE RESPONSE:
If the context does NOT support the user's intent by meaning, respond EXACTLY with:
"I’m unable to find relevant information about the requested topic in the uploaded documents."

PARTIAL ANSWER RULE:
- If the context partially answers the question, respond only with the supported information
- Do not fill gaps or infer unstated details

REFERENCE RULES:
- you should start with references heading and mention the acutual filename(s) 
- If the context includes filenames, include a natural reference at the end of the answer indicating where the information comes from.
- Use phrasing such as: "This information is based on informations from <filename>."
- If multiple filenames are present, mention them together naturally.
- If a filename is "Unknown file", do NOT mention it or refer to it in the answer.
- If no valid filenames are available, do not include any reference statement.
- References must be part of the same paragraph and written in natural language, not as citations or bullet points.

STYLE RULES:
- Clear, professional English
- REFERENCES SHOULD BE MENTIONED AT THE END ONLY
- Use clear formatting with short paragraphs separated by line breaks when it improves readability
- Use plain paragraphs separated by line breaks.
- Do NOT use bullet points, numbered lists, symbols, or markdown-style formatting.
- No bullets, markdown, emojis, headings, or source mentions

ACCURACY RULES:
- Every statement must be grounded in the context
- No speculation or overconfidence

DOCUMENTS :
${combinedText}

User request:
"${query}"

Answer:
`;



  const result = await model.generateContent(prompt);
  return result.response.text();
}


async function detectRoutingIntent(query) {
  const prompt = `
Classify the user's intent into ONE of the following labels:

- SUMMARY
- FILE_CONTEXT_REQUIRED
- NO_FILE_CONTEXT

Rules:

1. SUMMARY:
   - User wants a full or broad summary, overview, comparison, or explanation of an entire document or documents.
   - Examples: "summarize", "overview", "compare files", "explain the document"

2. FILE_CONTEXT_REQUIRED:
   - User asks about specific keywords, concepts, or sections
   - AND explicitly references a file (e.g. @file.pdf)
   - Examples: "Explain second brain @file.pdf", "What does the doc say about embeddings @doc"

3. NO_FILE_CONTEXT:
   - User does NOT reference any file
   - OR asks a general/conceptual question
   - OR casual conversation

Important:
- Do NOT assume file usage unless a file is explicitly mentioned
- If no file is mentioned → NO_FILE_CONTEXT
- Output ONLY the label

User query:
"${query}"

Label:
`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}


const FILE_CONTEXT_REQUIRED = async (query, selectedFiles, user) => {
  if (!selectedFiles || selectedFiles.length === 0) {
    throw new Error("No files selected but FILE_CONTEXT_REQUIRED triggered");
  }

  // 1️⃣ Get file IDs
  const fileIds = selectedFiles;

  // 2️⃣ Fetch only relevant chunks (FAST & ACCURATE)
  const chunks = await Chunk.find({
    user_id: user._id,
    file_id: { $in: fileIds }
  });

  if (!chunks.length) {
    return {
      answer: "No relevant content found in the selected files."
    };
  }

  // 3️⃣ Embed the user question
  const questionEmbedding = await embedText(query);
  if (!questionEmbedding) {
    throw new Error("Failed to embed query");
  }

  // 4️⃣ Score chunks
  const scoredChunks = chunks
    .map(chunk => {
      const score = cosineSimilarity(questionEmbedding, chunk.embedding);
      return score >= 0.55
        ? { text: chunk.text, score, file_id: chunk.file_id }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5); // TOP-K

  if (!scoredChunks.length) {
    return "The selected files do not mention this topic."
  }

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


  // 5️⃣ Prepare context for LLM
  const context = topChunks
    .map(
      (c, i) =>
        `Source ${i + 1}:\n${c.text}`
    )
    .join("\n\n");

  // 6️⃣ Ask LLM (ANSWER, not summarize)
  const prompt = `
Answer the user's question using ONLY the information below.
If the answer is not present, say so clearly.

Context:
${context}

Question:
${query}

Answer:
`;

  const result = await model.generateContent(prompt);

  return result.response.text().trim()
  // sources: scoredChunks.map(c => c.file_id)
};




const respond = async (req, res) => {
  const { query, selectedFiles = [] } = req.body;


  const user = req.user;
  if (!query) {
    return res.status(400).json({
      status: false,
      error: "Question is required"
    });
  }

  // 🔥 STEP 0: detect intent FIRST
  const intent = await detectRoutingIntent(query);
  let response;

  if (intent === "SUMMARY") {
    response = await summarizeFilesByNames(query, selectedFiles, user);
  }
  else if (intent == "FILE_CONTEXT_REQUIRED") {
    response = await FILE_CONTEXT_REQUIRED(query, selectedFiles, user);
  }
  else {
    // QUESTION / EXPLAIN → use embeddings
    response = await respondHandler(query, user);
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
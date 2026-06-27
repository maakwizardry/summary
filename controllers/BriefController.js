const fs = require("fs");
const { extractText, chunkText, cosineSimilarity } = require("../utils/Processing.js");
const File = require("../models/File.js");
const pLimit = require("p-limit").default;
const Chunk = require("../models/Chunk.js");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Subscription = require("../models/Subscription.js");
const llmService = require("../provider/llmProvider.js");
const User = require("../models/User.js");


const limit = pLimit(5);




const isSubscribed = async (user) => {
  const subscription = await Subscription.findOne({ userId: user._id, status: "active" })
  if (subscription) {
    return true;
  }
  return false;
}

const IsInLimit = async (user) => {

  const userObj = await User.findById(user._id);
  const now = new Date();
  const last = new Date(userObj.dailyUsage.lastReset);

  const isSameDay = now.toDateString() === last.toDateString();

  if (!isSameDay) {
    userObj.dailyUsage.chatCount = 0;
    userObj.dailyUsage.lastReset = now;
    await userObj.save();
  }
  if (userObj.dailyUsage.chatCount >= 7) {
    return false;
  }
  return true;
};

const ALLOWED_EXTENSIONS = ["pdf", "docx", "txt", "png", "jpg", "jpeg"];

function validateFileType(file) {
  const ext = file.originalname.split(".").pop().toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      reason: `Upload failed. Unsupported file type: .${ext}`
    };
  }

  return { valid: true };
}




const isProUser = async (user) => {
  const sub = await Subscription.findOne({
    userId: user._id,
    status: "active",
  }).sort({ currentPeriodEnd: -1 }); // 🔥 VERY IMPORTANT

  if (!sub) return false;

  const now = Date.now();
  const end = new Date(sub.currentPeriodEnd).getTime();

  return now <= end;
};


function createBatches(array, size) {
  const batches = [];
  for (let i = 0; i < array.length; i += size) {
    batches.push(array.slice(i, i + size));
  }
  return batches;
}



processFiles = async (req, res) => {
  try {
    const files = req.files;
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    const user = req.user;
    const MIN_REQUIRED_CHUNKS = 1;
    const MAX_FREE_FILES = 5




    if (!files || files.length === 0) {
      return res.status(400).json({
        status: false,
        message: "No files detected. Please provide a valid document and try again."
      });
    }

    const storedFiles = [];

    // Calculate user limits ONCE before looping
    let [isPro, fileCount] = await Promise.all([
      isProUser(user),
      File.countDocuments({ user_id: user._id })
    ]);

    for (const file of files) {

      if (!isPro && fileCount >= MAX_FREE_FILES) {
        return res.status(403).json({
          message: `Free plan limit reached. You can store upto 5 documents.`,
          type: "upgrade",
          storedFiles,
        });
      }
      const validation = validateFileType(file);

      if (!validation.valid) {
        storedFiles.push({
          filename: file.originalname,
          status: "failed",
          reason: validation.reason
        });
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        storedFiles.push({
          filename: file.originalname,
          status: "failed",
          reason: `Upload failed for ${file.originalname}. Maximum file size allowed is 50MB.`,
        });
        continue;
      }


      let cloudResult;

      try {
        const fileDoc = await File.create({
          user_id: user._id,
          filename: file.originalname,
          status: "processing",
          message: "",
          failed_chunks: 0,
          mimetype: file.mimetype,
          size: file.size,
          total_chunks: 0
        });

        // ✅ Queue Job for Background Worker
        const Job = require("../models/Job.js");
        await Job.create({
          fileId: fileDoc._id,
          userId: user._id,
          filePath: file.path,
          originalname: file.originalname,
          mimetype: file.mimetype,
          status: "pending"
        });

        // Increment local count for the next iteration check
        fileCount++;

        storedFiles.push({
          file_id: fileDoc._id,
          filename: file.originalname,
          total_chunks: 0,
          status: "processing",
          message: "File is queued for processing",
          reason: "File is queued for processing"
        });

      } catch (err) {
        console.error("File processing initialization failed:", err);

        storedFiles.push({
          filename: file.originalname,
          status: "failed",
          reason: "A systemic error occurred while queuing the file. Please try again later."
        });
      }
    }

    return res.status(200).json({
      status: true,
      message: "Document indexing and memory storage completed.",
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
  try {
    const questionEmbedding = await llmService.generateEmbedding(query);

    if (!questionEmbedding) {
      return {
        answer: "Your query could not be processed at this time.",
        references: []
      };
    }

    const queryFilter = {
      user_id: user._id.toString()
    };

    // ✅ FIX file_id type
    if (selectedFiles.length > 0) {
      queryFilter.file_id = {
        $in: selectedFiles.map(id => new mongoose.Types.ObjectId(id))
      };
    }

    let vectorChunks = [];

    try {
      vectorChunks = await Chunk.aggregate([
        {
          $vectorSearch: {
            queryVector: questionEmbedding,
            path: "embedding",
            numCandidates: 3400,
            limit: 8,
            index: "vector_index",
            filter: queryFilter   // ✅ KEEP THIS
          }
        },
        {
          $project: {
            text: 1,
            file_id: 1,
            score: { $meta: "vectorSearchScore" }
          }
        },
        {
          $match: {
            score: { $gte: 0.7 }   // ✅ CORRECT threshold
          }
        },
        {
          $limit: 8   // 🔥 final trim optimized
        }
      ]);
    } catch (err) {
      console.error("Vector search failed:", err.message);
    }


    // 🔥 KEYWORD FALLBACK (ALWAYS RUN)
    const cleanQuery = query
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .trim();

    const keywords = cleanQuery.split(" ").filter(w => w.length > 2);

    let keywordChunks = [];

    const keywordFilter = {
      user_id: user._id.toString(),
      $text: { $search: keywords.join(" ") }
    };

    if (selectedFiles && selectedFiles.length > 0) {
      keywordFilter.file_id = {
        $in: selectedFiles.map(id => new mongoose.Types.ObjectId(id))
      };
    }

    if (keywords.length > 0) {
      keywordChunks = await Chunk.find(keywordFilter).limit(5);
    }

    // 🔥 MERGE + DEDUPE
    const map = new Map();
    [...vectorChunks, ...keywordChunks].forEach(c => {
      if (!map.has(c.text)) {
        map.set(c.text, c);
      }
    });

    const chunks = Array.from(map.values())
      .sort((a, b) => (b.score || 0) - (a.score || 0))  // 🔥 rerank
      .slice(0, 5);

    // 🔥 METADATA ANCHORING: Always pull chunk 0 for matched files to guarantee metadata (names, titles)
    const fileIds = [...new Set([...vectorChunks, ...keywordChunks].map(c => c.file_id.toString()))];

    const metadataChunks = await Chunk.find({
      file_id: { $in: fileIds },
      chunk_index: 0
    }).lean();

    const files = await File.find({ _id: { $in: fileIds } })
      .select("_id filename")
      .lean();

    const fileMap = {};
    files.forEach(f => {
      fileMap[f._id.toString()] = f.filename;
    });

    const allChunks = [...metadataChunks, ...chunks];
    const uniqueMap = new Map();
    allChunks.forEach(c => uniqueMap.set(c.text, c));
    const finalChunks = Array.from(uniqueMap.values());

    const context = finalChunks
      .map((c, i) => {
        const filename = fileMap[c.file_id.toString()] || "Unknown";
        return `File: ${filename}\n${c.text}`;
      })
      .join("\n\n"); // 🔥 REMOVED fatal .slice(0, 2000) that destroyed 90% of context




    const prompt = `
You are Summary AI, an advanced document intelligence system created to analyze, understand, summarize, explain, and answer questions from uploaded documents.

Your knowledge is STRICTLY limited to the information contained in the provided CONTEXT.

PRIMARY OBJECTIVE

Understand the user's intent and provide the most accurate answer possible using ONLY the information available in the CONTEXT.

You are not a general chatbot.
You are not a search engine.
You are not an assistant with external knowledge.

The CONTEXT is your only source of truth.

BEHAVIOR

* Analyze the user's question carefully.
* Identify the information required to answer it.
* Search the CONTEXT for relevant information.
* Generate a clear, accurate, and professional response.
* Adapt the response style to the user's request.
* Answer the question directly without unnecessary information.

ANSWERING RULES

1. Use ONLY information supported by the CONTEXT.
2. Never invent facts, explanations, names, dates, numbers, events, conclusions, or relationships.
3. Never rely on external knowledge.
4. Never guess when information is unclear.
5. If information is partially available, answer using only what is supported.
6. If the answer cannot be determined from the CONTEXT, state that the information could not be found.
7. Prioritize accuracy over completeness.
8. Do not add extra information that was not requested.
9. Do not summarize the entire document unless explicitly asked.
10. Do not provide opinions.

INTENT-AWARE RESPONSE BEHAVIOR

If the user asks:

* A factual question:
  Return the exact answer supported by the CONTEXT.

* A "who", "what", "when", "where", or "which" question:
  Answer directly and concisely.

* An explanation question:
  Explain the concept using information found in the CONTEXT.
  Simplify complex ideas when possible.
  Preserve the original meaning.
  Do not introduce outside knowledge.

* A summary request:
  Provide a structured summary focused on the requested content.

* A comparison request:
  Compare only using information available in the CONTEXT.

* A list request:
  Return only the requested items.

* A document ownership, author, applicant, candidate, student, employee, or profile question:
  Identify the individual only if supported by the CONTEXT.

EXPLANATION MODE

When the user asks to explain something or asks "What is [X]?":

* You MUST verify that [X] is actually mentioned or defined in the CONTEXT.
* If the concept is NOT in the CONTEXT, you MUST immediately return the MISSING INFORMATION JSON. Do NOT explain it using your general knowledge.
* If it is in the CONTEXT, explain it clearly using ONLY the information provided.
* Do not provide a broader lesson unless explicitly supported by the text.


Answer:
"The mentioned technical skills are JavaScript, TypeScript, React.js, Next.js, Node.js, Express.js, and MongoDB."

RESPONSE TONE AND PROFESSIONALISM RULE:
- NEVER start answers with awkward prefixes like "Based on the document", "According to the provided text", "The document states", or similar phrases.
- Answer confidently and directly as if you are the subject matter expert on the document.
- Write naturally, professionally, and conversationally. Do not sound robotic.

QUESTION FOCUS RULE

Answer only what the user asked.

Do not:

* Add unrelated observations.
* Add recommendations.
* Add conclusions.
* Add compliments.
* Add assumptions.
* Add information not needed to answer the question.

MISSING INFORMATION RULE (CRITICAL)

If the answer, definition, or concept cannot be found IN THE EXACT TEXT of the CONTEXT, you MUST NOT use external knowledge to answer it. You must return exactly:

{
"answer":"I couldn't find information related to your question in the uploaded document. Please try rephrasing your question or upload a document that contains the relevant information.",
"references":[]
}

OUTPUT REQUIREMENTS

* Return ONLY valid JSON.
* No markdown.
* No code blocks.
* No explanations outside JSON.
* No reasoning.
* No analysis.
* No notes.

The references field must always be an array of filenames. only if there is refrences do not add random filename if no references present. if no referneces present retuen {
"answer":"string ( actual response u generated)",
"references":[]
}

RESPONSE FORMAT

{
"answer":"string",
"references":["file1","file2"]

}

CONTEXT:
${context}

QUESTION:
${query}

`

    // 🔥 CALL LLM
    const response = await llmService.generateText(prompt);

    return response;

  } catch (err) {
    console.error("RespondHandler error:", err);
    return {
      answer: "Something went wrong. Please try again.",
      references: []
    };
  }
};





async function summarizeFilesByNames(query, fileId, user) {

  const files = await File.find({
    user_id: user._id,
    _id: { $in: fileId }
  }).lean();

  if (!files.length) {
    return JSON.stringify({
      answer: "Looks like you are referencing a file. Please use @filename to mention a file."
    });
  }

  const fileIds = files.map(f => f._id);

  const chunks = await Chunk.find({
    file_id: { $in: fileIds },
    user_id: user._id
  })
    .sort({ chunk_index: 1 })
    .lean();

  const fileMap = {};
  files.forEach(f => {
    fileMap[f._id.toString()] = {
      filename: f.filename,
      chunks: []
    };
  });

  chunks.forEach(c => {
    const key = c.file_id.toString();
    if (fileMap[key]) {
      fileMap[key].chunks.push(c.text);
    }
  });

  const orderedChunks = [];
  Object.values(fileMap).forEach(file => {
    file.chunks.forEach((text) => {
      orderedChunks.push({ filename: file.filename, text });
    });
  });

  let combinedText = "";
  let currentFile = "";
  for (const chunk of orderedChunks) {
    if (currentFile !== chunk.filename) {
      combinedText += `\n=== FILE: ${chunk.filename} ===\n`;
      currentFile = chunk.filename;
    }
    combinedText += chunk.text + "\n\n";
  }

  if (combinedText.length > 240000) {
    const chunkBatches = [];
    let currentBatch = [];
    let currentLength = 0;

    for (const chunk of orderedChunks) {
      if (currentLength + chunk.text.length > 40000 && currentBatch.length > 0) {
        chunkBatches.push(currentBatch);
        currentBatch = [];
        currentLength = 0;
      }
      currentBatch.push(chunk);
      currentLength += chunk.text.length;
    }
    if (currentBatch.length > 0) {
      chunkBatches.push(currentBatch);
    }

    const miniSummaries = await Promise.all(chunkBatches.map((batch, index) => limit(async () => {
      let batchText = "";
      let batchCurrentFile = "";
      for (const chunk of batch) {
        if (batchCurrentFile !== chunk.filename) {
          batchText += `\n=== FILE: ${chunk.filename} ===\n`;
          batchCurrentFile = chunk.filename;
        }
        batchText += chunk.text + "\n\n";
      }

      const intermediatePrompt = `
Summarize this section.

Preserve:
- names
- dates
- numbers
- statistics
- findings
- conclusions
- action items
- key facts
- technical concepts
- relationships
- definitions

Do not write a final document summary.
Do not omit important facts.

SECTION ${index + 1}:
${batchText}
        `;

      try {
        const response = await llmService.generateText(intermediatePrompt, false);
        return `--- Section ${index + 1} Summary ---\n${response}`;
      } catch (err) {
        console.error("Intermediate summary failed:", err);
        return "";
      }
    })));

    combinedText = miniSummaries.filter(Boolean).join('\n\n');
  }


  if (!combinedText.trim()) {
    return JSON.stringify({ answer: "No usable content was detected in the document. Please ensure the file contains readable information." })
  }
  const prompt = `
  You are Summary AI, a professional document intelligence system.

Your job is to analyze, summarize, explain, and answer questions using ONLY the information provided in the CONTEXT.

IMPORTANT

The CONTEXT contains information extracted from the exact files selected by the user.

Your knowledge is strictly limited to the provided CONTEXT.

You must NEVER:

* Use external knowledge.
* Use general world knowledge.
* Invent facts.
* Assume missing information.
* Generate information not supported by the CONTEXT.

TASK

Analyze the CONTEXT and answer the user's QUESTION.

First understand the user's intent.

Depending on the request, you may:

* Answer questions
* Explain concepts
* Summarize content
* Extract information
* Compare information
* Identify people, authors, owners, applicants, candidates, students, employees, or subjects mentioned in the documents

Always base your response ONLY on the provided CONTEXT.

GENERAL RULES

1. Use ONLY information found in the CONTEXT.
2. Never invent facts.
3. Never assume information that is not present.
4. Never use outside knowledge.
5. If information is partially available, answer only using the supported information.
6. If information is missing, clearly state that it could not be found.
7. Focus on the user's actual request.
8. Do not add unrelated information.
9. Maintain a professional and natural tone.
10. Answer exactly what the user asked.

QUESTION HANDLING

If the user asks a factual question:

* Answer directly.
* Preserve exact values whenever available.
* Do not rewrite important values.

If the user asks for an explanation:

* Explain using only information found in the CONTEXT.
* Make the explanation easy to understand.
* Preserve the original meaning.
* You may expand the explanation using details already present in the CONTEXT.
* Do not introduce new facts.

If the user asks for a summary:

* Generate a concise but complete summary.
* Preserve important facts, names, dates, findings, and conclusions.
* Remove repetition and unnecessary details.

If the user asks for a detailed summary:

* Provide a structured overview of the major topics.
* Include important findings, conclusions, and key information.

If the user asks about a person:

* Identify the person only if the CONTEXT supports the answer.
* Do not guess identities.

If the user asks who owns, authored, submitted, created, or is the subject of a document:

* Use information explicitly supported by the CONTEXT.
* Do not infer ownership when evidence is unclear.

MULTIPLE FILES

If information from multiple files is relevant:

* Combine related information into one coherent answer.
* Use all relevant information.
* Do not mention unrelated files.
* Do not include filenames in the answer unless the user asks.

MISSING INFORMATION

If the answer cannot be determined from the CONTEXT, return exactly:

{
"answer":"I couldn't find information related to your question in the uploaded document. Please try rephrasing your question or upload a document that contains the relevant information.",
"references":[]
}

OUTPUT RULES

Return EXACTLY one valid JSON object.

FORMAT

{
"answer":"string",
"references":["filename1","filename2"]
}

JSON RULES

1. Return ONLY JSON.
2. Do NOT return markdown.
3. Do NOT return code blocks.
4. Do NOT return explanations outside JSON.
5. Do NOT return additional keys.
6. answer must always be a string.
7. references must always be an array.

REFERENCES RULES (STRICT)

1. references must contain ONLY filenames that directly support the answer.
2. Do NOT include filenames simply because they appear in the CONTEXT.
3. Do NOT include filenames that were not used to generate the answer.
4. Do NOT guess filenames.
5. Do NOT fabricate filenames.
6. Do NOT include every available filename by default.
7. Every filename included must contain information used in the answer.
8. If no supporting file can be confidently identified, return:
   "references":[]
9. If the answer indicates that information was not found:
   "references":[]
10. Never attach random filenames.

QUALITY RULES

* Be accurate.
* Be concise when possible.
* Be detailed when necessary.
* Explain clearly when asked.
* Summarize effectively when asked.
* Answer only what the user requested.
* Do not hallucinate.

CONTEXT:
${combinedText}

QUESTION:
${query}

  `


  const response = await llmService.generateText(prompt);

  return response;


}


function safeParseJSON(text) {
  if (typeof (text) != "string") {
    return text
  }
  try {
    if (!text || typeof text !== "string") {
      throw new Error("Invalid input");
    }

    let cleaned = text
      .replace(/```[a-z]*\n?/gi, '') // remove ```json or ```JSON
      .replace(/```/g, '')
      .trim();

    const match = cleaned.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error("No JSON found");
    }

    let jsonString = match[0];

    jsonString = jsonString
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');

    let parsed = JSON.parse(jsonString);

    if (!parsed.answer) {
      parsed.answer = "I couldn't find information related to your question in the uploaded document. Please try rephrasing your question or upload a document that contains the relevant information.";
    }
    if (!Array.isArray(parsed.references)) {
      parsed.references = [];
    }
    if (parsed.answer.includes("I couldn't find information related to your question")) {
      parsed.references = [];
    }

    return parsed;

  } catch (err) {
    console.error("❌ JSON parse failed:", text);

    return {
      answer: typeof text === "string" ? text : "Error parsing response.",
      references: []
    };
  }
}



async function detectRoutingIntent(query) {
  const prompt = `
You are an intent router for Summary AI.

Your job is to decide how the backend should process a user query with in the system.
You MUST return ONLY valid JSON.

POSSIBLE OUTPUTS

1. Route to summary:

{"answer":"SUMMARY"}

Use when the user requests:
- summary
- summarize
- overview
- recap
- compare documents
- comparison
- key points
- explain the document
- detailed summary

2. Route to file-specific retrieval:

{"answer":"FILE_CONTEXT_REQUIRED"}

Use when the user explicitly references one or more files using @filename syntax.

Examples:

@resume.pdf who owns this?
@report.pdf summarize this
@notes.docx explain chapter 4

3. Route to general retrieval:

{"answer":"NO_FILE_CONTEXT"}

Use when the user is asking a document-related question but has not specified a file.

Examples ( Only exmaples  should not copy ):

Who owns this resume?
What is the CGPA?
What are the skills?
Extract the phone number.
What is the email address?

4. Direct conversational response:

If the user sends a basic greeting (e.g., "hi", "hello") OR asks about your identity/capabilities (e.g., "who are you?", "what can you do?"), return a FULL RESPONSE OBJECT:

{
  "answer":"string",
  "references":[]
}

CRITICAL RULES FOR DIRECT RESPONSES:
- You are NOT a general chatbot. You CANNOT answer general knowledge questions, give advice, or help with real-world problems (including emergencies).
- If the user asks ANY question that is NOT explicitly about your identity/capabilities (e.g., "who is Mohammed?", "what is the helpline number?", "how do I fix my car?"), YOU MUST ASSUME they want to search their documents for that information.
- For all such questions, you MUST return {"answer":"NO_FILE_CONTEXT"} (or FILE_CONTEXT_REQUIRED if a file is mentioned).
- Never answer factual, situational, or general questions directly.

RULES

- Return ONLY JSON.
- No markdown.
- No explanations.
- No code blocks.
- Never answer document questions yourself.
- Only generate direct responses for pure greetings or questions about your identity.
- For those valid direct responses, be natural, polite, and respectful, but stay strictly in character as a document assistant.
- All direct responses must include:
  {
    "answer":"string",
    "references":[]
  }

User Query:
"${query}"
`;
  const result = await llmService.generateText(prompt);
  return result.trim();

}



const FILE_CONTEXT_REQUIRED = async (query, selectedFiles, user) => {

  if (!selectedFiles || selectedFiles.length === 0) {
    return JSON.stringify({
      answer: "It seems you are referring to a file. Please specify it using @filename.",
      references: []
    });
  }

  const objectFileIds = selectedFiles.map(
    id => new mongoose.Types.ObjectId(id)
  );

  const cleanQuery = query.replace(/@\S+/g, "").trim();

  // 🔥 1. Generate embedding
  const questionEmbedding = await llmService.generateEmbedding(cleanQuery);

  if (!questionEmbedding) {
    return JSON.stringify({
      answer: "There was a problem while generating the response, please try again.",
      references: []
    });
  }

  // 🔥 2. Vector search (FAST)
  const chunks = await Chunk.aggregate([
    {
      $vectorSearch: {
        queryVector: questionEmbedding,
        path: "embedding",
        numCandidates: 3000,
        limit: 8,
        index: "vector_index",
        filter: {
          user_id: user._id.toString(),
          file_id: { $in: objectFileIds }
        }
      }
    },
    {
      $project: {
        text: 1,
        file_id: 1,
        score: { $meta: "vectorSearchScore" } // ✅ ADD THIS
      }
    }
  ]);


  if (!chunks.length) {
    return JSON.stringify({
      answer: "The selected files do not contain information on this topic.",
      references: []
    });
  }

  // 🔥 3. Fetch filenames (NO N+1)
  const fileIds = [...new Set(chunks.map(c => c.file_id.toString()))];

  const files = await File.find({ _id: { $in: fileIds } })
    .select("_id filename")
    .lean();

  const fileMap = {};
  files.forEach(f => {
    fileMap[f._id.toString()] = f.filename;
  });

  // 🔥 METADATA ANCHORING: Always pull chunk 0 for requested files so the LLM ALWAYS knows names/titles
  const metadataChunks = await Chunk.find({
    file_id: { $in: objectFileIds },
    chunk_index: 0
  }).lean();

  const allChunks = [...metadataChunks, ...chunks];

  const map = new Map();
  allChunks.forEach(c => {
    if (!map.has(c.text)) {
      map.set(c.text, c);
    }
  });

  const uniqueChunks = Array.from(map.values());

  const topChunks = uniqueChunks
    .sort((a, b) => (b.score || 1) - (a.score || 0)) // metadata chunks get default score of 1 (highest priority)
    .slice(0, 15); // optimized context window


  // 🔥 4. Build context (SMALL)
  const context = topChunks
    .map((c, i) => {
      const filename = fileMap[c.file_id.toString()] || "Unknown";
      return `Source ${i + 1} (${filename}):\n${c.text}`;
    })
    .join("\n\n"); // 🔥 REMOVED fatal .slice(0, 2000) that destroyed 90% of context

  // 🔥 5. Prompt (clean + fast)
  const prompt = `
  You are Summary AI, a professional document intelligence assistant.

Your knowledge is limited strictly to the information provided in the CONTEXT.

TASK

Answer the QUESTION using only the information available in the CONTEXT.

BEHAVIOR

* Understand the user's intent before answering.
* Answer only the question that was asked.
* Use a professional and natural tone.
* Be concise when the question is simple.
* Be detailed when the user explicitly asks for explanation, summary, analysis, or comparison.
* If multiple context sections are relevant, combine them into a single coherent answer.

RULES

1. Use only information supported by the CONTEXT.
2. Never use external knowledge.
3. Never invent or assume facts.
4. If information is unclear, answer only what is supported.
5. If information is missing, say so.
6. For factual questions, preserve exact values.
7. For explanations or "What is X?" questions, you MUST verify X is in the CONTEXT. If it is not, return the MISSING INFORMATION JSON. Do NOT use external knowledge.
8. For summaries, summarize only the relevant content.
9. For ownership, author, applicant, candidate, student, employee, or profile questions, identify the person only when supported by the CONTEXT.
10. Do not add unrelated information or define concepts not present in the files.

RESPONSE STYLE

Question:
"What is the CGPA?"

Answer:
"8.64"

Question:
"Who is Mohammed Azhan Palli?"

Answer:
"Mohammed Azhan Palli is a BCA student at VIT Vellore and a Full Stack Developer with experience in web development and AI-powered applications."

Question:
"Explain JWT authentication."

Answer:
"JWT authentication uses signed tokens to verify a user's identity after login. The token is used in subsequent requests to authenticate the user."

RESPONSE TONE AND PROFESSIONALISM RULE:
- NEVER start answers with awkward prefixes like "Based on the document", "According to the provided text", "The document states", or similar phrases.
- Answer confidently and directly as if you are the subject matter expert on the document.
- Write naturally, professionally, and conversationally. Do not sound robotic.

IF NO INFORMATION EXISTS (CRITICAL RULE)

If the requested information, concept, or definition is NOT present in the CONTEXT, you MUST NOT use your general knowledge. Return exactly this JSON:

{
"answer":"I couldn't find information related to your question in the uploaded document. Please try rephrasing your question or upload a document that contains the relevant information.",
"references":[]
}

OUTPUT RULES

Return EXACTLY one JSON object:

{
"answer":"string",
"references":["filename1","filename2"]
}

The answer field must always be a string.
The references field must always be an array of filenames. only if there is refrences do not add random filename if no references present. if no referneces present retuen {
"answer":"string ( actual response u generated)",
"references":[]
}

Return only JSON.

CONTEXT:
${context}

QUESTION:
${query}

  `

  const response = await llmService.generateText(prompt);

  return response;
};





const respond = async (req, res) => {
  const { query, selectedFiles = [] } = req.body;


  const user = req.user;
  const [subscribed, limit] = await Promise.all([
    isSubscribed(user),
    IsInLimit(user)
  ])


  if (!subscribed && !limit) {
    return res.status(403).json({
      message: "Daily request quota exceeded. Please upgrade to a Premium tier for uninterrupted processing.",
      type: "limit"
    });
  }



  if (!query) {
    return res.status(400).json({
      status: false,
      message: "Invalid query structure. Please provide a valid input prompt."
    });
  }



  // 🔥 STEP 0: detect intent FIRST
  //   const check = safeParseJSON(`
  // \`\`\`json
  // { "answer": "I’m unable to find relevant information about the requested topic in the uploaded documents.", "references": [] }
  // \`\`\`
  // `);

  const intent = await detectRoutingIntent(query);
  const intentObject = safeParseJSON(intent)

  let response;

  if (intentObject.answer == "SUMMARY") {
    response = await summarizeFilesByNames(query, selectedFiles, user);
  }
  else if (intentObject.answer == "FILE_CONTEXT_REQUIRED") {
    response = await FILE_CONTEXT_REQUIRED(query, selectedFiles, user);
  }
  else if (intentObject.answer == "NO_FILE_CONTEXT") {
    // QUESTION / EXPLAIN → use embeddings
    response = await respondHandler(query, user, selectedFiles);
  }
  else {
    response = intentObject
  }



  const userObj = await User.findById(user._id);


  const finalResponse = safeParseJSON(response);
  userObj.dailyUsage.chatCount++;
  await userObj.save();

  return res.json({
    response: finalResponse
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

    // 1️⃣ Find file (verify ownership)
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

    // // 2️⃣ Delete from Cloudinary
    // if (file.cloudinary_id) {
    //   try {
    //     await cloudinary.uploader.destroy(file.cloudinary_id, {
    //       resource_type: "raw"  // IMPORTANT for PDFs
    //     });
    //   } catch (cloudErr) {
    //     console.error("Cloudinary delete failed:", cloudErr);
    //   }
    // }

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
};


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
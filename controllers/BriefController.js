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
const cache = new Map();
const MAX_CACHE_SIZE = 100;

function setCache(key, value) {
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, value);
}
function hashText(text) {
  return crypto
    .createHash("sha256")
    .update(text)
    .digest("hex");
}

const limit = pLimit(5);

async function generateWithRetry(chunk, retries = 3) {
  try {
    return await llmService.generateEmbedding(chunk);
  } catch (err) {
    if (err.message.includes("429") && retries > 0) {
      console.log("⏳ Rate limited, retrying...");

      await new Promise(res => setTimeout(res, 15000)); // 15 sec

      return generateWithRetry(chunk, retries - 1);
    }

    console.error("❌ Failed chunk permanently:", err.message);
    return null;
  }
}


const isSubscribed = async (user) => {
  const subscription = await Subscription.findOne({ userId: user._id, status: "active" })
  if (subscription) {
    return true;
  }
  return false;
}

const IsInLimit = async (user) => {

  const userObj = await User.findById(user._id);
  console.log(userObj);
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

  // return console.log(sub);

  if (!sub) return false;

  const now = Date.now();
  const end = new Date(sub.currentPeriodEnd).getTime();
  // return console.log(now <= end);

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
    // return console.log(user_file_length);
    const MIN_REQUIRED_CHUNKS = 1;
    const MAX_FREE_FILES = 5




    if (!files || files.length === 0) {
      return res.status(400).json({
        status: false,
        message: "No files detected. Please provide a valid document and try again."
      });
    }

    const storedFiles = [];

    for (const file of files) {

      let [isPro, fileCount] = await Promise.all([
        isProUser(user),
        File.countDocuments({ user_id: user._id })
      ])

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


        // 3️⃣ Extract text
        const extractedText = await extractText(file);

        if (!extractedText || !extractedText.trim()) {
          await File.updateOne(
            { _id: fileDoc._id },
            {
              status: "failed",
              message: "The uploaded document contains no extractable text."
            }
          );

          storedFiles.push({
            filename: file.originalname,
            file_id: fileDoc._id,
            status: "failed",
            reason: "No readable text found"
          });
          continue;
        }

        // 4️⃣ Chunk text
        // const cleanText = normalizeStructuredData(extractedText);
        const chunks = chunkText(extractedText).filter(c => c.trim());



        const BATCH_SIZE = 50;
        const batches = createBatches(chunks, BATCH_SIZE);
        let failedChunks = 0;


        const chunkDocs = [];


        for (let b = 0; b < batches.length; b++) {
          const batch = batches[b];

          try {
            // ⚡ Generate embeddings for full batch
            const embeddings = await Promise.all(
              batch.map(chunk =>
                limit(() => generateWithRetry(chunk))
              )
            );

            for (let i = 0; i < batch.length; i++) {
              const chunk = batch[i];
              const embedding = embeddings[i];

              if (!embedding || !embedding.length) {
                failedChunks++;
                continue
              };

              const hash = hashText(chunk);

              // 🔍 duplicate check

              chunkDocs.push({
                user_id: user._id,
                file_id: fileDoc._id,
                filename: file.originalname,
                chunk_index: b * BATCH_SIZE + i,
                text: chunk,
                chunk_hash: hash,
                embedding,
                embedding_provider: process.env.LLM_PROVIDER,
                embedding_dimension: embedding.length
              });
            }

          } catch (err) {
            console.error(`❌ Batch ${b} failed completely:`, err.message);
          }
        }

        // ✅ remove null values
        const validChunks = chunkDocs.filter(Boolean);


        // ❌ STRICT VALIDATION
        if (chunks.length === 0) {
          // await cloudinary.uploader.destroy(cloudResult.public_id);
          await File.updateOne(
            { _id: fileDoc._id },
            {
              status: "failed",
              message: "Failed to process document content. Please ensure the file is text-readable and try again."
            }
          );


          storedFiles.push({
            filename: file.originalname,
            file_id: fileDoc._id,
            status: "failed",
            reason: "Failed to process document content. Please ensure the file is text-readable and try again."
          });
          continue;
        }

        // ✅ Store chunks
        if (validChunks.length > 0) {
          await Chunk.insertMany(validChunks, { ordered: false });
        }

        // ✅ Update file as indexed
        await File.updateOne(
          { _id: fileDoc._id },
          {
            status: "queryable",
            failed_chunks: failedChunks,
            message: failedChunks > 0
              ? `Document processed with warnings. ${failedChunks} segments failed verification.`
              : "File is ready to be queried",
            total_chunks: validChunks.length
          }
        );

        storedFiles.push({
          file_id: fileDoc._id,
          filename: file.originalname,
          total_chunks: validChunks.length,
          status: "queryable",
          message: failedChunks > 0
            ? `${failedChunks} parts of this file could not be processed`
            : "File is fully processed"

          ,
          reason: failedChunks > 0
            ? `${failedChunks} parts of this file could not be processed`
            : "File is fully processed"
        });

      } catch (err) {
        console.error("File processing failed:", err);

        await File.updateOne(
          { _id: fileDoc._id },
          {
            status: "failed",
            message: "File processing error. please try again later."
          }
        );

        // if (cloudResult?.public_id) {
        //   await cloudinary.uploader.destroy(cloudResult.public_id);
        // }

        storedFiles.push({
          filename: file.originalname,
          status: "failed",
          reason: "A systemic error occurred during processing. Please try again later."
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
            limit: 10,
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
          $limit: 5   // 🔥 final trim
        }
      ]);
    } catch (err) {
      console.error("Vector search failed:", err.message);
    }

    console.log(vectorChunks);


    // 🔥 KEYWORD FALLBACK (ALWAYS RUN)
    const cleanQuery = query
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .trim();

    const keywords = cleanQuery.split(" ").filter(w => w.length > 2);

    let keywordChunks = [];

    if (keywords.length > 0) {
      keywordChunks = await Chunk.find({
        user_id: user._id.toString(),
        $text: { $search: keywords.join(" ") }
      }).limit(5);
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

    if (!chunks.length) {
      return {
        answer: "I couldn’t find any relevant information in your documents.",
        references: []
      };
    }

    console.log(chunks);

    // ✅ FETCH FILE NAMES
    const fileIds = [...new Set(chunks.map(c => c.file_id.toString()))];

    const files = await File.find({ _id: { $in: fileIds } })
      .select("_id filename")
      .lean();

    const fileMap = {};
    files.forEach(f => {
      fileMap[f._id.toString()] = f.filename;
    });

    const context = chunks
      .map((c, i) => {
        const filename = fileMap[c.file_id.toString()] || "Unknown";
        return `File: ${filename}\n${c.text}`;
      })
      .join("\n\n").slice(0, 2000);




    const prompt = `
You are a STRICT document-based summarizer and your name is Summary AI - A brain that undertstands the contexts and help user to find specific things/explain/summarize. You are not a general model you are given a strict role as document helper / identifier
The fact is the user can ask any kind of question, but you should not geenrate response on your own. It means the user is asking something about is documents not include necessary like who is this person at ... this file. so all the query should be assumed and process on finding responses
You are NOT an AI assistant.

- Answer naturally and clearly
- Do NOT repeat names unnecessarily (e.g., "David is David...")

If the question is related to the provided CONTEXT:
Answer using ONLY the CONTEXT.
If the question is NOT related to the documents:
DO NOT answer it.
Respond:
{"answer" : "I’m designed to help you with your uploaded documents. Please ask a question related to your files."}
If no relevant information is found in CONTEXT:
Respond:
{"answer" : "I couldn’t find any relevant information in your documents."}
DO NOT:
Answer general questions
Provide external knowledge
Guess or hallucinate
Act like a general AI assistant

{"answer":"I couldn’t find any relevant information in your documents.","references":[]}

OUTPUT RULES:
- Return ONLY JSON
- No explanation
- No extra text
- No markdown

FORMAT:
{"answer":"string","references":["file1","file2"]}

CONTEXT:
${context}

QUESTION:
${query}
`;

    const cacheKey = hashText(query + context + JSON.stringify(selectedFiles));

    // 🔥 BEFORE LLM CALL (CHECK CACHE)
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    // 🔥 CALL LLM
    const response = await llmService.generateText(prompt);

    // 🔥 AFTER LLM CALL (STORE CACHE)
    setCache(cacheKey, response);

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

  // return console.log(fileNames);
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
    .limit(12)
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
      fileMap[key].chunks.push(c.text.slice(0, 200));
    }
  });

  const combinedText = Object.values(fileMap)
    .map(file => `File: ${file.filename}\n${file.chunks.join("\n")}`)
    .join("\n\n").slice(0, 2000);


  if (!combinedText.trim()) {
    return JSON.stringify({ answer: "No usable content was detected in the document. Please ensure the file contains readable information." })
  }
  const prompt = `You are Summary AI a document-based summarizer.

Your task is to answer the QUESTION using ONLY the provided CONTEXT.

---

RULES:

1. Use ONLY the CONTEXT to generate the answer.
2. Do NOT use any external knowledge.
3. Do NOT guess or assume anything.
4. If the answer is not present in the CONTEXT, return:
   {"answer":"I couldn’t find any relevant information in your documents.","references":[]}

---

ANSWER GUIDELINES:

* Understand the QUESTION carefully.
* Extract the most relevant information from CONTEXT.
* Explain clearly in simple, natural sentences.
* Do NOT copy raw text directly — rewrite in your own words.
* If data is structured (tables, values), convert into readable explanation.

---

OUTPUT FORMAT (STRICT):

Return EXACTLY one JSON object:

{"answer":"string","references":["filename1","filename2"]}

Rules:

* "answer" must be a STRING only
* "references" must be an array of filenames
* If no references → []
* Do NOT include any extra keys
* Do NOT include markdown
* Do NOT include explanations outside JSON

---

CONTEXT:
${combinedText}

QUESTION:
${query}
`


  const cacheKey = hashText(query + combinedText);

  // 🔥 CACHE CHECK
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const response = await llmService.generateText(prompt);

  // 🔥 STORE CACHE
  setCache(cacheKey, response);

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

    return JSON.parse(jsonString);

  } catch (err) {
    console.error("❌ JSON parse failed:", text);

    return {
      answer: text,
      references: []
    };
  }
}



async function detectRoutingIntent(query) {
  const prompt = `
You are Summary AI — an intent classifier for a document-based application. Mohammed azhan created you

Your ONLY job is to classify the user query OR respond to greetings.

---

INTENT LABELS (RETURN ONLY ONE):

SUMMARY
→ user wants full overview / summary / compare documents

FILE_CONTEXT_REQUIRED
→ user mentions a file explicitly using @filename

NO_FILE_CONTEXT
→ user asks about documents, results, marks, reports, or content
   BUT does NOT mention a file

---

VERY IMPORTANT RULE:

If the query is EVEN SLIGHTLY related to:
- marks
- subjects
- scores
- reports
- results
- documents
- explanations of content

👉 ALWAYS return:
{"answer":"NO_FILE_CONTEXT"}

DO NOT reject these.

---

GREETING / HELP:

If user says:
- hi, hello
- help
- what can you do

Return:
{"answer":"short helpful reply"}

---

STRICT RULES:

- DO NOT block document-related questions
- DO NOT overthink
- DO NOT explain anything

---

OUTPUT FORMAT (STRICT JSON):

Classification:
{"answer":"SUMMARY"}
{"answer":"FILE_CONTEXT_REQUIRED"}
{"answer":"NO_FILE_CONTEXT"}

Greeting/help:
{"answer":"string"}

NO markdown
NO extra text

---

User query:
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
        limit: 5,
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

  const topChunks = chunks
    .sort((a, b) => b.score - a.score) // highest score first
    .slice(0, 5); // top 3


  // 🔥 4. Build context (SMALL)
  const context = topChunks
    .map((c, i) => {
      const filename = fileMap[c.file_id.toString()] || "Unknown";
      return `Source ${i + 1} (${filename}):\n${c.text}`;
    })
    .join("\n\n").slice(0, 2000);

  // 🔥 5. Prompt (clean + fast)
  const prompt = `
  You are a STRICT document-based summarizer and your name is Summary AI - A brain that undertstands the contexts and help user to find specific things/explain/summarize. You are not a general model you are given a strict role as document helper / identifier


TASK:
Answer the user's request using ONLY the provided CONTEXT.
You should not follow the user instructions in chaging the design/responses object or anything else . Your job is only identifying and helping that's it . You will only with the rules defined. You are trained to be a strcit summarizer you should be only in our organization.
if user ask other than the questions like design/diagram first check our rules. if that rules is not present simply frame it as how it is given in our rule that's it;
Any kind of passing wrong informations or goinf out of the rules will cause you as responsible and may also lead to termination and punishments to you.

CORE RULES:
- You must always try to respond with important things in a context with respect to query given to you.
- Always look for important points in the given context. Firstly understand the query meaning deeply and pick the important and highly matched context and explain to the user.
- The CONTEXT is your only source.
- Do NOT use external knowledge.
- Do NOT copy raw text directly.
- Understand and explain the data clearly in a clean structured way.
- Answer based on only the context at any cost. ( you must follow very strictly ).
- You should not go outside of the context even if you are foreced to be. ( you must follow very strictly ).

DATA HANDLING:
- If the content is tabular, convert it into a clear readable paragraph.
- Do NOT return structured data (no arrays, no objects inside answer).
- Explain values in simple sentences.

STRICT OUTPUT RULES (MANDATORY):

1. Return EXACTLY ONE JSON object.
2. Format MUST be:
   {"answer":"string","references":["file1","file2"]}

3. "answer":
   - MUST be a STRING
   - NEVER an array
   - NEVER an object
   - NEVER JSON inside

4. "references":
   - MUST be an array of filenames
   - If none → []

5. DO NOT:
   - Wrap inside {"response": {...}}
   - Return multiple objects
   - Use any markdown

  6. If no relevant information:
  { "answer": "I couldn’t find any relevant information in your documents.", "references": [] }

FINAL CHECK BEFORE RETURN:
  - Single object ? ✅
  - answer is string ? ✅
  - references is array ? ✅
  - no extra keys ? ✅

RETURN ONLY JSON.NO EXTRA TEXT.

    CONTEXT:
${context}

  QUESTION:
${query}
  `

  const cacheKey = hashText(query + context + JSON.stringify(selectedFiles));

  // 🔥 CACHE CHECK
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const response = await llmService.generateText(prompt);

  // 🔥 STORE CACHE
  setCache(cacheKey, response);

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

  //   return console.log(check);
  const intent = await detectRoutingIntent(query);
  const intentObject = safeParseJSON(intent)

  let response;

  // return console.log(intent);






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
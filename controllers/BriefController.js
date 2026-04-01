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
function hashText(text) {
  return crypto
    .createHash("sha256")
    .update(text)
    .digest("hex");
}

const limit = pLimit(5);

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



const checkAndResetDailyUsage = async (userInfo) => {
  const user = await User.findById(userInfo._id)
  if (user.pro) {
    return;
  }
  const now = new Date();
  const last = new Date(user.dailyUsage.lastReset);

  const isSameDay =
    now.getDate() === last.getDate() &&
    now.getMonth() === last.getMonth() &&
    now.getFullYear() === last.getFullYear();

  if (!isSameDay) {
    user.dailyUsage.chatCount = 0;
    user.dailyUsage.uploadCount = 0;
    user.dailyUsage.lastReset = now;

    await user.save();
  }
};




cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  timeout: 120000
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


const isProUser = async (user) => {
  const userLimit = await Subscription.find({ userId: user._id, status: "active" });
  if (!userLimit) return false;

  const expiry = userLimit?.currentPeriodEnd;

  return expiry && new Date(expiry) > new Date();
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
    const user = req.user;
    const fileCount = await File.countDocuments({ user_id: user._id });
    // return console.log(user_file_length);
    const MIN_REQUIRED_CHUNKS = 1;

    if (!files || files.length === 0) {
      return res.status(400).json({
        status: false,
        error: "No files uploaded"
      });
    }

    const storedFiles = [];

    for (const file of files) {
      // await checkAndResetDailyUsage(user);

      if (!isProUser(user) && fileCount >= 5) {
        return res.status(403).json({
          message: "You’ve reached the 5-file storage limit. Upgrade to Pro and enjoy expanded memory space.",
          type: "limit"
        });
      }
      let cloudResult;

      try {
        // 1️⃣ Upload to Cloudinary
        // cloudResult = await uploadToCloudinary(
        //   file.buffer,
        //   file.originalname
        // );

        // 2️⃣ Create file record (temporary)
        const fileDoc = await File.create({
          user_id: user._id,
          filename: file.originalname,
          // cloudinary_url: cloudResult.secure_url,
          // cloudinary_id: cloudResult.public_id,
          status: "processing",
          mimetype: file.mimetype,
          size: file.size,
          total_chunks: 0
        });

        // if (!user.pro) {
        //   const user_file_limit = await User.findById(user._id);
        //   if (user_file_limit) {
        //     user_file_limit.dailyUsage.uploadCount += 1;
        //     await user_file_limit.save();
        //     console.log("User limit updated");
        //   }

        // }


        // 3️⃣ Extract text
        const extractedText = await extractText(file);

        if (!extractedText || !extractedText.trim()) {
          // await cloudinary.uploader.destroy(cloudResult.public_id);
          await File.deleteOne({ _id: fileDoc._id });

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

        const existingChunks = await Chunk.find({
          user_id: user._id
        }).select("chunk_hash");

        const existingHashes = new Set(
          existingChunks.map(c => c.chunk_hash)
        );

        // const chunkDocs = await Promise.all(
        //   chunks.map((chunk, i) =>
        //     limit(async () => {
        //       try {
        //         const hash = hashText(chunk);

        //         // 🔍 check duplicate
        //         const exists = await Chunk.findOne({
        //           user_id: user._id,
        //           chunk_hash: hash
        //         });

        //         if (exists) return null;

        //         // ⚡ generate embedding
        //         const embedding = await llmService.generateEmbedding(chunk);

        //         if (!embedding || !embedding.length) {
        //           console.error("Embedding failed for chunk:", i);
        //           return null;
        //         }

        //         return {
        //           user_id: user._id,
        //           file_id: fileDoc._id,
        //           filename: file.originalname,
        //           chunk_index: i,
        //           text: chunk,
        //           chunk_hash: hash,
        //           embedding,
        //           embedding_provider: process.env.LLM_PROVIDER,
        //           embedding_dimension: embedding.length
        //         };

        //       } catch (err) {
        //         console.error("Chunk error:", i, err);
        //         return null;
        //       }
        //     })
        //   )
        // );

        const BATCH_SIZE = 100;
        const batches = createBatches(chunks, BATCH_SIZE);

        const chunkDocs = [];

        for (let b = 0; b < batches.length; b++) {
          const batch = batches[b];

          try {
            // ⚡ Generate embeddings for full batch
            const embeddings = await Promise.all(
              batch.map(chunk => llmService.generateEmbedding(chunk))
            );

            for (let i = 0; i < batch.length; i++) {
              const chunk = batch[i];
              const embedding = embeddings[i];

              if (!embedding || !embedding.length) continue;

              const hash = hashText(chunk);

              // 🔍 duplicate check
              if (existingHashes.has(hash)) continue;

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
            console.error("Batch error:", b, err);
          }
        }

        // ✅ remove null values
        const validChunks = chunkDocs.filter(Boolean);


        // ❌ STRICT VALIDATION
        if (chunks.length < MIN_REQUIRED_CHUNKS) {
          // await cloudinary.uploader.destroy(cloudResult.public_id);
          await File.deleteOne({ _id: fileDoc._id });

          storedFiles.push({
            filename: file.originalname,
            file_id: fileDoc._id,
            status: "failed",
            reason: "Unable to extract the text from the file, please try with some other file\n"
          });
          continue;
        }

        // ✅ Store chunks
        await Chunk.insertMany(validChunks);

        // ✅ Update file as indexed
        await File.updateOne(
          { _id: fileDoc._id },
          {
            status: "indexed",
            total_chunks: validChunks.length
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

        // if (cloudResult?.public_id) {
        //   await cloudinary.uploader.destroy(cloudResult.public_id);
        // }

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

  console.log("Executed");


  // step 1  : intend detection 

  // return console.log(user);



  const questionEmbedding = await llmService.generateEmbedding(query);     // step 1 : embed the query   i tested here for llmService embeddings are working
  if (!questionEmbedding) {
    return res.json({
      answer: "Failed to process your query.",
      references: []
    });
  }


  // return console.log(questionEmbedding);
  // step 2 : fetch chunks 

  const queryFilter = {
    user_id: user._id.toString()
  };

  // return console.log(queryFilter);
  filename = "";

  if (selectedFiles.length > 0) {
    queryFilter.file_id = { $in: selectedFiles };

  }

  const chunks = await Chunk.aggregate([
    {
      $vectorSearch: {
        queryVector: questionEmbedding,
        path: "embedding",
        numCandidates: 500,
        limit: 5,
        index: "vector_index",
        filter: queryFilter

      }
    },
    {
      $project: {
        text: 1,
        file_id: 1,
        score: { $meta: "vectorSearchScore" }
      }
    }
  ]);

  console.log(chunks)


  if (!chunks.length) {
    return JSON.stringify({
      answer: "I couldn’t find relevant information in your documents.",
      references: []
    });
  }

  const fileIds = [...new Set(chunks.map(c => c.file_id.toString()))];

  const files = await File.find({ _id: { $in: fileIds } })
    .select("_id filename");

  const fileMap = {};
  files.forEach(f => {
    fileMap[f._id.toString()] = f.filename;
  });

  const context = chunks
    .map((c, i) => {
      const filename = fileMap[c.file_id.toString()] || "Unknown";
      return `File: ${filename}\n chunk ${i + 1} : ${c.text}`;
    })
    .join("\n\n");


  console.log(context);
  // const chunks = await Chunk.find(queryFilter);
  // if (chunks.length > 0) {

  // }
  // else {
  //   return { "answer": "Looks like you have'nt uploaded any files yet, upload files here to create you second brain ready for you !" };
  // }




  // const MIN_SCORE = 0.53;
  // const scoredChunks = await Promise.all(
  //   chunks.map(async (chunk) => {
  //     if (
  //       !chunk.embedding ||
  //       chunk.embedding_provider !== process.env.LLM_PROVIDER ||
  //       chunk.embedding_dimension !== questionEmbedding.length
  //     ) {
  //       return false;
  //     }
  //     const score = cosineSimilarity(questionEmbedding, chunk.embedding);

  //     if (score === null || score < MIN_SCORE) return false;

  //     const file = await File.findById(chunk.file_id).select("filename");
  //     console.log("filename : " + file);

  //     return {
  //       text: chunk.text,
  //       score,
  //       filename: file?.filename || "Unknown file",
  //     };
  //   })
  // );



  // // return console.log(scoredChunks);

  // const filteredResults = scoredChunks.filter(Boolean);

  // if (!filteredResults.length > 0) {
  //   return JSON.stringify({ answer: "I searched your document memory, but this context doesn’t seem to exist in your saved files yet." })
  // }






  // const topChunks = [];

  // for (const c of filteredResults) {
  //   if (topChunks.length < 5) {
  //     topChunks.push(c);
  //     topChunks.sort((a, b) => b.score - a.score);
  //   } else if (c.score > topChunks[4].score) {
  //     topChunks[4] = c;   // ✅ replace the WORST chunk
  //     topChunks.sort((a, b) => b.score - a.score);
  //   }
  // }




  // if (!topChunks.length) {
  //   return "I’m unable to find relevant information about the requested topic in the uploaded documents.";
  // }


  // return console.log(context);


  const prompt = `
  You are BriefMe AI, a smart memory assistant.

TASK:
Answer the user's request using ONLY the provided CONTEXT.

CORE RULES:
- The CONTEXT is your only source.
- Do NOT use external knowledge.
- Do NOT copy raw text directly.
- Understand and explain the data clearly.
- You are NOT a general AI assistant.
- You are ONLY a memory retrieval system.
- NEVER say:
  "I don't have information"
  "I don’t know"
  "No information about this person/thing/place..etc"

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
  { "answer": "I’m unable to find relevant information in the uploaded documents.", "references": [] }

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

  const response = await llmService.generateText(prompt);
  return response;

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

  // return console.log(fileNames);
  const files = await File.find({
    user_id: user._id,
    _id: { $in: fileId }
  }).lean();

  if (!files.length) {
    return JSON.stringify({
      answer: "Please specify valid files."
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
    .join("\n\n");


  if (!combinedText.trim()) {
    return JSON.stringify({ answer: "No meaningful content found in the document . looks like you have no data" })
  }
  const prompt = `
  You are BriefMe AI, a smart memory assistant.

TASK:
Answer the user's request using ONLY the provided CONTEXT.

CORE RULES:
- The CONTEXT is your only source.
- Do NOT use external knowledge.
- Do NOT copy raw text directly.
- Understand and explain the data clearly.

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
  { "answer": "I’m unable to find relevant information in the uploaded documents.", "references": [] }

FINAL CHECK BEFORE RETURN:
  - Single object ? ✅
  - answer is string ? ✅
  - references is array ? ✅
  - no extra keys ? ✅

RETURN ONLY JSON.NO EXTRA TEXT.

    CONTEXT:
${combinedText}

  QUESTION:
${query}
  `


  console.log(prompt);

  return await llmService.generateText(prompt);


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
  You are a breifme ai assistant
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


GREETING HANDLING (HIGH PRIORITY):

GENERAL QUESTION HANDLING:

If the user asks a general question about the assistant 
(e.g., "What is your name?", "Who are you?", "What can you do?") 
or any simple conversational question that does not require document access:

- answer naturally with a short answer
- Do NOT return intent classification
- Do NOT mention system logic

If the user message contains ONLY a greeting or simple conversational phrase 
(such as “hi”, “hello”, “good morning”, “how are you”, “thanks”, “bye”, etc.), 
and does not include any request, task, document reference, or informational question, then:

- Do NOT search any documents
- Do NOT perform any file-based processing
- Do NOT generate summaries or explanations
- answer naturally and appropriately to the greeting
- Keep the response short, polite, and conversational
- Match the tone of the user’s message
- Do NOT return any intent classification
- Do NOT mention system logic
- Return aan object that contains answer as key for greetings.



Important:
- Do NOT assume file usage unless a file is explicitly mentioned
- If no file is mentioned → NO_FILE_CONTEXT


OUTPUT FORMAT RULE (STRICT):

- ALWAYS return ONLY valid JSON
- Do NOT include markdown (no \`\`\`)
- Do NOT include explanation or extra text
- Response MUST start with { and end with }

FORMAT:

For classification:
{"answer":"SUMMARY"}
{"answer":"FILE_CONTEXT_REQUIRED"}
{"answer":"NO_FILE_CONTEXT"}

For greeting:
{"answer":"<short conversational reply>"}

STRICT VALIDATION RULES:
- Keys MUST use double quotes
- Values MUST use double quotes
- No trailing commas
- No additional fields
- Output must be parseable by JSON.parse()

User query:
"${query}"
`;
  const result = await llmService.generateText(prompt);
  return result.trim();

}



const FILE_CONTEXT_REQUIRED = async (query, selectedFiles, user) => {

  if (!selectedFiles || selectedFiles.length === 0) {
    return JSON.stringify({
      answer: "Please select at least one file to continue",
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
      answer: "There was a problem generating response, please try again.",
      references: []
    });
  }

  // 🔥 2. Vector search (FAST)
  const chunks = await Chunk.aggregate([
    {
      $vectorSearch: {
        queryVector: questionEmbedding,
        path: "embedding",
        numCandidates: 80,
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
        file_id: 1
      }
    }
  ]);

  console.log(chunks);

  if (!chunks.length) {
    return JSON.stringify({
      answer: "The selected files do not mention this topic.",
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

  console.log(topChunks);

  // 🔥 4. Build context (SMALL)
  const context = topChunks
    .map((c, i) => {
      const filename = fileMap[c.file_id.toString()] || "Unknown";
      return `Source ${i + 1} (${filename}):\n${c.text}`;
    })
    .join("\n\n");

  // 🔥 5. Prompt (clean + fast)
  const prompt = `
  You are BriefMe AI, a smart memory assistant.

TASK:
Answer the user's request using ONLY the provided CONTEXT.

CORE RULES:
- The CONTEXT is your only source.
- Do NOT use external knowledge.
- Do NOT copy raw text directly.
- Understand and explain the data clearly.

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
  { "answer": "I’m unable to find relevant information in the uploaded documents.", "references": [] }

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

  return await llmService.generateText(prompt);
};





const respond = async (req, res) => {
  const { query, selectedFiles = [] } = req.body;


  const user = req.user;
  await checkAndResetDailyUsage(user);

  const userObj = await User.findById(user._id);
  if (!userObj.pro && userObj.dailyUsage.chatCount >= 7) {
    return res.status(403).json({
      message: "Daily chat limit reached, upgrade to pro version and enjoy unintrepted services",
      type: "limit"
    });
  }



  if (!query) {
    return res.status(400).json({
      status: false,
      error: "Question is required"
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
    response = await respondHandler(query, user);
  }
  else {
    response = intentObject
  }




  const finalResponse = safeParseJSON(response);
  if (!userObj.pro) {
    userObj.dailyUsage.chatCount += 1
    await userObj.save()
  }
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
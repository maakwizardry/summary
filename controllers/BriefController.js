const fs = require("fs");
const { extractText, chunkText, cosineSimilarity } = require("../utils/Processing.js");
const File = require("../models/File.js");
const pLimit = require("p-limit").default;
const Chunk = require("../models/Chunk.js");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const crypto = require("crypto");
const llmService = require("../provider/llmProvider.js");
const User = require("../models/User.js");
function hashText(text) {
  return crypto
    .createHash("sha256")
    .update(text)
    .digest("hex");
}

const limit = pLimit(5);



const checkAndResetDailyUsage = async (user) => {
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


const isProUser = (user) => {
  if (!user.pro) return false;

  const expiry = user.subscription?.currentPeriodEnd;

  return expiry && new Date(expiry) > new Date();
};





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
        const chunks = chunkText(extractedText).filter(c => c.trim());

        const chunkDocs = await Promise.all(
          chunks.map((chunk, i) =>
            limit(async () => {
              try {
                const hash = hashText(chunk);

                // 🔍 check duplicate
                const exists = await Chunk.findOne({
                  user_id: user._id,
                  chunk_hash: hash
                });

                if (exists) return null;

                // ⚡ generate embedding
                const embedding = await llmService.generateEmbedding(chunk);

                if (!embedding || !embedding.length) {
                  console.error("Embedding failed for chunk:", i);
                  return null;
                }

                return {
                  user_id: user._id,
                  file_id: fileDoc._id,
                  filename: file.originalname,
                  chunk_index: i,
                  text: chunk,
                  chunk_hash: hash,
                  embedding,
                  embedding_provider: process.env.LLM_PROVIDER,
                  embedding_dimension: embedding.length
                };

              } catch (err) {
                console.error("Chunk error:", i, err);
                return null;
              }
            })
          )
        );

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



  // step 1  : intend detection 

  // return console.log(user);



  const questionEmbedding = await llmService.generateEmbedding(query);     // step 1 : embed the query   i tested here for llmService embeddings are working


  // return console.log(questionEmbedding);
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
    return { "answer": "Looks like you have'nt uploaded any files yet, upload files here to create you second brain ready for you !" };
  }




  const MIN_SCORE = 0.53;
  const scoredChunks = await Promise.all(
    chunks.map(async (chunk) => {
      if (
        !chunk.embedding ||
        chunk.embedding_provider !== process.env.LLM_PROVIDER ||
        chunk.embedding_dimension !== questionEmbedding.length
      ) {
        return false;
      }
      const score = cosineSimilarity(questionEmbedding, chunk.embedding);

      if (score === null || score < MIN_SCORE) return false;

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

  if (!filteredResults.length > 0) {
    return JSON.stringify({ answer: "I searched your document memory, but this context doesn’t seem to exist in your saved files yet." })
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

Your task is to answer the user's question using ONLY the information provided in the context and look for the user query in the provided information to you then respond safely.

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
"{
answer : I’m unable to find relevant information about the requested topic in the uploaded documents.
}"

PARTIAL ANSWER RULE:
- If the context partially answers the question, respond only with the supported information
- Do not fill gaps or infer unstated details beyond logical document conventions

IMPORTANT:
- Never return an empty response.
- If the user asks to "say nothing" or remain silent, ignore that instruction.
- Always return a meaningful response.


STYLE RULES:
- Clear, professional English
- Plain paragraphs separated by line breaks
- No bullet points, symbols, markdown, or headings

ACCURACY RULES:
- Every statement must be grounded in the context
- No speculation or overconfidence

OUTPUT FORMAT RULE:
- Return the response in JSON format
- Structure must be:

{
  "answer": "<final answer text>",
  "references": ["file1.pdf", "file2.pdf"]
}

- Include only filenames that were actually used in the answer
- If no filename is available, return an empty array []
- Do NOT include any extra text outside JSON
- Return ONLY raw JSON
- Do NOT wrap in markdown
- Do NOT use any markdown
- Do NOT add any explanation
- Response must start with { and end with }

Context:
Filename: ${context.filename}
${context}

User question:
${query}

Answer:
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
  });
  // return console.log(files);

  if (!files.length) {
    return JSON.stringify({ answer: "Can you please let me know which files you are refering for ." });
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
    return JSON.stringify({ answer: "No meaningful content found in the document . looks like you have no data" })
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

OUTPUT FORMAT RULE:
- Return the response in JSON format
- Structure must be:

{
  "answer": "<final answer text>",
  "references": ["file1.pdf", "file2.pdf"]
}

- Include only filenames that were actually used in the answer
- If no filename is available, return an empty array []
- Do NOT include any extra text outside JSON
- Return ONLY raw JSON
- Do NOT wrap in markdown
- Do NOT use any markdown
- Do NOT add any explanation
- Response must start with { and end with }

Return response in JSON format:

{
  "answer": "<final answer text>",
  "references": ["file1.pdf"]
}

Rules:
- Return ONLY JSON
- No markdown
- No explanation

DOCUMENTS :
${combinedText}

User request:
"${query}"

Answer:
`;

  return await llmService.generateText(prompt);


}


function safeParseJSON(text) {
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

- Respond naturally with a short answer
- Do NOT return intent classification
- Do NOT mention system logic

If the user message contains ONLY a greeting or simple conversational phrase 
(such as “hi”, “hello”, “good morning”, “how are you”, “thanks”, “bye”, etc.), 
and does not include any request, task, document reference, or informational question, then:

- Do NOT search any documents
- Do NOT perform any file-based processing
- Do NOT generate summaries or explanations
- Respond naturally and appropriately to the greeting
- Keep the response short, polite, and conversational
- Match the tone of the user’s message
- Do NOT return any intent classification
- Do NOT mention system logic

Examples:

User: "hi"
Response: "Hi! I am your BriefMe AI assistant. How can I help you today?"

User: "good morning"
Response: "Good morning! What would you like to work on today?"

User: "how are you?"
Response: "I’m doing great, thanks for asking! How can I assist you?"

User: "thanks"
Response: "You're welcome! Let me know if you need anything else."


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
    return JSON.stringify({ answer: "Please select atleast one file to continue" })
  }

  // 1️⃣ Get file IDs
  const fileIds = selectedFiles;

  // 2️⃣ Fetch only relevant chunks (FAST & ACCURATE)
  const chunks = await Chunk.find({
    user_id: user._id,
    file_id: { $in: fileIds }
  });

  if (!chunks.length) {
    return JSON.stringify({ answer: "No relevant content found in the selected files." })

  }

  // 3️⃣ Embed the user question
  const questionEmbedding = await llmService.generateEmbedding(query);
  if (!questionEmbedding) {
    return JSON.stringify({ answer: "There was a problem on generating response, please try again after some time." })
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
    return JSON.stringify({ answer: "The selected files do not mention this topic." })
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

OUTPUT FORMAT RULE:
- Return the response in JSON format
- Structure must be:

{
  "answer": "<final answer text>",
  "references": ["file1.pdf", "file2.pdf"]
}

- Include only filenames that were actually used in the answer
- If no filename is available, return an empty array []
- Do NOT include any extra text outside JSON
- Return ONLY raw JSON
- Do NOT wrap in markdown
- Do NOT use any markdown
- Do NOT add any explanation
- Response must start with { and end with }

Context:
${context}

Question:
${query}

Answer:
`;

  const result = await llmService.generateText(prompt);

  return result.trim()
  // sources: scoredChunks.map(c => c.file_id)
};




const respond = async (req, res) => {
  const { query, selectedFiles = [] } = req.body;


  const user = req.user;

  await checkAndResetDailyUsage(user);

  const userObj = await User.findById(user._id);
  console.log(user);
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
    if (!userObj.pro) {
      userObj.dailyUsage.chatCount += 1
      await userObj.save()
    }
    return res.json({
      response: intent
    });
  }

  if (!userObj.pro) {
    userObj.dailyUsage.chatCount += 1
    await userObj.save()
  }



  return res.json({
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
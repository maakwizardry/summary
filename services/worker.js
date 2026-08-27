const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const File = require("../models/File.js");
const Job = require("../models/Job.js");
const Chunk = require("../models/Chunk.js");
const { extractText, chunkText } = require("../utils/Processing.js");
const llmService = require("../provider/llmProvider.js");
const pLimit = require("p-limit").default;
const crypto = require("crypto");

const limit = pLimit(5);

function hashText(text) {
  return crypto
    .createHash("sha256")
    .update(text)
    .digest("hex");
}

function createBatches(array, size) {
  const batches = [];
  for (let i = 0; i < array.length; i += size) {
    batches.push(array.slice(i, i + size));
  }
  return batches;
}

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

async function processJob(job) {
  try {
    console.log(`[Worker] Starting job ${job._id} for file ${job.originalname}`);
    const fileDoc = await File.findById(job.fileId);
    if (!fileDoc) throw new Error("File document not found");

    const file = {
      path: job.filePath,
      originalname: job.originalname,
      mimetype: job.mimetype,
    };

    // 3️⃣ Extract text
    const extractedText = await extractText(file);

    if (!extractedText || !extractedText.trim()) {
      await File.updateOne(
        { _id: fileDoc._id },
        { status: "failed", message: "The uploaded document contains no extractable text." }
      );
      throw new Error("No readable text found");
    }

    // 4️⃣ Chunk text
    const chunks = chunkText(extractedText).filter(c => c.trim());

    if (chunks.length === 0) {
      await File.updateOne(
        { _id: fileDoc._id },
        { status: "failed", message: "Failed to process document content. Please ensure the file is text-readable and try again." }
      );
      throw new Error("Failed to process document content.");
    }

    const BATCH_SIZE = 50;
    const batches = createBatches(chunks, BATCH_SIZE);
    let failedChunks = 0;
    const chunkDocs = [];

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      try {
        const embeddings = await Promise.all(
          batch.map(chunk => limit(() => generateWithRetry(chunk)))
        );

        for (let i = 0; i < batch.length; i++) {
          const chunk = batch[i];
          const embedding = embeddings[i];

          if (!embedding || !embedding.length) {
            failedChunks++;
            continue;
          }

          const hash = hashText(chunk);

          chunkDocs.push({
            user_id: job.userId,
            file_id: fileDoc._id,
            filename: job.originalname,
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

    const validChunks = chunkDocs.filter(Boolean);

    if (validChunks.length > 0) {
      await Chunk.insertMany(validChunks, { ordered: false });
    }

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

    // Job completed successfully
    job.status = "completed";
    await job.save();
    console.log(`[Worker] Completed job ${job._id}`);
  } catch (error) {
    console.error(`[Worker] Error processing job ${job._id}:`, error);
    job.status = "failed";
    job.error = error.message;
    await job.save();

    await File.updateOne(
      { _id: job.fileId },
      {
        status: "failed",
        message: "File processing error. Please try again later."
      }
    );
  } finally {
    // Delete temp file
    if (job.filePath && fs.existsSync(job.filePath)) {
      fs.unlinkSync(job.filePath);
    }
  }
}

async function deleteJob(job) {
  try {
    console.log(`[Worker] Deleting file ${job.fileId}`);

    // Delete all related chunks
    await Chunk.deleteMany({ file_id: job.fileId });

    // Delete file record
    await File.deleteOne({ _id: job.fileId });

    job.status = "completed";
    await job.save();
    console.log(`[Worker] Delete job ${job._id} completed`);
  } catch (error) {
    console.error(`[Worker] Delete job ${job._id} failed:`, error);
    job.status = "failed";
    job.error = error.message;
    await job.save();
  }
}

async function startWorker() {
  console.log("🚀 Starting Background Worker...");

  // Continuously poll for jobs
  setInterval(async () => {
    try {
      // Find one pending job and mark it as processing atomically
      const job = await Job.findOneAndUpdate(
        { status: "pending" },
        { status: "processing" },
        { new: true }
      );

      if (job) {
        if (job.type === "delete") {
          await deleteJob(job);
        } else {
          await processJob(job);
        }
      }
    } catch (error) {
      console.error("[Worker] Polling error:", error);
    }
  }, 5000); // Poll every 5 seconds
}

module.exports = { startWorker };

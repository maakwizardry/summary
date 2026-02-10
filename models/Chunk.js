const mongoose = require("mongoose");

const ChunkSchema = new mongoose.Schema(
    {
        // User who owns this memory
        user_id: {
            type: String,
            required: true,
            index: true,
        },

        // File reference (parent document)
        file_id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },

        // Order of chunk in the file
        chunk_index: {
            type: Number,
            required: true,
        },

        // Chunk text content
        text: {
            type: String,
            required: true,
        },
        chunk_hash: {
            type: String,
            index: true
        }
        ,

        // Vector embedding
        embedding: {
            type: [Number],
            required: true,
        },
    },
    {
        timestamps: true, // adds createdAt & updatedAt
    }
);

// Helpful compound index
ChunkSchema.index({ file_id: 1, chunk_index: 1 });

module.exports = mongoose.model("Chunk", ChunkSchema);

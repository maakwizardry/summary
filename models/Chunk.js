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
        embedding_provider: {
            type: String,
            required: true
        },

        embedding_dimension: {
            type: Number,
            required: true
        },

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
ChunkSchema.index({ user_id: 1, text: "text" });

module.exports = mongoose.model("Chunk", ChunkSchema);

const mongoose = require("mongoose");

const FileSchema = new mongoose.Schema(
    {
        // 🔑 internal reference
        // 👤 ownership
        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        // 👀 USER-FACING (used for @mentions)
        filename: {
            type: String,
            required: true,
            index: true
        },

        path: {
            type: String,
            required: true
        },

        status: {
            type: String,
            enum: ["uploaded", "indexing", "ready", "failed"],
            default: "uploaded"
        },

        // 📄 metadata
        mimetype: {
            type: String,
            required: true
        },

        size: {
            type: Number,
            required: true
        },

        // ⚙️ processing state

        // 📊 optional stats
        total_chunks: {
            type: Number,
            default: 0
        },
    },
    {
        timestamps: true // createdAt, updatedAt
    }
);

module.exports = mongoose.model("File", FileSchema);

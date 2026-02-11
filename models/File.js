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

        cloudinary_url: {
            type: String,
            required: true,
        },

        cloudinary_id: {
            type: String,
            required: true,
            index: true, // useful for delete operations
        },
        status: {
            type: String,
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
        reason: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true // createdAt, updatedAt
    }
);

module.exports = mongoose.model("File", FileSchema);

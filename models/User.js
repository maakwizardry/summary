const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        trim: true
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },

    password: {
        type: String,
        required: function () {
            return this.authProvider === "local";
        }
    },

    googleId: {
        type: String
    },

    authProvider: {
        type: String,
        enum: ["local", "google"],
        default: "local"
    },

    // 🔥 QUICK ACCESS FLAG (important)
    pro: {
        type: Boolean,
        default: false
    },

    // 🔥 SUBSCRIPTION DETAILS

    // 🔥 USAGE TRACKING
    dailyUsage: {
        chatCount: {
            type: Number,
            default: 0
        },
        uploadCount: {
            type: Number,
            default: 0
        },
        lastReset: {
            type: Date,
            default: Date.now
        }
    },

    // 🔐 AUTH / VERIFICATION
    otp: String,

    isVerified: {
        type: Boolean,
        default: false
    },

    // ⚡ FEATURE LIMIT CONTROL (for free users)
    limit: {
        type: Number,
        default: 0
    }

}, {
    timestamps: true
});

module.exports = mongoose.model("User", userSchema);
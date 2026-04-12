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
    emailVerifyToken: String,
    emailVerifyExpires: Date,

    isVerified: {
        type: Boolean,
        default: false
    },

    resetPasswordToken: {
        type: String,
        default: null
    },
    resetPasswordExpires: {
        type: Date,
        default: null
    },

    // ⚡ FEATURE LIMIT CONTROL (for free users)
    limit: {
        type: Number,
        default: 0
    }
    ,
    SubscriptionStatus: {
        type: String,
        enum: ["active", "cancelled", "expired", "past_due", null],
        default: null
    },

}, {
    timestamps: true
});

module.exports = mongoose.model("User", userSchema);
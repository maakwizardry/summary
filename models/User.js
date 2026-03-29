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
    subscription: {
        id: String,                     // Lemon subscription ID
        status: {
            type: String,
            enum: ["active", "cancelled", "expired", "past_due", null],
            default: null
        },
        plan: {
            type: String,
            default: null
        },
        startDate: Date,
        currentPeriodEnd: Date,         // renews_at
        variantId: String,              // plan identifier
        cancelled: {
            type: Boolean,
            default: false
        }
    },

    // 🔥 Lemon customer ID (keep outside for easy access)
    customerId: {
        type: String
    },

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
    timestamps: true // 🔥 replaces your manual "date"
});

module.exports = mongoose.model("User", userSchema);
const mongoose = require("mongoose");
const userSchema = mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    googleId: {
        type: String,
    },
    authProvider: {
        type: String,
        enum: ["local", "google"],
        default: "local",
    },

    pro: {
        type: Boolean,
        default: false
    },
    otp: {
        type: String,
    },
    limit: {
        type: Number,
        default: 0,
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    date: {
        type: Date,
        default: Date.now,
    }
})
module.exports = mongoose.model("User", userSchema);
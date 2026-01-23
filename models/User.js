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
    pro : {
        type : Boolean,
        default : false
    },
    otp: {
        type: String,
    },
    limit : {
        type : Number,
        default : 0,
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
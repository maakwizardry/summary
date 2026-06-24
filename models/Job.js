const mongoose = require("mongoose");

const JobSchema = new mongoose.Schema({
  fileId: { type: mongoose.Schema.Types.ObjectId, ref: "File", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  filePath: { type: String, required: true },
  originalname: { type: String, required: true },
  mimetype: { type: String, required: true },
  status: { type: String, enum: ["pending", "processing", "completed", "failed"], default: "pending" },
  error: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("Job", JobSchema);

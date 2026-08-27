const mongoose = require("mongoose");

const JobSchema = new mongoose.Schema({
  type: { type: String, enum: ["process", "delete"], default: "process" },
  fileId: { type: mongoose.Schema.Types.ObjectId, ref: "File", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  // process-specific fields (optional for delete jobs)
  filePath: { type: String, default: "" },
  originalname: { type: String, default: "" },
  mimetype: { type: String, default: "" },
  status: { type: String, enum: ["pending", "processing", "completed", "failed"], default: "pending" },
  error: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("Job", JobSchema);

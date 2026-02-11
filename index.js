// index.js
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const morgan = require("morgan");
const UserRouter = require("./routes/userRoute");
const BriefRouter = require("./routes/BriefRoute");
const ContactRouter = require("./routes/ContactRoute");
const PaymentRouter = require("./routes/PaymentRoute");
const connectDB = require("./config/db");
const userMiddleware = require("./middleware/userMiddleware");
const UserModel = require('./models/User');
const File = require('./models/File');



// Load env variables
dotenv.config();


// Initialize app
const app = express();

// CORS Configuration
const corsOptions = {
  origin: [
    'http://localhost:5173',        // Local development (Vite default)
    'http://localhost:5174',        // Local development (alternative Vite port)
    'http://localhost:3000',        // Alternative local port (React/Next.js)
    'https://www.getsummaryapp.com', // Production frontend (new domain),
    'https://getsummaryapp.com' // Production frontend (new domain)
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Middleware
app.use(express.json()); // Parse JSON bodies
app.use(cors(corsOptions)); // Enable CORS with config
app.use(morgan("dev"));  // Logger


app.get('/api/memory/files', userMiddleware, async (req, res) => {
  try {
    const files = await File.find({ user_id: req.user._id });
    res.status(200).json(files);
  } catch (error) {
    console.error("Error fetching files:", error);
    res.status(500).json({ message: "Internal server error" });
  }
})

app.use("/api/users", UserRouter);
app.use("/api/process", BriefRouter);
app.use("/api/contactus", ContactRouter);
app.use("/api/payment", PaymentRouter);



// Root route
app.get("/", async (req, res) => {
  // console.log("hi"); // MUST be 768
});



app.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;
    const user_id = payload.meta.custom_data.user_id;
    console.log("Webhook received for user ID:", user_id);
    const updateUser = await UserModel.updateOne({ _id: user_id }, { $set: { pro: true } });
    res.status(200).send("Ok");


  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(400).send("Webhook handler failed");
  }
});

// Connect to database
connectDB();

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`✅ Server is running on port ${PORT}`);
});

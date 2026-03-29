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
const User = require('./models/User');
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
    // console.error("Error fetching files:", error);
    res.status(500).json({ message: "Internal server error" });
  }
})

app.use("/api/users", UserRouter);
app.use("/api/process", BriefRouter);
app.use("/api/contactus", ContactRouter);
app.use("/api/payment", PaymentRouter);



// Root route
app.get("/", async (req, res) => {
  console.log("hi"); // MUST be 768
});
app.post("/api/lemonsqueezy/webhook", async (req, res) => {
  console.log("🔥 WEBHOOK HIT");

  try {
    const event = req.body;

    const eventName = event.meta?.event_name;
    const userId = event.meta?.custom_data?.user_id;

    console.log("Event:", eventName);
    console.log("User ID:", userId);

    // ❌ Safety check
    if (!userId) {
      console.log("❌ No userId found");
      return res.sendStatus(200);
    }

    // =========================
    // ✅ SUBSCRIPTION CREATED
    // =========================
    if (eventName === "subscription_created") {
      const sub = event.data;

      await User.findByIdAndUpdate(userId, {
        pro: true,
        customerId: sub.attributes.customer_id,
        subscription: {
          id: sub.id,
          status: sub.attributes.status,
          plan: "pro",
          startDate: sub.attributes.created_at,
          currentPeriodEnd: sub.attributes.renews_at,
          variantId: sub.attributes.variant_id,
          cancelled: false
        }
      });

      console.log("✅ User upgraded to PRO");
    }

    // =========================
    // 🔁 SUBSCRIPTION UPDATED
    // =========================
    if (eventName === "subscription_updated") {
      const sub = event.data; w

      await User.findByIdAndUpdate(userId, {
        "subscription.status": sub.attributes.status,
        "subscription.currentPeriodEnd": sub.attributes.renews_at,
        "subscription.cancelled": sub.attributes.cancelled
      });

      console.log("🔁 Subscription updated");
    }

    // =========================
    // ❌ SUBSCRIPTION CANCELLED
    // =========================
    if (eventName === "subscription_cancelled") {
      await User.findByIdAndUpdate(userId, {
        pro: false,
        "subscription.status": "cancelled",
        "subscription.cancelled": true
      });

      console.log("❌ Subscription cancelled");
    }

    // =========================
    // ⌛ SUBSCRIPTION EXPIRED
    // =========================
    if (eventName === "subscription_expired") {
      await User.findByIdAndUpdate(userId, {
        pro: false,
        "subscription.status": "expired"
      });

      console.log("⌛ Subscription expired");
    }

    res.sendStatus(200);

  } catch (err) {
    console.error("Webhook Error:", err);
    res.sendStatus(500);
  }
});


// app.post("/webhook", async (req, res) => {
//   try {
//     const payload = req.body;
//     const user_id = payload.meta.custom_data.user_id;
//     console.log("Webhook received for user ID:", user_id);
//     const updateUser = await User.updateOne({ _id: user_id }, { $set: { pro: true } });
//     res.status(200).send("Ok");


//   } catch (error) {
//     console.error("Webhook Error:", error);
//     res.status(400).send("Webhook handler failed");
//   }
// });

// Connect to database
connectDB();

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`✅ Server is running on port ${PORT}`);
});

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
const mongoose = require("mongoose");
const File = require('./models/File');
const Subscription = require('./models/Subscription');



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


  const event = req.body;

  const eventName = event.meta?.event_name;
  const userId = event.meta?.custom_data?.user_id;



  // ❌ Safety check
  if (!userId) {
    console.log("❌ No userId found");
    return res.sendStatus(200);
  }

  // =========================
  // ✅ SUBSCRIPTION CREATED
  // =========================
  try {
    if (eventName === "subscription_created") {
      // await Subscription.updateMany(
      //   { userId: userId, status: "active" },
      //   { status: "expired" }
      // );
      console.log(event);

      const sub = event.data;
      const attr = sub.attributes; // ✅ FIXED

      const response = await Subscription.findOneAndUpdate(
        { subscriptionId: sub.id },
        {
          subscriptionId: sub.id, // ✅ IMPORTANT
          userId: userId,
          customerId: attr.customer_id,
          orderId: attr.order_id,
          variantId: attr.variant_id,
          productId: attr.product_id,
          name: attr.product_name,
          variantName: attr.variant_name,
          status: attr.status,
          plan: "pro",
          startDate: new Date(attr.created_at), // ✅ better
          currentPeriodEnd: new Date(attr.renews_at), // ✅ better
          cancelled: attr.cancelled,
          test_mode: attr.test_mode,
          customerPortalUrl: attr.urls.customer_portal,
          updatePaymentUrl: attr.urls.update_payment_method,
        },
        { upsert: true, new: true }
      );
      console.log(response);
      console.log("✅ Subscription saved/updated");
      return res.sendStatus(200);
    }

  } catch (e) {
    console.log(e);
    return res.status(500)
  }


  // =========================
  // 🔁 SUBSCRIPTION UPDATED
  // =========================
  if (eventName === "subscription_updated") {
    try {
      const sub = event.data;
      const attr = sub.attributes;

      await Subscription.findOneAndUpdate(
        { subscriptionId: sub.id }, // 🔥 match using subscriptionId
        {
          status: attr.status,
          currentPeriodEnd: new Date(attr.renews_at),
          cancelled: attr.cancelled
        }
      );

      console.log("🔁 Subscription updated");
      return res.sendStatus(200);

    } catch (err) {
      console.error("❌ Error updating subscription:", err);
      return res.sendStatus(500);
    }
  }

  // =========================
  // ❌ SUBSCRIPTION CANCELLED
  // =========================
  if (eventName === "subscription_cancelled") {
    try {
      const sub = event.data;
      const attr = sub.attributes;

      // ✅ Update Subscription collection
      await Subscription.findOneAndUpdate(
        { subscriptionId: sub.id },
        {
          status: "cancelled",
          cancelled: true
        }
      );

      // ✅ KEEP USER AS PRO (IMPORTANT)
      await User.findByIdAndUpdate(userId, {
        pro: true
      });

      console.log("❌ Subscription cancelled (but still active until expiry)");
      return res.sendStatus(200);

    } catch (err) {
      console.error("❌ Error cancelling subscription:", err);
      return res.sendStatus(500);
    }
  }

  // =========================
  // ⌛ SUBSCRIPTION EXPIRED
  // =========================
  if (eventName === "subscription_expired") {
    try {
      const sub = event.data;

      // ✅ 1. Update Subscription collection (MAIN SOURCE)
      await Subscription.findOneAndUpdate(
        { subscriptionId: sub.id },
        {
          status: "expired"
        }
      );

      // ✅ 2. Remove PRO access from user
      await User.findByIdAndUpdate(userId, {
        pro: false
      });

      console.log("⌛ Subscription expired");
      return res.sendStatus(200);

    } catch (err) {
      console.error("❌ Error handling expiry:", err);
      return res.sendStatus(500);
    }
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

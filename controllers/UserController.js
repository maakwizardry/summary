const User = require("../models/User");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const sendMail = require("../utils/sendMail");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const { stat } = require("fs");


const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // 1. Validate inputs
    if (!email || !password || !username) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // 2. Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered", existingUser });
    }

    // 3. Hash the password
    const salt = await bcrypt.genSalt(12); // strong salt rounds
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Generate OTP (6 digits, secure random)
    const otp = crypto.randomInt(100000, 999999);

    // 5. Create new user
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      otp,
    });

    await newUser.save();
    const status = sendMail({ to: newUser.email, subject: "OTP verification", otp: newUser.otp });

    // 6. TODO: Send OTP via email or SMS (e.g., using nodemailer or Twilio)

    if (status) {
      return res.status(201).json({ message: "User registered successfully. Verify OTP.", otp, email: newUser.email });
    }
    else {
      return res.status(500).json({
        message: "User registered, but failed to send OTP email.",
        error: status.error,
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// login function .

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    // 2. Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // 3. Check verification
    if (!user.isVerified) {
      return res.status(403).json({ message: "Please verify your OTP first" });
    }

    // 4. Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // 5. Generate JWT
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // 6. Send response
    return res.status(200).json({
      message: "Login successful",
      token,
      email: user.email
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};


// verify OTP .
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;


    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "User already verified" });
    }

    // Check OTP validity
    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }


    // Mark user as verified
    user.isVerified = true;
    user.otp = null;
    await user.save();

    res.status(200).json({ message: "OTP verified successfully" });
  } catch (error) {
    console.error("Verify OTP Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// get user profile 
const getUserProfile = async (req, res) => {
  if (!req.user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.status(200).json({
    id: req.user._id,
    email: req.user.email,
    pro: req.user.pro,
    name: req.user.name, // include other safe fields
  });
};

const Google = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: "Google token missing" });
    }

    // 1️⃣ Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, email_verified, sub: googleId } = payload;

    if (!email || !email_verified) {
      return res.status(401).json({ message: "Google email not verified" });
    }

    // 2️⃣ Find user by EMAIL ONLY
    let user = await User.findOne({ email });

    // 3️⃣ If user exists
    if (user) {
      // 🚫 Email/password user trying Google
      if (user.authProvider === "local") {
        return res.status(409).json({
          message: "An account already exists with this email please try to use login with password .",
        });
      }

      // ✅ Google user logging in again
      if (!user.googleId) {
        user.googleId = googleId;
        await user.save();
      }
    }

    // 4️⃣ Create new Google user if not exists
    if (!user) {
      user = await User.create({
        email,
        password: "GOOGLE_AUTH",
        googleId,
        authProvider: "google",
        isVerified: true,
        limit: 0,
        pro: false,
      });
    }

    // 5️⃣ Issue app JWT
    const appToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      token: appToken,
      email: user.email,
      userId: user._id,
      status: true,
    });

  } catch (err) {
    console.error("Google Sign-In Error:", err);
    return res.status(401).json({ message: "Invalid Google token" });
  }
};



module.exports = { register, login, verifyOtp, getUserProfile, Google };

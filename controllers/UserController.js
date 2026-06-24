const User = require("../models/User");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const sendMail = require("../utils/sendMail");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const cron = require("node-cron");
const { stat } = require("fs");


const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const HOURS_LIMIT = 24;


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
      return res.status(400).json({ message: "An account already exists with this email address." });
    }

    // 3. Hash the password
    const salt = await bcrypt.genSalt(12); // strong salt rounds
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Generate OTP (6 digits, secure random)
    const token = crypto.randomBytes(32).toString('hex');

    // 5. Create new user
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      emailVerifyToken: token,
      emailVerifyExpires: Date.now() + 1000 * 60 * 10 // 10 mins,
    });

    await newUser.save();
    const verifyUrl = `${process.env.FRONTEND_URL}/verify?token=${token}`;
    const status = await sendMail({ to: newUser.email, name: newUser.username, type: "verify", url: verifyUrl });

    const identityToken = jwt.sign(
      { user_id: newUser._id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // 6. TODO: Send OTP via email or SMS (e.g., using nodemailer or Twilio)

    if (status) {
      return res.status(201).json({ message: "Account created successfully.", token: identityToken, email: newUser.email });
    }
    return res.status(500).json({
      message: "Unable to send verification link. Please try again later.",
      error: status.error,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong." });

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

    // 4. Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Email or password is incorrect" });
    }

    if (!user.isVerified) {

      const identityToken = jwt.sign(
        { user_id: user._id },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );
      return res.status(403).json({ message: "Please verify your email to continue", status: "unverified", token: identityToken });
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
      username: user.username,
      email: user.email
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong." });

  }
};

const verifyUser = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }
    const user = await User.findOne({ emailVerifyToken: token, emailVerifyExpires: { $gt: Date.now() } });
    if (!user) {
      return res.status(404).json({ message: "Token has expired or broken" });
    }
    if (user.isVerified) {
      return res.status(400).json({ message: "User was already verified", status: "verified" });
    }
    user.isVerified = true;
    user.emailVerifyToken = null;
    user.emailVerifyExpires = null;
    await user.save();
    const status = await sendMail({ to: user.email, name: user.username, type: "welcome", url: `${process.env.FRONTEND_URL}/summary` });
    if (status) {
      console.log("Welcome email sent successfully");
    }
    else {
      console.log("Failed to send welcome email");
    }
    return res.status(200).json({ message: "User verified successfully", status: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong." });

  }
}




// get user profile 
const getUserProfile = async (req, res) => {
  if (!req.user) {
    return res.status(404).json({ message: "We couldn't found any account with this email address" });
  }

  try {
    const user = await User.findById(req.user._id);
    console.log(user);

    return res.status(200).json({
      id: user._id,
      email: user.email,
      username: user.username,
      subscriptionStatus: user.subscriptionStatus,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      authProvider: user.authProvider,
      dailyUsage: user.dailyUsage,
      createdAt: user.createdAt,
    });
  }
  catch (e) {
    return res.status(500).json({ message: "Something went wrong." });
  }
};

const updateProfile = async (req, res) => {
  if (!req.user) {
    return res.status(404).json({ message: "Unauthorized" });
  }

  try {
    const { username, password } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (username) {
      user.username = username;
    }

    if (password && user.authProvider === "local") {
      const salt = await bcrypt.genSalt(12);
      user.password = await bcrypt.hash(password, salt);
    }

    await user.save();

    return res.status(200).json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
        authProvider: user.authProvider,
        dailyUsage: user.dailyUsage
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

const isLoggedIn = async (req, res) => {
  if (!req.user) {
    return res.status(404).json({ message: "Unauthourized" });
  }
  const user = await User.findById(req.user._id);

  return res.status(200).json({
    id: user._id,
    email: user.email,
    isVerified: user.isVerified,

  });
}

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
      return res.status(401).json({ message: "Please verify your google account to continue" });
    }

    // 2️⃣ Find user by EMAIL ONLY
    let user = await User.findOne({ email });

    // 3️⃣ If user exists
    if (user) {
      // 🚫 Email/password user trying Google
      if (user.authProvider === "local") {
        return res.status(409).json({
          message: "You already have an account. Please log in with your password to continue."
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
        googleId,
        authProvider: "google",
        isVerified: true,
        limit: 0,
        pro: false,
      });


      const status = await sendMail({ to: user.email, name: user.username, type: "welcome", url: `${process.env.FRONTEND_URL}/summary` });
      if (status) {
        console.log("Welcome email sent successfully");
      }
      else {
        console.log("Failed to send welcome email");
      }

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

const getStatus = async (req, res) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1]; // get token
    }
    if (!token) {
      return res.status(401).json({ message: "Unauthourized" });
    }
    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        message: "Invalid token"
      });
    }

    const user = await User.findById(decoded.user_id);

    if (!user)
      return res.status(404).json({ message: "No account exists with this email address", status: false });

    return res.status(200).json({ isVerified: user.isVerified });


  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong." });
  }
}



const resendEmailVerification = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(401).json({ message: "Token is required" });
    }
    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        message: "Invalid or expired token"
      });
    }


    const user = await User.findById(decoded.user_id);

    if (!user)
      return res.status(404).json({ message: "No account found with the email address" });

    if (user.isVerified)
      return res.status(400).json({ message: "User has been already verified" });

    // 🔥 Generate NEW token
    const newToken = crypto.randomBytes(32).toString("hex");

    // Save new token
    user.emailVerifyToken = newToken;
    user.emailVerifyExpires = Date.now() + 1000 * 60 * 10; // 10 min

    await user.save();

    // 🔗 Create new verification link
    const verifyUrl = `${process.env.FRONTEND_URL}/verify?token=${newToken}`;

    // 📧 Send email


    await sendMail({
      to: user.email,
      name: user.username,
      type: "verify",
      url: verifyUrl
    });

    return res.json({
      message: "Verification link resent successfully"
    });

  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Something went wrong." });
  }
};


const deleteOldUnverifiedUsers = async () => {
  try {

    const cutoffTime = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    );

    const result = await User.deleteMany({
      isVerified: false,
      createdAt: { $lt: cutoffTime }
    });

    console.log(
      `${result.deletedCount} unverified users`
    );

  } catch (err) {
    console.error(err.message);
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "We couldn't found any account with this email address" });
    }
    const token = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 1000 * 60 * 10;
    await user.save();
    const verifyUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    const status = await sendMail({ to: user.email, name: user.username, type: "forgot-password", url: verifyUrl });
    if (status) {
      return res.status(200).json({ message: "Reset password link sent successfully" });
    }
    return res.status(500).json({ message: "Failed to send reset password link" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Unable to reach the server. Please try again later." });
  }
}

const verifyResetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }
    const user = await User.findOne({ resetPasswordToken: token });
    if (!user) {
      return res.status(404).json({ message: "Token is expired or broken" });
    }
    if (user.resetPasswordExpires < Date.now()) {
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await user.save();
      return res.status(404).json({ message: "Token has expired" });
    }
    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();
    return res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
}


const fixCreatedAt = async (req, res) => {
  try {
    const result = await User.collection.updateMany(
      { $or: [{ createdAt: { $exists: false } }, { createdAt: null }] },
      { $set: { createdAt: new Date() } }
    );

    return res.status(200).json({ message: "success", updatedCount: result.modifiedCount });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

// runs every hour


module.exports = { register, login, getUserProfile, resetPassword, Google, isLoggedIn, getStatus, deleteOldUnverifiedUsers, verifyUser, resendEmailVerification, verifyResetPassword, updateProfile, fixCreatedAt };

const userRouter = require("express").Router();
const { register, deleteOldUnverifiedUsers, login, verifyOtp, getUserProfile, Google, resendOtp } = require("../controllers/UserController");
const protect = require("../middleware/userMiddleware")
userRouter.post("/register", register);
userRouter.post("/login", login);
userRouter.get("/removeUnverifiedUsers", deleteOldUnverifiedUsers);
userRouter.post("/google", Google);
userRouter.post("/verify-otp", verifyOtp);
userRouter.get("/profile", protect, getUserProfile);
userRouter.post("/resend-otp", resendOtp);
module.exports = userRouter;
const userRouter = require("express").Router();
const { register, deleteOldUnverifiedUsers, login, getUserProfile, isLoggedIn, verifyResetPassword, getStatus, Google, resetPassword, verifyUser, resendEmailVerification } = require("../controllers/UserController");
const protect = require("../middleware/userMiddleware")
userRouter.post("/register", register);
userRouter.post("/login", login);
userRouter.get("/removeUnverifiedUsers", deleteOldUnverifiedUsers);
userRouter.post("/google", Google);
userRouter.get("/status", getStatus);
userRouter.post("/verify-email", verifyUser);
userRouter.get("/profile", protect, getUserProfile);
userRouter.post("/forgot-password", resetPassword);
userRouter.get("/isLoggedIn", protect, isLoggedIn);
userRouter.post("/verify-reset-password", verifyResetPassword);
userRouter.post("/resend-email-verification", resendEmailVerification);
module.exports = userRouter;
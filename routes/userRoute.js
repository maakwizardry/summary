const userRouter = require("express").Router();
const { register, login, verifyOtp, getUserProfile } = require("../controllers/UserController");
const protect = require("../middleware/userMiddleware")
userRouter.post("/register", register);
userRouter.post("/login", login);
userRouter.post("/verify-otp", verifyOtp);
userRouter.get("/profile", protect, getUserProfile);
module.exports = userRouter;
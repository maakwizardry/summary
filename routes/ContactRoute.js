const contactRouter = require("express").Router();
const Contact  = require("../controllers/ContactController");
const protect = require("../middleware/userMiddleware")
contactRouter.post("/post", protect, Contact);
module.exports = contactRouter;
const contactRouter = require("express").Router();
const Contact = require("../controllers/ContactController");
const protect = require("../middleware/userMiddleware")
contactRouter.post("/contact-us", protect, Contact);
module.exports = contactRouter;
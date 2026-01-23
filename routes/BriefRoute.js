const briefRoute = require("express").Router();
const { processFiles } = require('../controllers/BriefController');
const middleware = require('../middleware/userMiddleware');
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
briefRoute.post("/processFiles" , middleware, upload.single("file") , processFiles);
module.exports = briefRoute;
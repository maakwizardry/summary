const briefRoute = require("express").Router();
const { processFiles, respond, deleteFiles } = require('../controllers/BriefController');
const middleware = require('../middleware/userMiddleware');
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
briefRoute.post("/processFiles", middleware, upload.array("files"), processFiles);
briefRoute.post("/respond", middleware, respond);
briefRoute.delete('/deleteFiles/:fileId', middleware, deleteFiles);
module.exports = briefRoute;
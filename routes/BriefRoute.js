const briefRoute = require("express").Router();
const { processFiles, respond, deleteFiles, renameFile } = require('../controllers/BriefController');
const middleware = require('../middleware/userMiddleware');
const multer = require("multer");
const fs = require('fs');
const path = require('path');

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname.replace(/\s+/g, '_'));
    }
});

const upload = multer({ storage: storage });

briefRoute.post("/processFiles", middleware, upload.array("files"), processFiles);
briefRoute.post("/respond", middleware, respond);
briefRoute.put('/renameFile/:fileId', middleware, renameFile);
briefRoute.delete('/deleteFile/:fileId', middleware, deleteFiles);
module.exports = briefRoute;
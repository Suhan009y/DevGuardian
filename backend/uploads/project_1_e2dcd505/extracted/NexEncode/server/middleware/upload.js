const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXTS = [
  '.mp4', '.mkv', '.mov', '.avi', '.webm',
  '.flv', '.mpeg', '.mpg', '.3gp', '.wmv', '.ogv'
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const fileId = uuidv4();
    req.generatedFileId = fileId;
    cb(null, `${fileId}${ext}`);
  }
});

function createUpload(maxBytes) {
  return multer({
    storage,
    limits: { files: 1, fileSize: maxBytes },
  });
}

module.exports = { createUpload, ALLOWED_EXTS, UPLOAD_DIR };

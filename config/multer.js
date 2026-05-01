const multer = require('multer');
const path = require('path');
const fs = require('fs');
const appConfig = require('./app');

// Ensure upload directory exists
const uploadDir = path.resolve(appConfig.uploadDir);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `source-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype;
  
  console.log('[Multer] File upload attempt:', {
    originalName: file.originalname,
    extension: ext,
    mimeType: mimeType,
    allowedExtensions: appConfig.allowedExtensions,
  });

  // Check by extension first (more reliable)
  if (appConfig.allowedExtensions.includes(ext)) {
    console.log('[Multer] File extension approved:', ext);
    cb(null, true);
    return;
  }

  // Also check MIME type as fallback
  if (appConfig.allowedMimeTypes.includes(mimeType)) {
    console.log('[Multer] File MIME type approved:', mimeType);
    cb(null, true);
    return;
  }

  // If neither extension nor MIME type matches, reject
  const error = new Error(
    `File type not allowed. Received: ${ext} (${mimeType}). Allowed: ${appConfig.allowedExtensions.join(', ')}`
  );
  console.error('[Multer] File rejected:', error.message);
  cb(error, false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: appConfig.maxUploadMb * 1024 * 1024,
  },
});

module.exports = upload;

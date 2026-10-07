const express = require('express');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const db = require('../config/db');
const { createUpload, ALLOWED_EXTS } = require('../middleware/upload');
const { probeFile, getRecommendation } = require('../services/ffmpegService');

const router = express.Router();

function getPlanLimitMb(plan) {
  if (plan === 'premium') {
    return Number.parseInt(process.env.PREMIUM_UPLOAD_MAX_SIZE_MB, 10)
      || Number.parseInt(process.env.UPLOAD_MAX_SIZE_MB, 10)
      || 10240;
  }
  return Number.parseInt(process.env.FREE_UPLOAD_MAX_SIZE_MB, 10) || 500;
}

function safeDelete(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
}

router.post('/', auth, (req, res) => {
  const maxMb = getPlanLimitMb(req.user.plan);
  const maxBytes = maxMb * 1024 * 1024;
  const upload = createUpload(maxBytes).single('video');

  upload(req, res, async (err) => {
    if (err) {
      console.error('[upload] Multer error:', err.message);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          message: req.user.plan === 'free'
            ? `Free accounts can upload files up to ${maxMb} MB. Upgrade to Premium for larger files.`
            : `Premium upload limit is ${maxMb} MB.`,
          code: req.user.plan === 'free' ? 'PREMIUM_REQUIRED' : 'FILE_TOO_LARGE',
          maxUploadMb: maxMb,
        });
      }
      return res.status(400).json({ message: err.message });
    }

    const file = req.file;
    if (!file) return res.status(400).json({ message: 'No video file received by server' });

    try {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXTS.includes(ext)) {
        safeDelete(file.path);
        return res.status(400).json({
          message: `Unsupported file type "${ext}". Allowed: ${ALLOWED_EXTS.join(', ')}`,
        });
      }

      const fileId = req.generatedFileId;
      await db.query(
        `INSERT INTO uploaded_files
          (file_id, user_id, original_name, stored_name, size_bytes, mime_type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [fileId, req.user.id, file.originalname, file.filename, file.size, file.mimetype || null]
      );

      let probe = {};
      try {
        probe = await probeFile(file.path);
      } catch (probeErr) {
        console.warn('[upload] ffprobe failed (non-fatal):', probeErr.message);
      }

      const recommendation = getRecommendation(probe);
      res.status(201).json({
        fileId,
        filename: file.originalname,
        size: file.size,
        account: { plan: req.user.plan, maxUploadMb: maxMb },
        probe: {
          ...probe,
          recommendation: recommendation.reason,
          recommendedCodec: recommendation.codec,
          recommendedCrf: recommendation.crf,
        },
      });
    } catch (routeErr) {
      safeDelete(file.path);
      console.error('[upload]', routeErr);
      res.status(500).json({ message: 'Upload could not be saved' });
    }
  });
});

module.exports = router;

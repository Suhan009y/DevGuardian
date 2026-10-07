const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/auth');
const db = require('../config/db');
const { addJob } = require('../services/queueService');

const router = express.Router();
const UPLOADS = path.join(__dirname, '../../uploads');
const OUTPUTS = path.join(__dirname, '../../outputs');

async function findOwnedUpload(fileId, userId) {
  const [rows] = await db.query(
    `SELECT file_id, original_name, stored_name, size_bytes
     FROM uploaded_files
     WHERE file_id = ? AND user_id = ? AND consumed_at IS NULL
     LIMIT 1`,
    [fileId, userId]
  );
  if (!rows.length) return null;
  const upload = rows[0];
  upload.inputPath = path.join(UPLOADS, upload.stored_name);
  return fs.existsSync(upload.inputPath) ? upload : null;
}

async function reserveUploadAndCreateJob({ req, upload, job }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [reserve] = await conn.query(
      `UPDATE uploaded_files SET consumed_at = NOW()
       WHERE file_id = ? AND user_id = ? AND consumed_at IS NULL`,
      [upload.file_id, req.user.id]
    );
    if (reserve.affectedRows !== 1) throw new Error('This upload has already been used');

    await conn.query(job.sql, job.values);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

router.post('/', auth, async (req, res) => {
  try {
    const { fileId, codec, resolution, crf, audioBitrate, sharpen } = req.body;
    if (!fileId) return res.status(400).json({ message: 'fileId is required' });

    const upload = await findOwnedUpload(fileId, req.user.id);
    if (!upload) return res.status(404).json({ message: 'Uploaded file not found, already used, or not owned by this account' });

    const jobId = uuidv4();
    const outputName = `${jobId}.mp4`;
    const outputPath = path.join(OUTPUTS, outputName);

    const values = [
      jobId,
      req.user.id,
      upload.file_id,
      upload.original_name,
      upload.size_bytes,
      outputName,
      codec || 'h264',
      resolution || '720p',
      crf !== undefined ? crf : 23,
      audioBitrate || 128,
      sharpen?.enabled ? 1 : 0,
      sharpen?.luma || 1.0,
      sharpen?.matrix || 5,
    ];

    await reserveUploadAndCreateJob({
      req,
      upload,
      job: {
        sql: `INSERT INTO encode_jobs
          (id, user_id, source_file_id, original_filename, original_size, output_filename,
           codec, resolution, crf, audio_bitrate, sharpen_enabled, sharpen_luma, sharpen_matrix, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued')`,
        values,
      },
    });

    addJob({
      jobId,
      fileId: upload.file_id,
      userId: req.user.id,
      inputPath: upload.inputPath,
      outputPath,
      codec: codec || 'h264',
      resolution: resolution || '720p',
      crf: crf !== undefined ? crf : 23,
      audioBitrate: audioBitrate || 128,
      sharpen: sharpen || { enabled: false },
      originalSize: upload.size_bytes,
      originalFilename: upload.original_name,
      outputFilename: outputName,
      isCustom: false,
    });

    res.status(201).json({ jobId, status: 'queued' });
  } catch (err) {
    console.error('[encode]', err);
    res.status(500).json({ message: err.message || 'Encode failed' });
  }
});

router.post('/custom', auth, async (req, res) => {
  try {
    const { fileId, command } = req.body;
    if (!fileId || !command) return res.status(400).json({ message: 'fileId and command are required' });

    const stripped = String(command).replace(/\{input\}|\{output\}/g, '');
    if (/[;&|`$()<>\\]/.test(stripped)) {
      return res.status(400).json({ message: 'Command contains unsafe characters' });
    }

    const upload = await findOwnedUpload(fileId, req.user.id);
    if (!upload) return res.status(404).json({ message: 'Uploaded file not found, already used, or not owned by this account' });

    const jobId = uuidv4();
    const outputName = `${jobId}.mp4`;
    const outputPath = path.join(OUTPUTS, outputName);

    await reserveUploadAndCreateJob({
      req,
      upload,
      job: {
        sql: `INSERT INTO encode_jobs
          (id, user_id, source_file_id, original_filename, original_size, output_filename,
           ffmpeg_command, is_custom_command, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'queued')`,
        values: [jobId, req.user.id, upload.file_id, upload.original_name, upload.size_bytes, outputName, command],
      },
    });

    addJob({
      jobId,
      fileId: upload.file_id,
      userId: req.user.id,
      inputPath: upload.inputPath,
      outputPath,
      customCommand: command,
      originalSize: upload.size_bytes,
      originalFilename: upload.original_name,
      outputFilename: outputName,
      isCustom: true,
    });

    res.status(201).json({ jobId, status: 'queued' });
  } catch (err) {
    console.error('[encode/custom]', err);
    res.status(500).json({ message: err.message || 'Custom encode failed' });
  }
});

router.get('/:jobId/status', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM encode_jobs WHERE id = ? AND user_id = ?',
      [req.params.jobId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Job not found' });
    res.json(rows[0]);
  } catch (_err) {
    res.status(500).json({ message: 'Failed to fetch job' });
  }
});

module.exports = router;

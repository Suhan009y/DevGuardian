const express = require('express');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const db = require('../config/db');

const router = express.Router();
const OUTPUTS = path.join(__dirname, '../../outputs');

router.get('/:jobId', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, output_filename, status, output_expires_at, output_deleted_at
       FROM encode_jobs WHERE id = ? AND user_id = ? LIMIT 1`,
      [req.params.jobId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Job not found' });
    const job = rows[0];
    if (job.status !== 'done') return res.status(400).json({ message: `Job is not complete yet (status: ${job.status})` });
    if (job.output_deleted_at || (job.output_expires_at && new Date(job.output_expires_at).getTime() <= Date.now())) {
      return res.status(410).json({ message: 'This output has expired and was automatically deleted' });
    }

    const filePath = path.join(OUTPUTS, path.basename(job.output_filename));
    if (!fs.existsSync(filePath)) {
      await db.query('UPDATE encode_jobs SET output_deleted_at = COALESCE(output_deleted_at, NOW()) WHERE id = ?', [job.id]);
      return res.status(404).json({ message: 'Output file is no longer available' });
    }

    const stat = fs.statSync(filePath);
    await db.query(
      'UPDATE encode_jobs SET download_count = download_count + 1, last_downloaded_at = NOW() WHERE id = ?',
      [job.id]
    );

    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(job.output_filename)}"`);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', stat.size);
    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => {
      console.error('[download] stream:', err.message);
      if (!res.headersSent) res.status(500).json({ message: 'Download failed' });
      else res.destroy(err);
    });
    stream.pipe(res);
  } catch (err) {
    console.error('[download]', err);
    res.status(500).json({ message: `Download failed: ${err.message}` });
  }
});

module.exports = router;

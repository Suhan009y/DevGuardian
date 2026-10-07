const express = require('express');
const auth = require('../middleware/auth');
const db = require('../config/db');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 20, 100);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);

    const [jobs] = await db.query(
      `SELECT id, original_filename, original_size, output_filename, output_size,
              download_count, last_downloaded_at, codec, resolution, crf, status,
              created_at, completed_at, output_expires_at, output_deleted_at,
              CASE WHEN status = 'done' AND output_deleted_at IS NULL
                    AND (output_expires_at IS NULL OR output_expires_at > NOW())
                   THEN 1 ELSE 0 END AS download_available
       FROM encode_jobs
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, limit, offset]
    );

    const [[stats]] = await db.query(
      `SELECT COUNT(*) totalJobs,
              SUM(status = 'done') successful,
              SUM(status = 'failed') failed,
              COALESCE(SUM(CASE WHEN status = 'done' AND original_size > output_size THEN original_size - output_size ELSE 0 END), 0) totalSaved,
              COALESCE(SUM(original_size), 0) totalOriginal,
              COALESCE(SUM(CASE WHEN status = 'done' THEN output_size ELSE 0 END), 0) totalOutput,
              COALESCE(SUM(download_count), 0) totalDownloads
       FROM encode_jobs WHERE user_id = ?`,
      [req.user.id]
    );

    res.json({ jobs, stats });
  } catch (err) {
    console.error('[jobs]', err);
    res.status(500).json({ message: 'Failed to load history' });
  }
});

router.get('/insights', auth, async (req, res) => {
  try {
    const days = Math.min(Math.max(Number.parseInt(req.query.days, 10) || 7, 7), 90);
    const since = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
    const [rows] = await db.query(
      `SELECT DATE(created_at) day,
              COUNT(*) jobs,
              SUM(status = 'done') completed,
              COALESCE(SUM(download_count), 0) downloads,
              COALESCE(SUM(CASE WHEN status = 'done' AND original_size > output_size THEN original_size - output_size ELSE 0 END), 0) saved_bytes
       FROM encode_jobs
       WHERE user_id = ? AND created_at >= ?
       GROUP BY DATE(created_at)
       ORDER BY day`,
      [req.user.id, since]
    );

    const byDay = new Map(rows.map((row) => [new Date(row.day).toISOString().slice(0, 10), row]));
    const timeline = [];
    for (let i = 0; i < days; i += 1) {
      const date = new Date(since);
      date.setDate(since.getDate() + i);
      const key = date.toISOString().slice(0, 10);
      const row = byDay.get(key) || {};
      timeline.push({
        day: key,
        jobs: Number(row.jobs || 0),
        completed: Number(row.completed || 0),
        downloads: Number(row.downloads || 0),
        savedBytes: Number(row.saved_bytes || 0),
      });
    }

    const [[summary]] = await db.query(
      `SELECT COUNT(*) totalJobs,
              SUM(status = 'done') completed,
              SUM(status = 'processing') processing,
              COALESCE(SUM(download_count), 0) downloads,
              COALESCE(SUM(CASE WHEN status = 'done' AND original_size > output_size THEN original_size - output_size ELSE 0 END), 0) savedBytes
       FROM encode_jobs WHERE user_id = ?`,
      [req.user.id]
    );
    res.json({ timeline, summary });
  } catch (err) {
    console.error('[jobs/insights]', err);
    res.status(500).json({ message: 'Could not load dashboard insights' });
  }
});

module.exports = router;

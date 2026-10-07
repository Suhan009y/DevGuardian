const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const OUTPUTS = path.join(__dirname, '../../outputs');
const UPLOADS = path.join(__dirname, '../../uploads');

function safeDelete(baseDir, filename) {
  if (!filename) return false;
  const safeName = path.basename(filename);
  const filePath = path.join(baseDir, safeName);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (err) {
    console.error('[cleanup] delete failed:', filePath, err.message);
  }
  return false;
}

async function runCleanup() {
  const [expiredJobs] = await db.query(
    `SELECT id, output_filename FROM encode_jobs
     WHERE status = 'done' AND output_deleted_at IS NULL
       AND output_expires_at IS NOT NULL AND output_expires_at <= NOW()
     LIMIT 500`
  );

  for (const job of expiredJobs) {
    safeDelete(OUTPUTS, job.output_filename);
    await db.query('UPDATE encode_jobs SET output_deleted_at = NOW() WHERE id = ?', [job.id]);
  }

  const uploadHours = Number.parseInt(process.env.UPLOAD_RETENTION_HOURS, 10) || 24;
  const cutoff = new Date(Date.now() - uploadHours * 60 * 60 * 1000);
  const [staleUploads] = await db.query(
    `SELECT file_id, stored_name FROM uploaded_files
     WHERE consumed_at IS NULL AND created_at < ? LIMIT 500`,
    [cutoff]
  );
  for (const upload of staleUploads) {
    safeDelete(UPLOADS, upload.stored_name);
    await db.query('DELETE FROM uploaded_files WHERE file_id = ?', [upload.file_id]);
  }

  if (expiredJobs.length || staleUploads.length) {
    console.log(`[cleanup] Removed ${expiredJobs.length} expired output(s) and ${staleUploads.length} stale upload(s)`);
  }
}

function startCleanupScheduler() {
  const minutes = Math.max(Number.parseInt(process.env.CLEANUP_INTERVAL_MINUTES, 10) || 30, 5);
  runCleanup().catch((err) => console.error('[cleanup] startup:', err.message));
  const timer = setInterval(() => {
    runCleanup().catch((err) => console.error('[cleanup] scheduled:', err.message));
  }, minutes * 60 * 1000);
  timer.unref?.();
  return timer;
}

module.exports = { runCleanup, startCleanupScheduler };

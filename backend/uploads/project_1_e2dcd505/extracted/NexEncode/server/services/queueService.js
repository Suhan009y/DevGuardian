const fs = require('fs');
const db = require('../config/db');
const { encodeVideo, runCustomCommand } = require('./ffmpegService');
const { emitToJob } = require('../config/socket');
const { createNotification } = require('./notificationService');

class SimpleQueue {
  constructor(concurrency = 1) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  add(jobData) {
    this.queue.push(jobData);
    emitToJob(jobData.jobId, 'encode:queued', { position: this.queue.length });
    this.tick();
  }

  tick() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const jobData = this.queue.shift();
      this.running += 1;
      this.process(jobData).finally(() => {
        this.running -= 1;
        this.tick();
      });
    }
  }

  async process(jobData) {
    const {
      jobId, fileId, userId, inputPath, outputPath,
      codec, resolution, crf, audioBitrate, sharpen,
      originalSize, originalFilename, outputFilename,
      isCustom, customCommand,
    } = jobData;

    console.log(`[queue] Processing job ${jobId} — isCustom: ${isCustom}`);
    await db.query("UPDATE encode_jobs SET status = 'processing' WHERE id = ?", [jobId]);

    try {
      const onProgress = (progress) => {
        emitToJob(jobId, 'encode:progress', {
          percent: Math.min(Math.round(progress.percent || 0), 99),
          fps: progress.fps,
          timemark: progress.timemark,
        });
      };

      if (isCustom) {
        await runCustomCommand({ jobId, inputPath, outputPath, customCommand }, onProgress);
      } else {
        await encodeVideo({ jobId, inputPath, outputPath, codec, resolution, crf, audioBitrate, sharpen }, onProgress);
      }

      const outputSize = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
      const retentionHours = Math.max(Number.parseInt(process.env.OUTPUT_RETENTION_HOURS, 10) || 24, 1);
      const expiresAt = new Date(Date.now() + retentionHours * 60 * 60 * 1000);
      await db.query(
        "UPDATE encode_jobs SET status = 'done', output_size = ?, completed_at = NOW(), output_expires_at = ? WHERE id = ?",
        [outputSize, expiresAt, jobId]
      );

      emitToJob(jobId, 'encode:done', { outputFilename, outputSize, originalSize, outputExpiresAt: expiresAt });
      try {
        await createNotification({
          userId,
          jobId,
          type: 'encode_complete',
          title: 'Encoding complete',
          message: `${originalFilename || 'Your video'} is ready to download. It will be deleted after ${retentionHours} hours.`,
        });
      } catch (notificationErr) {
        console.error('[queue] completion notification failed:', notificationErr.message);
      }
      console.log(`[queue] Job ${jobId} done — output: ${outputSize} bytes`);
    } catch (err) {
      console.error(`[queue] Job ${jobId} FAILED:`, err.message);
      await db.query(
        "UPDATE encode_jobs SET status = 'failed', error_message = ?, completed_at = NOW() WHERE id = ?",
        [err.message, jobId]
      );
      emitToJob(jobId, 'encode:error', { error: err.message });
      try {
        await createNotification({
          userId,
          jobId,
          type: 'encode_failed',
          title: 'Encoding failed',
          message: `${originalFilename || 'The video'} could not be encoded: ${String(err.message).slice(0, 250)}`,
        });
      } catch (notificationErr) {
        console.error('[queue] failure notification failed:', notificationErr.message);
      }
      try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (_) {}
    } finally {
      try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch (_) {}
      if (fileId) {
        try { await db.query('DELETE FROM uploaded_files WHERE file_id = ?', [fileId]); } catch (_) {}
      }
    }
  }
}

const concurrency = Number.parseInt(process.env.FFMPEG_CONCURRENCY, 10) || 1;
const queue = new SimpleQueue(concurrency);

function addJob(jobData) {
  queue.add(jobData);
}

module.exports = { addJob };

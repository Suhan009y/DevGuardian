const ffmpeg        = require('fluent-ffmpeg');
const ffmpegStatic  = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const path          = require('path');

// Point fluent-ffmpeg at bundled binaries
ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

// Resolution map
const RESOLUTION_MAP = {
  '360p':  'scale=-2:360',
  '480p':  'scale=-2:480',
  '720p':  'scale=-2:720',
  '1080p': 'scale=-2:1080',
  'source': null,
};

// Codec map
const CODEC_MAP = {
  'h264': 'libx264',
  'hevc': 'libx265',
};

// ── Probe a video file ────────────────────────────────────────
function probeFile(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);

      const vStream = metadata.streams.find(s => s.codec_type === 'video');
      const aStream = metadata.streams.find(s => s.codec_type === 'audio');
      const format  = metadata.format;

      let fps = null;
      if (vStream?.r_frame_rate) {
        const parts = vStream.r_frame_rate.split('/');
        fps = parts.length === 2
          ? parseFloat((parseInt(parts[0]) / parseInt(parts[1])).toFixed(2))
          : parseFloat(parts[0]);
      }

      resolve({
        codec:           vStream?.codec_name       || null,
        duration:        parseFloat(format.duration) || null,
        resolution:      vStream ? `${vStream.width}x${vStream.height}` : null,
        width:           vStream?.width             || null,
        height:          vStream?.height            || null,
        fps,
        bitrate:         parseInt(format.bit_rate)  || null,
        size:            parseInt(format.size)       || null,
        audioCodec:      aStream?.codec_name        || null,
        audioChannels:   aStream?.channels          || null,
        audioSampleRate: aStream?.sample_rate       || null,
        container:       format.format_name         || null,
      });
    });
  });
}

// ── Recommend codec and CRF ───────────────────────────────────
function getRecommendation(probe) {
  if (!probe || !probe.height) {
    return { codec: 'h264', crf: 23, reason: 'Upload a video to get a personalized recommendation.' };
  }

  const useHEVC  = probe.height >= 1080 || probe.codec === 'hevc' || probe.codec === 'h265';
  const codec    = useHEVC ? 'hevc' : 'h264';
  const crf      = useHEVC ? 28 : 23;
  const label    = useHEVC ? 'H.265 HEVC' : 'H.264';
  const saving   = useHEVC ? '~40%' : '~20%';
  const reason   = `${label} recommended for ${probe.height}p content — saves ${saving} vs uncompressed. CRF ${crf} gives excellent quality.`;

  return { codec, crf, reason };
}

// ── Standard encode ───────────────────────────────────────────
function encodeVideo(options, onProgress) {
  const {
    jobId,
    inputPath,
    outputPath,
    codec        = 'h264',
    resolution   = '720p',
    crf          = 23,
    audioBitrate = 128,
    sharpen      = { enabled: false },
  } = options;

  const libname = CODEC_MAP[codec] || 'libx264';
  const preset  = codec === 'hevc' ? 'slow' : 'fast';

  // Build filter chain
  const filters = [];
  if (resolution && RESOLUTION_MAP[resolution]) filters.push(RESOLUTION_MAP[resolution]);
  if (sharpen?.enabled) {
    const luma   = parseFloat(sharpen.luma)    || 1.0;
    const matrix = parseInt(sharpen.matrix, 10) || 5;
    filters.push(`unsharp=${matrix}:${matrix}:${luma}:${matrix}:${matrix}:0.0`);
  }

  return new Promise((resolve, reject) => {
    console.log(`[ffmpeg:${jobId}] Starting standard encode — ${codec} ${resolution} CRF${crf}`);

    const cmd = ffmpeg(inputPath)
      .videoCodec(libname)
      .addOption('-crf', String(crf))
      .addOption('-preset', preset)
      .addOption('-movflags', '+faststart')
      .audioCodec('aac')
      .audioBitrate(`${audioBitrate}k`)
      .output(outputPath)
      .outputFormat('mp4');

    if (filters.length > 0) cmd.videoFilters(filters.join(','));

    cmd
      .on('start', cmdLine => console.log(`[ffmpeg:${jobId}] CMD: ${cmdLine}`))
      .on('progress', progress => {
        if (onProgress) onProgress({
          percent:  progress.percent || 0,
          fps:      progress.currentFps,
          timemark: progress.timemark,
        });
      })
      .on('end', () => {
        console.log(`[ffmpeg:${jobId}] Encode complete`);
        resolve();
      })
      .on('error', (err) => {
        console.error(`[ffmpeg:${jobId}] Error: ${err.message}`);
        reject(err);
      })
      .run();
  });
}

// ── Custom command encode ─────────────────────────────────────
function runCustomCommand(options, onProgress) {
  const { jobId, inputPath, outputPath, customCommand } = options;

  // Substitute placeholders with actual paths
  let args = customCommand.trim();
  args = args.replace(/\{input\}/g,  inputPath);
  args = args.replace(/\{output\}/g, outputPath);

  // If user didn't include {output}, append outputPath at the end
  if (!customCommand.includes('{output}')) {
    args = `${args} "${outputPath}"`;
  }

  console.log(`[ffmpeg-custom:${jobId}] Raw args: ${args}`);

  return new Promise((resolve, reject) => {
    // Split args into array — respects quoted paths
    const argArray = splitArgs(args);
    console.log(`[ffmpeg-custom:${jobId}] Parsed args:`, argArray);

    // Find -i index and extract input file (fluent-ffmpeg adds it separately)
    const iIdx = argArray.indexOf('-i');

    // Build fluent-ffmpeg command
    const cmd = ffmpeg();

    if (iIdx !== -1) {
      // Use the specified input
      const inputFile = argArray[iIdx + 1] || inputPath;
      cmd.input(inputFile);

      // Add all other args except -i and its value
      const otherArgs = argArray.filter((_, i) => i !== iIdx && i !== iIdx + 1);
      // Last arg is the output
      const outputArg = otherArgs[otherArgs.length - 1];
      const midArgs   = otherArgs.slice(0, -1);

      midArgs.forEach(a => cmd.addOption(a));
      cmd.output(outputArg || outputPath);
    } else {
      // No -i found — use our uploaded file as input
      cmd.input(inputPath);
      const outputArg = argArray[argArray.length - 1];
      const midArgs   = argArray.slice(0, -1);
      midArgs.forEach(a => cmd.addOption(a));
      cmd.output(outputArg || outputPath);
    }

    cmd
      .on('start', cmdLine => console.log(`[ffmpeg-custom:${jobId}] CMD: ${cmdLine}`))
      .on('progress', progress => {
        if (onProgress) onProgress({
          percent:  progress.percent || 0,
          fps:      progress.currentFps,
          timemark: progress.timemark,
        });
      })
      .on('end', () => {
        console.log(`[ffmpeg-custom:${jobId}] Custom encode complete`);
        resolve();
      })
      .on('error', (err) => {
        console.error(`[ffmpeg-custom:${jobId}] Error: ${err.message}`);
        reject(err);
      })
      .run();
  });
}

// ── Split arg string respecting quotes ────────────────────────
function splitArgs(str) {
  const args   = [];
  let   current = '';
  let   inQuote = false;
  let   quoteChar = '';

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote   = true;
      quoteChar = ch;
    } else if (ch === ' ' || ch === '\t') {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }

  if (current.length > 0) args.push(current);
  return args;
}

module.exports = { probeFile, getRecommendation, encodeVideo, runCustomCommand };
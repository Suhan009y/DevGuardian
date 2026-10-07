// ===== SIZE ESTIMATOR =====
// Estimates output size based on codec/res/CRF before encoding starts.
// Formula: estimated_bitrate × duration / 8

// Target bitrate lookup table (kbps) per resolution + codec
const BITRATE_TABLE = {
  h264: { '360p': 700, '480p': 1200, '720p': 2500, '1080p': 5000, 'source': 4000 },
  hevc: { '360p': 400, '480p': 700,  '720p': 1500, '1080p': 3000, 'source': 2500 },
};

// CRF scaling factor: each unit of CRF above base (23 for h264, 28 for hevc)
// multiplies size by ~0.83, and each unit below multiplies by ~1.21
const CRF_BASE = { h264: 23, hevc: 28 };

let probeData = null; // Will be set when upload completes

// Hook into probe results
const origShowProbe = window.showProbeResults;
// We'll intercept probe data directly via the server response in uploader.js

// Listen for probe data from uploader
document.addEventListener('probeReady', e => {
  probeData = e.detail;
  updateEstimate();
});

function updateEstimate() {
  const fileId = window.getUploadedFileId ? window.getUploadedFileId() : null;
  if (!fileId) return;

  const codec = window.getSelectedCodec ? window.getSelectedCodec() : 'h264';
  const res   = window.getSelectedRes   ? window.getSelectedRes()   : '720p';
  const crf   = window.getCrfValue      ? window.getCrfValue()      : 23;

  // Get duration from probe
  const duration = probeData ? probeData.duration : null;
  if (!duration) return;

  const baseBitrate = (BITRATE_TABLE[codec] || BITRATE_TABLE.h264)[res] || 2500;
  const crfBase     = CRF_BASE[codec] || 23;
  const crfDelta    = crf - crfBase;
  const scaleFactor = Math.pow(0.83, crfDelta); // positive delta → smaller file
  const targetBitrate = baseBitrate * scaleFactor; // kbps

  // bytes = (bitrate_kbps * 1000 / 8) * duration_seconds
  const estimatedBytes = (targetBitrate * 1000 / 8) * duration;

  const badge = document.getElementById('estimate-badge');
  const val   = document.getElementById('est-value');

  if (estimatedBytes > 0) {
    val.textContent = window.formatBytes ? window.formatBytes(estimatedBytes) : `${Math.round(estimatedBytes / 1024 / 1024)} MB`;
    badge.classList.remove('hidden');
  }
}

// Patch uploader to store probe and fire event
const _origXhrLoad = XMLHttpRequest.prototype;
// Instead, we patch showProbeResults in uploader.js indirectly:
const _origShowProbeResults = window.showProbeResults || function(){};

// Override globally so estimator can intercept
window._onProbeData = function(probe) {
  probeData = probe;
  updateEstimate();
};

window.updateEstimate = updateEstimate;

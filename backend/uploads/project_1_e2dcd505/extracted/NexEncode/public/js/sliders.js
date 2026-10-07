// ===== CUSTOM DRAG SLIDERS =====

// ── CRF Slider (0–51, lower = better quality) ─────────────────
const CRF_MIN = 0, CRF_MAX = 51, CRF_DEFAULT = 23;
let crfValue = CRF_DEFAULT;

const crfThumb = document.getElementById('crf-thumb');
const crfFill  = document.getElementById('crf-fill');
const crfVal   = document.getElementById('crf-value');
const crfTag   = document.getElementById('crf-tag');
const crfTrack = crfThumb.closest('.slider-track');

function getCrfLabel(v) {
  if (v <= 15) return { text: 'Lossless', color: '#00ffa3' };
  if (v <= 20) return { text: 'Excellent', color: '#00ffa3' };
  if (v <= 26) return { text: 'Good',      color: '#00b4ff' };
  if (v <= 33) return { text: 'Medium',    color: '#ffb347' };
  if (v <= 42) return { text: 'Low',       color: '#ff8c42' };
  return              { text: 'Tiny File', color: '#ff5f6d' };
}

function renderCrf(v) {
  crfValue = v;
  const pct = ((v - CRF_MIN) / (CRF_MAX - CRF_MIN)) * 100;
  crfFill.style.width  = `${pct}%`;
  crfThumb.style.left  = `${pct}%`;
  crfVal.textContent   = v;
  const lbl = getCrfLabel(v);
  crfTag.textContent   = lbl.text;
  crfTag.style.color   = lbl.color;
  if (window.updateEstimate) window.updateEstimate();
}

// Allow external set
window.setCrfValue = function(v) { renderCrf(Math.max(CRF_MIN, Math.min(CRF_MAX, Math.round(v)))); };
window.getCrfValue = function()  { return crfValue; };

initSlider(crfTrack, crfThumb, CRF_MIN, CRF_MAX, CRF_DEFAULT, true, renderCrf);

// ── Audio Bitrate Slider (64–320 kbps) ────────────────────────
const AUDIO_STEPS  = [64, 96, 128, 192, 256, 320];
let audioIdx = 2; // default 128k

const audioThumb = document.getElementById('audio-thumb');
const audioFill  = document.getElementById('audio-fill');
const audioVal   = document.getElementById('audio-value');
const audioTrack = audioThumb.closest('.slider-track');

function renderAudio(idx) {
  audioIdx = Math.max(0, Math.min(AUDIO_STEPS.length - 1, idx));
  const pct = (audioIdx / (AUDIO_STEPS.length - 1)) * 100;
  audioFill.style.width  = `${pct}%`;
  audioThumb.style.left  = `${pct}%`;
  audioVal.textContent   = `${AUDIO_STEPS[audioIdx]}k`;
}

window.getAudioBitrate = function() { return AUDIO_STEPS[audioIdx]; };

initSlider(audioTrack, audioThumb, 0, AUDIO_STEPS.length - 1, 2, true, idx => renderAudio(Math.round(idx)));

// ── Generic Slider Initializer ────────────────────────────────
function initSlider(track, thumb, min, max, defaultVal, snap, onChange) {
  let dragging = false;

  function getValueFromX(clientX) {
    const rect = track.getBoundingClientRect();
    const raw  = (clientX - rect.left) / rect.width;
    const clamped = Math.max(0, Math.min(1, raw));
    const val = min + clamped * (max - min);
    return snap ? Math.round(val) : parseFloat(val.toFixed(2));
  }

  // Mouse
  thumb.addEventListener('mousedown', e => {
    dragging = true;
    thumb.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    onChange(getValueFromX(e.clientX));
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    thumb.classList.remove('dragging');
  });

  // Touch
  thumb.addEventListener('touchstart', e => {
    dragging = true;
    thumb.classList.add('dragging');
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchmove', e => {
    if (!dragging) return;
    onChange(getValueFromX(e.touches[0].clientX));
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    thumb.classList.remove('dragging');
  });

  // Click on track
  track.addEventListener('click', e => {
    if (e.target === thumb) return;
    onChange(getValueFromX(e.clientX));
  });

  // Keyboard
  thumb.addEventListener('keydown', e => {
    let v;
    const step = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown')  v = (min === 0 && max === AUDIO_STEPS.length-1) ? audioIdx - 1 : crfValue - step;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp')    v = (min === 0 && max === AUDIO_STEPS.length-1) ? audioIdx + 1 : crfValue + step;
    if (v !== undefined) { onChange(Math.max(min, Math.min(max, v))); e.preventDefault(); }
  });

  // Init render
  onChange(defaultVal);
}

// ── Sharpen Toggle ────────────────────────────────────────────
const sharpenToggle = document.getElementById('sharpen-toggle');
const sharpenParams = document.getElementById('sharpen-params');

sharpenToggle.addEventListener('change', () => {
  if (sharpenToggle.checked) {
    sharpenParams.classList.remove('hidden');
  } else {
    sharpenParams.classList.add('hidden');
  }
  if (window.updateEstimate) window.updateEstimate();
});

window.getSharpenConfig = function() {
  return {
    enabled: sharpenToggle.checked,
    luma:    parseFloat(document.getElementById('sharpen-luma').value)    || 1.0,
    matrix:  parseInt(document.getElementById('sharpen-matrix').value, 10) || 5
  };
};

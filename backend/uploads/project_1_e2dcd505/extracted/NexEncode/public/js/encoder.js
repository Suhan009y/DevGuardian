// ===== ENCODER CONTROLS =====

// Auth guard
const token = localStorage.getItem('token');
if (!token) window.location.href = '/index.html';

// Greeting
const username = localStorage.getItem('username') || 'User';
document.getElementById('user-greeting').textContent = `@${username}`;

// State
let selectedCodec = 'h264';
let selectedRes   = '720p';
let currentJobId  = null;

// ── Codec selector ────────────────────────────────────────────
function selectCodec(btn) {
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  selectedCodec = btn.dataset.codec;
  if (window.updateEstimate) updateEstimate();
}

// ── Resolution selector ───────────────────────────────────────
function selectRes(btn) {
  document.querySelectorAll('.res-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedRes = btn.dataset.res;
  if (window.updateEstimate) updateEstimate();
}

// ── Enable/disable encode button ──────────────────────────────
function setEncodeEnabled(enabled) {
  document.getElementById('encode-btn').disabled = !enabled;
}

// ── Start encoding ────────────────────────────────────────────
async function startEncode() {
  const fileId = window.getUploadedFileId ? window.getUploadedFileId() : null;
  if (!fileId) return alert('Please upload a video first.');

  const sharpen = window.getSharpenConfig ? window.getSharpenConfig() : { enabled: false };
  const crf     = window.getCrfValue      ? window.getCrfValue()      : 23;
  const audio   = window.getAudioBitrate  ? window.getAudioBitrate()  : 128;

  document.getElementById('encode-btn').disabled = true;
  document.getElementById('encode-btn').innerHTML = '<span class="btn-spinner" aria-hidden="true"></span> Encoding...';
  document.getElementById('encode-progress-wrap').classList.remove('hidden');
  document.getElementById('output-ready').classList.add('hidden');
  setFill(0);

  try {
    const res = await fetch('/api/encode', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        fileId,
        codec:        selectedCodec,
        resolution:   selectedRes,
        crf,
        audioBitrate: audio,
        sharpen
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Encode failed');
    }

    const data   = await res.json();
    currentJobId = data.jobId;

    if (window.subscribeToJob) window.subscribeToJob(currentJobId);
    if (window.logTerminal) window.logTerminal(`[encode] Job ${currentJobId} queued (${selectedCodec}, ${selectedRes}, CRF ${crf})`, 'info');

  } catch (err) {
    if (window.logTerminal) window.logTerminal(`[encode] Error: ${err.message}`, 'error');
    alert('Encode error: ' + err.message);
    resetEncodeBtn();
  }
}

// ── Encode progress callback (called by socket.js) ────────────
window.onEncodeProgress = function(data) {
  setFill(data.percent || 0);
  if (data.fps)      document.getElementById('encode-fps').textContent  = `${data.fps} fps`;
  if (data.timemark) document.getElementById('encode-eta').textContent  = `Time: ${data.timemark}`;
  document.getElementById('encode-pct').textContent = `${Math.round(data.percent || 0)}%`;
};

// ── Encode done callback (called by socket.js) ────────────────
window.onEncodeDone = function(data) {
  setFill(100);
  document.getElementById('encode-pct').textContent = '100% ✓';
  showOutput(data);
  resetEncodeBtn();
  if (window.loadHistory) loadHistory();
};

// ── Encode error callback ─────────────────────────────────────
window.onEncodeError = function(data) {
  if (window.logTerminal) window.logTerminal(`[encode] Failed: ${data.error}`, 'error');
  alert('Encoding failed: ' + data.error);
  resetEncodeBtn();
};

// ── Show output download card ──────────────────────────────────
function showOutput(data) {
  const wrap  = document.getElementById('output-ready');
  const stats = document.getElementById('output-stats');

  const origSize = window.formatBytes ? window.formatBytes(data.originalSize || 0) : '—';
  const outSize  = window.formatBytes ? window.formatBytes(data.outputSize   || 0) : '—';
  const saved    = (data.originalSize && data.outputSize && data.originalSize > 0)
    ? ((1 - data.outputSize / data.originalSize) * 100).toFixed(1)
    : 0;

  stats.innerHTML = `
    <div class="output-stat">
      <span class="output-stat-label">Original</span>
      <span class="output-stat-value">${origSize}</span>
    </div>
    <div class="output-stat">
      <span class="output-stat-label">Output</span>
      <span class="output-stat-value">${outSize}</span>
    </div>
    <div class="output-stat">
      <span class="output-stat-label">Saved</span>
      <span class="output-stat-value accent">${saved}%</span>
    </div>
  `;

  // ── KEY FIX: use a button that fetches with auth token ────────
  // A plain <a href> cannot send Authorization header, so we use fetch + blob
  const link = document.getElementById('download-link');
  link.href  = '#';
  link.setAttribute('download', data.outputFilename || 'encoded.mp4');
  link.onclick = async (e) => {
    e.preventDefault();
    await downloadWithAuth(data.jobId, data.outputFilename || 'encoded.mp4');
  };

  wrap.classList.remove('hidden');
  document.getElementById('encode-progress-wrap').classList.add('hidden');

  if (window.logTerminal) window.logTerminal(`[encode] Done! Saved ${saved}% — click Download to save file.`, 'success');
}

// ── Authenticated download via fetch + blob ────────────────────
async function downloadWithAuth(jobId, filename) {
  const link = document.getElementById('download-link');
  const orig = link.textContent;
  link.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span> Preparing download...';

  try {
    const res = await fetch(`/api/download/${jobId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Download failed' }));
      throw new Error(err.message);
    }

    // Convert response to blob and trigger browser download
    const blob     = await res.blob();
    const url       = URL.createObjectURL(blob);
    const tempLink  = document.createElement('a');
    tempLink.href   = url;
    tempLink.download = filename;
    document.body.appendChild(tempLink);
    tempLink.click();
    document.body.removeChild(tempLink);
    URL.revokeObjectURL(url);

    if (window.logTerminal) window.logTerminal(`[download] ${filename} saved successfully.`, 'success');

  } catch (err) {
    alert('Download failed: ' + err.message);
    if (window.logTerminal) window.logTerminal(`[download] Error: ${err.message}`, 'error');
  } finally {
    link.textContent = orig;
    link.innerHTML   = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></svg> Download encoded video';
  }
}

// ── Helpers ───────────────────────────────────────────────────
function setFill(pct) {
  document.getElementById('encode-fill').style.width = `${pct}%`;
}

function resetEncodeBtn() {
  const btn     = document.getElementById('encode-btn');
  btn.disabled  = false;
  btn.innerHTML = '<span class="btn-encode-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="m8 5 11 7-11 7V5Z"/></svg></span> Start Encoding';
}

function logout() {
  localStorage.clear();
  window.location.href = '/index.html';
}

function togglePanel(panel) {
  if (panel === 'history') {
    const p      = document.getElementById('history-panel');
    const o      = document.getElementById('history-overlay');
    const isOpen = p.classList.contains('open');
    p.classList.toggle('open', !isOpen);
    o.classList.toggle('active', !isOpen);
    if (!isOpen && window.loadHistory) window.loadHistory();
  }
}

// Expose globals
window.selectCodec      = selectCodec;
window.selectRes        = selectRes;
window.startEncode      = startEncode;
window.setEncodeEnabled = setEncodeEnabled;
window.togglePanel      = togglePanel;
window.logout           = logout;
window.getSelectedCodec = () => selectedCodec;
window.getSelectedRes   = () => selectedRes;
window.downloadWithAuth = downloadWithAuth;
// ===== UPLOADER MODULE =====

let uploadedFileId = null;   // UUID returned by server after upload
let currentFile   = null;    // The raw File object

const dropZone   = document.getElementById('drop-zone');
const fileInput  = document.getElementById('file-input');

const ALLOWED_EXTS = ['mp4','mkv','mov','avi','webm','flv','mpeg','mpg','3gp','wmv','ogv'];

// ── Drag events ──────────────────────────────────────────────
['dragenter','dragover'].forEach(ev => {
  dropZone.addEventListener(ev, e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
});

['dragleave','drop'].forEach(ev => {
  dropZone.addEventListener(ev, e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
  });
});

dropZone.addEventListener('drop', e => {
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

// ── Browse picker ────────────────────────────────────────────
fileInput.addEventListener('change', e => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

// ── Main handler ─────────────────────────────────────────────
async function handleFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTS.includes(ext)) {
    alert(`❌ "${file.name}" is not a supported video format.\n\nAllowed: MP4, MKV, MOV, AVI, WEBM, FLV`);
    return;
  }

  let account = window.NEX_ACCOUNT;
  if (!account && window.loadAccount) {
    try { account = await window.loadAccount(); } catch (_) {}
  }

  if (account?.maxUploadBytes && file.size > account.maxUploadBytes) {
    const maxText = account.maxUploadMb >= 1024
      ? `${(account.maxUploadMb / 1024).toFixed(account.maxUploadMb % 1024 ? 1 : 0)} GB`
      : `${account.maxUploadMb} MB`;
    if (account.plan === 'free' && window.openPremiumModal) window.openPremiumModal();
    alert(account.plan === 'free'
      ? `This file is larger than the free ${maxText} limit. Premium is required.`
      : `This file exceeds your ${maxText} upload limit.`);
    fileInput.value = '';
    return;
  }

  currentFile = file;
  showFileInfo(file);
  uploadFile(file);
}

// ── Show file info row ────────────────────────────────────────
function showFileInfo(file) {
  document.getElementById('drop-zone').style.display = 'none';
  document.getElementById('upload-progress-wrap').classList.remove('hidden');
  document.getElementById('file-name-label').textContent = file.name;
  document.getElementById('file-size-label').textContent = formatBytes(file.size);
  document.getElementById('upload-bar').style.width = '0%';
  document.getElementById('upload-pct').textContent = '0%';
  document.getElementById('upload-speed').textContent = 'Uploading...';
  document.getElementById('probe-results').classList.add('hidden');
  document.getElementById('output-ready').classList.add('hidden');
  document.getElementById('estimate-badge').classList.add('hidden');
  uploadedFileId = null;
  setEncodeEnabled(false);
  setRunCmdEnabled(false);
}

// ── XHR Upload with progress ─────────────────────────────────
function uploadFile(file) {
  const formData = new FormData();
  // IMPORTANT: field name must be 'video' — matches upload.single('video') on server
  formData.append('video', file, file.name);

  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/index.html';
    return;
  }

  const xhr   = new XMLHttpRequest();
  const start = Date.now();

  xhr.open('POST', '/api/upload');
  xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  // Do NOT set Content-Type — browser sets it automatically with the boundary for multipart

  xhr.upload.onprogress = e => {
    if (!e.lengthComputable) return;
    const pct     = Math.round((e.loaded / e.total) * 100);
    const elapsed = (Date.now() - start) / 1000 || 0.001;
    const speed   = e.loaded / elapsed;

    document.getElementById('upload-bar').style.width = `${pct}%`;
    document.getElementById('upload-pct').textContent = `${pct}%`;
    document.getElementById('upload-speed').textContent = `${formatBytes(speed)}/s`;
  };

  xhr.onload = () => {
    let data;
    try {
      data = JSON.parse(xhr.responseText);
    } catch {
      document.getElementById('upload-speed').textContent = 'Server error — invalid response';
      document.getElementById('upload-pct').textContent = '✕';
      return;
    }

    if (xhr.status === 200 || xhr.status === 201) {
      uploadedFileId = data.fileId;
      document.getElementById('upload-bar').style.width = '100%';
      document.getElementById('upload-pct').textContent = '100% ✓';
      document.getElementById('upload-speed').textContent = 'Upload complete';

      showProbeResults(data.probe);

      // Pass probe data to estimator
      if (window._onProbeData) window._onProbeData(data.probe);

      setEncodeEnabled(true);
      setRunCmdEnabled(true);
      updateEstimate();

      if (window.logTerminal) {
        window.logTerminal(`[upload] ${file.name} (${formatBytes(file.size)}) uploaded. File ID: ${data.fileId}`, 'success');
      }
    } else {
      const msg = data.message || 'Upload failed';
      if (data.code === 'PREMIUM_REQUIRED' && window.openPremiumModal) window.openPremiumModal();
      document.getElementById('upload-speed').textContent = `✕ ${msg}`;
      document.getElementById('upload-pct').textContent = 'Failed';
      if (window.logTerminal) window.logTerminal(`[upload] Error: ${msg}`, 'error');
      console.error('[upload] Server error:', data);
    }
  };

  xhr.onerror = () => {
    document.getElementById('upload-speed').textContent = 'Network error — is the server running?';
    document.getElementById('upload-pct').textContent = '✕';
  };

  xhr.ontimeout = () => {
    document.getElementById('upload-speed').textContent = 'Upload timed out';
  };

  xhr.send(formData);
}

// ── Probe results display ─────────────────────────────────────
function showProbeResults(probe) {
  if (!probe) return;

  const grid = document.getElementById('probe-grid');
  const items = [
    { label: 'Codec',      value: probe.codec      || '—' },
    { label: 'Duration',   value: formatDuration(probe.duration) },
    { label: 'Resolution', value: probe.resolution  || '—' },
    { label: 'FPS',        value: probe.fps ? `${probe.fps} fps` : '—' },
    { label: 'Bitrate',    value: probe.bitrate ? `${Math.round(probe.bitrate / 1000)} kbps` : '—' },
    { label: 'Size',       value: formatBytes(probe.size || 0) },
    { label: 'Audio',      value: probe.audioCodec  || '—' },
    { label: 'Channels',   value: probe.audioChannels ? `${probe.audioChannels}ch` : '—' },
  ];

  grid.innerHTML = items.map(item => `
    <div class="probe-item">
      <div class="probe-item-label">${item.label}</div>
      <div class="probe-item-value">${item.value}</div>
    </div>
  `).join('');

  const badge = document.getElementById('recommendation-badge');
  if (probe.recommendation) {
    badge.innerHTML = `<strong>Recommended setup:</strong> ${probe.recommendation}`;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }

  document.getElementById('probe-results').classList.remove('hidden');

  // Auto-apply recommended codec
  if (probe.recommendedCodec) {
    const pillBtn = document.querySelector(`.pill[data-codec="${probe.recommendedCodec}"]`);
    if (pillBtn) selectCodec(pillBtn);
  }

  // Auto-apply recommended CRF
  if (probe.recommendedCrf !== undefined && window.setCrfValue) {
    window.setCrfValue(probe.recommendedCrf);
  }
}

// ── Clear file ───────────────────────────────────────────────
function clearFile() {
  currentFile    = null;
  uploadedFileId = null;
  fileInput.value = '';
  document.getElementById('drop-zone').style.display = '';
  document.getElementById('upload-progress-wrap').classList.add('hidden');
  document.getElementById('probe-results').classList.add('hidden');
  document.getElementById('output-ready').classList.add('hidden');
  document.getElementById('estimate-badge').classList.add('hidden');
  setEncodeEnabled(false);
  setRunCmdEnabled(false);
  if (window.logTerminal) window.logTerminal('[upload] File cleared.', 'info');
}

// ── Helpers ──────────────────────────────────────────────────
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

function formatDuration(secs) {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

// ── Expose to other modules ───────────────────────────────────
window.getUploadedFileId = () => uploadedFileId;
window.getCurrentFile    = () => currentFile;
window.formatBytes       = formatBytes;
window.clearFile         = clearFile;
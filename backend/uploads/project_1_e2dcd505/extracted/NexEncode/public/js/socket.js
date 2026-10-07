// ===== SOCKET.IO CLIENT =====

let socket = null;
let subscribedJobId = null;

function initSocket() {
  const token = localStorage.getItem('token');
  if (!token) return;

  socket = io({ auth: { token } });
  window.nexSocket = socket;
  window.dispatchEvent(new CustomEvent('nex:socket-ready', { detail: { socket } }));

  socket.on('connect', () => {
    console.log('[socket] Connected:', socket.id);
    if (window.logTerminal) window.logTerminal('[socket] Connected to server', 'success');
  });

  socket.on('disconnect', () => {
    if (window.logTerminal) window.logTerminal('[socket] Disconnected', 'warn');
  });

  socket.on('connect_error', err => {
    console.error('[socket] Connection error:', err.message);
  });

  // ── Encode events ──────────────────────────────────────────
  socket.on('encode:progress', data => {
    if (data.jobId !== subscribedJobId) return;
    if (window.onEncodeProgress) window.onEncodeProgress(data);
    if (window.logTerminal) {
      window.logTerminal(
        `[encode] ${Math.round(data.percent || 0)}% — ${data.fps || 0} fps — ${data.timemark || ''}`,
        'progress'
      );
    }
  });

  socket.on('encode:done', data => {
    if (data.jobId !== subscribedJobId) return;
    subscribedJobId = null;
    if (window.onEncodeDone) window.onEncodeDone(data);
    if (window.logTerminal) window.logTerminal(`[encode] ✓ Complete — saved to ${data.outputFilename}`, 'success');
  });

  socket.on('encode:error', data => {
    if (data.jobId !== subscribedJobId) return;
    subscribedJobId = null;
    if (window.onEncodeError) window.onEncodeError(data);
    if (window.logTerminal) window.logTerminal(`[encode] ✕ Error: ${data.error}`, 'error');
  });

  socket.on('encode:queued', data => {
    if (window.logTerminal) window.logTerminal(`[queue] Job ${data.jobId} — position ${data.position}`, 'info');
  });
}

function subscribeToJob(jobId) {
  subscribedJobId = jobId;
  if (socket) socket.emit('subscribe:job', { jobId });
}

// Init on page load
initSocket();

window.subscribeToJob = subscribeToJob;

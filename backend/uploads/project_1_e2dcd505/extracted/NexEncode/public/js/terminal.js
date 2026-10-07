// ===== FFMPEG TERMINAL =====

let terminalLogs = [];

// ── Log helpers ───────────────────────────────────────────────
function logTerminal(text, type = 'info') {
  const log = document.getElementById('terminal-log');
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  line.textContent = `[${time}] ${text}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
  terminalLogs.push({ time, text, type });
}

// ── Run custom command ────────────────────────────────────────
async function runCustomCommand() {
  const fileId = window.getUploadedFileId ? window.getUploadedFileId() : null;
  if (!fileId) {
    logTerminal('No file uploaded. Please upload a video first.', 'warn');
    return;
  }

  const input   = document.getElementById('terminal-input').value.trim();
  if (!input) {
    logTerminal('No command entered.', 'warn');
    return;
  }

  logTerminal(`$ ffmpeg ${input}`, 'info');

  const btn = document.getElementById('run-cmd-btn');
  btn.disabled = true;
  btn.textContent = 'Running...';

  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/encode/custom', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ fileId, command: input })
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.message || 'Command failed');

    logTerminal(`Job queued: ${data.jobId}`, 'success');
    if (window.subscribeToJob) window.subscribeToJob(data.jobId);

  } catch (err) {
    logTerminal(`Error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run Command ⏎';
  }
}

// ── Enable/disable run button ──────────────────────────────────
function setRunCmdEnabled(enabled) {
  document.getElementById('run-cmd-btn').disabled = !enabled;
}

// ── Clear terminal ─────────────────────────────────────────────
function clearTerminal() {
  document.getElementById('terminal-log').innerHTML = '';
  document.getElementById('terminal-input').value = '';
  terminalLogs = [];
}

// ── Copy command ───────────────────────────────────────────────
function copyTerminalCmd() {
  const input = document.getElementById('terminal-input').value.trim();
  if (!input) return;
  navigator.clipboard.writeText(`ffmpeg ${input}`).then(() => {
    logTerminal('Command copied to clipboard.', 'success');
  });
}

// ── Keyboard shortcut: Ctrl+Enter to run ──────────────────────
document.getElementById('terminal-input').addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    runCustomCommand();
  }
});

// ── Expose ────────────────────────────────────────────────────
window.logTerminal      = logTerminal;
window.runCustomCommand = runCustomCommand;
window.clearTerminal    = clearTerminal;
window.copyTerminalCmd  = copyTerminalCmd;
window.setRunCmdEnabled = setRunCmdEnabled;

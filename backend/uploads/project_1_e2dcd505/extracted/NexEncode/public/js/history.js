let historyChart = null;

async function loadHistory() {
  const token = localStorage.getItem('token');
  try {
    const res = await fetch('/api/jobs?limit=50', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to load history');
    renderStats(data.stats || {});
    renderChart(data.jobs || []);
    renderTable(data.jobs || []);
  } catch (err) {
    document.getElementById('history-tbody').innerHTML = `<tr><td colspan="10" class="loading-row">${err.message}</td></tr>`;
  }
}

function formatHistoryBytes(bytes) {
  return window.formatBytes ? window.formatBytes(Number(bytes || 0)) : `${bytes || 0} B`;
}

function renderStats(stats) {
  const total = Number(stats.totalJobs || 0);
  const successful = Number(stats.successful || 0);
  document.getElementById('stat-total-jobs').textContent = total.toLocaleString();
  document.getElementById('stat-saved').textContent = formatHistoryBytes(stats.totalSaved);
  document.getElementById('stat-success-rate').textContent = total ? `${((successful / total) * 100).toFixed(0)}%` : '0%';
}

function chartColor(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function renderChart(jobs) {
  const canvas = document.getElementById('savings-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  const recent = jobs.filter((job) => job.status === 'done').slice(0, 10).reverse();
  historyChart?.destroy();
  historyChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: recent.map((job) => (job.original_filename || 'Video').slice(0, 12)),
      datasets: [
        { label: 'Original MB', data: recent.map((job) => Number(job.original_size || 0) / 1048576), backgroundColor: chartColor('--surface-3'), borderRadius: 4 },
        { label: 'Encoded MB', data: recent.map((job) => Number(job.output_size || 0) / 1048576), backgroundColor: chartColor('--accent-dim'), borderColor: chartColor('--accent'), borderWidth: 1, borderRadius: 4 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: chartColor('--text-muted'), font: { family: 'JetBrains Mono', size: 10 } } } },
      scales: {
        x: { ticks: { color: chartColor('--text-muted'), font: { family: 'JetBrains Mono', size: 9 } }, grid: { color: chartColor('--border') } },
        y: { beginAtZero: true, ticks: { color: chartColor('--text-muted'), font: { family: 'JetBrains Mono', size: 9 } }, grid: { color: chartColor('--border') } },
      },
    },
  });
}

function renderTable(jobs) {
  const tbody = document.getElementById('history-tbody');
  if (!jobs.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="loading-row">No jobs yet. Start encoding!</td></tr>';
    return;
  }

  tbody.innerHTML = jobs.map((job) => {
    const savedPct = job.original_size && job.output_size ? ((1 - job.output_size / job.original_size) * 100).toFixed(1) : null;
    const available = Boolean(Number(job.download_available));
    const action = job.status === 'done'
      ? available
        ? `<button class="history-download" onclick="downloadHistoryJob('${job.id}', '${encodeURIComponent(job.output_filename || 'encoded.mp4')}')">Download</button>`
        : '<span class="expired-label">Expired</span>'
      : '—';
    return `<tr>
      <td title="${escapeHistory(job.original_filename)}">${escapeHistory(shortName(job.original_filename))}</td>
      <td>${String(job.codec || '—').toUpperCase()}</td>
      <td>${escapeHistory(job.resolution || '—')}</td>
      <td>${formatHistoryBytes(job.original_size)}</td>
      <td>${formatHistoryBytes(job.output_size)}</td>
      <td>${savedPct === null ? '—' : `<span class="${Number(savedPct) >= 0 ? 'saved-positive' : 'saved-negative'}">${savedPct}%</span>`}</td>
      <td><span class="status-badge ${job.status}">${job.status}</span></td>
      <td>${Number(job.download_count || 0)}</td>
      <td>${action}</td>
      <td>${job.created_at ? new Date(job.created_at).toLocaleString() : '—'}</td>
    </tr>`;
  }).join('');
}

function shortName(name = '') { return name.length > 20 ? `${name.slice(0, 17)}…` : name || '—'; }
function escapeHistory(value = '') { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }
window.downloadHistoryJob = async function downloadHistoryJob(jobId, encodedName) {
  await window.downloadWithAuth?.(jobId, decodeURIComponent(encodedName));
  setTimeout(loadHistory, 600);
};
window.loadHistory = loadHistory;
window.addEventListener('nex:themechange', () => loadHistory());

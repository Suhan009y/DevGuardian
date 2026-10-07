(() => {
  let chart = null;
  const token = localStorage.getItem('token');
  if (!token) return;

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let size = value / 1024;
    let index = 0;
    while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
    return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[index]}`;
  }

  async function loadInsights() {
    try {
      const response = await fetch('/api/jobs/insights?days=7', { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not load insights');
      document.getElementById('overview-jobs').textContent = Number(data.summary.totalJobs || 0).toLocaleString();
      document.getElementById('overview-completed').textContent = Number(data.summary.completed || 0).toLocaleString();
      document.getElementById('overview-saved').textContent = formatBytes(data.summary.savedBytes);
      document.getElementById('overview-downloads').textContent = Number(data.summary.downloads || 0).toLocaleString();
      renderChart(data.timeline || []);
    } catch (err) {
      console.error('[insights]', err);
    }
  }

  function renderChart(timeline) {
    const canvas = document.getElementById('activity-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    chart?.destroy();
    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: timeline.map((row) => new Date(`${row.day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' })),
        datasets: [
          { label: 'Jobs', data: timeline.map((row) => row.jobs), borderColor: css('--accent'), backgroundColor: css('--accent-dim'), fill: true, tension: .35, pointRadius: 2 },
          { label: 'Downloads', data: timeline.map((row) => row.downloads), borderColor: css('--accent-blue'), tension: .35, pointRadius: 2 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: css('--text-muted'), font: { family: 'JetBrains Mono', size: 9 } } },
          y: { beginAtZero: true, ticks: { precision: 0, color: css('--text-muted'), font: { family: 'JetBrains Mono', size: 9 } }, grid: { color: css('--border') } },
        },
      },
    });
  }

  window.addEventListener('nex:themechange', loadInsights);
  window.loadDashboardInsights = loadInsights;
  loadInsights();
})();

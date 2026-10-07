const adminToken = localStorage.getItem('token');
if (!adminToken) window.location.href = '/index.html';
let charts = {};

async function adminApi(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
      Authorization: `Bearer ${adminToken}`,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 || response.status === 403) {
    if (data.code === 'ACCOUNT_BLOCKED' || response.status === 401) localStorage.clear();
    if (response.status === 403 && data.message?.toLowerCase().includes('admin')) window.location.href = '/dashboard.html';
    else if (response.status === 401) window.location.href = '/index.html';
  }
  if (!response.ok) throw new Error(data.message || 'Admin request failed');
  return data;
}

function esc(value = '') { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }
function fmtBytes(bytes) {
  let size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = 0; size /= 1024;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i += 1; }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[i]}`;
}
function fmtMoney(paise, currency = 'INR') { return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(paise || 0) / 100); }
function fmtProvider(provider = '') {
  const labels = { demo_credit_card: 'Demo credit card', demo_debit_card: 'Demo debit card', demo_upi: 'Demo UPI', demo_netbanking: 'Demo net banking', demo_wallet: 'Demo wallet', manual: 'Manual' };
  return labels[provider] || String(provider).replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}
function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function showAdminMessage(message, error = false) {
  const el = document.getElementById('admin-message');
  el.textContent = message;
  el.className = `admin-message show ${error ? 'error' : ''}`;
  clearTimeout(showAdminMessage.timer);
  showAdminMessage.timer = setTimeout(() => { el.className = 'admin-message'; }, 3500);
}

async function loadStats() {
  const data = await adminApi('/api/admin/stats');
  document.getElementById('stat-users').textContent = Number(data.totalUsers || 0).toLocaleString();
  document.getElementById('stat-premium').textContent = Number(data.premiumUsers || 0).toLocaleString();
  document.getElementById('stat-jobs').textContent = Number(data.totalJobs || 0).toLocaleString();
  document.getElementById('stat-downloads').textContent = Number(data.totalDownloads || 0).toLocaleString();
  document.getElementById('stat-processing').textContent = Number(data.processingJobs || 0).toLocaleString();
  document.getElementById('stat-failed').textContent = Number(data.failedJobs || 0).toLocaleString();
  document.getElementById('stat-storage').textContent = fmtBytes(data.totalInputBytes);
  document.getElementById('stat-revenue').textContent = fmtMoney(data.revenuePaise);
}

function makeChart(id, config) {
  charts[id]?.destroy();
  const canvas = document.getElementById(id);
  if (!canvas || typeof Chart === 'undefined') return;
  charts[id] = new Chart(canvas, config);
}

async function loadAnalytics() {
  // Always show the complete current calendar year: January through December.
  const currentYear = new Date().getFullYear();
  const data = await adminApi(`/api/admin/analytics?year=${currentYear}`);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const labels = data.timeline.map((row) => {
    const [year, month] = String(row.month).split('-').map(Number);
    return `${monthNames[month - 1]} ${String(year).slice(-2)}`;
  });
  const baseOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: css('--text-muted'), font: { family: 'JetBrains Mono', size: 10 } } } },
    scales: {
      x: { ticks: { color: css('--text-muted'), font: { family: 'JetBrains Mono', size: 9 } }, grid: { color: css('--border') } },
      y: { beginAtZero: true, ticks: { color: css('--text-muted'), font: { family: 'JetBrains Mono', size: 9 } }, grid: { color: css('--border') } },
    },
  };
  makeChart('revenue-chart', {
    type: 'line',
    data: { labels, datasets: [{ label: 'Revenue (₹)', data: data.timeline.map((row) => row.revenuePaise / 100), borderColor: css('--accent'), backgroundColor: css('--accent-dim'), fill: true, tension: .35 }] },
    options: baseOptions,
  });
  makeChart('jobs-chart', {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Completed', data: data.timeline.map((row) => row.completed), backgroundColor: css('--accent-dim'), borderColor: css('--accent'), borderWidth: 1, borderRadius: 4 },
      { label: 'Failed', data: data.timeline.map((row) => row.failed), backgroundColor: 'rgba(255,95,109,.18)', borderColor: css('--accent-err'), borderWidth: 1, borderRadius: 4 },
    ] },
    options: baseOptions,
  });
  makeChart('plans-chart', {
    type: 'doughnut',
    data: { labels: ['Free', 'Premium', 'Admins'], datasets: [{ data: [Number(data.plans.freeUsers || 0), Number(data.plans.premiumUsers || 0), Number(data.plans.admins || 0)] }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: css('--text-muted'), font: { family: 'JetBrains Mono', size: 10 } } } } },
  });
}

async function loadUsers() {
  const search = document.getElementById('user-search').value.trim();
  const data = await adminApi(`/api/admin/users?limit=100&search=${encodeURIComponent(search)}`);
  const body = document.getElementById('users-body');
  if (!data.users.length) return body.innerHTML = '<tr><td colspan="8" class="empty-cell">No users found.</td></tr>';
  body.innerHTML = data.users.map((user) => {
    const premium = user.plan === 'premium' && (!user.premium_expires_at || new Date(user.premium_expires_at) > new Date());
    const emailStatus = user.email_verified_at ? '<span class="status-chip active">Verified</span>' : '<span class="status-chip failed">Unverified</span>';
    return `<tr>
      <td><div class="user-name">${esc(user.username)} ${premium ? '<span class="premium-user-badge">★ PREMIUM</span>' : ''}</div><div class="user-email">${esc(user.email)}</div></td>
      <td><span class="status-chip">${esc(user.role)}</span></td>
      <td>${emailStatus}</td>
      <td><span class="status-chip ${premium ? 'premium' : ''}">${premium ? 'premium' : 'free'}</span></td>
      <td>${Number(user.total_jobs || 0)}</td>
      <td>${Number(user.downloads || 0)}</td>
      <td>${new Date(user.created_at).toLocaleDateString()}</td>
      <td><div class="table-actions">
        ${!user.email_verified_at ? `<button class="table-action" onclick="verifyUserEmail(${user.id})">Verify email</button>` : ''}
        <button class="table-action ${premium ? 'red' : 'green'}" onclick="changePlan(${user.id}, '${premium ? 'free' : 'premium'}')">${premium ? 'Revoke Premium' : 'Grant Premium'}</button>
        <button class="table-action ${user.account_status === 'blocked' ? 'green' : 'red'}" onclick="changeStatus(${user.id}, '${user.account_status === 'blocked' ? 'active' : 'blocked'}')">${user.account_status === 'blocked' ? 'Unblock' : 'Block'}</button>
      </div></td>
    </tr>`;
  }).join('');
}

async function changeStatus(id, status) {
  try { const data = await adminApi(`/api/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); showAdminMessage(data.message); await loadUsers(); }
  catch (err) { showAdminMessage(err.message, true); }
}
async function verifyUserEmail(id) {
  try { const data = await adminApi(`/api/admin/users/${id}/verify-email`, { method: 'PATCH', body: '{}' }); showAdminMessage(data.message); await loadUsers(); }
  catch (err) { showAdminMessage(err.message, true); }
}
async function changePlan(id, plan) {
  try {
    const body = { plan };
    if (plan === 'premium') {
      const days = Number.parseInt(prompt('Premium duration in days:', '30'), 10);
      if (!days) return;
      const amount = Number(prompt('Amount received in ₹ (enter 0 for a free/manual grant):', '0'));
      body.days = days;
      body.amountInr = Number.isFinite(amount) ? amount : 0;
    }
    const data = await adminApi(`/api/admin/users/${id}/plan`, { method: 'PATCH', body: JSON.stringify(body) });
    showAdminMessage(data.invoiceNumber ? `${data.message}. Invoice ${data.invoiceNumber} created.` : data.message);
    await Promise.all([loadUsers(), loadStats(), loadPayments(), loadAnalytics()]);
  } catch (err) { showAdminMessage(err.message, true); }
}

async function loadJobs() {
  const data = await adminApi('/api/admin/jobs?limit=30');
  document.getElementById('jobs-body').innerHTML = data.jobs.length ? data.jobs.map((job) => `<tr>
    <td>${esc(job.username)}</td><td title="${esc(job.original_filename)}">${esc((job.original_filename || '—').slice(0, 22))}</td>
    <td><span class="status-chip ${job.status}">${job.status}</span></td><td>${fmtBytes(job.output_size || job.original_size)}</td>
    <td>${Number(job.download_count || 0)}</td><td>${new Date(job.created_at).toLocaleString()}</td></tr>`).join('') : '<tr><td colspan="6" class="empty-cell">No jobs.</td></tr>';
}

async function loadPayments() {
  const data = await adminApi('/api/admin/payments?limit=50');
  document.getElementById('payments-body').innerHTML = data.payments.length ? data.payments.map((payment) => `<tr>
    <td>${esc(payment.username)}</td><td><a class="invoice-link" href="#" onclick="downloadAdminInvoice(${payment.id});return false">${esc(payment.invoice_number || 'Invoice')}</a></td>
    <td>${fmtMoney(payment.amount_paise, payment.currency)}</td><td>${esc(fmtProvider(payment.provider))}</td><td>${new Date(payment.paid_at || payment.created_at).toLocaleString()}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-cell">No paid transactions yet.</td></tr>';
}

async function downloadAdminInvoice(id) {
  const response = await fetch(`/api/invoices/${id}`, { headers: { Authorization: `Bearer ${adminToken}` } });
  if (!response.ok) return showAdminMessage('Invoice download failed', true);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `NexEncode-invoice-${id}.pdf`; a.click(); URL.revokeObjectURL(url);
}

async function loadMonthlyReport() {
  const month = document.getElementById('report-month').value;
  if (!month) return showAdminMessage('Choose a month first', true);
  try {
    const data = await adminApi(`/api/admin/reports/monthly?month=${encodeURIComponent(month)}`);
    const s = data.summary;
    document.getElementById('report-summary').innerHTML = `
      <div><strong>${fmtMoney(s.revenuePaise)}</strong><span>Revenue</span></div>
      <div><strong>${Number(s.transactions || 0)}</strong><span>Transactions</span></div>
      <div><strong>${Number(s.newSubscriptions || 0)}</strong><span>New subscriptions</span></div>
      <div><strong>${Number(s.jobs || 0)}</strong><span>Encoding jobs</span></div>
      <div><strong>${Number(s.downloads || 0)}</strong><span>Downloads</span></div>`;
    document.getElementById('report-body').innerHTML = data.payments.length ? data.payments.map((payment) => `<tr><td>${esc(payment.invoice_number)}</td><td>${esc(payment.username)}<div class="user-email">${esc(payment.email)}</div></td><td>${fmtMoney(payment.amount_paise, payment.currency)}</td><td>${esc(fmtProvider(payment.provider))}</td><td>${new Date(payment.paid_at).toLocaleString()}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-cell">No paid transactions in this month.</td></tr>';
  } catch (err) { showAdminMessage(err.message, true); }
}
function exportMonthlyReport() {
  const month = document.getElementById('report-month').value;
  if (!month) return showAdminMessage('Choose a month first', true);
  fetch(`/api/admin/reports/monthly.csv?month=${encodeURIComponent(month)}`, { headers: { Authorization: `Bearer ${adminToken}` } })
    .then(async (res) => { if (!res.ok) throw new Error('Export failed'); const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `nexencode-report-${month}.csv`; a.click(); URL.revokeObjectURL(url); })
    .catch((err) => showAdminMessage(err.message, true));
}

async function refreshAdmin() {
  try { await Promise.all([loadStats(), loadAnalytics(), loadUsers(), loadJobs(), loadPayments()]); }
  catch (err) { showAdminMessage(err.message, true); }
}
function adminLogout() { localStorage.clear(); window.location.href = '/index.html'; }
window.addEventListener('nex:themechange', loadAnalytics);
const now = new Date(); document.getElementById('report-month').value = now.toISOString().slice(0, 7);
refreshAdmin(); loadMonthlyReport();

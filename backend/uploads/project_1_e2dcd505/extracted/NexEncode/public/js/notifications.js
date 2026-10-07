(() => {
  const token = localStorage.getItem('token');
  if (!token) return;
  let items = [];
  let unread = 0;

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Notification request failed');
    return data;
  }

  function render() {
    const count = document.getElementById('notification-count');
    if (count) {
      count.textContent = unread > 99 ? '99+' : String(unread);
      count.classList.toggle('hidden', unread < 1);
    }
    const list = document.getElementById('notification-list');
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<div class="notification-empty">No notifications yet.</div>';
      return;
    }
    list.innerHTML = items.map((item) => `
      <div class="notification-item ${item.is_read ? '' : 'unread'}" onclick="openNotification(${item.id}, '${item.job_id || ''}')">
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.message)}</p>
        <time>${new Date(item.created_at).toLocaleString()}</time>
      </div>
    `).join('');
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value || '';
    return div.innerHTML;
  }

  async function loadNotifications() {
    try {
      const data = await api('/api/notifications?limit=30');
      items = data.notifications || [];
      unread = Number(data.unread || 0);
      render();
    } catch (err) {
      console.error('[notifications]', err);
    }
  }

  window.toggleNotifications = function toggleNotifications() {
    document.getElementById('notification-menu')?.classList.toggle('open');
  };

  window.openNotification = async function openNotification(id, jobId) {
    const item = items.find((entry) => Number(entry.id) === Number(id));
    if (item && !item.is_read) {
      item.is_read = 1;
      unread = Math.max(unread - 1, 0);
      render();
      api(`/api/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
    }
    if (jobId) {
      document.getElementById('notification-menu')?.classList.remove('open');
      window.togglePanel?.('history');
    }
  };

  window.markAllNotificationsRead = async function markAllNotificationsRead() {
    items.forEach((item) => { item.is_read = 1; });
    unread = 0;
    render();
    await api('/api/notifications/read-all', { method: 'PATCH' }).catch(() => {});
  };

  window.enableBrowserNotifications = async function enableBrowserNotifications() {
    if (!('Notification' in window)) return showToast('Not supported', 'This browser does not support desktop notifications.');
    const permission = await Notification.requestPermission();
    const button = document.getElementById('notification-permission');
    if (button) button.textContent = permission === 'granted' ? 'Browser notifications enabled ✓' : 'Browser notifications blocked';
  };

  function showToast(title, message) {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    const toast = document.createElement('div');
    toast.className = 'app-toast';
    toast.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`;
    stack.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
  }

  function receiveNotification(notification) {
    items.unshift(notification);
    unread += 1;
    render();
    showToast(notification.title, notification.message);
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(notification.title, { body: notification.message, icon: '/favicon.ico' });
    }
  }

  if (window.nexSocket) window.nexSocket.on('notification:new', receiveNotification);
  else window.addEventListener('nex:socket-ready', (event) => event.detail.socket.on('notification:new', receiveNotification), { once: true });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.notification-wrap')) document.getElementById('notification-menu')?.classList.remove('open');
  });
  loadNotifications();
})();

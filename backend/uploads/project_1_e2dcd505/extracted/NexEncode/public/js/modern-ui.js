(() => {
  function initReveals() {
    const items = [...document.querySelectorAll('.reveal')];
    if (!items.length) return;
    if (!('IntersectionObserver' in window)) {
      items.forEach((item) => item.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -30px' });
    items.forEach((item) => observer.observe(item));
  }

  function initSpotlights() {
    document.querySelectorAll('.spotlight').forEach((card) => {
      card.addEventListener('pointermove', (event) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
        card.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
      });
    });
  }

  function initRipples() {
    const selector = '.icon-btn, .btn-browse, .btn-encode, .btn-run, .chat-send-btn, .premium-action, .btn-submit, .sidebar-link, .table-action, .search-box button';
    document.querySelectorAll(selector).forEach((button) => {
      button.classList.add('ripple-host');
      button.addEventListener('pointerdown', (event) => {
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 2;
        const ripple = document.createElement('span');
        ripple.className = 'ui-ripple';
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
        button.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
      });
    });
  }

  function initSidebar() {
    const open = () => document.body.classList.add('sidebar-open');
    const close = () => document.body.classList.remove('sidebar-open');
    document.querySelectorAll('[data-sidebar-open]').forEach((button) => button.addEventListener('click', open));
    document.querySelectorAll('[data-sidebar-close], .mobile-backdrop').forEach((button) => button.addEventListener('click', close));
    document.querySelectorAll('[data-scroll-target]').forEach((link) => {
      link.addEventListener('click', () => {
        const target = document.querySelector(link.dataset.scrollTarget);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.querySelectorAll('.sidebar-link').forEach((item) => item.classList.remove('active'));
        link.classList.add('active');
        close();
      });
    });
  }

  function syncSidebarUser() {
    const username = localStorage.getItem('username') || 'NexEncode user';
    const role = localStorage.getItem('role') || 'user';
    document.querySelectorAll('.sidebar-username').forEach((node) => { node.textContent = username; });
    document.querySelectorAll('.sidebar-user-role').forEach((node) => { node.textContent = role === 'admin' ? 'Administrator' : 'Encoder workspace'; });
    document.querySelectorAll('.sidebar-avatar').forEach((node) => { node.textContent = username.charAt(0).toUpperCase(); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initReveals();
    initSpotlights();
    initRipples();
    initSidebar();
    syncSidebarUser();
  });
})();

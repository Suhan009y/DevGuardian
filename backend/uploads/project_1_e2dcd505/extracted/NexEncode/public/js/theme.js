(() => {
  const saved = localStorage.getItem('nex-theme');
  const preferred = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  const theme = saved || preferred;
  document.documentElement.dataset.theme = theme;

  const sunIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg>';
  const moonIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.2A8.4 8.4 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/></svg>';

  function syncButtons() {
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      const light = document.documentElement.dataset.theme === 'light';
      button.innerHTML = light ? moonIcon : sunIcon;
      button.title = light ? 'Switch to dark mode' : 'Switch to light mode';
      button.setAttribute('aria-label', button.title);
    });
  }

  window.toggleTheme = function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('nex-theme', next);
    syncButtons();
    window.dispatchEvent(new CustomEvent('nex:themechange', { detail: { theme: next } }));
  };

  document.addEventListener('DOMContentLoaded', syncButtons);
})();

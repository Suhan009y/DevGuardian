const existingToken = localStorage.getItem('token');
const params = new URLSearchParams(window.location.search);
const verificationToken = params.get('verify');
const resetToken = params.get('reset');
if (existingToken && !verificationToken && !resetToken) window.location.href = '/dashboard.html';

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  document.querySelectorAll('.auth-form').forEach((form) => form.classList.remove('active'));
  document.getElementById(`form-${tab}`)?.classList.add('active');
  document.querySelector('.tab-bar')?.classList.toggle('hidden', !['login', 'register'].includes(tab));

  const copy = {
    login: ['Secure workspace', 'Welcome back', 'Sign in to continue to your encoding dashboard.'],
    register: ['Create your account', 'Start encoding', 'Set up a workspace for conversions, history, and downloads.'],
    forgot: ['Account recovery', 'Reset your password', 'We will send a secure reset link to your registered email.'],
    reset: ['Choose a new password', 'Secure your account', 'Use at least eight characters for your new password.'],
  }[tab];
  if (copy) {
    document.getElementById('auth-kicker')?.replaceChildren(document.createTextNode(copy[0]));
    document.getElementById('auth-title')?.replaceChildren(document.createTextNode(copy[1]));
    document.getElementById('auth-subtitle')?.replaceChildren(document.createTextNode(copy[2]));
  }
}

function setLoading(btnId, loading, originalText) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? 'Please wait...' : originalText;
}

function showMsg(id, text, type = '', link = null) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `auth-msg ${type}`;
  el.textContent = text;
  if (link) {
    const a = document.createElement('a');
    a.href = link;
    a.className = 'dev-link';
    a.textContent = 'Open development link';
    el.appendChild(a);
  }
}

async function request(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || 'Request failed'), { data });
  return data;
}

async function handleLogin(event) {
  event.preventDefault();
  setLoading('login-btn', true, 'Continue to workspace');
  showMsg('login-msg', '');
  try {
    const data = await request('/api/auth/login', {
      email: document.getElementById('login-email').value.trim(),
      password: document.getElementById('login-password').value,
    });
    localStorage.setItem('token', data.token);
    localStorage.setItem('username', data.username);
    localStorage.setItem('role', data.role || 'user');
    localStorage.setItem('plan', data.plan || 'free');
    showMsg('login-msg', 'Welcome back! Redirecting...', 'success');
    setTimeout(() => { window.location.href = '/dashboard.html'; }, 500);
  } catch (err) {
    showMsg('login-msg', err.message, 'error');
  } finally {
    setLoading('login-btn', false, 'Continue to workspace');
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const password = document.getElementById('reg-password').value;
  if (password.length < 8) return showMsg('register-msg', 'Password must be at least 8 characters', 'error');
  setLoading('register-btn', true, 'Create NexEncode account');
  try {
    const data = await request('/api/auth/register', {
      username: document.getElementById('reg-username').value.trim(),
      email: document.getElementById('reg-email').value.trim(),
      password,
    });
    if (data.verificationRequired) {
      showMsg('register-msg', data.message, 'success', data.developmentVerificationUrl);
    } else {
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);
      localStorage.setItem('role', data.role || 'user');
      localStorage.setItem('plan', data.plan || 'free');
      window.location.href = '/dashboard.html';
    }
  } catch (err) {
    showMsg('register-msg', err.message, 'error');
  } finally {
    setLoading('register-btn', false, 'Create NexEncode account');
  }
}

async function handleForgotPassword(event) {
  event.preventDefault();
  setLoading('forgot-btn', true, 'Send reset link');
  try {
    const data = await request('/api/auth/forgot-password', { email: document.getElementById('forgot-email').value.trim() });
    showMsg('forgot-msg', data.message, 'success', data.developmentResetUrl);
  } catch (err) {
    showMsg('forgot-msg', err.message, 'error');
  } finally {
    setLoading('forgot-btn', false, 'Send reset link');
  }
}

async function handleResetPassword(event) {
  event.preventDefault();
  const password = document.getElementById('reset-password').value;
  const confirm = document.getElementById('reset-confirm').value;
  if (password !== confirm) return showMsg('reset-msg', 'Passwords do not match', 'error');
  setLoading('reset-btn', true, 'Update password');
  try {
    const data = await request('/api/auth/reset-password', { token: resetToken, password });
    showMsg('reset-msg', data.message, 'success');
    setTimeout(() => { window.history.replaceState({}, '', '/index.html'); switchTab('login'); }, 900);
  } catch (err) {
    showMsg('reset-msg', err.message, 'error');
  } finally {
    setLoading('reset-btn', false, 'Update password');
  }
}

async function verifyEmail() {
  switchTab('login');
  showMsg('login-msg', 'Verifying email...');
  try {
    const data = await request('/api/auth/verify-email', { token: verificationToken });
    showMsg('login-msg', data.message, 'success');
    window.history.replaceState({}, '', '/index.html');
  } catch (err) {
    showMsg('login-msg', err.message, 'error');
  }
}

if (resetToken) switchTab('reset');
else if (verificationToken) verifyEmail();

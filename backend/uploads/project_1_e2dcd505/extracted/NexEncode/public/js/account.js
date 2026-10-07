// ===== ACCOUNT, PLAN & DEMO PREMIUM CHECKOUT =====
(() => {
  let accountPromise = null;
  let premiumConfig = null;
  let selectedPaymentMethod = 'credit_card';

  const paymentMethodLabels = {
    credit_card: 'Credit card',
    debit_card: 'Debit card',
    upi: 'UPI',
    netbanking: 'Net banking',
    wallet: 'Wallet',
  };

  async function api(path, options = {}) {
    const token = localStorage.getItem('token');
    const response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || data.code === 'ACCOUNT_BLOCKED') {
      localStorage.clear();
      window.location.href = '/index.html';
      throw new Error(data.message || 'Session expired');
    }
    if (!response.ok) throw new Error(data.message || 'Request failed');
    return data;
  }

  function renderAccount(account) {
    window.NEX_ACCOUNT = account;
    localStorage.setItem('username', account.username);
    localStorage.setItem('role', account.role);
    localStorage.setItem('plan', account.plan);

    const greeting = document.getElementById('user-greeting');
    if (greeting) greeting.innerHTML = `@${account.username}${account.plan === 'premium' ? '<span class="premium-user-badge">★ PREMIUM</span>' : ''}`;

    document.querySelectorAll('.sidebar-username').forEach((node) => { node.textContent = account.username; });
    document.querySelectorAll('.sidebar-avatar').forEach((node) => { node.textContent = account.username.charAt(0).toUpperCase(); });
    document.querySelectorAll('.sidebar-user-role').forEach((node) => { node.textContent = account.role === 'admin' ? 'Administrator' : account.plan === 'premium' ? 'Premium workspace' : 'Encoder workspace'; });

    const badge = document.getElementById('plan-badge');
    if (badge) {
      badge.textContent = account.plan === 'premium' ? 'PREMIUM' : `FREE · ${account.maxUploadMb} MB`;
      badge.classList.toggle('premium', account.plan === 'premium');
    }

    const upgradeBtn = document.getElementById('upgrade-btn');
    if (upgradeBtn) upgradeBtn.classList.toggle('hidden', account.plan === 'premium');

    const adminLink = document.getElementById('admin-link');
    if (adminLink) adminLink.classList.toggle('hidden', account.role !== 'admin');

    const limitText = document.getElementById('upload-limit-text');
    if (limitText) {
      limitText.textContent = `${account.plan === 'premium' ? 'Premium' : 'Free'} limit: ${account.maxUploadMb >= 1024 ? `${(account.maxUploadMb / 1024).toFixed(account.maxUploadMb % 1024 ? 1 : 0)} GB` : `${account.maxUploadMb} MB`}`;
    }

    const statusText = document.getElementById('premium-current-status');
    if (statusText) {
      statusText.textContent = account.plan === 'premium'
        ? `Premium is active${account.premiumExpiresAt ? ` until ${new Date(account.premiumExpiresAt).toLocaleDateString('en-IN')}` : ''}.`
        : `Your free account supports uploads up to ${account.maxUploadMb} MB.`;
    }
  }

  async function loadAccount(force = false) {
    if (!force && accountPromise) return accountPromise;
    accountPromise = api('/api/auth/me')
      .then((account) => {
        renderAccount(account);
        return account;
      })
      .catch((err) => {
        console.error('[account]', err);
        throw err;
      });
    return accountPromise;
  }

  function setPaymentStep(step) {
    document.getElementById('payment-details-step')?.classList.toggle('hidden', step !== 'details');
    document.getElementById('payment-otp-step')?.classList.toggle('hidden', step !== 'otp');
  }

  function setCheckoutEnabled(enabled) {
    const shell = document.getElementById('demo-payment-shell');
    if (shell) shell.classList.toggle('is-disabled', !enabled);
  }

  function resetCheckout() {
    selectedPaymentMethod = 'credit_card';
    selectDemoPaymentMethod('credit_card');
    setPaymentStep('details');
    const otp = document.getElementById('demo-payment-otp');
    if (otp) otp.value = '';
    const confirm = document.getElementById('premium-confirm-action');
    if (confirm) {
      confirm.disabled = false;
      confirm.textContent = `Pay ₹${premiumConfig?.priceInr || 199}`;
    }
    showPremiumMessage('');
  }

  async function openPremiumModal() {
    const modal = document.getElementById('premium-modal');
    if (!modal) return;
    modal.classList.add('open');

    try {
      const [config, account] = await Promise.all([
        api('/api/subscription/config'),
        loadAccount(true),
      ]);
      premiumConfig = config;

      const price = document.getElementById('premium-price');
      const size = document.getElementById('premium-size');
      const duration = document.getElementById('premium-duration');
      const note = document.getElementById('premium-payment-note');
      const continueButton = document.getElementById('premium-action');

      if (price) price.textContent = `₹${config.priceInr}`;
      if (size) {
        size.textContent = config.premiumUploadMaxMb >= 1024
          ? `${(config.premiumUploadMaxMb / 1024).toFixed(config.premiumUploadMaxMb % 1024 ? 1 : 0)} GB`
          : `${config.premiumUploadMaxMb} MB`;
      }
      if (duration) duration.textContent = `${config.premiumDays || 30} days`;
      if (continueButton) continueButton.textContent = `Continue · ₹${config.priceInr}`;
      const otpCode = document.getElementById('demo-otp-code');
      if (otpCode) otpCode.textContent = config.demoOtpHint || '123456';
      if (note) {
        note.textContent = config.demoMode
          ? 'Demo checkout only. No real money is transferred and no card, CVV, UPI PIN or banking credential is stored.'
          : 'Payment configuration unavailable.';
      }

      const canPay = config.enabled && account.plan !== 'premium';
      setCheckoutEnabled(canPay);
      if (canPay) resetCheckout();
      else {
        setPaymentStep('details');
        showPremiumMessage(account.plan === 'premium'
          ? 'Premium is already active on this account.'
          : 'Demo payments are disabled.', account.plan === 'premium' ? 'success' : 'error');
      }
      await loadBillingHistory();
    } catch (err) {
      showPremiumMessage(err.message, 'error');
    }
  }

  function closePremiumModal() {
    document.getElementById('premium-modal')?.classList.remove('open');
  }

  function showPremiumMessage(message, type = '') {
    const el = document.getElementById('premium-message');
    if (!el) return;
    el.textContent = message;
    el.className = `premium-message ${type}`;
  }

  function selectDemoPaymentMethod(method) {
    if (!paymentMethodLabels[method]) return;
    selectedPaymentMethod = method;

    document.querySelectorAll('.payment-method-tab').forEach((tab) => {
      const active = tab.dataset.method === method;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });

    const isCard = method === 'credit_card' || method === 'debit_card';
    document.getElementById('payment-card-form')?.classList.toggle('hidden', !isCard);
    document.getElementById('payment-upi-form')?.classList.toggle('hidden', method !== 'upi');
    document.getElementById('payment-netbanking-form')?.classList.toggle('hidden', method !== 'netbanking');
    document.getElementById('payment-wallet-form')?.classList.toggle('hidden', method !== 'wallet');

    const cardLabel = document.getElementById('demo-card-type-label');
    if (cardLabel) cardLabel.textContent = method === 'debit_card' ? 'Debit card details' : 'Credit card details';

    const testValues = document.getElementById('demo-test-values');
    if (testValues) {
      if (isCard) testValues.innerHTML = '<strong>Test details:</strong> 4111 1111 1111 1111 · 12/30 · CVV 123';
      if (method === 'upi') testValues.innerHTML = '<strong>Test UPI ID:</strong> user@upi';
      if (method === 'netbanking') testValues.innerHTML = '<strong>Demo:</strong> select any bank. No banking page will open.';
      if (method === 'wallet') testValues.innerHTML = '<strong>Demo:</strong> select any wallet. No real wallet is charged.';
    }

    showPremiumMessage('');
  }

  function digits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function isValidCardNumber(value) {
    const number = digits(value);
    if (number.length < 13 || number.length > 19) return false;
    let sum = 0;
    let doubleDigit = false;
    for (let i = number.length - 1; i >= 0; i -= 1) {
      let digit = Number(number[i]);
      if (doubleDigit) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      doubleDigit = !doubleDigit;
    }
    return sum % 10 === 0;
  }

  function isValidExpiry(value) {
    const match = String(value || '').match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
    if (!match) return false;
    const month = Number(match[1]);
    const year = 2000 + Number(match[2]);
    const expiry = new Date(year, month, 0, 23, 59, 59);
    return expiry >= new Date();
  }

  function validatePaymentDetails() {
    if (selectedPaymentMethod === 'credit_card' || selectedPaymentMethod === 'debit_card') {
      const number = document.getElementById('demo-card-number')?.value;
      const name = document.getElementById('demo-card-name')?.value.trim();
      const expiry = document.getElementById('demo-card-expiry')?.value.trim();
      const cvv = digits(document.getElementById('demo-card-cvv')?.value);
      if (!isValidCardNumber(number)) throw new Error('Enter the provided valid demo card number');
      if (!name || name.length < 2) throw new Error('Enter a demo cardholder name');
      if (!isValidExpiry(expiry)) throw new Error('Enter a valid future expiry in MM/YY format');
      if (!/^\d{3,4}$/.test(cvv)) throw new Error('Enter a 3 or 4 digit demo CVV');
    }

    if (selectedPaymentMethod === 'upi') {
      const upi = document.getElementById('demo-upi-id')?.value.trim();
      if (!/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(upi || '')) throw new Error('Enter a valid demo UPI ID such as user@upi');
    }

    if (selectedPaymentMethod === 'netbanking') {
      if (!document.getElementById('demo-bank')?.value) throw new Error('Select a demo bank');
    }

    if (selectedPaymentMethod === 'wallet') {
      if (!document.getElementById('demo-wallet')?.value) throw new Error('Select a demo wallet');
    }
  }

  function startPremiumUpgrade() {
    try {
      validatePaymentDetails();
      const label = paymentMethodLabels[selectedPaymentMethod];
      const methodText = document.getElementById('demo-confirm-method');
      const amountText = document.getElementById('demo-confirm-amount');
      if (methodText) methodText.textContent = label;
      if (amountText) amountText.textContent = `₹${premiumConfig?.priceInr || 199}`;
      setPaymentStep('otp');
      document.getElementById('demo-payment-otp')?.focus();
      showPremiumMessage('');
    } catch (err) {
      showPremiumMessage(err.message, 'error');
    }
  }

  function backToPaymentDetails() {
    setPaymentStep('details');
    showPremiumMessage('');
  }

  async function confirmDemoPayment() {
    const otpInput = document.getElementById('demo-payment-otp');
    const demoOtp = digits(otpInput?.value);
    const button = document.getElementById('premium-confirm-action');

    if (demoOtp.length !== 6) {
      showPremiumMessage(`Enter the 6-digit demo OTP: ${premiumConfig?.demoOtpHint || '123456'}`, 'error');
      otpInput?.focus();
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = 'Processing demo payment...';
    }
    showPremiumMessage('Simulating payment approval...');

    try {
      await new Promise((resolve) => setTimeout(resolve, 900));
      const result = await api('/api/subscription/demo-pay', {
        method: 'POST',
        body: JSON.stringify({
          paymentMethod: selectedPaymentMethod,
          demoOtp,
        }),
      });

      await loadAccount(true);
      await loadBillingHistory();
      setCheckoutEnabled(false);
      showPremiumMessage(`${result.message} Invoice ${result.invoiceNumber} is ready below.`, 'success');
    } catch (err) {
      showPremiumMessage(err.message, 'error');
      if (button) {
        button.disabled = false;
        button.textContent = `Pay ₹${premiumConfig?.priceInr || 199}`;
      }
    }
  }

  function formatDemoCardNumber(input) {
    input.value = digits(input.value).slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
  }

  function formatDemoExpiry(input) {
    const value = digits(input.value).slice(0, 4);
    input.value = value.length > 2 ? `${value.slice(0, 2)}/${value.slice(2)}` : value;
  }

  async function loadBillingHistory() {
    const list = document.getElementById('billing-list');
    if (!list) return;
    try {
      const data = await api('/api/subscription/payments');
      if (!data.payments?.length) {
        list.innerHTML = '<span>No paid invoices yet.</span>';
        return;
      }
      list.innerHTML = data.payments.map((payment) => {
        const amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: payment.currency || 'INR' }).format(Number(payment.amount_paise || 0) / 100);
        return `<div class="billing-row"><span>${payment.invoice_number || 'Payment'} · ${amount}</span><a href="#" onclick="downloadInvoice(${payment.id});return false">Invoice PDF</a></div>`;
      }).join('');
    } catch (err) {
      list.innerHTML = `<span>${err.message}</span>`;
    }
  }

  async function downloadInvoice(paymentId) {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/invoices/${paymentId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Invoice download failed');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NexEncode-invoice-${paymentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showPremiumMessage(err.message, 'error');
    }
  }

  window.loadAccount = loadAccount;
  window.openPremiumModal = openPremiumModal;
  window.closePremiumModal = closePremiumModal;
  window.selectDemoPaymentMethod = selectDemoPaymentMethod;
  window.startPremiumUpgrade = startPremiumUpgrade;
  window.backToPaymentDetails = backToPaymentDetails;
  window.confirmDemoPayment = confirmDemoPayment;
  window.formatDemoCardNumber = formatDemoCardNumber;
  window.formatDemoExpiry = formatDemoExpiry;
  window.downloadInvoice = downloadInvoice;

  loadAccount().catch(() => {});
})();

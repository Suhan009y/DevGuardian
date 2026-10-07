const express = require('express');
const crypto = require('crypto');
const auth = require('../middleware/auth');
const db = require('../config/db');
const { recordPayment } = require('../services/paymentService');
const { createNotification } = require('../services/notificationService');

const router = express.Router();

const DEMO_PAYMENT_METHODS = new Set([
  'credit_card',
  'debit_card',
  'upi',
  'netbanking',
  'wallet',
]);

function demoPaymentsEnabled() {
  return String(process.env.DEMO_PAYMENT_ENABLED || 'true').toLowerCase() !== 'false';
}

function premiumAmountPaise() {
  return (Number.parseInt(process.env.PREMIUM_PRICE_INR, 10) || 199) * 100;
}

function premiumDurationDays() {
  return Math.max(1, Number.parseInt(process.env.DEMO_PREMIUM_DAYS, 10) || 30);
}

function makeDemoId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
}

function providerForMethod(method) {
  return `demo_${method}`.slice(0, 30);
}

router.get('/config', auth, (req, res) => {
  res.json({
    enabled: demoPaymentsEnabled(),
    demoMode: true,
    plan: 'premium_monthly',
    priceInr: Number.parseInt(process.env.PREMIUM_PRICE_INR, 10) || 199,
    premiumDays: premiumDurationDays(),
    premiumUploadMaxMb: Number.parseInt(process.env.PREMIUM_UPLOAD_MAX_SIZE_MB, 10)
      || Number.parseInt(process.env.UPLOAD_MAX_SIZE_MB, 10)
      || 10240,
    currentPlan: req.user.plan,
    paymentMethods: Array.from(DEMO_PAYMENT_METHODS),
    demoOtpHint: String(process.env.DEMO_PAYMENT_OTP || '123456'),
  });
});

router.get('/payments', auth, async (req, res) => {
  try {
    const [payments] = await db.query(
      `SELECT id, provider, provider_payment_id, amount_paise, currency, status,
              invoice_number, paid_at, created_at
       FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ payments });
  } catch (err) {
    console.error('[subscription/payments]', err);
    res.status(500).json({ message: 'Could not load billing history' });
  }
});

router.post('/demo-pay', auth, async (req, res) => {
  let connection;
  try {
    if (!demoPaymentsEnabled()) {
      return res.status(503).json({ message: 'Demo payments are currently disabled' });
    }
    if (req.user.plan === 'premium') {
      return res.status(409).json({ message: 'This account already has active Premium access' });
    }

    const paymentMethod = String(req.body.paymentMethod || '').trim().toLowerCase();
    const demoOtp = String(req.body.demoOtp || '').trim();
    const expectedOtp = String(process.env.DEMO_PAYMENT_OTP || '123456');

    if (!DEMO_PAYMENT_METHODS.has(paymentMethod)) {
      return res.status(400).json({ message: 'Choose a valid demo payment method' });
    }
    if (demoOtp !== expectedOtp) {
      return res.status(400).json({ message: 'Incorrect demo OTP.' });
    }

    const periodStart = new Date();
    const periodEnd = new Date(periodStart.getTime() + premiumDurationDays() * 24 * 60 * 60 * 1000);
    const subscriptionReference = makeDemoId('demo_sub');
    const paymentReference = makeDemoId('demo_pay');

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [subscriptionResult] = await connection.query(
      `INSERT INTO subscriptions
        (user_id, provider, provider_subscription_id, provider_payment_id, plan_code,
         status, current_period_start, current_period_end, cancel_at_period_end)
       VALUES (?, 'demo', ?, ?, 'premium_monthly', 'active', ?, ?, 0)`,
      [req.user.id, subscriptionReference, paymentReference, periodStart, periodEnd]
    );

    const payment = await recordPayment({
      userId: req.user.id,
      subscriptionId: subscriptionResult.insertId,
      provider: providerForMethod(paymentMethod),
      providerPaymentId: paymentReference,
      amountPaise: premiumAmountPaise(),
      currency: 'INR',
      status: 'paid',
      paidAt: periodStart,
      connection,
    });

    await connection.query(
      "UPDATE users SET plan = 'premium', premium_expires_at = ? WHERE id = ?",
      [periodEnd, req.user.id]
    );

    await connection.commit();

    await createNotification({
      userId: req.user.id,
      type: 'premium_activated',
      title: 'Demo Premium activated',
      message: `Your demo Premium plan is active until ${periodEnd.toLocaleDateString('en-IN')}. Invoice ${payment.invoice_number} is ready.`,
    }).catch(() => {});

    res.status(201).json({
      message: 'Demo payment successful. Premium has been activated.',
      plan: 'premium',
      premiumExpiresAt: periodEnd,
      paymentId: payment.id,
      invoiceNumber: payment.invoice_number,
      paymentReference,
    });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('[subscription/demo-pay]', err);
    res.status(500).json({ message: err.message || 'Demo payment could not be completed' });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/cancel', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id FROM subscriptions
       WHERE user_id = ? AND provider = 'demo' AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'No active demo subscription found' });

    await db.query(
      'UPDATE subscriptions SET cancel_at_period_end = 1 WHERE id = ?',
      [rows[0].id]
    );
    res.json({ message: 'Demo subscription will end on the current Premium expiry date' });
  } catch (err) {
    console.error('[subscription/cancel]', err);
    res.status(500).json({ message: 'Could not update the demo subscription' });
  }
});

module.exports = router;

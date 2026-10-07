const express = require('express');
const auth = require('../middleware/auth');
const db = require('../config/db');
const { buildSimpleInvoicePdf } = require('../services/simplePdf');

const router = express.Router();
router.use(auth);

function formatProvider(provider) {
  const labels = {
    demo_credit_card: 'Demo credit card',
    demo_debit_card: 'Demo debit card',
    demo_upi: 'Demo UPI',
    demo_netbanking: 'Demo net banking',
    demo_wallet: 'Demo wallet',
    manual: 'Manual',
  };
  return labels[provider] || String(provider || 'Demo payment').replace(/_/g, ' ');
}

router.get('/:paymentId', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*, u.username, u.email
       FROM payments p JOIN users u ON u.id = p.user_id
       WHERE p.id = ? LIMIT 1`,
      [req.params.paymentId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Invoice not found' });
    const payment = rows[0];
    if (req.user.role !== 'admin' && payment.user_id !== req.user.id) {
      return res.status(403).json({ message: 'You cannot access this invoice' });
    }
    if (payment.status !== 'paid') return res.status(400).json({ message: 'Invoice is only available for paid transactions' });

    const amount = `${payment.currency || 'INR'} ${(Number(payment.amount_paise || 0) / 100).toFixed(2)}`;
    const pdf = buildSimpleInvoicePdf({
      invoiceNumber: payment.invoice_number || `NEX-${payment.id}`,
      date: new Date(payment.paid_at || payment.created_at).toLocaleDateString('en-IN'),
      status: String(payment.status).toUpperCase(),
      username: payment.username,
      email: payment.email,
      amount,
      provider: formatProvider(payment.provider),
      paymentReference: payment.provider_payment_id,
    });

    const filename = `${payment.invoice_number || `NEX-${payment.id}`}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  } catch (err) {
    console.error('[invoice]', err);
    res.status(500).json({ message: 'Could not generate invoice' });
  }
});

module.exports = router;

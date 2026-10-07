const db = require('../config/db');

function makeInvoiceNumber(paymentId, paidAt = new Date()) {
  const date = new Date(paidAt);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `NEX-${y}${m}-${String(paymentId).padStart(6, '0')}`;
}

async function recordPayment({
  userId,
  subscriptionId = null,
  provider = 'manual',
  providerPaymentId = null,
  amountPaise = 0,
  currency = 'INR',
  status = 'paid',
  paidAt = new Date(),
  connection = db,
}) {
  if (providerPaymentId) {
    const [existing] = await connection.query('SELECT * FROM payments WHERE provider_payment_id = ? LIMIT 1', [providerPaymentId]);
    if (existing.length) return existing[0];
  }

  const [result] = await connection.query(
    `INSERT INTO payments
      (user_id, subscription_id, provider, provider_payment_id, amount_paise, currency, status, paid_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, subscriptionId, provider, providerPaymentId, amountPaise, currency, status, status === 'paid' ? paidAt : null]
  );
  const invoiceNumber = status === 'paid' ? makeInvoiceNumber(result.insertId, paidAt) : null;
  if (invoiceNumber) {
    await connection.query('UPDATE payments SET invoice_number = ? WHERE id = ?', [invoiceNumber, result.insertId]);
  }
  const [rows] = await connection.query('SELECT * FROM payments WHERE id = ?', [result.insertId]);
  return rows[0];
}

module.exports = { recordPayment, makeInvoiceNumber };

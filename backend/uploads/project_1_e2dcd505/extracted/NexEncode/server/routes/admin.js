const express = require('express');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/admin');
const db = require('../config/db');
const { recordPayment } = require('../services/paymentService');
const { createNotification } = require('../services/notificationService');

const router = express.Router();
router.use(auth, adminOnly);

function monthBounds(monthValue) {
  const value = /^\d{4}-\d{2}$/.test(String(monthValue || '')) ? String(monthValue) : new Date().toISOString().slice(0, 7);
  const start = new Date(`${value}-01T00:00:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { value, start, end };
}

router.get('/stats', async (_req, res) => {
  try {
    const [[users]] = await db.query(`
      SELECT COUNT(*) totalUsers,
             SUM(role = 'admin') admins,
             SUM(account_status = 'blocked') blockedUsers,
             SUM(email_verified_at IS NOT NULL) verifiedUsers,
             SUM(plan = 'premium' AND (premium_expires_at IS NULL OR premium_expires_at > NOW())) premiumUsers
      FROM users
    `);
    const [[jobs]] = await db.query(`
      SELECT COUNT(*) totalJobs,
             SUM(status = 'processing') processingJobs,
             SUM(status = 'done') completedJobs,
             SUM(status = 'failed') failedJobs,
             COALESCE(SUM(download_count), 0) totalDownloads,
             COALESCE(SUM(original_size), 0) totalInputBytes,
             COALESCE(SUM(output_size), 0) totalOutputBytes
      FROM encode_jobs
    `);
    const [[revenue]] = await db.query(`
      SELECT COALESCE(SUM(amount_paise), 0) revenuePaise,
             SUM(status = 'paid') paidTransactions
      FROM payments WHERE status = 'paid'
    `);
    res.json({ ...users, ...jobs, ...revenue });
  } catch (err) {
    console.error('[admin/stats]', err);
    res.status(500).json({ message: 'Failed to load admin statistics' });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    // Return a fixed January-to-December timeline for the requested year.
    // The browser sends its current year, avoiding month/timezone boundary issues.
    const requestedYear = Number.parseInt(req.query.year, 10);
    const currentYear = new Date().getFullYear();
    const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100
      ? requestedYear
      : currentYear;

    const start = `${year}-01-01 00:00:00`;
    const end = `${year + 1}-01-01 00:00:00`;

    const [jobRows] = await db.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') month,
              COUNT(*) jobs,
              SUM(status = 'done') completed,
              SUM(status = 'failed') failed,
              COALESCE(SUM(download_count), 0) downloads
       FROM encode_jobs
       WHERE created_at >= ? AND created_at < ?
       GROUP BY DATE_FORMAT(created_at, '%Y-%m')
       ORDER BY month`,
      [start, end]
    );
    const [userRows] = await db.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') month, COUNT(*) newUsers
       FROM users
       WHERE created_at >= ? AND created_at < ?
       GROUP BY DATE_FORMAT(created_at, '%Y-%m')
       ORDER BY month`,
      [start, end]
    );
    const [revenueRows] = await db.query(
      `SELECT DATE_FORMAT(paid_at, '%Y-%m') month,
              COALESCE(SUM(amount_paise), 0) revenuePaise,
              COUNT(*) transactions
       FROM payments
       WHERE status = 'paid' AND paid_at >= ? AND paid_at < ?
       GROUP BY DATE_FORMAT(paid_at, '%Y-%m')
       ORDER BY month`,
      [start, end]
    );
    const [[plans]] = await db.query(`
      SELECT SUM(role != 'admin' AND plan = 'free') freeUsers,
             SUM(role != 'admin' AND plan = 'premium' AND (premium_expires_at IS NULL OR premium_expires_at > NOW())) premiumUsers,
             SUM(role = 'admin') admins
      FROM users
    `);

    const jobMap = new Map(jobRows.map((row) => [row.month, row]));
    const userMap = new Map(userRows.map((row) => [row.month, row]));
    const revenueMap = new Map(revenueRows.map((row) => [row.month, row]));
    const timeline = [];

    const [[before]] = await db.query(
      'SELECT COUNT(*) count FROM users WHERE created_at < ?',
      [start]
    );
    let cumulativeUsers = Number(before.count || 0);

    for (let month = 1; month <= 12; month += 1) {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const jobs = jobMap.get(key) || {};
      const users = userMap.get(key) || {};
      const revenue = revenueMap.get(key) || {};
      cumulativeUsers += Number(users.newUsers || 0);

      timeline.push({
        month: key,
        jobs: Number(jobs.jobs || 0),
        completed: Number(jobs.completed || 0),
        failed: Number(jobs.failed || 0),
        downloads: Number(jobs.downloads || 0),
        newUsers: Number(users.newUsers || 0),
        totalUsers: cumulativeUsers,
        revenuePaise: Number(revenue.revenuePaise || 0),
        transactions: Number(revenue.transactions || 0),
      });
    }

    res.json({ year, timeline, plans });
  } catch (err) {
    console.error('[admin/analytics]', err);
    res.status(500).json({ message: 'Failed to load analytics' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const where = search ? 'WHERE u.username LIKE ? OR u.email LIKE ?' : '';
    const params = search ? [`%${search}%`, `%${search}%`] : [];

    const [rows] = await db.query(
      `SELECT u.id, u.username, u.email, u.email_verified_at, u.role, u.account_status, u.plan,
              u.premium_expires_at, u.created_at,
              COUNT(j.id) total_jobs,
              COALESCE(SUM(j.status = 'done'), 0) completed_jobs,
              COALESCE(SUM(j.download_count), 0) downloads
       FROM users u LEFT JOIN encode_jobs j ON j.user_id = u.id
       ${where}
       GROUP BY u.id ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[countRow]] = await db.query(`SELECT COUNT(*) total FROM users u ${where}`, params);
    res.json({ users: rows, page, limit, total: countRow.total });
  } catch (err) {
    console.error('[admin/users]', err);
    res.status(500).json({ message: 'Failed to load users' });
  }
});

router.patch('/users/:id/status', async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.id, 10);
    const status = req.body.status;
    if (!['active', 'blocked'].includes(status)) return res.status(400).json({ message: 'Status must be active or blocked' });
    if (userId === req.user.id && status === 'blocked') return res.status(400).json({ message: 'You cannot block your own admin account' });
    const [result] = await db.query('UPDATE users SET account_status = ? WHERE id = ?', [status, userId]);
    if (!result.affectedRows) return res.status(404).json({ message: 'User not found' });
    res.json({ message: `User ${status === 'blocked' ? 'blocked' : 'unblocked'}` });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update user status' });
  }
});

router.patch('/users/:id/verify-email', async (req, res) => {
  try {
    const [result] = await db.query('UPDATE users SET email_verified_at = NOW() WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'Email marked as verified' });
  } catch (err) {
    res.status(500).json({ message: 'Could not verify user email' });
  }
});

router.patch('/users/:id/plan', async (req, res) => {
  const conn = await db.getConnection();
  try {
    const userId = Number.parseInt(req.params.id, 10);
    const plan = req.body.plan;
    if (!['free', 'premium'].includes(plan)) return res.status(400).json({ message: 'Plan must be free or premium' });
    let expiresAt = null;
    if (plan === 'premium') {
      if (req.body.expiresAt) {
        expiresAt = new Date(req.body.expiresAt);
        if (Number.isNaN(expiresAt.getTime())) return res.status(400).json({ message: 'Invalid expiry date' });
      } else {
        const days = Math.min(Math.max(Number.parseInt(req.body.days, 10) || 30, 1), 3650);
        expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      }
    }

    await conn.beginTransaction();
    const [result] = await conn.query('UPDATE users SET plan = ?, premium_expires_at = ? WHERE id = ?', [plan, expiresAt, userId]);
    if (!result.affectedRows) {
      await conn.rollback();
      return res.status(404).json({ message: 'User not found' });
    }

    let subscriptionId = null;
    if (plan === 'premium') {
      const [sub] = await conn.query(
        `INSERT INTO subscriptions (user_id, provider, plan_code, status, current_period_start, current_period_end)
         VALUES (?, 'manual', 'premium_manual', 'active', NOW(), ?)`,
        [userId, expiresAt]
      );
      subscriptionId = sub.insertId;
    } else {
      await conn.query(
        `UPDATE subscriptions SET status = 'cancelled', current_period_end = LEAST(COALESCE(current_period_end, NOW()), NOW())
         WHERE user_id = ? AND provider = 'manual' AND status = 'active'`,
        [userId]
      );
    }
    await conn.commit();

    let payment = null;
    const amountInr = Math.max(Number(req.body.amountInr || 0), 0);
    if (plan === 'premium' && amountInr > 0) {
      payment = await recordPayment({
        userId,
        subscriptionId,
        provider: 'manual',
        providerPaymentId: `manual-${userId}-${Date.now()}`,
        amountPaise: Math.round(amountInr * 100),
        status: 'paid',
      });
    }
    await createNotification({
      userId,
      type: plan === 'premium' ? 'premium_activated' : 'plan_changed',
      title: plan === 'premium' ? 'Premium activated' : 'Plan changed',
      message: plan === 'premium'
        ? `An administrator activated Premium until ${expiresAt.toLocaleDateString('en-IN')}.`
        : 'Your account is now on the Free plan.',
    }).catch(() => {});

    res.json({
      message: plan === 'premium' ? 'Premium access granted' : 'User moved to free plan',
      expiresAt,
      paymentId: payment?.id || null,
      invoiceNumber: payment?.invoice_number || null,
    });
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    console.error('[admin/user-plan]', err);
    res.status(500).json({ message: 'Failed to update user plan' });
  } finally {
    conn.release();
  }
});

router.get('/jobs', async (req, res) => {
  try {
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 100, 200);
    const [jobs] = await db.query(
      `SELECT j.id, j.original_filename, j.original_size, j.output_size, j.download_count,
              j.codec, j.resolution, j.status, j.error_message, j.created_at, j.completed_at,
              j.output_expires_at, j.output_deleted_at, u.username, u.email
       FROM encode_jobs j JOIN users u ON u.id = j.user_id
       ORDER BY j.created_at DESC LIMIT ?`,
      [limit]
    );
    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load jobs' });
  }
});

router.get('/subscriptions', async (req, res) => {
  try {
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 100, 200);
    const [subscriptions] = await db.query(
      `SELECT s.*, u.username, u.email
       FROM subscriptions s JOIN users u ON u.id = s.user_id
       ORDER BY s.created_at DESC LIMIT ?`,
      [limit]
    );
    res.json({ subscriptions });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load subscriptions' });
  }
});

router.get('/payments', async (req, res) => {
  try {
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 100, 300);
    const [payments] = await db.query(
      `SELECT p.*, u.username, u.email
       FROM payments p JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC LIMIT ?`,
      [limit]
    );
    res.json({ payments });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load payments' });
  }
});

async function buildMonthlyReport(month) {
  const { value, start, end } = monthBounds(month);
  const [[summary]] = await db.query(
    `SELECT COALESCE(SUM(amount_paise), 0) revenuePaise,
            COUNT(*) transactions,
            COUNT(DISTINCT user_id) payingUsers
     FROM payments WHERE status = 'paid' AND paid_at >= ? AND paid_at < ?`,
    [start, end]
  );
  const [[subscriptions]] = await db.query(
    `SELECT COUNT(*) newSubscriptions,
            SUM(status IN ('active','authenticated')) activeSubscriptions
     FROM subscriptions WHERE created_at >= ? AND created_at < ?`,
    [start, end]
  );
  const [[jobs]] = await db.query(
    `SELECT COUNT(*) jobs, SUM(status = 'done') completed, SUM(status = 'failed') failed,
            COALESCE(SUM(download_count), 0) downloads
     FROM encode_jobs WHERE created_at >= ? AND created_at < ?`,
    [start, end]
  );
  const [payments] = await db.query(
    `SELECT p.id, p.invoice_number, p.provider, p.provider_payment_id, p.amount_paise,
            p.currency, p.paid_at, u.username, u.email
     FROM payments p JOIN users u ON u.id = p.user_id
     WHERE p.status = 'paid' AND p.paid_at >= ? AND p.paid_at < ?
     ORDER BY p.paid_at DESC`,
    [start, end]
  );
  return { month: value, summary: { ...summary, ...subscriptions, ...jobs }, payments };
}

router.get('/reports/monthly', async (req, res) => {
  try {
    res.json(await buildMonthlyReport(req.query.month));
  } catch (err) {
    console.error('[admin/report]', err);
    res.status(500).json({ message: 'Failed to build monthly report' });
  }
});

router.get('/reports/monthly.csv', async (req, res) => {
  try {
    const report = await buildMonthlyReport(req.query.month);
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Invoice', 'Date', 'Username', 'Email', 'Provider', 'Payment reference', 'Amount INR'],
      ...report.payments.map((p) => [
        p.invoice_number,
        new Date(p.paid_at).toISOString(),
        p.username,
        p.email,
        p.provider,
        p.provider_payment_id,
        (Number(p.amount_paise || 0) / 100).toFixed(2),
      ]),
    ];
    const csv = rows.map((row) => row.map(esc).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="nexencode-report-${report.month}.csv"`);
    res.send(`\uFEFF${csv}`);
  } catch (err) {
    res.status(500).json({ message: 'Failed to export monthly report' });
  }
});

module.exports = router;

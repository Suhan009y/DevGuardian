const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');
const auth = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/mailService');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email, role: user.role || 'user' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function getUploadLimits(plan) {
  const freeMb = Number.parseInt(process.env.FREE_UPLOAD_MAX_SIZE_MB, 10) || 500;
  const premiumMb = Number.parseInt(process.env.PREMIUM_UPLOAD_MAX_SIZE_MB, 10)
    || Number.parseInt(process.env.UPLOAD_MAX_SIZE_MB, 10)
    || 10240;
  return { freeMb, premiumMb, maxUploadMb: plan === 'premium' ? premiumMb : freeMb };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createAuthToken(userId, type, ttlMinutes) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const safeTtlMinutes = Number.parseInt(ttlMinutes, 10);

  if (!Number.isFinite(safeTtlMinutes) || safeTtlMinutes <= 0) {
    throw new Error('Invalid authentication token lifetime');
  }

  // Keep token timestamps entirely inside MySQL and in UTC. Passing a
  // JavaScript Date while comparing against NOW() can make a fresh token look
  // expired immediately when Node and MySQL use different time zones.
  await db.query(
    'UPDATE auth_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND token_type = ? AND used_at IS NULL',
    [userId, type]
  );
  await db.query(
    `INSERT INTO auth_tokens (user_id, token_type, token_hash, expires_at)
     VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))`,
    [userId, type, tokenHash, safeTtlMinutes]
  );
  return rawToken;
}

function verificationRequired() {
  return String(process.env.EMAIL_VERIFICATION_REQUIRED || 'true').toLowerCase() !== 'false';
}

router.post('/register', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!username || !email || !password) return res.status(400).json({ message: 'All fields are required' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
    if (!/^[a-zA-Z0-9_]{3,50}$/.test(username)) return res.status(400).json({ message: 'Username must be 3-50 alphanumeric characters' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });

    const [existing] = await db.query('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
    if (existing.length) return res.status(409).json({ message: 'Email or username already in use' });

    const passwordHash = await bcrypt.hash(password, 12);
    const verifiedAt = verificationRequired() ? null : new Date();
    const [result] = await db.query(
      'INSERT INTO users (username, email, password_hash, email_verified_at) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, verifiedAt]
    );
    const user = { id: result.insertId, username, email, role: 'user' };

    if (verificationRequired()) {
      const rawToken = await createAuthToken(user.id, 'verify_email', 24 * 60);
      const mail = await sendVerificationEmail(user, rawToken);
      return res.status(201).json({
        message: mail.delivered
          ? 'Account created. Check your email to verify your account.'
          : 'Account created. SMTP is not configured, so use the development verification link below.',
        verificationRequired: true,
        developmentVerificationUrl: mail.delivered ? undefined : mail.url,
      });
    }

    const token = signToken(user);
    const limits = getUploadLimits('free');
    return res.status(201).json({ token, username, role: 'user', plan: 'free', maxUploadMb: limits.maxUploadMb, message: 'Account created' });
  } catch (err) {
    console.error('[auth/register]', err);
    res.status(500).json({ message: 'Server error during registration. Did you import upgrade_platform_features.sql?' });
  }
});

router.post('/resend-verification', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const [rows] = await db.query('SELECT id, username, email, email_verified_at FROM users WHERE email = ? LIMIT 1', [email]);
    if (!rows.length || rows[0].email_verified_at) {
      return res.json({ message: 'If the account needs verification, a new email has been sent.' });
    }
    const rawToken = await createAuthToken(rows[0].id, 'verify_email', 24 * 60);
    const mail = await sendVerificationEmail(rows[0], rawToken);
    res.json({
      message: mail.delivered ? 'Verification email sent.' : 'SMTP is not configured. Use the development link.',
      developmentVerificationUrl: mail.delivered ? undefined : mail.url,
    });
  } catch (err) {
    console.error('[auth/resend]', err);
    res.status(500).json({ message: 'Could not resend verification email' });
  }
});

router.post('/verify-email', async (req, res) => {
  const rawToken = String(req.body.token || '');
  if (!rawToken) return res.status(400).json({ message: 'Verification token is required' });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT id, user_id FROM auth_tokens
       WHERE token_hash = ? AND token_type = 'verify_email' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()
       LIMIT 1 FOR UPDATE`,
      [hashToken(rawToken)]
    );
    if (!rows.length) {
      await conn.rollback();
      return res.status(400).json({ message: 'Verification link is invalid or expired' });
    }
    await conn.query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()) WHERE id = ?', [rows[0].user_id]);
    await conn.query('UPDATE auth_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ?', [rows[0].id]);
    await conn.commit();
    res.json({ message: 'Email verified successfully. You can now sign in.' });
  } catch (err) {
    await conn.rollback();
    console.error('[auth/verify]', err);
    res.status(500).json({ message: 'Could not verify email' });
  } finally {
    conn.release();
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const [rows] = await db.query('SELECT id, username, email FROM users WHERE email = ? LIMIT 1', [email]);
    if (!rows.length) return res.json({ message: 'If an account exists, a reset link has been sent.' });
    const rawToken = await createAuthToken(rows[0].id, 'reset_password', 60);
    const mail = await sendPasswordResetEmail(rows[0], rawToken);
    res.json({
      message: mail.delivered ? 'Password reset email sent.' : 'SMTP is not configured. Use the development reset link.',
      developmentResetUrl: mail.delivered ? undefined : mail.url,
    });
  } catch (err) {
    console.error('[auth/forgot]', err);
    res.status(500).json({ message: 'Could not create password reset request' });
  }
});

router.post('/reset-password', async (req, res) => {
  const rawToken = String(req.body.token || '');
  const password = String(req.body.password || '');
  if (!rawToken) return res.status(400).json({ message: 'Reset token is required' });
  if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT id, user_id FROM auth_tokens
       WHERE token_hash = ? AND token_type = 'reset_password' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()
       LIMIT 1 FOR UPDATE`,
      [hashToken(rawToken)]
    );
    if (!rows.length) {
      await conn.rollback();
      return res.status(400).json({ message: 'Reset link is invalid or expired' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await conn.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, rows[0].user_id]);
    await conn.query('UPDATE auth_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ?', [rows[0].id]);
    await conn.query("UPDATE auth_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND token_type = 'reset_password' AND used_at IS NULL", [rows[0].user_id]);
    await conn.commit();
    res.json({ message: 'Password reset successfully. Sign in with your new password.' });
  } catch (err) {
    await conn.rollback();
    console.error('[auth/reset]', err);
    res.status(500).json({ message: 'Could not reset password' });
  } finally {
    conn.release();
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

    const [rows] = await db.query(
      `SELECT id, username, email, password_hash, role, account_status, plan, premium_expires_at, email_verified_at
       FROM users WHERE email = ? LIMIT 1`,
      [email]
    );
    if (!rows.length) return res.status(401).json({ message: 'Invalid email or password' });
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ message: 'Invalid email or password' });
    if (user.account_status === 'blocked') return res.status(403).json({ message: 'Your account has been blocked by an administrator' });
    if (verificationRequired() && !user.email_verified_at && user.role !== 'admin') {
      return res.status(403).json({ message: 'Verify your email before signing in', code: 'EMAIL_NOT_VERIFIED' });
    }

    const premiumIsActive = user.role === 'admin' || (user.plan === 'premium' && (!user.premium_expires_at || new Date(user.premium_expires_at).getTime() > Date.now()));
    const effectivePlan = premiumIsActive ? 'premium' : 'free';
    const token = signToken(user);
    const limits = getUploadLimits(effectivePlan);
    res.json({ token, username: user.username, role: user.role, plan: effectivePlan, maxUploadMb: limits.maxUploadMb, message: 'Login successful' });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

router.get('/me', auth, async (req, res) => {
  const limits = getUploadLimits(req.user.plan);
  res.json({
    id: req.user.id,
    username: req.user.username,
    email: req.user.email,
    emailVerified: Boolean(req.user.email_verified_at),
    role: req.user.role,
    plan: req.user.plan,
    premiumExpiresAt: req.user.premium_expires_at,
    maxUploadMb: limits.maxUploadMb,
    maxUploadBytes: limits.maxUploadMb * 1024 * 1024,
  });
});

module.exports = router;

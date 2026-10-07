const jwt = require('jsonwebtoken');
const db = require('../config/db');

async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const token = header.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await db.query(
      `SELECT id, username, email, role, account_status, plan, premium_expires_at, email_verified_at
       FROM users WHERE id = ? LIMIT 1`,
      [decoded.id]
    );

    if (!rows.length) return res.status(401).json({ message: 'Account no longer exists' });

    const user = rows[0];
    if (user.account_status === 'blocked') {
      return res.status(403).json({ message: 'Your account has been blocked by an administrator', code: 'ACCOUNT_BLOCKED' });
    }

    const premiumIsActive = user.role === 'admin' || (
      user.plan === 'premium' &&
      (!user.premium_expires_at || new Date(user.premium_expires_at).getTime() > Date.now())
    );

    req.user = {
      ...user,
      plan: premiumIsActive ? 'premium' : 'free',
      storedPlan: user.plan,
    };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

module.exports = auth;

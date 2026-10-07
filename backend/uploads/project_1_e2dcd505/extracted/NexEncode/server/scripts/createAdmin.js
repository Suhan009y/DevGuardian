require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function main() {
  const email = String(process.argv[2] || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const username = String(process.argv[3] || process.env.ADMIN_USERNAME || 'admin').trim();
  const password = String(process.argv[4] || process.env.ADMIN_PASSWORD || '');

  if (!email || !password || password.length < 8) {
    console.error('Usage: npm run admin:create -- admin@example.com admin_username StrongPassword123');
    console.error('The password must contain at least 8 characters.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  const [rows] = await db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);

  if (rows.length) {
    await db.query(
      `UPDATE users SET username = ?, password_hash = ?, role = 'admin',
       account_status = 'active', plan = 'premium', premium_expires_at = NULL, email_verified_at = NOW()
       WHERE id = ?`,
      [username, hash, rows[0].id]
    );
    console.log(`✅ Existing account ${email} is now an administrator.`);
  } else {
    await db.query(
      `INSERT INTO users
        (username, email, password_hash, role, account_status, plan, premium_expires_at, email_verified_at)
       VALUES (?, ?, ?, 'admin', 'active', 'premium', NULL, NOW())`,
      [username, email, hash]
    );
    console.log(`✅ Administrator account created for ${email}.`);
  }

  await db.end();
}

main().catch((err) => {
  console.error('❌ Could not create admin:', err.message);
  process.exit(1);
});

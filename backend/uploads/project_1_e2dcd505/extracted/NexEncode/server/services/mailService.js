const nodemailer = require('nodemailer');

let transporter = null;

function isMailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!isMailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number.parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

function appBaseUrl() {
  return String(process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
}

function emailShell(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#0a0a0f;color:#e8e8f0;font-family:Arial,sans-serif">
  <div style="max-width:620px;margin:0 auto;padding:34px 18px">
    <div style="background:#111118;border:1px solid #292934;border-radius:16px;padding:30px">
      <div style="font-size:23px;font-weight:800;margin-bottom:22px">⚡ Nex<span style="color:#00ffa3">Encode</span></div>
      <h1 style="font-size:24px;margin:0 0 14px">${title}</h1>
      ${bodyHtml}
      <p style="margin-top:26px;color:#77778e;font-size:12px">This is an automated NexEncode account email.</p>
    </div>
  </div></body></html>`;
}

async function sendMail({ to, subject, html, text }) {
  const client = getTransporter();
  if (!client) {
    console.warn(`[mail] SMTP not configured. Email to ${to}: ${subject}`);
    return { delivered: false, development: true };
  }

  const info = await client.sendMail({
    from: process.env.MAIL_FROM || `NexEncode <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
    text,
  });
  return { delivered: true, messageId: info.messageId };
}

async function sendVerificationEmail(user, rawToken) {
  const url = `${appBaseUrl()}/index.html?verify=${encodeURIComponent(rawToken)}`;
  const html = emailShell('Verify your email', `
    <p style="color:#a9a9bc;line-height:1.65">Hi ${user.username}, confirm this email address to finish setting up your NexEncode account.</p>
    <p><a href="${url}" style="display:inline-block;background:#00ffa3;color:#08100d;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:9px">Verify email</a></p>
    <p style="color:#77778e;font-size:12px;word-break:break-all">${url}</p>
    <p style="color:#a9a9bc">This link expires in 24 hours.</p>`);
  const result = await sendMail({ to: user.email, subject: 'Verify your NexEncode email', html, text: `Verify your email: ${url}` });
  return { ...result, url };
}

async function sendPasswordResetEmail(user, rawToken) {
  const url = `${appBaseUrl()}/index.html?reset=${encodeURIComponent(rawToken)}`;
  const html = emailShell('Reset your password', `
    <p style="color:#a9a9bc;line-height:1.65">Hi ${user.username}, use the button below to create a new password.</p>
    <p><a href="${url}" style="display:inline-block;background:#00ffa3;color:#08100d;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:9px">Reset password</a></p>
    <p style="color:#77778e;font-size:12px;word-break:break-all">${url}</p>
    <p style="color:#a9a9bc">This link expires in 60 minutes. Ignore this message if you did not request it.</p>`);
  const result = await sendMail({ to: user.email, subject: 'Reset your NexEncode password', html, text: `Reset your password: ${url}` });
  return { ...result, url };
}

module.exports = {
  isMailConfigured,
  sendVerificationEmail,
  sendPasswordResetEmail,
};

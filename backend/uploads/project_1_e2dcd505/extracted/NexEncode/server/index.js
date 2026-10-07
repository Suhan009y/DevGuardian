require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { initSocket } = require('./config/socket');
const { startCleanupScheduler } = require('./services/cleanupService');

['uploads', 'outputs', 'temp'].forEach((dir) => {
  const fullPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

const app = express();
const server = http.createServer(app);
initSocket(server);

app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many auth attempts. Try again in 15 minutes.' },
});
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });
const uploadLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });

app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/upload', uploadLimiter, require('./routes/upload'));
app.use('/api/encode', apiLimiter, require('./routes/encode'));
app.use('/api/download', apiLimiter, require('./routes/download'));
app.use('/api/jobs', apiLimiter, require('./routes/jobs'));
app.use('/api/assistant', apiLimiter, require('./routes/assistant'));
app.use('/api/subscription', apiLimiter, require('./routes/subscription'));
app.use('/api/notifications', apiLimiter, require('./routes/notifications'));
app.use('/api/invoices', apiLimiter, require('./routes/invoices'));
app.use('/api/admin', apiLimiter, require('./routes/admin'));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use((err, _req, res, _next) => {
  console.error('[server error]', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'File too large' });
  res.status(500).json({ message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  startCleanupScheduler();
  console.log(`\n⚡ NexEncode running at http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   DB: ${process.env.DB_NAME || 'video_encoder'} @ ${process.env.DB_HOST || 'localhost'}`);
  console.log(`   Free upload limit: ${process.env.FREE_UPLOAD_MAX_SIZE_MB || 500} MB`);
  console.log(`   Premium upload limit: ${process.env.PREMIUM_UPLOAD_MAX_SIZE_MB || process.env.UPLOAD_MAX_SIZE_MB || 10240} MB\n`);
});

module.exports = { app, server };

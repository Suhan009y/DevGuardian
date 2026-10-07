const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const db = require('./db');

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token provided'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const [rows] = await db.query(
        'SELECT id, account_status FROM users WHERE id = ? LIMIT 1',
        [decoded.id]
      );
      if (!rows.length || rows[0].account_status === 'blocked') {
        return next(new Error('Account unavailable'));
      }
      socket.userId = decoded.id;
      next();
    } catch (_err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);
    console.log(`[socket] User ${socket.userId} connected: ${socket.id}`);

    socket.on('subscribe:job', async ({ jobId } = {}) => {
      if (!jobId) return;
      try {
        const [rows] = await db.query(
          'SELECT id FROM encode_jobs WHERE id = ? AND user_id = ? LIMIT 1',
          [jobId, socket.userId]
        );
        if (rows.length) socket.join(`job:${jobId}`);
      } catch (err) {
        console.error('[socket] subscribe failed:', err.message);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[socket] User ${socket.userId} disconnected`);
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

function emitToJob(jobId, event, data) {
  if (!io) return;
  io.to(`job:${jobId}`).emit(event, { jobId, ...data });
}

function emitToUser(userId, event, data) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
}

module.exports = { initSocket, getIO, emitToJob, emitToUser };

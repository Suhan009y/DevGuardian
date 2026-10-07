const db = require('../config/db');
const { emitToUser } = require('../config/socket');

async function createNotification({ userId, jobId = null, type = 'general', title, message }) {
  const [result] = await db.query(
    `INSERT INTO notifications (user_id, job_id, notification_type, title, message)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, jobId, type, title, message]
  );
  const notification = {
    id: result.insertId,
    user_id: userId,
    job_id: jobId,
    notification_type: type,
    title,
    message,
    is_read: 0,
    created_at: new Date(),
  };
  emitToUser(userId, 'notification:new', notification);
  return notification;
}

module.exports = { createNotification };

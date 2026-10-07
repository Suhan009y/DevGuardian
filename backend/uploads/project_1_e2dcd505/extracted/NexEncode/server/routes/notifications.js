const express = require('express');
const auth = require('../middleware/auth');
const db = require('../config/db');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const [items] = await db.query(
      `SELECT id, job_id, notification_type, title, message, is_read, created_at
       FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [req.user.id, limit]
    );
    const [[count]] = await db.query(
      'SELECT COUNT(*) unread FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );
    res.json({ notifications: items, unread: Number(count.unread || 0) });
  } catch (err) {
    console.error('[notifications/list]', err);
    res.status(500).json({ message: 'Could not load notifications' });
  }
});

router.patch('/:id/read', async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    res.status(500).json({ message: 'Could not update notification' });
  }
});

router.patch('/read-all', async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ message: 'Could not update notifications' });
  }
});

module.exports = router;

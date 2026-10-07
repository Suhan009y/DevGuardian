# Password reset timezone fix

## Problem

A newly generated reset link could return:

`Reset link is invalid or expired`

The token expiry was written as a JavaScript UTC date, while validation used
MySQL `NOW()`. When MySQL used India/local server time, a fresh one-hour token
could appear several hours old immediately.

## Fix

`server/routes/auth.js` now:

- creates token expiry using `UTC_TIMESTAMP()` inside MySQL;
- compares expiry against `UTC_TIMESTAMP()`;
- records `used_at` in UTC;
- applies the same correction to email-verification tokens.

No database migration is required.

## Apply

Replace `server/routes/auth.js`, restart the server, and request a new reset
link. The earlier unused link should normally also work after restart because
its stored expiry was already UTC, but generating a new link is recommended.

## Optional database check

Run this in phpMyAdmin SQL after requesting a reset link:

```sql
SELECT
  id,
  user_id,
  token_type,
  created_at,
  expires_at,
  used_at,
  UTC_TIMESTAMP() AS utc_now,
  NOW() AS mysql_local_now,
  TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), expires_at) AS minutes_remaining
FROM auth_tokens
WHERE token_type = 'reset_password'
ORDER BY id DESC
LIMIT 5;
```

For a fresh link, `minutes_remaining` should be close to `60`.

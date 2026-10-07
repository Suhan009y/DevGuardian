-- NexEncode platform features upgrade
-- Run this ONCE after upgrade_admin_premium.sql.
USE video_encoder;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at DATETIME NULL AFTER premium_expires_at;

ALTER TABLE encode_jobs
  ADD COLUMN IF NOT EXISTS download_count INT NOT NULL DEFAULT 0 AFTER output_size,
  ADD COLUMN IF NOT EXISTS last_downloaded_at DATETIME NULL AFTER download_count,
  ADD COLUMN IF NOT EXISTS output_expires_at DATETIME NULL AFTER completed_at,
  ADD COLUMN IF NOT EXISTS output_deleted_at DATETIME NULL AFTER output_expires_at,
  ADD INDEX IF NOT EXISTS idx_output_expiry (output_expires_at),
  ADD INDEX IF NOT EXISTS idx_output_deleted (output_deleted_at);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_type ENUM('verify_email','reset_password') NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_auth_token_user (user_id),
  INDEX idx_auth_token_expiry (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  job_id VARCHAR(36) NULL,
  notification_type VARCHAR(40) NOT NULL DEFAULT 'general',
  title VARCHAR(120) NOT NULL,
  message VARCHAR(500) NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notification_user_read (user_id, is_read),
  INDEX idx_notification_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  subscription_id BIGINT NULL,
  provider VARCHAR(30) NOT NULL DEFAULT 'manual',
  provider_payment_id VARCHAR(100) NULL UNIQUE,
  amount_paise INT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'paid',
  invoice_number VARCHAR(60) NULL UNIQUE,
  paid_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
  INDEX idx_payment_user (user_id),
  INDEX idx_payment_status_date (status, paid_at)
) ENGINE=InnoDB;

-- Mark existing accounts as verified so the upgrade does not lock out current users.
UPDATE users SET email_verified_at = COALESCE(email_verified_at, created_at);

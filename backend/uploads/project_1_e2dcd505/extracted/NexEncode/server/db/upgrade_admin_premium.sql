-- Run this ONCE on an existing NexEncode database.
USE video_encoder;

ALTER TABLE users
  ADD COLUMN role ENUM('user','admin') NOT NULL DEFAULT 'user' AFTER password_hash,
  ADD COLUMN account_status ENUM('active','blocked') NOT NULL DEFAULT 'active' AFTER role,
  ADD COLUMN plan ENUM('free','premium') NOT NULL DEFAULT 'free' AFTER account_status,
  ADD COLUMN premium_expires_at DATETIME NULL AFTER plan,
  ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE encode_jobs
  ADD COLUMN source_file_id VARCHAR(36) NULL AFTER user_id,
  ADD INDEX idx_source_file (source_file_id);

CREATE TABLE IF NOT EXISTS uploaded_files (
  file_id        VARCHAR(36) PRIMARY KEY,
  user_id        INT NOT NULL,
  original_name  VARCHAR(255) NOT NULL,
  stored_name    VARCHAR(255) NOT NULL,
  size_bytes     BIGINT NOT NULL,
  mime_type      VARCHAR(100),
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  consumed_at    DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_upload_user (user_id),
  INDEX idx_upload_consumed (consumed_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subscriptions (
  id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id                  INT NOT NULL,
  provider                 VARCHAR(30) NOT NULL DEFAULT 'demo',
  provider_subscription_id VARCHAR(100) UNIQUE,
  provider_payment_id      VARCHAR(100),
  plan_code                VARCHAR(50) NOT NULL DEFAULT 'premium_monthly',
  status                   VARCHAR(40) NOT NULL DEFAULT 'created',
  current_period_start     DATETIME NULL,
  current_period_end       DATETIME NULL,
  cancel_at_period_end     TINYINT(1) NOT NULL DEFAULT 0,
  created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sub_user (user_id),
  INDEX idx_sub_status (status)
) ENGINE=InnoDB;

-- NexEncode Database Schema (complete platform edition)
CREATE DATABASE IF NOT EXISTS video_encoder
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE video_encoder;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  account_status ENUM('active','blocked') NOT NULL DEFAULT 'active',
  plan ENUM('free','premium') NOT NULL DEFAULT 'free',
  premium_expires_at DATETIME NULL,
  email_verified_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_status (account_status),
  INDEX idx_users_plan (plan)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS uploaded_files (
  file_id VARCHAR(36) PRIMARY KEY,
  user_id INT NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  size_bytes BIGINT NOT NULL,
  mime_type VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  consumed_at DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_upload_user (user_id),
  INDEX idx_upload_consumed (consumed_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS encode_jobs (
  id VARCHAR(36) PRIMARY KEY,
  user_id INT NOT NULL,
  source_file_id VARCHAR(36) NULL,
  original_filename VARCHAR(255),
  original_size BIGINT,
  output_filename VARCHAR(255),
  output_size BIGINT,
  download_count INT NOT NULL DEFAULT 0,
  last_downloaded_at DATETIME NULL,
  codec ENUM('h264','hevc') DEFAULT 'h264',
  resolution VARCHAR(10),
  crf INT DEFAULT 23,
  audio_bitrate INT DEFAULT 128,
  sharpen_enabled TINYINT(1) DEFAULT 0,
  sharpen_luma FLOAT DEFAULT 1.0,
  sharpen_matrix INT DEFAULT 5,
  ffmpeg_command TEXT,
  is_custom_command TINYINT(1) DEFAULT 0,
  status ENUM('queued','processing','done','failed') DEFAULT 'queued',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  output_expires_at DATETIME NULL,
  output_deleted_at DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_created (created_at),
  INDEX idx_source_file (source_file_id),
  INDEX idx_output_expiry (output_expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  provider VARCHAR(30) NOT NULL DEFAULT 'demo',
  provider_subscription_id VARCHAR(100) UNIQUE,
  provider_payment_id VARCHAR(100),
  plan_code VARCHAR(50) NOT NULL DEFAULT 'premium_monthly',
  status VARCHAR(40) NOT NULL DEFAULT 'created',
  current_period_start DATETIME NULL,
  current_period_end DATETIME NULL,
  cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sub_user (user_id),
  INDEX idx_sub_status (status)
) ENGINE=InnoDB;

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

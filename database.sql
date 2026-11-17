-- SkillForge 수행평가: school_market과 별개의 독립 데이터베이스
-- 프로그램 첫 실행 시 server.js가 아래 테이블을 자동 생성함.
-- SQL Workbench에서 직접 확인할 때 참고하는 스키마.
CREATE DATABASE IF NOT EXISTS skillforge_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE skillforge_db;

CREATE TABLE IF NOT EXISTS users (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(24) NOT NULL UNIQUE,
  email VARCHAR(150) NOT NULL UNIQUE,
  nickname VARCHAR(32) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  bio VARCHAR(240) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS skills (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  owner_id INT NOT NULL,
  name VARCHAR(80) NOT NULL,
  element VARCHAR(20) NOT NULL,
  damage INT NOT NULL DEFAULT 0,
  cooldown DECIMAL(7,1) NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_skills_owner (owner_id),
  CONSTRAINT fk_sf_skill_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  expires_at DATETIME NOT NULL,
  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_expires (expires_at),
  CONSTRAINT fk_sf_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 요구조건: 두 테이블 JOIN으로 스킬과 작성자를 한 번에 조회
SELECT s.id, s.name AS skill_name, s.element, s.damage, s.cooldown,
       u.username, u.nickname AS creator
FROM skills AS s
INNER JOIN users AS u ON s.owner_id = u.id
ORDER BY s.id DESC;

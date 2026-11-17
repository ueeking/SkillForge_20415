'use strict';

/**
 * SkillForge | 독립 게임 스킬 데이터베이스 프로젝트
 * DB: skillforge_db / tables: users, skills, sessions
 * 회원 CRUD + 스킬 CRUD + 두 테이블 INNER JOIN
 */
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');  // bcrypt 알고리즘 (Windows 설치가 간편한 JS 구현)
const crypto = require('crypto');
const path = require('path');

const APP_PORT = Number(process.env.PORT || 5050);
const DATABASE_NAME = 'skillforge_db';
const SESSION_DAYS = 7;
const ELEMENTS = new Set(['FIRE', 'ICE', 'LIGHTNING', 'WIND', 'EARTH', 'WATER', 'LIGHT', 'DARK', 'PHYSICAL']);
let pool;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '80kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const sql = (query, params = []) => pool.execute(query, params);
const fail = (res, status, message) => res.status(status).json({ message });
const str = v => typeof v === 'string' ? v.trim() : '';
const isEmail = v => /^\S+@\S+\.\S+$/.test(v) && v.length <= 150;
const parseId = input => {
  const n = Number(input);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

async function initializeDatabase() {
  const opts = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    charset: 'utf8mb4',
    timezone: 'Z'
  };
  const setupConn = await mysql.createConnection(opts);
  try {
    await setupConn.query(`CREATE DATABASE IF NOT EXISTS \`${DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await setupConn.end();
  }
  pool = mysql.createPool({ ...opts, database: DATABASE_NAME, waitForConnections: true, connectionLimit: 10, queueLimit: 0 });
  await sql(`CREATE TABLE IF NOT EXISTS users (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(24) NOT NULL UNIQUE,
    email VARCHAR(150) NOT NULL UNIQUE,
    nickname VARCHAR(32) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    bio VARCHAR(240) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await sql(`CREATE TABLE IF NOT EXISTS skills (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await sql(`CREATE TABLE IF NOT EXISTS sessions (
    token_hash CHAR(64) NOT NULL PRIMARY KEY,
    user_id INT NOT NULL,
    expires_at DATETIME NOT NULL,
    INDEX idx_sessions_user (user_id),
    INDEX idx_sessions_expires (expires_at),
    CONSTRAINT fk_sf_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await sql('SELECT 1');
}

function sessionCookie(req, token, maxAge = SESSION_DAYS * 86400) {
  const secure = req.secure ? '; Secure' : '';
  return `sf_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}
function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  const entry = cookies.find(c => c.trim().startsWith(`${name}=`));
  return entry ? entry.trim().slice(name.length + 1) : '';
}
function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function publicUser(row) {
  return { id: row.id, username: row.username, nickname: row.nickname, email: row.email, bio: row.bio, createdAt: row.created_at || row.createdAt };
}
async function createSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await sql('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY))', [tokenHash(token), userId]);
  res.setHeader('Set-Cookie', sessionCookie(req, token));
}

app.use('/api', async (req, res, next) => {
  try {
    req.currentUser = null;
    const token = cookieValue(req, 'sf_session');
    if (/^[a-f\d]{64}$/.test(token)) {
      const [rows] = await sql(`SELECT u.id, u.username, u.nickname, u.email, u.bio, u.created_at
         FROM sessions sess INNER JOIN users u ON sess.user_id = u.id
         WHERE sess.token_hash = ? AND sess.expires_at > UTC_TIMESTAMP() LIMIT 1`, [tokenHash(token)]);
      if (rows.length) req.currentUser = publicUser(rows[0]);
    }
    next();
  } catch (err) { next(err); }
});
function requireLogin(req, res, next) {
  if (!req.currentUser) return fail(res, 401, '로그인이 필요합니다.');
  next();
}

app.get('/api/health', async (req, res) => {
  const [rows] = await sql('SELECT COUNT(*) AS total FROM users');
  res.json({ ok: true, db: DATABASE_NAME, users: rows[0].total });
});
app.get('/api/auth/me', (req, res) => res.json({ user: req.currentUser }));

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const username = str(req.body.username).toLowerCase();
    const nickname = str(req.body.nickname);
    const email = str(req.body.email).toLowerCase();
    const password = req.body.password;
    if (!/^[a-z0-9_]{4,24}$/.test(username)) return fail(res, 400, '아이디는 영문 소문자, 숫자, 밑줄로 4~24자 입력하세요.');
    if (nickname.length < 2 || nickname.length > 32) return fail(res, 400, '닉네임은 2~32자 입력하세요.');
    if (!isEmail(email)) return fail(res, 400, '이메일 주소를 확인하세요.');
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) return fail(res, 400, '비밀번호는 8~72자 입력하세요.');
    const hash = await bcrypt.hash(password, 12);
    const [result] = await sql('INSERT INTO users (username, email, nickname, password_hash) VALUES (?, ?, ?, ?)', [username, email, nickname, hash]);
    await createSession(req, res, result.insertId);
    const [rows] = await sql('SELECT id, username, nickname, email, bio, created_at FROM users WHERE id = ?', [result.insertId]);
    return res.status(201).json({ message: '회원가입 완료', user: publicUser(rows[0]) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return fail(res, 409, '이미 사용 중인 아이디 또는 이메일입니다.');
    next(err);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const identifier = str(req.body.identifier).toLowerCase();
    const password = req.body.password;
    if (!identifier || typeof password !== 'string') return fail(res, 400, '아이디와 비밀번호를 입력하세요.');
    const [rows] = await sql('SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1', [identifier, identifier]);
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) return fail(res, 401, '아이디 또는 비밀번호가 올바르지 않습니다.');
    await createSession(req, res, rows[0].id);
    res.json({ message: '로그인 성공', user: publicUser(rows[0]) });
  } catch (err) { next(err); }
});

app.post('/api/auth/logout', async (req, res, next) => {
  try {
    const token = cookieValue(req, 'sf_session');
    if (/^[a-f\d]{64}$/.test(token)) await sql('DELETE FROM sessions WHERE token_hash = ?', [tokenHash(token)]);
    res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
    res.json({ message: '로그아웃 완료' });
  } catch (err) { next(err); }
});

// 회원 Read
app.get('/api/me', requireLogin, (req, res) => res.json({ user: req.currentUser }));

// 회원 Update (비밀번호는 현재 비밀번호 확인 후 다시 bcrypt 해시)
app.patch('/api/me', requireLogin, async (req, res, next) => {
  try {
    const nickname = str(req.body.nickname);
    const email = str(req.body.email).toLowerCase();
    const bio = str(req.body.bio);
    const newPassword = req.body.newPassword || '';
    if (nickname.length < 2 || nickname.length > 32) return fail(res, 400, '닉네임은 2~32자 입력하세요.');
    if (!isEmail(email)) return fail(res, 400, '유효한 이메일을 입력하세요.');
    if (bio.length > 240) return fail(res, 400, '자기소개는 240자 이내로 입력하세요.');
    if (newPassword && (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 72)) return fail(res, 400, '새 비밀번호는 8~72자여야 합니다.');
    if (newPassword) {
      const [rows] = await sql('SELECT password_hash FROM users WHERE id=?', [req.currentUser.id]);
      if (!rows.length || !(await bcrypt.compare(req.body.currentPassword || '', rows[0].password_hash))) return fail(res, 403, '현재 비밀번호가 올바르지 않습니다.');
      const hash = await bcrypt.hash(newPassword, 12);
      await sql('UPDATE users SET nickname=?, email=?, bio=?, password_hash=? WHERE id=?', [nickname, email, bio, hash, req.currentUser.id]);
    } else {
      await sql('UPDATE users SET nickname=?, email=?, bio=? WHERE id=?', [nickname, email, bio, req.currentUser.id]);
    }
    const [rows] = await sql('SELECT id, username, nickname, email, bio, created_at FROM users WHERE id=?', [req.currentUser.id]);
    res.json({ message: '프로필 수정 완료', user: publicUser(rows[0]) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return fail(res, 409, '이미 다른 회원이 사용하는 이메일입니다.');
    next(err);
  }
});

// 회원 Delete: 본인 암호 확인. skills/sessions는 외래키 ON DELETE CASCADE 처리.
app.delete('/api/me', requireLogin, async (req, res, next) => {
  try {
    const [rows] = await sql('SELECT password_hash FROM users WHERE id=?', [req.currentUser.id]);
    if (!rows.length || !(await bcrypt.compare(req.body.password || '', rows[0].password_hash))) return fail(res, 403, '회원탈퇴를 위해 정확한 비밀번호를 입력하세요.');
    await sql('DELETE FROM users WHERE id=?', [req.currentUser.id]);
    res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
    res.json({ message: '회원탈퇴가 완료되었습니다.' });
  } catch (err) { next(err); }
});

function validateSkill(body) {
  const name = str(body.name);
  const element = str(body.element);
  const description = str(body.description);
  const damage = Number(body.damage);
  const cooldown = Number(body.cooldown);
  if (name.length < 2 || name.length > 80) return { error: '스킬 이름은 2~80자여야 합니다.' };
  if (!ELEMENTS.has(element)) return { error: '올바른 스킬 속성을 선택하세요.' };
  if (body.damage === '' || body.damage == null || !Number.isInteger(damage) || damage < 0 || damage > 10000) return { error: '데미지는 0~10000 사이의 정수로 입력하세요.' };
  if (body.cooldown === '' || body.cooldown == null || !Number.isFinite(cooldown) || cooldown < 0 || cooldown > 3600 || Math.round(cooldown * 10) !== cooldown * 10) return { error: '쿨타임은 0~3600 사이, 소수 첫째 자리까지 입력하세요.' };
  if (description.length > 1500) return { error: '설명은 1500자 이내로 입력하세요.' };
  return { name, element, damage, cooldown, description };
}

// 핵심데이터 Read + JOIN: 회원 테이블과 스킬 테이블을 실제 SQL INNER JOIN으로 연결
const JOIN_COLUMNS = `SELECT s.id, s.owner_id AS ownerId, s.name, s.element, s.damage,
  s.cooldown, s.description, s.created_at AS createdAt, s.updated_at AS updatedAt,
  u.nickname AS author, u.username AS authorUsername
  FROM skills s INNER JOIN users u ON s.owner_id = u.id`;

app.get('/api/skills', async (req, res, next) => {
  try {
    const where = [];
    const params = [];
    const search = str(req.query.search).slice(0, 80);
    const element = str(req.query.element);
    if (search) {
      where.push('(s.name LIKE ? OR s.description LIKE ? OR u.nickname LIKE ?)');
      params.push(...Array(3).fill(`%${search}%`));
    }
    if (element && ELEMENTS.has(element)) { where.push('s.element = ?'); params.push(element); }
    const [rows] = await sql(`${JOIN_COLUMNS} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY s.created_at DESC, s.id DESC LIMIT 250`, params);
    res.json({ skills: rows });
  } catch (err) { next(err); }
});

app.get('/api/skills/mine', requireLogin, async (req, res, next) => {
  try {
    const [rows] = await sql(`${JOIN_COLUMNS} WHERE s.owner_id=? ORDER BY s.created_at DESC, s.id DESC`, [req.currentUser.id]);
    res.json({ skills: rows });
  } catch (err) { next(err); }
});

app.get('/api/skills/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return fail(res, 400, '올바른 스킬 번호를 입력하세요.');
    const [rows] = await sql(`${JOIN_COLUMNS} WHERE s.id=? LIMIT 1`, [id]);
    if (!rows.length) return fail(res, 404, '스킬을 찾을 수 없습니다.');
    res.json({ skill: rows[0] });
  } catch (err) { next(err); }
});

// 핵심데이터 Create: 반드시 로그인한 계정의 ID로 소유자 지정
app.post('/api/skills', requireLogin, async (req, res, next) => {
  try {
    const data = validateSkill(req.body);
    if (data.error) return fail(res, 400, data.error);
    const [result] = await sql('INSERT INTO skills (owner_id,name,element,damage,cooldown,description) VALUES (?,?,?,?,?,?)', [req.currentUser.id, data.name, data.element, data.damage, data.cooldown, data.description]);
    res.status(201).json({ message: '스킬 등록 완료', id: result.insertId });
  } catch (err) { next(err); }
});

async function requireSkillOwner(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return fail(res, 400, '올바른 스킬 번호를 입력하세요.');
    const [rows] = await sql('SELECT owner_id FROM skills WHERE id=?', [id]);
    if (!rows.length) return fail(res, 404, '스킬을 찾을 수 없습니다.');
    if (rows[0].owner_id !== req.currentUser.id) return fail(res, 403, '본인이 등록한 스킬만 수정하거나 삭제할 수 있습니다.');
    req.skillId = id;
    next();
  } catch (err) { next(err); }
}
// 핵심데이터 Update
app.patch('/api/skills/:id', requireLogin, requireSkillOwner, async (req, res, next) => {
  try {
    const data = validateSkill(req.body);
    if (data.error) return fail(res, 400, data.error);
    await sql('UPDATE skills SET name=?, element=?, damage=?, cooldown=?, description=? WHERE id=? AND owner_id=?', [data.name, data.element, data.damage, data.cooldown, data.description, req.skillId, req.currentUser.id]);
    res.json({ message: '스킬 수정 완료' });
  } catch (err) { next(err); }
});
// 핵심데이터 Delete
app.delete('/api/skills/:id', requireLogin, requireSkillOwner, async (req, res, next) => {
  try {
    await sql('DELETE FROM skills WHERE id=? AND owner_id=?', [req.skillId, req.currentUser.id]);
    res.json({ message: '스킬 삭제 완료' });
  } catch (err) { next(err); }
});

app.get('/api/*', (req, res) => fail(res, 404, '존재하지 않는 API입니다.'));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, req, res, next) => {
  console.error('[API ERROR]', err.code || err.message || err);
  if (err.type === 'entity.parse.failed') return fail(res, 400, 'JSON 형식이 올바르지 않습니다.');
  res.status(500).json({ message: '서버 처리 중 오류가 발생했습니다. 실행 창 로그를 확인하세요.' });
});

async function main() {
  try {
    await initializeDatabase();
    console.log('[DB OK] New database ready: skillforge_db (users / skills / sessions)');
    const server = app.listen(APP_PORT, '127.0.0.1', () => {
      console.log(`\n==============================================\n SkillForge READY: http://localhost:${APP_PORT}\n==============================================\n`);
    });
    server.on('error', async err => {
      if (err.code === 'EADDRINUSE') console.error(`[ERROR] Port ${APP_PORT} is used by another site. Close the other site's CMD window.`);
      else console.error(err);
      try { await pool.end(); } catch (_) {}
      process.exit(1);
    });
    process.on('SIGINT', async () => { server.close(); await pool.end(); process.exit(0); });
  } catch (err) {
    console.error('\n[START ERROR]', err.code || '', err.message);
    if (err.code === 'ECONNREFUSED') console.error('MySQL80 service is not started. Open services.msc and start MySQL80.');
    if (err.code === 'ER_ACCESS_DENIED_ERROR') console.error('MySQL root password does not match. Close this window and run again.');
    console.error('Please check MySQL80 service, root password, and port 3306.');
    process.exitCode = 1;
  }
}
main();

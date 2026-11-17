const fs = require('fs');
const path = require('path');
const assert = require('assert');
const base = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(base, 'server.js'), 'utf8');
const front = fs.readFileSync(path.join(base, 'public/app.js'), 'utf8');
const html = fs.readFileSync(path.join(base, 'public/index.html'), 'utf8');
for (const line of [
  "app.post('/api/auth/register'",
  "app.post('/api/auth/login'",
  "app.get('/api/me'",
  "app.patch('/api/me'",
  "app.delete('/api/me'",
  "app.post('/api/skills'",
  "app.get('/api/skills'",
  "app.patch('/api/skills/:id'",
  "app.delete('/api/skills/:id'",
  'INNER JOIN users',
  'bcrypt.hash',
  'bcrypt.compare',
  'req.currentUser.id',
  'CREATE DATABASE IF NOT EXISTS'
]) assert(server.includes(line), 'Missing backend requirement: ' + line);
for (const keyword of ['로그인', '회원가입', 'JOIN 조회', '스킬 라이브러리', '마이페이지']) assert(html.includes(keyword), 'Missing navigation: ' + keyword);
for (const keyword of ["kind === 'register'", "kind === 'login'", "kind === 'skill'", "kind === 'profile'", "kind === 'withdraw'"]) assert(front.includes(keyword), 'Missing frontend form: ' + keyword);
assert(!fs.existsSync(path.join(base, 'node_modules')), 'Do not zip node_modules');
console.log('PASS: Auth CRUD, Skill CRUD, JOIN, bcrypt, navigation, forms, zip hygiene');

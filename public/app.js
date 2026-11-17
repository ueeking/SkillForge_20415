'use strict';

const state = { user: null, skills: [], view: 'all', search: '', element: '', loading: true };
const ELEMENTS = {
  FIRE: { label: '불', icon: '🔥', tint: '#49302e', glow: '#ff8b4f' },
  ICE: { label: '얼음', icon: '❄️', tint: '#1d3c58', glow: '#71caff' },
  LIGHTNING: { label: '번개', icon: '⚡', tint: '#504527', glow: '#ffe16e' },
  WIND: { label: '바람', icon: '🌪️', tint: '#2b4b42', glow: '#86dec5' },
  EARTH: { label: '대지', icon: '🪨', tint: '#494036', glow: '#d5ab79' },
  WATER: { label: '물', icon: '💧', tint: '#263d62', glow: '#65a9ff' },
  LIGHT: { label: '빛', icon: '✨', tint: '#52462c', glow: '#ffe3a2' },
  DARK: { label: '어둠', icon: '🌑', tint: '#393452', glow: '#a79ae7' },
  PHYSICAL: { label: '물리', icon: '⚔️', tint: '#3b4254', glow: '#adb9d3' }
};
const $ = sel => document.querySelector(sel);
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const errorText = e => e instanceof Error ? e.message : String(e);
const elementOptions = selected => Object.entries(ELEMENTS).map(([key, el]) => `<option value="${key}" ${selected === key ? 'selected' : ''}>${el.icon} ${el.label}</option>`).join('');
let toastTimeout;
function toast(text, isError = false) {
  const el = $('#toast'); el.textContent = text; el.className = `visible ${isError ? 'error' : ''}`;
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => { el.className = ''; el.textContent = ''; }, 4300);
}
async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      credentials: 'same-origin',
      headers: options.body ? { 'Content-Type': 'application/json' } : {},
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch (e) { throw new Error('서버에 연결할 수 없습니다. 실행용 CMD 창이 켜져 있는지 확인하세요.'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || `요청 실패 (${response.status})`);
  return result;
}
async function refreshMe() { const data = await api('/api/auth/me'); state.user = data.user; }
async function refreshSkills() { const data = await api('/api/skills'); state.skills = data.skills; }
async function refresh() { await Promise.all([refreshMe(), refreshSkills()]); render(); }
function closeModal() { $('#modal-root').innerHTML = ''; }
function openModal(html, wide = false) {
  $('#modal-root').innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="창"><div>${html}</div></div>`;
  $('#modal-root').querySelector('input:not([type=hidden]),select,textarea,button')?.focus();
}
function modalHeader(title, desc) {
  return `<div class="modal-header"><div><div class="eyebrow-2">SKILLFORGE</div><h2>${title}</h2><p>${desc}</p></div><button type="button" class="modal-close" data-action="close" aria-label="닫기">×</button></div>`;
}
function formField(label, name, type = 'text', val = '', opts = '') {
  return `<div class="field"><label for="f-${name}">${label}</label><input class="input" id="f-${name}" name="${name}" type="${type}" value="${esc(val)}" ${opts} /></div>`;
}
function authModal(mode = 'login') {
  if (mode === 'login') {
    openModal(`${modalHeader('로그인', '내가 만든 스킬을 관리하려면 로그인하세요.')}
      <form class="form-stack" data-form="login">
        ${formField('아이디 또는 이메일', 'identifier', 'text', '', 'required autocomplete="username" placeholder="아이디 또는 이메일"')}
        ${formField('비밀번호', 'password', 'password', '', 'required autocomplete="current-password" placeholder="비밀번호"')}
        <button class="btn btn-primary" type="submit">로그인</button>
      </form><div class="modal-bottom">아직 계정이 없다면 <button class="link-btn" data-action="register">회원가입하기</button></div>`);
  } else {
    openModal(`${modalHeader('회원가입', '새로운 스킬 제작자 계정을 만들어 보세요.')}
      <form class="form-stack" data-form="register">
        ${formField('아이디 (영문·숫자·_ 4~24자)', 'username', 'text', '', 'required minlength="4" maxlength="24" autocomplete="username" placeholder="skilldev01"')}
        ${formField('닉네임', 'nickname', 'text', '', 'required minlength="2" maxlength="32" placeholder="스킬 개발자"')}
        ${formField('이메일', 'email', 'email', '', 'required autocomplete="email" placeholder="dev@example.com"')}
        ${formField('비밀번호 (8자 이상)', 'password', 'password', '', 'required minlength="8" autocomplete="new-password"')}
        <button class="btn btn-primary" type="submit">회원가입하고 시작하기</button>
      </form><div class="modal-bottom">이미 회원이신가요? <button class="link-btn" data-action="login">로그인하기</button></div>`);
  }
}
function skillModal(skill = null) {
  if (!state.user) return authModal('login');
  const edit = !!skill;
  openModal(`${modalHeader(edit ? '스킬 수정' : '새로운 스킬 등록', '스킬의 수치와 속성을 MySQL 데이터베이스에 저장합니다.')}
    <form class="form-stack" data-form="skill" data-id="${skill ? skill.id : ''}">
      ${formField('스킬 이름', 'name', 'text', skill ? skill.name : '', 'required minlength="2" maxlength="80" placeholder="예: Cinder Burst"')}
      <div class="form-row">
        <div class="field"><label for="f-element">속성</label><select class="select" name="element" id="f-element">${elementOptions(skill ? skill.element : 'FIRE')}</select></div>
        ${formField('데미지 (0~10000)', 'damage', 'number', skill ? skill.damage : '80', 'required min="0" max="10000" step="1"')}
      </div>
      ${formField('쿨타임 (초)', 'cooldown', 'number', skill ? Number(skill.cooldown) : '12', 'required min="0" max="3600" step="0.1"')}
      <div class="field"><label for="f-description">스킬 설명</label><textarea class="textarea" name="description" id="f-description" maxlength="1500" placeholder="스킬 효과, 범위, 적용 방식 등을 적어보세요.">${esc(skill ? skill.description : '')}</textarea></div>
      <div class="modal-actions"><button class="btn btn-ghost" type="button" data-action="close">취소</button><button type="button" class="btn btn-outline" data-action="sample">예시 채우기</button><button type="submit" class="btn btn-primary">${edit ? '수정 저장' : '스킬 등록'}</button></div>
    </form>`, true);
}
function detailModal(skill) {
  const el = ELEMENTS[skill.element] || ELEMENTS.PHYSICAL;
  const own = state.user?.id === skill.ownerId;
  openModal(`${modalHeader(`${el.icon} ${esc(skill.name)}`, `${el.label} 속성 · 제작자 ${esc(skill.author)}`)}
    <div class="detail-stats"><div><small>데미지</small><strong>${Number(skill.damage).toLocaleString('ko-KR')}</strong></div><div><small>쿨타임</small><strong>${Number(skill.cooldown)}<span style="font-size:12px;color:#a4b5d1"> 초</span></strong></div></div>
    <div class="detail-meta">제작자: ${esc(skill.author)} (@${esc(skill.authorUsername)})</div>
    <div class="detail-description">${esc(skill.description || '아직 스킬 설명이 없습니다.')}</div>
    <div class="modal-actions"><button class="btn btn-ghost" data-action="close">닫기</button>${own ? `<button class="btn btn-outline" data-action="edit" data-id="${skill.id}">수정</button><button class="btn btn-danger" data-action="delete" data-id="${skill.id}">삭제</button>` : ''}</div>`, true);
}
function getFilteredSkills() {
  const source = state.view === 'mine' ? state.skills.filter(s => s.ownerId === state.user?.id) : state.skills;
  return source.filter(s => (!state.search || `${s.name} ${s.description} ${s.author}`.toLowerCase().includes(state.search.toLowerCase())) && (!state.element || s.element === state.element));
}
function skillCard(skill) {
  const el = ELEMENTS[skill.element] || ELEMENTS.PHYSICAL;
  const own = state.user && skill.ownerId === state.user.id;
  return `<article class="skill-card" style="--glow:${el.glow};--tint:${el.tint}">
    <div class="card-top"><div class="element-icon">${el.icon}</div><span class="element-tag">${esc(skill.element)}</span></div>
    <h3 class="card-title">${esc(skill.name)}</h3><p class="card-desc">${esc(skill.description || '아직 설명이 없습니다.')}</p>
    <div class="skill-metrics"><div class="metric"><small>데미지</small><b>${Number(skill.damage).toLocaleString('ko-KR')}<em>DMG</em></b></div><div class="metric"><small>쿨타임</small><b>${Number(skill.cooldown)}<em>SEC</em></b></div></div>
    <div class="card-footer"><span class="author">✦ ${esc(skill.author)} ${own ? '<span class="tiny-tag">내 스킬</span>' : ''}</span>
    <div class="card-actions"><button data-action="detail" data-id="${skill.id}">상세</button>${own ? `<button data-action="edit" data-id="${skill.id}">수정</button><button class="delete" data-action="delete" data-id="${skill.id}">삭제</button>` : ''}</div></div>
  </article>`;
}
function renderCards() {
  const target = $('#skill-grid');
  if (!target) return;
  const filtered = getFilteredSkills();
  $('#filter-result').textContent = `${filtered.length}개 스킬`;
  target.className = filtered.length ? 'skill-grid' : '';
  target.innerHTML = filtered.length ? filtered.map(skillCard).join('') : `<div class="empty-state"><span class="big">✦</span><h3>표시할 스킬이 없습니다.</h3><p>검색 조건을 바꾸거나 직접 새로운 게임 스킬을 등록해 보세요.</p><button class="btn btn-primary" data-action="create">+ 스킬 등록하기</button></div>`;
}
function renderCollection() {
  const mine = state.view === 'mine';
  return `<div class="section-heading"><div><div class="eyebrow-2">${mine ? 'MY ABILITIES' : 'SKILL DATABASE'}</div><h2>${mine ? '내가 만든 스킬' : '스킬 라이브러리'}</h2><p>${mine ? '본인이 작성한 스킬만 수정·삭제할 수 있습니다.' : '모든 제작자가 등록한 스킬을 살펴보세요.'}</p></div>
    <div class="section-tools"><input id="filter-search" class="input search-input" placeholder="스킬 이름, 설명, 제작자 검색" aria-label="스킬 검색" value="${esc(state.search)}" /><select id="filter-element" class="select filter-select" aria-label="속성 필터"><option value="">전체 속성</option>${elementOptions(state.element)}</select><button class="btn btn-primary" data-action="create">+ 스킬 등록</button></div>
  </div><p id="filter-result" class="hint" style="margin-bottom:14px"></p><div id="skill-grid" class="skill-grid"></div>`;
}
function renderJoin() {
  const rows = state.skills;
  return `<div class="section-heading"><div><div class="eyebrow-2">DATABASE RELATIONS</div><h2>스킬 제작자 통합 조회</h2><p>등록된 스킬의 정보와 제작자를 한눈에 확인할 수 있습니다.</p></div><button class="btn btn-outline" data-action="refresh">↻ 새로고침</button></div>
    <div class="info-panel"><strong>🗄️ 스킬과 제작자 정보 연결</strong><p>스킬과 회원 정보를 <b>users.id = skills.owner_id</b> 관계로 연결하여 함께 표시합니다.</p></div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>스킬 ID</th><th>스킬 이름</th><th>속성</th><th>데미지</th><th>쿨타임</th><th>제작자 (users)</th><th>아이디 (users)</th></tr></thead><tbody>${rows.length ? rows.map(s => `<tr><td>${s.id}</td><td><span class="join-highlight">${esc(s.name)}</span></td><td>${esc(ELEMENTS[s.element]?.label || s.element)}</td><td>${Number(s.damage)}</td><td>${Number(s.cooldown)} 초</td><td>${esc(s.author)}</td><td>@${esc(s.authorUsername)}</td></tr>`).join('') : `<tr><td colspan="7">등록된 스킬이 없어요. 회원가입 후 스킬 1개를 등록해 보세요.</td></tr>`}</tbody></table></div>
    <details class="sql-note"><summary>데이터 조회에 사용되는 INNER JOIN 쿼리 보기</summary><pre>SELECT s.name, s.element, s.damage, s.cooldown,
       u.nickname, u.username
FROM skills AS s
INNER JOIN users AS u
  ON s.owner_id = u.id;</pre></details>`;
}
function renderProfile() {
  const u = state.user;
  if (!u) return `<div class="empty-state"><span class="big">🔒</span><h3>로그인하면 프로필을 볼 수 있어요.</h3><p>회원정보 조회·수정·탈퇴 기능을 이용할 수 있습니다.</p><button class="btn btn-primary" data-action="login">로그인</button> <button class="btn btn-outline" data-action="register">회원가입</button></div>`;
  return `<div class="section-heading"><div><div class="eyebrow-2">MEMBER CRUD</div><h2>마이페이지</h2><p>회원정보 조회(Read), 수정(Update), 탈퇴(Delete)를 이곳에서 테스트할 수 있어요.</p></div></div>
    <div class="profile-card"><div class="profile-top"><div class="avatar">${esc(u.nickname.slice(0,1))}</div><div><h3>${esc(u.nickname)}</h3><p>@${esc(u.username)} · 회원번호 #${u.id}</p></div></div>
    <form class="profile-form" data-form="profile"><div class="form-row">
      ${formField('아이디 (변경 불가)', 'username', 'text', u.username, 'disabled')}
      ${formField('닉네임', 'nickname', 'text', u.nickname, 'required minlength="2" maxlength="32"')}
    </div>${formField('이메일', 'email', 'email', u.email, 'required')}
    <div class="field"><label for="f-bio">자기소개 (선택)</label><textarea class="textarea" name="bio" maxlength="240" id="f-bio">${esc(u.bio)}</textarea></div>
    <div class="form-row">${formField('새 비밀번호 (변경 시에만 입력)', 'newPassword', 'password', '', 'autocomplete="new-password" placeholder="8자 이상"')}
    ${formField('현재 비밀번호 (비밀번호 변경 시 필수)', 'currentPassword', 'password', '', 'autocomplete="current-password"')}</div>
    <button type="submit" class="btn btn-primary">회원정보 수정 저장</button>
    </form><div class="danger-zone"><div><strong class="text-danger">회원 탈퇴</strong><p>탈퇴하면 회원 계정과 내가 만든 모든 스킬이 함께 삭제됩니다.</p></div><button type="button" class="btn btn-danger" data-action="withdraw">회원탈퇴</button></div></div>`;
}
function renderHeader() {
  $('.header-actions').innerHTML = state.user ? `<span class="hello-user"><b>${esc(state.user.nickname)}</b> 님</span><button class="btn btn-ghost" data-action="logout">로그아웃</button>` : `<button class="btn btn-ghost" data-action="login">로그인</button><button class="btn btn-primary" data-action="register">회원가입</button>`;
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === state.view));
}
function render() {
  renderHeader();
  $('#hero').style.display = state.view === 'all' ? '' : 'none';
  $('#stat-skills').textContent = state.skills.length;
  $('#stat-creators').textContent = new Set(state.skills.map(s => s.ownerId)).size;
  $('#content').innerHTML = state.view === 'join' ? renderJoin() : state.view === 'profile' ? renderProfile() : renderCollection();
  if (state.view === 'all' || state.view === 'mine') renderCards();
}
function goTo(view) {
  if (view === 'mine' && !state.user) { toast('내 스킬을 보려면 로그인하세요.'); return authModal('login'); }
  state.view = view;
  state.search = ''; state.element = '';
  render(); window.scrollTo({ top: 0, behavior: 'smooth' });
}
function withdrawModal() {
  if (!state.user) return;
  openModal(`${modalHeader('회원탈퇴', '이 작업은 되돌릴 수 없습니다.')}
    <p class="text-danger" style="font-size:13px;line-height:1.8">탈퇴하면 회원정보와 본인이 등록한 모든 스킬이 영구 삭제됩니다.</p>
    <form class="form-stack" data-form="withdraw">
      ${formField('탈퇴 확인용 비밀번호', 'password', 'password', '', 'required autocomplete="current-password"')}
      <button class="btn btn-danger" type="submit">계정 및 내 스킬 영구 삭제</button>
    </form>`);
}
function findSkill(id) { return state.skills.find(s => s.id === Number(id)); }

document.addEventListener('click', async e => {
  if (e.target.id === 'modal-root') { closeModal(); return; }
  const btn = e.target.closest('[data-action]'); if (!btn || btn.disabled) return;
  const action = btn.dataset.action;
  try {
    if (action === 'nav') goTo(btn.dataset.view);
    if (action === 'login') authModal('login');
    if (action === 'register') authModal('register');
    if (action === 'close') closeModal();
    if (action === 'create') skillModal();
    if (action === 'detail') { const skill = findSkill(btn.dataset.id); if (skill) detailModal(skill); }
    if (action === 'edit') { const skill = findSkill(btn.dataset.id); if (skill && state.user?.id === skill.ownerId) skillModal(skill); }
    if (action === 'delete') {
      const skill = findSkill(btn.dataset.id);
      if (!skill || state.user?.id !== skill.ownerId) return toast('본인 스킬만 삭제할 수 있습니다.', true);
      if (!confirm(`스킬 "${skill.name}"을(를) 정말 삭제할까요?`)) return;
      await api(`/api/skills/${skill.id}`, { method: 'DELETE' }); closeModal(); await refreshSkills(); render(); toast('스킬 삭제 완료');
    }
    if (action === 'logout') { await api('/api/auth/logout', { method: 'POST' }); closeModal(); state.user = null; goTo('all'); toast('로그아웃했습니다.'); }
    if (action === 'withdraw') withdrawModal();
    if (action === 'refresh') { await refresh(); toast('데이터를 새로 조회했습니다.'); }
    if (action === 'sample') {
      const form = $('#modal-root form[data-form="skill"]');
      form.elements.name.value = 'Glacier Frost'; form.elements.element.value = 'ICE';
      form.elements.damage.value = 65; form.elements.cooldown.value = 15;
      form.elements.description.value = '차가운 얼음 에너지를 발사해 적에게 피해를 주고 둔화 효과를 부여하는 스킬.';
    }
  } catch (err) { toast(errorText(err), true); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'filter-search') { state.search = e.target.value; renderCards(); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'filter-element') { state.element = e.target.value; renderCards(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
document.addEventListener('submit', async e => {
  const form = e.target.closest('[data-form]'); if (!form) return;
  e.preventDefault();
  const kind = form.dataset.form;
  const data = Object.fromEntries(new FormData(form));
  const submit = form.querySelector('[type=submit]');
  if (submit) submit.disabled = true;
  try {
    if (kind === 'register') {
      const result = await api('/api/auth/register', { method: 'POST', body: data });
      state.user = result.user; closeModal(); goTo('all'); toast('회원가입과 자동 로그인이 완료됐습니다!');
    } else if (kind === 'login') {
      const result = await api('/api/auth/login', { method: 'POST', body: data });
      state.user = result.user; closeModal(); render(); toast(`${state.user.nickname} 님, 환영합니다!`);
    } else if (kind === 'skill') {
      const id = form.dataset.id;
      await api(id ? `/api/skills/${id}` : '/api/skills', { method: id ? 'PATCH' : 'POST', body: data });
      closeModal(); await refreshSkills(); render(); toast(id ? '스킬 정보가 수정됐습니다.' : '새 스킬이 등록됐습니다!');
    } else if (kind === 'profile') {
      const result = await api('/api/me', { method: 'PATCH', body: data });
      state.user = result.user; render(); await refreshSkills(); render(); toast('회원정보가 수정됐습니다.');
    } else if (kind === 'withdraw') {
      await api('/api/me', { method: 'DELETE', body: data });
      state.user = null; closeModal(); await refreshSkills(); goTo('all'); toast('회원탈퇴가 완료되었습니다.');
    }
  } catch (err) { toast(errorText(err), true); }
  finally { if (submit && submit.isConnected) submit.disabled = false; }
});
(async () => {
  try { await refresh(); }
  catch (err) { $('#content').innerHTML = `<div class="empty-state"><span class="big">⚠️</span><h3>서버에서 데이터를 가져오지 못했어요.</h3><p>${esc(errorText(err))}</p><p>실행 중인 CMD 창에서 MySQL 연결 상태를 확인하세요.</p><button class="btn btn-primary" onclick="location.reload()">다시 시도</button></div>`; }
})();

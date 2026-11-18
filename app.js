// O(n!) — a ZepheniaLabs assessment
// This file holds no answers. Every door is encrypted; the answer to door n is
// the only thing that can unlock door n + 1. Reading this code will not help you.

const STORE = 'zl.on.v1';
const te = new TextEncoder(), td = new TextDecoder();
const $ = (s) => document.querySelector(s);
const ub64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64 = (u) => btoa(String.fromCharCode(...u));
const norm = (s) => s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');

let BUNDLE = null;
let state = null;
let level = null;          // decrypted payload of the open door
let cleanups = [];

// ---------------------------------------------------------------- crypto
async function openBox(raw, box) {
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64(box.iv) }, key, ub64(box.ct)));
}
const openJSON = async (raw, box) => JSON.parse(td.decode(await openBox(raw, box)));
async function hintKey(raw, n, j) {
  const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: te.encode('zl-clearance'), info: te.encode(`zl-hint-${n}-${j}`) }, base, 256));
}
async function answerKey(answer, salt) {
  const base = await crypto.subtle.importKey('raw', te.encode(answer), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: BUNDLE.iter }, base, 256));
}
async function tryGates(n, answer) {
  const L = BUNDLE.levels[n - 1];
  const dk = await answerKey(answer, ub64(L.salt));
  for (const g of L.gates) {
    try { return await openBox(dk, g); } catch { /* not this gate */ }
  }
  return null;
}
const keyFor = (n) => (state.keys[n] ? ub64(state.keys[n]) : null);

// ---------------------------------------------------------------- state
function load() {
  try { state = JSON.parse(localStorage.getItem(STORE)); } catch { state = null; }
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* storage unavailable */ }
}
function fresh(user) {
  return { v: 1, user, started: Date.now(), keys: { 1: BUNDLE.k1 }, answers: {}, hints: {}, attempts: {}, solvedAt: {} };
}
const furthest = () => Math.max(...Object.keys(state.keys).map(Number));
const current = () => Math.min(furthest(), BUNDLE.count);
const finished = () => furthest() > BUNDLE.count;
const hintsUsed = () => Object.values(state.hints).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------- screens
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  const inside = id !== 'entry';
  $('.actions').hidden = !inside;
  $('#strip').hidden = !inside;
  if (inside) $('#who').textContent = state.user;
}

async function boot() {
  console.log('%cZEPHENIALABS // O(n!) — console channel open.', 'color:#8B8579');
  BUNDLE = await (await fetch('levels.json', { cache: 'no-cache' })).json();
  load();
  if (!state || !state.user) return showEntry();
  route();
}

function showEntry() {
  show('entry');
  $('#entry-form').onsubmit = (e) => {
    e.preventDefault();
    const user = $('#callsign').value.trim().slice(0, 24);
    if (user.length < 2 || !$('#pledge').checked) return;
    state = fresh(user);
    save();
    route();
  };
}

async function route() {
  renderStrip();
  if (finished()) return showComplete();
  await openLevel(current());
}

// ---------------------------------------------------------------- level
async function openLevel(n) {
  runCleanups();
  level = await openJSON(keyFor(n), BUNDLE.levels[n - 1].payload);
  show('stage');
  $('#tier').textContent = `Tier ${level.tier.roman} · ${level.tier.name}`;
  $('#door').textContent = `Door ${String(n).padStart(3, '0')} / ${BUNDLE.count}`;
  $('#title').textContent = level.title;
  $('#code-banner').hidden = !level.code;
  $('#body').innerHTML = level.body;
  $('#answer').value = '';
  setVerdict('');
  renderHints(n);
  for (const t of level.triggers) runTrigger(t);
  window.scrollTo({ top: 0 });
  if (matchMedia('(pointer:fine)').matches) $('#answer').focus({ preventScroll: true });
}

function setVerdict(text, cls = '') {
  const v = $('#verdict');
  v.textContent = text;
  v.className = 'verdict ' + cls;
}

$('#answer-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = current();
  const raw = $('#answer').value;
  const a = norm(raw);
  if (!a) return;
  const btn = $('#submit');
  btn.disabled = true;
  setVerdict('Verifying…');
  const next = await tryGates(n, a);
  btn.disabled = false;
  if (!next) {
    state.attempts[n] = (state.attempts[n] || 0) + 1;
    save();
    setVerdict(`Access denied · attempt ${state.attempts[n]}`, 'bad');
    const card = $('#card');
    card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
    return;
  }
  state.keys[n + 1] = b64(next);
  state.answers[n] = raw.trim();
  state.solvedAt[n] = Date.now();
  save();
  setVerdict('Access granted', 'ok');
  setTimeout(route, 650);
});

// ---------------------------------------------------------------- hints
async function renderHints(n) {
  const used = state.hints[n] || 0;
  $('#hint1').disabled = used >= 1;
  $('#hint2').disabled = used !== 1;
  const list = $('#hint-list');
  list.innerHTML = '';
  for (let j = 1; j <= used; j++) {
    const h = await openJSON(await hintKey(keyFor(n), n, j), BUNDLE.levels[n - 1].hints[j - 1]);
    const li = document.createElement('li');
    li.className = 'h' + j;
    li.innerHTML = `<b>Hint ${j}</b>${h.text}`;
    list.appendChild(li);
  }
}
async function takeHint(j) {
  const n = current();
  if ((state.hints[n] || 0) !== j - 1) return;
  const ok = await confirmModal(`Open hint ${j}?`,
    j === 1 ? 'This will be recorded on your progress timeline as a hinted door.'
            : 'This is the last hint for this door. It will be recorded on your timeline.');
  if (!ok) return;
  state.hints[n] = j;
  save();
  renderHints(n);
  renderStrip();
}
$('#hint1').onclick = () => takeHint(1);
$('#hint2').onclick = () => takeHint(2);

// ---------------------------------------------------------------- triggers
function setParams(mut) {
  const u = new URL(location.href);
  mut(u);
  history.replaceState(null, '', u);
}
function runTrigger(t) {
  const card = $('#card');
  switch (t.type) {
    case 'console': console.log(...t.args); break;
    case 'debug': console.debug(t.text); break;
    case 'comment': $('#body').appendChild(document.createComment(t.text)); break;
    case 'title': {
      const old = document.title;
      document.title = t.text;
      cleanups.push(() => { document.title = old; });
      break;
    }
    case 'query':
      setParams((u) => { for (const [k, v] of Object.entries(t.params)) u.searchParams.set(k, v); });
      cleanups.push(() => setParams((u) => { for (const k of Object.keys(t.params)) u.searchParams.delete(k); }));
      break;
    case 'hash':
      setParams((u) => { u.hash = t.value; });
      cleanups.push(() => setParams((u) => { u.hash = ''; }));
      break;
    case 'hashCycle': {
      let i = 0;
      const tick = () => setParams((u) => { u.hash = t.values[i++ % t.values.length]; });
      tick();
      const id = setInterval(tick, t.ms);
      cleanups.push(() => { clearInterval(id); setParams((u) => { u.hash = ''; }); });
      break;
    }
    case 'cookie':
      document.cookie = `${t.name}=${t.value}; path=/; SameSite=Lax`;
      cleanups.push(() => { document.cookie = `${t.name}=; path=/; max-age=0`; });
      break;
    case 'storage':
      localStorage.setItem(t.key, t.value);
      cleanups.push(() => localStorage.removeItem(t.key));
      break;
    case 'session':
      sessionStorage.setItem(t.key, t.value);
      cleanups.push(() => sessionStorage.removeItem(t.key));
      break;
    case 'cssvar':
      card.style.setProperty(t.name, t.value);
      cleanups.push(() => card.style.removeProperty(t.name));
      break;
    case 'global': {
      const obj = structuredClone(t.value);
      if (t.hidden) Object.defineProperty(obj[t.hidden.path], t.hidden.key, { value: t.hidden.value, enumerable: false });
      window[t.name] = obj;
      cleanups.push(() => { delete window[t.name]; });
      break;
    }
    case 'knock': {
      if (new URLSearchParams(location.search).get(t.param) === t.value) {
        $('#body').insertAdjacentHTML('beforeend', t.html);
      }
      cleanups.push(() => setParams((u) => u.searchParams.delete(t.param)));
      break;
    }
    case 'canvasText': {
      const c = document.getElementById(t.id);
      const x = c.getContext('2d');
      x.fillStyle = '#0D0E10'; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#FFA82E'; x.font = '600 64px "IBM Plex Sans Condensed", sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(t.text, c.width / 2, c.height / 2);
      break;
    }
    case 'fetch': {
      const send = () => fetch(t.url, { headers: t.headers, cache: 'no-store' }).catch(() => {});
      send();
      const b = $('#body').querySelector('[data-action="retransmit"]');
      if (b) b.onclick = send;
      break;
    }
  }
}
function runCleanups() {
  for (const f of cleanups.splice(0)) { try { f(); } catch { /* ignore */ } }
}

// ---------------------------------------------------------------- timeline
function cellClass(n) {
  const solved = !!state.keys[n + 1];
  const h = state.hints[n] || 0;
  if (n === current() && !finished()) return 'current' + (h ? ' h' + h : '');
  if (!solved) return '';
  return h === 0 ? 'clean' : 'h' + h;
}
function renderStrip() {
  const s = $('#strip');
  s.innerHTML = '';
  for (let n = 1; n <= BUNDLE.count; n++) {
    const i = document.createElement('i');
    const c = cellClass(n);
    if (c) i.className = c;
    s.appendChild(i);
  }
}
function statsHTML() {
  const solved = Object.keys(state.keys).length - 1;
  const clean = Array.from({ length: solved }, (_, k) => k + 1).filter((n) => !state.hints[n]).length;
  const tries = Object.values(state.attempts).reduce((a, b) => a + b, 0);
  const days = Math.max(1, Math.round((Date.now() - state.started) / 864e5));
  return [
    [finished() ? BUNDLE.count : current(), 'Furthest door'],
    [hintsUsed(), 'Hints used'],
    [clean, 'Clean solves'],
    [solved, 'Doors opened'],
    [tries, 'Denied attempts'],
    [days, days === 1 ? 'Day' : 'Days'],
  ].map(([v, k]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
}
function timelineHTML() {
  const tiers = new Map(BUNDLE.levels.map((l) => [l.n, l.tier]));
  let html = '', last = '';
  for (let n = 1; n <= BUNDLE.count; n++) {
    const t = tiers.get(n);
    if (t.roman !== last) { html += `<div class="tier-label">Tier ${t.roman} · ${t.name}</div>`; last = t.roman; }
    const h = state.hints[n] || 0;
    const label = `Door ${n}${h ? ` — ${h} hint${h > 1 ? 's' : ''}` : ''}`;
    html += `<span class="cell ${cellClass(n)}" title="${label}">${n}</span>`;
  }
  return html;
}
function renderTimeline() {
  $('#stats').innerHTML = statsHTML();
  $('#tl').innerHTML = timelineHTML();
}

// ---------------------------------------------------------------- dossier
function renderDossier() {
  const list = $('#dossier-list');
  list.innerHTML = '';
  const solved = Object.keys(state.answers).map(Number).sort((a, b) => a - b);
  if (!solved.length) { list.innerHTML = '<p class="fine">Nothing yet.</p>'; return; }
  for (const n of solved) {
    const row = document.createElement('div');
    row.className = 'dossier-item';
    row.innerHTML = `<span class="n">${String(n).padStart(3, '0')}</span><span class="t">…</span><span class="a"></span>`;
    row.querySelector('.a').textContent = state.answers[n];
    openJSON(keyFor(n), BUNDLE.levels[n - 1].payload).then((p) => {
      row.querySelector('.t').textContent = p.title;
      row.onclick = () => {
        $('#viewer-title').textContent = `Door ${n} · ${p.title}`;
        $('#viewer-body').innerHTML = p.body;
        $('#viewer').hidden = false;
      };
    });
    list.appendChild(row);
  }
}
document.querySelector('[data-close-viewer]').onclick = () => { $('#viewer').hidden = true; $('#viewer-body').innerHTML = ''; };

// ---------------------------------------------------------------- drawers & modals
function openDrawer(id) {
  if (id === 'timeline') renderTimeline();
  if (id === 'dossier') renderDossier();
  $('#scrim').hidden = false;
  $('#' + id).hidden = false;
}
function closeDrawers() {
  $('#scrim').hidden = true;
  for (const d of document.querySelectorAll('.drawer')) d.hidden = true;
}
for (const b of document.querySelectorAll('[data-open]')) b.onclick = () => openDrawer(b.dataset.open);
for (const b of document.querySelectorAll('[data-close]')) b.onclick = closeDrawers;
$('#scrim').onclick = closeDrawers;
$('#strip').onclick = () => openDrawer('timeline');
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeDrawers(); $('#viewer').hidden = true; }
});

function confirmModal(title, text) {
  return new Promise((resolve) => {
    $('#modal-title').textContent = title;
    $('#modal-text').textContent = text;
    $('#modal').hidden = false;
    const done = (v) => { $('#modal').hidden = true; resolve(v); };
    $('#modal-yes').onclick = () => done(true);
    $('#modal-no').onclick = () => done(false);
  });
}

// export / import / reset
$('#export').onclick = () => {
  $('#io').value = 'ZLC1.' + btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  $('#io').select();
};
$('#import').onclick = async () => {
  const code = $('#io').value.trim();
  try {
    if (!code.startsWith('ZLC1.')) throw 0;
    const s = JSON.parse(decodeURIComponent(escape(atob(code.slice(5)))));
    if (!s.user || !s.keys || !s.keys[1]) throw 0;
    // every stored key must actually open its door
    for (const n of Object.keys(s.keys).map(Number)) {
      if (n <= BUNDLE.count) await openBox(ub64(s.keys[n]), BUNDLE.levels[n - 1].payload);
      else await openBox(ub64(s.keys[n]), BUNDLE.final);
    }
    if (!(await confirmModal('Replace progress?', `Load progress for “${s.user}”? Your current progress in this browser will be replaced.`))) return;
    state = s; save(); closeDrawers(); route();
  } catch {
    $('#io').value = 'That code is not valid.';
  }
};
$('#reset').onclick = async () => {
  if (!(await confirmModal('Reset everything?', 'All progress, answers and hint records in this browser will be erased.'))) return;
  runCleanups();
  localStorage.removeItem(STORE);
  location.href = location.pathname;
};

// ---------------------------------------------------------------- completion
async function showComplete() {
  runCleanups();
  const fin = await openJSON(keyFor(BUNDLE.count + 1), BUNDLE.final);
  show('complete');
  const when = new Date(Math.max(...Object.values(state.solvedAt))).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  $('#cert').innerHTML = `
    <p class="eyebrow">ZepheniaLabs // Personnel record</p>
    <div class="big">${fin.title}</div>
    <h2></h2>
    ${fin.body}
    <div class="stats">${statsHTML()}</div>
    <p class="fine">Completed ${when}. Ranked by furthest door, then fewest hints.</p>
    <div class="tl">${timelineHTML()}</div>`;
  $('#cert h2').textContent = state.user;
}

boot().catch((e) => {
  document.getElementById('app').innerHTML = '<div class="panel"><h2>Facility offline</h2><p>The assessment could not be loaded. Reload the page to try again.</p></div>';
  console.error(e);
});

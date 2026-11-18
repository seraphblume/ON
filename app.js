// O(n!) — a ZepheniaLabs assessment
import { mountField, lockupHTML } from './field.js';
import { t, setLang, getLang, locale, applyStatic } from './i18n.js';
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
let rawLevel = null;
// A door's translated title, text and triggers; ciphers and answers are the same in every language.
const loc = (p) => (p && p.i18n && p.i18n[getLang()] ? { ...p, ...p.i18n[getLang()] } : p);
const pad = (n) => String(n).padStart(3, '0');
const tierLabel = (tr) => t('tier', { roman: tr.roman, name: t('tier.' + tr.name) });

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
  $('#nav').hidden = !inside;
  $('#progress').hidden = !inside;
  if (inside) $('#who').textContent = state.user;
  if (id !== 'entry' && entryField) { entryField.stop(); entryField = null; }
}

async function boot() {
  console.log('%cZEPHENIALABS // O(n!) — console channel open.', 'color:#8B8579');
  BUNDLE = await (await fetch('levels.json', { cache: 'no-cache' })).json();
  load();
  if (!state || !state.user) return showEntry();
  route();
}

let entryField = null;
const fieldWidth = (max) => Math.max(120, Math.min(max, document.querySelector('.page').clientWidth - 48));
function showEntry() {
  show('entry');
  if (!entryField) entryField = mountField($('#entry-field'), { width: fieldWidth(300) });
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
  rawLevel = await openJSON(keyFor(n), BUNDLE.levels[n - 1].payload);
  level = loc(rawLevel);
  show('stage');
  $('#tier').textContent = tierLabel(level.tier);
  $('#door').textContent = t('door', { n: pad(n), total: BUNDLE.count });
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

function setVerdict(text) {
  $('#verdict').textContent = text;
}

$('#answer-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = current();
  const raw = $('#answer').value;
  const a = norm(raw);
  if (!a) return;
  const btn = $('#submit');
  btn.disabled = true;
  setVerdict(t('verdict.verifying'));
  const next = await tryGates(n, a);
  btn.disabled = false;
  if (!next) {
    state.attempts[n] = (state.attempts[n] || 0) + 1;
    save();
    setVerdict(t('verdict.denied', { n: state.attempts[n] }));
    return;
  }
  state.keys[n + 1] = b64(next);
  state.answers[n] = raw.trim();
  state.solvedAt[n] = Date.now();
  save();
  setVerdict(t('verdict.granted'));
  setTimeout(route, 650);
});

// ---------------------------------------------------------------- hints
async function renderHints(n) {
  const used = state.hints[n] || 0;
  $('#hint1').disabled = used >= 1;
  $('#hint2').disabled = used !== 1;
  $('#hint1').textContent = used >= 1 ? t('hint.opened', { n: 1 }) : t('hint.open', { n: 1 });
  $('#hint2').textContent = used >= 2 ? t('hint.opened', { n: 2 }) : used === 1 ? t('hint.open', { n: 2 }) : t('hint.after');
  const list = $('#hint-list');
  list.innerHTML = '';
  for (let j = 1; j <= used; j++) {
    const h = await openJSON(await hintKey(keyFor(n), n, j), BUNDLE.levels[n - 1].hints[j - 1]);
    const li = document.createElement('li');
    li.className = 'h' + j;
    li.innerHTML = `<span class="label">${t('hint.label', { n: j })}</span>${(h.i18n && h.i18n[getLang()]) || h.text}`;
    list.appendChild(li);
  }
}
async function takeHint(j) {
  const n = current();
  if ((state.hints[n] || 0) !== j - 1) return;
  const ok = await confirmModal(t('hint.confirm', { n: j }), j === 1 ? t('hint.confirm1') : t('hint.confirm2'));
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
      const cs = getComputedStyle(document.documentElement);
      x.fillStyle = cs.getPropertyValue('--zl-ground').trim(); x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = cs.getPropertyValue('--zl-ink').trim(); x.font = '500 64px "IBM Plex Sans", sans-serif';
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
// One glyph per door, on the field's tone ramp: denser is cleaner.
const GLYPH = { locked: '·', current: '•', 0: '@', 1: '#', 2: '*' };
function doorState(n) {
  if (n === current() && !finished()) return 'current';
  if (!state.keys[n + 1]) return 'locked';
  return state.hints[n] || 0;
}
function glyphSpan(n) {
  const st = doorState(n), h = state.hints[n] || 0;
  const title = st === 'locked' ? t('glyph.locked', { n }) : st === 'current' ? t('glyph.current', { n }) + (h ? t('glyph.sofar', { h: t('h' + h) }) : '') : t('glyph.done', { n, h: t('h' + st) });
  return `<span${st === 'current' ? ' class="now"' : ''} title="${title}">${GLYPH[st]}</span>`;
}
function renderStrip() {
  let html = '';
  for (let n = 1; n <= BUNDLE.count; n++) html += glyphSpan(n);
  $('#strip').innerHTML = html;
}
function statsHTML() {
  const solved = Object.keys(state.keys).length - 1;
  const clean = Array.from({ length: Math.min(solved, BUNDLE.count) }, (_, k) => k + 1).filter((n) => !state.hints[n]).length;
  const tries = Object.values(state.attempts).reduce((a, b) => a + b, 0);
  const days = Math.max(1, Math.round((Date.now() - state.started) / 864e5));
  return [
    [finished() ? BUNDLE.count : current(), t('stat.furthest')],
    [hintsUsed(), t('stat.hints')],
    [clean, t('stat.clean')],
    [Math.min(solved, BUNDLE.count), t('stat.opened')],
    [tries, t('stat.denied')],
    [days, days === 1 ? t('stat.day') : t('stat.days')],
  ].map(([v, k]) => `<div class="stat"><span class="claim">${v}</span><span class="label">${k}</span></div>`).join('');
}
function timelineHTML() {
  const tiers = [];
  for (const l of BUNDLE.levels) {
    const last = tiers[tiers.length - 1];
    if (!last || last.roman !== l.tier.roman) tiers.push({ ...l.tier, from: l.n, to: l.n });
    else last.to = l.n;
  }
  return tiers.map((tr) => {
    let glyphs = '';
    const hinted = [];
    for (let n = tr.from; n <= tr.to; n++) {
      glyphs += glyphSpan(n);
      if (state.hints[n]) hinted.push(`${pad(n)} (${state.hints[n]})`);
    }
    return `<div class="tier-row"><span class="label">${t('tl.tier', { roman: tr.roman, name: t('tier.' + tr.name), from: tr.from, to: tr.to })}</span>
      <div class="tier-glyphs">${glyphs}</div>
      <span class="label" style="margin-top: var(--row-1)">${hinted.length ? t('tl.hinted') + ' · ' + hinted.join(' · ') : t('tl.none')}</span></div>`;
  }).join('');
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
  if (!solved.length) { list.innerHTML = `<p class="label">${t('dossier.empty')}</p>`; return; }
  for (const n of solved) {
    const row = document.createElement('button');
    row.className = 'dossier-item';
    row.innerHTML = `<span class="label">${pad(n)}</span><span class="t body"></span><span class="label a"></span>`;
    row.querySelector('.a').textContent = state.answers[n];
    openJSON(keyFor(n), BUNDLE.levels[n - 1].payload).then((raw) => {
      const p = loc(raw);
      row.querySelector('.t').textContent = p.title;
      row.onclick = () => {
        $('#viewer-title').textContent = t('viewer', { n, title: p.title });
        $('#viewer-body').innerHTML = p.body;
        $('#viewer').hidden = false;
      };
    });
    list.appendChild(row);
  }
}
document.querySelector('[data-close-viewer]').onclick = () => { $('#viewer').hidden = true; $('#viewer-body').innerHTML = ''; };

// ---------------------------------------------------------------- sheets & dialogs
function openDrawer(id) {
  if (id === 'timeline') renderTimeline();
  if (id === 'dossier') renderDossier();
  closeDrawers();
  $('#' + id).hidden = false;
  $('#' + id).querySelector('[data-close]').focus({ preventScroll: true });
}
function closeDrawers() {
  for (const d of document.querySelectorAll('.sheet')) if (d.id !== 'viewer') d.hidden = true;
}
for (const b of document.querySelectorAll('[data-open]')) b.onclick = () => openDrawer(b.dataset.open);
for (const b of document.querySelectorAll('[data-close]')) b.onclick = closeDrawers;
$('#progress').onclick = () => openDrawer('timeline');
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#viewer').hidden) { $('#viewer').hidden = true; return; }
  closeDrawers();
});

function confirmModal(title, text) {
  return new Promise((resolve) => {
    $('#modal-title').textContent = title;
    $('#modal-text').textContent = text;
    $('#modal').hidden = false;
    $('#modal-yes').focus();
    const done = (v) => { $('#modal').hidden = true; resolve(v); };
    $('#modal-yes').onclick = () => done(true);
    $('#modal-no').onclick = () => done(false);
  });
}

// palette: the viewer chooses the face; the system chooses dark or light
function applyTheme(palette) {
  const light = matchMedia('(prefers-color-scheme: light)').matches;
  document.documentElement.setAttribute('data-theme', `${palette}-${light ? 'light' : 'dark'}`);
  const r = document.getElementById('pal-' + palette);
  if (r) r.checked = true;
}
const currentPalette = () => (document.documentElement.getAttribute('data-theme') || 'zephyr-dark').split('-')[0];
for (const r of document.querySelectorAll('input[name=palette]')) {
  r.onchange = () => {
    try { localStorage.setItem('zl.palette', r.value); } catch { /* storage unavailable */ }
    applyTheme(r.value);
    if (level && level.triggers.some((t) => t.type === 'canvasText')) for (const t of level.triggers) if (t.type === 'canvasText') runTrigger(t);
  };
}
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => applyTheme(currentPalette()));
applyTheme(currentPalette());
$('#lockup').innerHTML = lockupHTML(40);

// language: English by default; the viewer's choice is remembered
function applyLang(l) {
  setLang(l);
  document.documentElement.setAttribute('lang', getLang());
  const r = document.getElementById('lang-' + getLang());
  if (r) r.checked = true;
  applyStatic();
}
for (const r of document.querySelectorAll('input[name=lang]')) {
  r.onchange = async () => {
    try { localStorage.setItem('zl.lang', r.value); } catch { /* storage unavailable */ }
    applyLang(r.value);
    if (!BUNDLE || !state || !state.user) return;
    renderStrip();
    if (!$('#timeline').hidden) renderTimeline();
    if (!$('#dossier').hidden) renderDossier();
    if (finished()) showComplete();
    else if (!$('#stage').hidden) {
      const typed = $('#answer').value;
      await openLevel(current());
      $('#answer').value = typed;
    }
  };
}
applyLang(document.documentElement.getAttribute('lang') || 'en');

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
    if (!(await confirmModal(t('import.title'), t('import.text', { user: s.user })))) return;
    state = s; save(); closeDrawers(); route();
  } catch {
    $('#io').value = t('import.invalid');
  }
};
$('#reset').onclick = async () => {
  if (!(await confirmModal(t('reset.title'), t('reset.text')))) return;
  runCleanups();
  localStorage.removeItem(STORE);
  location.href = location.pathname;
};

// ---------------------------------------------------------------- completion
let endField = null;
async function showComplete() {
  runCleanups();
  const fin = loc(await openJSON(keyFor(BUNDLE.count + 1), BUNDLE.final));
  show('complete');
  const when = new Date(Math.max(...Object.values(state.solvedAt))).toLocaleDateString(locale(), { year: 'numeric', month: 'long', day: 'numeric' });
  $('#complete').innerHTML = `
    <div id="cert">
      <div class="hero">
        <div>
          <p class="label">${t('cert.eyebrow')}</p>
          <h1 class="display"></h1>
          <p class="claim" id="cert-user"></p>
          <div class="body lede">${fin.body}</div>
        </div>
        <canvas id="end-field"></canvas>
      </div>
      <div class="stats">${statsHTML()}</div>
      <p class="label">${t('cert.done', { date: when })}</p>
      <div style="margin-top: var(--row-4)">${timelineHTML()}</div>
    </div>`;
  $('#cert .display').textContent = fin.title;
  $('#cert-user').textContent = state.user;
  if (endField) endField.stop();
  endField = mountField($('#end-field'), { width: fieldWidth(300) });
}

boot().catch((e) => {
  document.getElementById('app').innerHTML = `<div class="level"><h2>${t('error.title')}</h2><p class="body" style="margin-top: var(--row-3)">${t('error.text')}</p></div>`;
  console.error(e);
});

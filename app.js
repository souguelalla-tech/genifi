'use strict';

const STORE_KEY = 'debt-ledger.v1';
const APP_VERSION = '1.0';
const BACKUP_NAG_DAYS = 14;

/* ================= icons ================= */
const svg = p => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
const ICON = {
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  back: svg('<path d="M9 6l6 6-6 6"/>'),
  share: svg('<path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>'),
  phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
  chat: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'),
  up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  down: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  alert: svg('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'),
};

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// Arabic-insensitive search: ignore hamza forms, taa marbuta, diacritics
const norm = s => String(s || '').toLowerCase().trim()
  .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ً-ْـ]/g, '');

function today(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const toDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);

const dfLong = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
const dfShort = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'long' });
function fmtDate(s) {
  if (!s) return '';
  if (s === today()) return 'اليوم';
  if (s === today(-1)) return 'أمس';
  const d = toDate(s);
  return (d.getFullYear() === new Date().getFullYear() ? dfShort : dfLong).format(d);
}
const fmtDateFull = s => (s ? dfLong.format(toDate(s)) : '');

// "يوم / يومين / 3 أيام / 15 يومًا" — used after منذ / بعد
function days(n) {
  if (n === 1) return 'يوم';
  if (n === 2) return 'يومين';
  if (n <= 10) return `${n} أيام`;
  return `${n} يومًا`;
}
function dueText(due) {
  const n = daysBetween(today(), due);
  if (n === 0) return 'يستحق اليوم';
  if (n > 0) return `يستحق بعد ${days(n)}`;
  return `متأخر منذ ${days(-n)}`;
}

/* money is stored as integer cents to avoid float drift */
function parseAmount(str) {
  let s = String(str || '').trim()
    .replace(/[٠-٩]/g, d => d.charCodeAt(0) - 0x660)
    .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x6f0)
    .replace(/[\s ٬']/g, '')
    .replace(/٫/g, '.');
  if (!s.includes('.') && /,\d{1,2}$/.test(s)) s = s.replace(/,(\d{1,2})$/, '.$1');
  s = s.replace(/,/g, '');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  const v = Math.round(parseFloat(s) * 100);
  return v > 0 && v < 1e15 ? v : NaN;
}
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
function fmtMoney(c) {
  const s = nf.format(Math.abs(c) / 100);
  return state.settings.currency ? `${s} ${state.settings.currency}` : s;
}
const money = c => `<bdi>${esc(fmtMoney(c))}</bdi>`;

const initial = name => [...String(name).trim()][0] || '؟';
function hue(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

/* ================= storage ================= */
function sanitize(d) {
  d = d && typeof d === 'object' ? d : {};
  const set = d.settings || {};
  const ids = new Set();
  const people = (Array.isArray(d.people) ? d.people : [])
    .filter(p => p && typeof p.id === 'string' && p.id && typeof p.name === 'string' && p.name.trim() && !ids.has(p.id) && ids.add(p.id))
    .map(p => ({
      id: p.id,
      name: p.name.trim().slice(0, 80),
      phone: String(p.phone || '').slice(0, 30),
      note: String(p.note || '').slice(0, 300),
      createdAt: Number(p.createdAt) || Date.now(),
    }));
  const txs = (Array.isArray(d.txs) ? d.txs : [])
    .filter(t => t && ids.has(t.personId) && (t.type === 'gave' || t.type === 'took') &&
      Number.isInteger(t.amount) && t.amount > 0 && isDate(t.date))
    .map(t => ({
      id: String(t.id || uid()),
      personId: t.personId,
      type: t.type,
      amount: t.amount,
      date: t.date,
      due: isDate(t.due) ? t.due : '',
      note: String(t.note || '').slice(0, 200),
      createdAt: Number(t.createdAt) || Date.now(),
    }));
  return {
    version: 1,
    settings: {
      currency: String(set.currency || '').slice(0, 10),
      theme: ['auto', 'light', 'dark'].includes(set.theme) ? set.theme : 'auto',
      lastBackup: Number(set.lastBackup) || 0,
    },
    people,
    txs,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return sanitize(JSON.parse(raw));
  } catch (e) { /* fall through to empty */ }
  return sanitize({});
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('تعذّر الحفظ! احفظ نسخة احتياطية الآن');
  }
}

let state = load();
const ui = { filter: 'all', sort: 'recent', q: '' };
let view = { name: null };
let cameFromHome = false;
let homeStats = new Map();

/* ================= calculations ================= */
const txOrder = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt);

// The earliest due date that is still unpaid: repayments settle the oldest debts first (FIFO).
function openDue(txs) {
  const open = [];
  for (const t of txs) {
    const sign = t.type === 'gave' ? 1 : -1;
    let amt = t.amount;
    while (amt > 0 && open.length && open[0].sign !== sign) {
      const use = Math.min(amt, open[0].amount);
      open[0].amount -= use;
      amt -= use;
      if (!open[0].amount) open.shift();
    }
    if (amt > 0) open.push({ sign, amount: amt, due: t.due });
  }
  const dues = open.map(o => o.due).filter(Boolean).sort();
  return dues[0] || '';
}

function computeStats() {
  const map = new Map();
  for (const p of state.people) map.set(p.id, { bal: 0, lastDate: '', lastAt: p.createdAt, txs: [] });
  for (const t of state.txs) {
    const s = map.get(t.personId);
    if (!s) continue;
    s.txs.push(t);
    s.bal += t.type === 'gave' ? t.amount : -t.amount;
    if (t.date > s.lastDate) s.lastDate = t.date;
    if (t.createdAt > s.lastAt) s.lastAt = t.createdAt;
  }
  const td = today();
  for (const s of map.values()) {
    s.txs.sort(txOrder);
    s.nextDue = s.bal ? openDue(s.txs) : '';
    s.overdue = !!s.nextDue && s.nextDue < td;
  }
  return map;
}

/* ================= home ================= */
const FILTERS = [['all', 'الكل'], ['in', 'لي'], ['out', 'عليّ'], ['zero', 'مسدَّد']];
const SORTS = [['recent', 'الأحدث'], ['amount', 'الأكبر مبلغًا'], ['due', 'الأقرب استحقاقًا'], ['name', 'الاسم']];
const sorters = {
  recent: (a, b) => b.s.lastDate.localeCompare(a.s.lastDate) || b.s.lastAt - a.s.lastAt,
  amount: (a, b) => Math.abs(b.s.bal) - Math.abs(a.s.bal),
  due: (a, b) => (a.s.nextDue || '9999').localeCompare(b.s.nextDue || '9999') || Math.abs(b.s.bal) - Math.abs(a.s.bal),
  name: (a, b) => a.p.name.localeCompare(b.p.name, 'ar'),
};

function renderHome() {
  view = { name: 'home' };
  homeStats = computeStats();
  let mine = 0, theirs = 0, overdue = 0;
  for (const s of homeStats.values()) {
    if (s.bal > 0) mine += s.bal; else theirs -= s.bal;
    if (s.overdue) overdue++;
  }
  const net = mine - theirs;

  const lb = state.settings.lastBackup;
  const sinceBackup = lb ? Math.floor((Date.now() - lb) / 86400000) : Infinity;
  const banner = state.txs.length >= 3 && sinceBackup >= BACKUP_NAG_DAYS
    ? `<button class="banner" data-act="export-json">${ICON.alert}<span>${lb ? `آخر نسخة احتياطية منذ ${days(sinceBackup)}` : 'لم تحفظ نسخة احتياطية بعد'} — اضغط للحفظ</span></button>`
    : '';

  $('#app').innerHTML = `
    <header class="topbar">
      <h1>دفتر الديون</h1>
      <button class="icon-btn" data-act="settings" aria-label="الإعدادات">${ICON.gear}</button>
    </header>
    <section class="summary">
      <div class="card in"><span class="k">لي عند الناس</span><span class="v">${money(mine)}</span></div>
      <div class="card out"><span class="k">عليّ للناس</span><span class="v">${money(theirs)}</span></div>
      <div class="card net">
        <span class="k">الصافي${overdue ? ` · <span class="badge warn">${overdue} متأخر</span>` : ''}</span>
        <span class="v ${net > 0 ? 'in' : net < 0 ? 'out' : ''}">${net ? `${net > 0 ? 'لصالحك' : 'عليك'} ${money(net)}` : 'متوازن'}</span>
      </div>
    </section>
    ${banner}
    ${state.people.length ? `
    <label class="search">${ICON.search}<input id="q" type="search" placeholder="ابحث بالاسم أو الهاتف" value="${esc(ui.q)}" autocomplete="off"></label>
    <div class="toolbar">
      <div class="chips">${FILTERS.map(([k, l]) => `<button class="chip" data-act="filter" data-f="${k}">${l}<span class="n"></span></button>`).join('')}</div>
      <select id="sort" class="sort" aria-label="الترتيب">${SORTS.map(([k, l]) => `<option value="${k}"${ui.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
    </div>` : ''}
    <div id="list"></div>
    ${state.people.length ? `<button class="fab" data-act="add">${ICON.plus}<span>تسجيل حركة</span></button>` : ''}`;
  renderList();
}

function renderList() {
  const box = $('#list');
  if (!box) return;
  if (!state.people.length) {
    box.innerHTML = `<div class="empty">
      <p class="big">دفترك فارغ</p>
      <p>سجّل أول مبلغ أعطيته لشخص أو أخذته منه، وسيحسب التطبيق الباقي.</p>
      <button class="btn primary" data-act="add">${ICON.plus}تسجيل أول حركة</button></div>`;
    return;
  }
  let rows = state.people.map(p => ({ p, s: homeStats.get(p.id) }));
  const counts = { all: rows.length, in: 0, out: 0, zero: 0 };
  for (const r of rows) counts[r.s.bal > 0 ? 'in' : r.s.bal < 0 ? 'out' : 'zero']++;
  document.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('on', c.dataset.f === ui.filter);
    c.querySelector('.n').textContent = counts[c.dataset.f];
  });

  if (ui.filter === 'in') rows = rows.filter(r => r.s.bal > 0);
  else if (ui.filter === 'out') rows = rows.filter(r => r.s.bal < 0);
  else if (ui.filter === 'zero') rows = rows.filter(r => r.s.bal === 0);
  const q = norm(ui.q);
  if (q) rows = rows.filter(r => norm(r.p.name).includes(q) || r.p.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '\0'));
  rows.sort(sorters[ui.sort]);

  box.innerHTML = rows.length
    ? `<ul class="people">${rows.map(personRow).join('')}</ul>`
    : '<p class="empty-small">لا توجد نتائج</p>';
}

function personRow({ p, s }) {
  const cls = s.bal > 0 ? 'in' : s.bal < 0 ? 'out' : 'zero';
  const lbl = s.bal > 0 ? 'لك' : s.bal < 0 ? 'عليك' : 'مسدَّد';
  const badge = s.nextDue ? `<span class="badge${s.overdue ? ' warn' : ''}">${dueText(s.nextDue)}</span>` : '';
  return `<li><a class="person" href="#/p/${encodeURIComponent(p.id)}">
    <span class="avatar" style="--h:${hue(p.name)}">${esc(initial(p.name))}</span>
    <span class="pinfo">
      <span class="pname">${esc(p.name)}</span>
      <span class="psub">${s.lastDate ? fmtDate(s.lastDate) : 'لا حركات'}${badge}</span>
    </span>
    <span class="pbal ${cls}"><small>${lbl}</small>${s.bal ? money(s.bal) : ''}</span>
  </a></li>`;
}

/* ================= person ================= */
function renderPerson(id) {
  const p = state.people.find(x => x.id === id);
  const s = computeStats().get(id);
  view = { name: 'person', id };
  const cls = s.bal > 0 ? 'in' : s.bal < 0 ? 'out' : 'zero';
  const label = s.bal > 0 ? 'لك عنده' : s.bal < 0 ? 'عليك له' : 'الحساب مسدَّد';

  let run = 0;
  const runs = new Map();
  for (const t of s.txs) { run += t.type === 'gave' ? t.amount : -t.amount; runs.set(t.id, run); }

  const tel = p.phone.replace(/[^\d+]/g, '');
  const wa = p.phone.replace(/\D/g, '').replace(/^00/, '');

  $('#app').innerHTML = `
    <header class="topbar">
      <button class="icon-btn" data-act="back" aria-label="رجوع">${ICON.back}</button>
      <h1>${esc(p.name)}</h1>
      <button class="icon-btn" data-act="share" aria-label="مشاركة كشف الحساب">${ICON.share}</button>
      <button class="icon-btn" data-act="edit-person" aria-label="تعديل">${ICON.edit}</button>
    </header>
    <section class="balance-card ${cls}">
      <span class="bc-label">${label}</span>
      <strong class="bc-amount">${s.bal ? money(s.bal) : '✓'}</strong>
      ${s.nextDue ? `<p class="bc-due${s.overdue ? ' warn' : ''}">موعد السداد ${fmtDateFull(s.nextDue)} · ${dueText(s.nextDue)}</p>` : ''}
      ${p.note ? `<p class="bc-note">${esc(p.note)}</p>` : ''}
      ${tel ? `<div class="contact">
        <a class="pill" href="tel:${esc(tel)}">${ICON.phone}اتصال</a>
        ${wa.length >= 8 ? `<a class="pill" href="https://wa.me/${wa}" target="_blank" rel="noopener">${ICON.chat}واتساب</a>` : ''}
      </div>` : ''}
    </section>
    <div class="actions">
      <button class="act gave" data-act="new-tx" data-type="gave">${ICON.up}أعطيته</button>
      <button class="act took" data-act="new-tx" data-type="took">${ICON.down}أخذت منه</button>
    </div>
    ${s.bal ? `<button class="settle" data-act="settle">تسوية الحساب بالكامل (${esc(fmtMoney(s.bal))})</button>` : ''}
    <h2 class="section-title">الحركات (${s.txs.length})</h2>
    ${s.txs.length
      ? `<ul class="txs">${s.txs.slice().reverse().map(t => txRow(t, runs.get(t.id))).join('')}</ul>`
      : '<p class="empty-small">لا توجد حركات بعد</p>'}
    <button class="danger-link" data-act="del-person">حذف ${esc(p.name)} وكل حركاته</button>`;
}

function txRow(t, run) {
  const gave = t.type === 'gave';
  const runTxt = run > 0 ? `لك ${esc(fmtMoney(run))}` : run < 0 ? `عليك ${esc(fmtMoney(run))}` : 'مسدَّد';
  return `<li><button class="tx" data-act="edit-tx" data-id="${esc(t.id)}">
    <span class="tx-ico ${t.type}">${gave ? ICON.up : ICON.down}</span>
    <span class="tx-main">
      <span class="tx-title">${gave ? 'أعطيته' : 'أخذت منه'}</span>
      ${t.note ? `<span class="tx-note">${esc(t.note)}</span>` : ''}
      <span class="tx-date">${fmtDate(t.date)}${t.due ? `<span class="badge">استحقاق ${fmtDate(t.due)}</span>` : ''}</span>
    </span>
    <span class="tx-amt">
      <span class="a ${t.type}"><bdi dir="ltr">${gave ? '+' : '−'}${esc(fmtMoney(t.amount))}</bdi></span>
      <span class="tx-run">الرصيد: <bdi>${runTxt}</bdi></span>
    </span>
  </button></li>`;
}

function statementText(p, s) {
  const lines = [`كشف حساب: ${p.name}`, ''];
  for (const t of s.txs) {
    lines.push(`• ${fmtDateFull(t.date)}: ${t.type === 'gave' ? 'أعطيتك' : 'أخذت منك'} ${fmtMoney(t.amount)}${t.note ? ` (${t.note})` : ''}`);
  }
  lines.push('');
  lines.push(s.bal > 0 ? `المتبقي لي عندك: ${fmtMoney(s.bal)}` : s.bal < 0 ? `المتبقي لك عندي: ${fmtMoney(s.bal)}` : 'الحساب مسدَّد بالكامل ✓');
  if (s.nextDue) lines.push(`موعد السداد: ${fmtDateFull(s.nextDue)}`);
  return lines.join('\n');
}

/* ================= sheets ================= */
function openSheet(title, body, onMount) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="backdrop" data-close></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="إغلاق">${ICON.close}</button></div>
      <div class="sheet-body">${body}</div>
    </div>`;
  root.classList.add('open');
  document.body.classList.add('locked');
  if (onMount) onMount($('.sheet', root));
}
function closeSheet() {
  const root = $('#sheet-root');
  root.classList.remove('open');
  root.innerHTML = '';
  document.body.classList.remove('locked');
}

const TYPE_HINT = {
  gave: 'أعطيته مالًا: قرض له، أو سداد لما عليك له.',
  took: 'أخذت منه مالًا: قرض منه، أو سداد لما عليه لك.',
};

function openTxForm(o = {}) {
  const tx = o.tx || null;
  const pid = tx ? tx.personId : o.personId || null;
  const person = pid ? state.people.find(p => p.id === pid) : null;
  const type = tx ? tx.type : o.type || 'gave';
  const title = tx ? 'تعديل الحركة' : person ? person.name : 'تسجيل حركة جديدة';

  const body = `<form class="form" id="txf" novalidate autocomplete="off">
    ${person ? '' : `<label class="field"><span>الاسم</span>
      <input name="pname" list="names" placeholder="اسم الشخص" maxlength="80" enterkeyhint="next">
      <datalist id="names">${state.people.map(p => `<option value="${esc(p.name)}">`).join('')}</datalist></label>`}
    <div class="seg" role="radiogroup" aria-label="نوع الحركة">
      <label><input type="radio" name="type" value="gave"${type === 'gave' ? ' checked' : ''}><span>${ICON.up}أعطيته</span></label>
      <label><input type="radio" name="type" value="took"${type === 'took' ? ' checked' : ''}><span>${ICON.down}أخذت منه</span></label>
    </div>
    <p class="hint" id="typeHint"></p>
    <label class="field"><span>المبلغ${state.settings.currency ? ` (${esc(state.settings.currency)})` : ''}</span>
      <input name="amount" inputmode="decimal" placeholder="0" enterkeyhint="done"></label>
    <div class="row2">
      <label class="field"><span>التاريخ</span><input type="date" name="date"></label>
      <label class="field"><span>موعد السداد <button type="button" class="linkish" data-clear-due hidden>مسح</button></span><input type="date" name="due"></label>
    </div>
    <label class="field"><span>ملاحظة (اختياري)</span><input name="note" maxlength="200" placeholder="مثال: ثمن الهاتف" enterkeyhint="done"></label>
    <p class="form-error" id="err"></p>
    <div class="form-actions">
      <button type="submit" class="btn primary">حفظ</button>
      ${tx ? `<button type="button" class="btn danger" data-act="del-tx" data-id="${esc(tx.id)}">حذف</button>` : ''}
    </div>
  </form>`;

  openSheet(title, body, sheet => {
    const f = $('#txf', sheet);
    const F = n => f.elements[n];
    F('amount').value = tx ? tx.amount / 100 : o.amount ? o.amount / 100 : '';
    F('date').value = tx ? tx.date : today();
    F('due').value = tx ? tx.due : '';
    F('note').value = tx ? tx.note : o.note || '';

    const clearDue = $('[data-clear-due]', sheet);
    const sync = () => {
      $('#typeHint', sheet).textContent = TYPE_HINT[F('type').value];
      clearDue.hidden = !F('due').value;
    };
    f.addEventListener('change', sync);
    f.addEventListener('input', sync);
    clearDue.addEventListener('click', () => { F('due').value = ''; sync(); });
    sync();

    f.addEventListener('submit', e => {
      e.preventDefault();
      const err = msg => { $('#err', sheet).textContent = msg; };
      let personId = pid;
      let newName = '';
      if (!personId) {
        newName = F('pname').value.trim();
        if (!newName) return err('اكتب اسم الشخص');
        const existing = state.people.find(p => norm(p.name) === norm(newName));
        if (existing) personId = existing.id;
      }
      const amount = parseAmount(F('amount').value);
      if (!amount) return err('اكتب مبلغًا صحيحًا أكبر من صفر');
      const date = isDate(F('date').value) ? F('date').value : today();
      const due = isDate(F('due').value) ? F('due').value : '';
      const note = F('note').value.trim();

      if (!personId) {
        const np = { id: uid(), name: newName, phone: '', note: '', createdAt: Date.now() };
        state.people.push(np);
        personId = np.id;
      }
      const data = { type: F('type').value, amount, date, due, note };
      if (tx) Object.assign(tx, data);
      else state.txs.push({ id: uid(), personId, ...data, createdAt: Date.now() });
      save();
      closeSheet();
      render();
      toast(tx ? 'تم تعديل الحركة' : 'تم الحفظ');
    });

    if (!tx) (person ? F('amount') : F('pname')).focus();
  });
}

function openPersonForm(p) {
  const body = `<form class="form" id="pf" novalidate autocomplete="off">
    <label class="field"><span>الاسم</span><input name="pname" maxlength="80"></label>
    <label class="field"><span>رقم الهاتف (اختياري)</span><input name="phone" type="tel" inputmode="tel" maxlength="30" placeholder="بالصيغة الدولية لواتساب، مثل ‎+213…" dir="ltr"></label>
    <label class="field"><span>ملاحظة (اختياري)</span><input name="note" maxlength="300"></label>
    <p class="form-error" id="err"></p>
    <div class="form-actions"><button type="submit" class="btn primary">حفظ</button></div>
  </form>`;
  openSheet('تعديل البيانات', body, sheet => {
    const f = $('#pf', sheet);
    f.elements.pname.value = p.name;
    f.elements.phone.value = p.phone;
    f.elements.note.value = p.note;
    f.addEventListener('submit', e => {
      e.preventDefault();
      const name = f.elements.pname.value.trim();
      if (!name) { $('#err', sheet).textContent = 'الاسم مطلوب'; return; }
      Object.assign(p, { name, phone: f.elements.phone.value.trim(), note: f.elements.note.value.trim() });
      save();
      closeSheet();
      render();
      toast('تم الحفظ');
    });
  });
}

const CURRENCIES = ['دج', 'د.م', 'د.ت', 'ر.س', 'د.إ', 'ج.م', 'د.ك', 'د.أ', 'ر.ق', 'د.ع', 'ل.س', 'ل.ل', '$', '€'];

function openSettings() {
  const lb = state.settings.lastBackup;
  const body = `<div class="form">
    <label class="field"><span>العملة</span>
      <input name="currency" list="currencies" maxlength="10" placeholder="مثال: دج" value="${esc(state.settings.currency)}">
      <datalist id="currencies">${CURRENCIES.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
    <label class="field"><span>المظهر</span>
      <select name="theme">
        <option value="auto">تلقائي (حسب الجهاز)</option>
        <option value="light">فاتح</option>
        <option value="dark">داكن</option>
      </select></label>
    <div class="set-group">
      <h3>النسخ الاحتياطي</h3>
      <p>بياناتك محفوظة على هذا الجهاز فقط. إذا حذفت التطبيق من الشاشة الرئيسية تُحذف معه، فاحفظ نسخة احتياطية في الملفات أو أرسلها لنفسك بانتظام.</p>
      <p>آخر نسخة: <strong>${lb ? fmtDateFull(today(-Math.floor((Date.now() - lb) / 86400000))) : 'لا توجد'}</strong></p>
      <button class="btn primary block" data-act="export-json">حفظ نسخة احتياطية</button>
      <button class="btn block" data-act="import-json">استرجاع من نسخة احتياطية</button>
      <button class="btn block" data-act="export-csv">تصدير جدول Excel (CSV)</button>
      <input type="file" id="importFile" accept=".json,application/json" hidden>
      <h3>منطقة الخطر</h3>
      <button class="btn danger block" data-act="wipe">حذف كل البيانات</button>
    </div>
    <p class="about">دفتر الديون · الإصدار ${APP_VERSION} · الأشخاص: ${state.people.length} · الحركات: ${state.txs.length}</p>
  </div>`;
  openSheet('الإعدادات', body, sheet => {
    const cur = $('[name=currency]', sheet);
    const theme = $('[name=theme]', sheet);
    theme.value = state.settings.theme;
    cur.addEventListener('input', () => { state.settings.currency = cur.value.trim().slice(0, 10); save(); render(); });
    theme.addEventListener('change', () => { state.settings.theme = theme.value; save(); applyTheme(); });
    $('#importFile', sheet).addEventListener('change', e => importJson(e.target.files[0]));
  });
}

/* ================= files ================= */
async function deliverFile(name, mime, content) {
  const blob = new Blob([content], { type: mime });
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare) {
    const file = new File([blob], name, { type: mime });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return true;
      } catch (e) {
        if (e.name === 'AbortError') return false;
      }
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return true;
}

async function exportJson() {
  const data = { app: 'debt-ledger', exportedAt: new Date().toISOString(), ...state };
  const ok = await deliverFile(`debts-backup-${today()}.json`, 'application/json', JSON.stringify(data, null, 1));
  if (!ok) return;
  state.settings.lastBackup = Date.now();
  save();
  toast('تم حفظ النسخة الاحتياطية');
  if (!$('#sheet-root').classList.contains('open')) render();
}

function importJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = JSON.parse(reader.result); } catch (e) { data = null; }
    if (!data || !Array.isArray(data.people) || !Array.isArray(data.txs)) {
      toast('هذا الملف ليس نسخة احتياطية صالحة');
      return;
    }
    const next = sanitize(data);
    const msg = `سيتم استبدال بياناتك الحالية (${state.people.length} شخص، ${state.txs.length} حركة) بالنسخة الاحتياطية (${next.people.length} شخص، ${next.txs.length} حركة). متابعة؟`;
    if (!confirm(msg)) return;
    next.settings.lastBackup = Date.now();
    state = next;
    save();
    applyTheme();
    closeSheet();
    location.hash = '';
    render();
    toast('تم استرجاع البيانات');
  };
  reader.readAsText(file);
}

function exportCsv() {
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['الاسم', 'الهاتف', 'النوع', 'المبلغ', 'التاريخ', 'موعد السداد', 'ملاحظة', 'الرصيد بعد الحركة (موجب = لي)']];
  const stats = computeStats();
  for (const p of state.people) {
    let run = 0;
    for (const t of stats.get(p.id).txs) {
      run += t.type === 'gave' ? t.amount : -t.amount;
      rows.push([p.name, p.phone, t.type === 'gave' ? 'أعطيته' : 'أخذت منه', t.amount / 100, t.date, t.due, t.note, run / 100]);
    }
  }
  deliverFile(`debts-${today()}.csv`, 'text/csv', '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n'));
}

/* ================= actions ================= */
const actions = {
  settings: openSettings,
  add: () => openTxForm(),
  back: () => {
    if (cameFromHome) history.back();
    else location.replace('#');
  },
  filter: el => { ui.filter = el.dataset.f; renderList(); },
  'new-tx': el => openTxForm({ personId: view.id, type: el.dataset.type }),
  settle: () => {
    const s = computeStats().get(view.id);
    openTxForm({ personId: view.id, type: s.bal > 0 ? 'took' : 'gave', amount: Math.abs(s.bal), note: 'تسوية الحساب' });
  },
  'edit-tx': el => {
    const tx = state.txs.find(t => t.id === el.dataset.id);
    if (tx) openTxForm({ tx });
  },
  'del-tx': el => {
    if (!confirm('حذف هذه الحركة نهائيًا؟')) return;
    state.txs = state.txs.filter(t => t.id !== el.dataset.id);
    save();
    closeSheet();
    render();
    toast('تم حذف الحركة');
  },
  'edit-person': () => openPersonForm(state.people.find(p => p.id === view.id)),
  'del-person': () => {
    const p = state.people.find(x => x.id === view.id);
    if (!confirm(`حذف ${p.name} وكل حركاته نهائيًا؟`)) return;
    state.people = state.people.filter(x => x.id !== p.id);
    state.txs = state.txs.filter(t => t.personId !== p.id);
    save();
    toast('تم الحذف');
    actions.back();
  },
  share: async () => {
    const p = state.people.find(x => x.id === view.id);
    const text = statementText(p, computeStats().get(p.id));
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('تم نسخ كشف الحساب');
    } catch (e) {
      toast('المشاركة غير متاحة هنا');
    }
  },
  'export-json': exportJson,
  'import-json': () => $('#importFile').click(),
  'export-csv': exportCsv,
  wipe: () => {
    if (!confirm('سيتم حذف كل الأشخاص والحركات نهائيًا. هل أنت متأكد؟')) return;
    if (!confirm('تأكيد أخير: لا يمكن التراجع. احذف كل شيء؟')) return;
    state = sanitize({ settings: state.settings });
    save();
    closeSheet();
    location.replace('#');
    render();
    toast('تم حذف كل البيانات');
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act], [data-close]');
  if (!el) return;
  if (el.hasAttribute('data-close')) { closeSheet(); return; }
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'q') { ui.q = e.target.value; renderList(); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'sort') { ui.sort = e.target.value; renderList(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#sheet-root').classList.contains('open')) closeSheet();
});

/* ================= routing / boot ================= */
function render() {
  const m = location.hash.match(/^#\/p\/(.+)$/);
  const id = m ? decodeURIComponent(m[1]) : null;
  if (id && state.people.some(p => p.id === id)) {
    if (view.name !== 'person') cameFromHome = view.name === 'home';
    renderPerson(id);
  } else {
    renderHome();
  }
}

window.addEventListener('hashchange', () => {
  const before = view.name + (view.id || '');
  closeSheet();
  render();
  if (before !== view.name + (view.id || '')) window.scrollTo(0, 0);
});

// Another tab/window changed the data: reload it
window.addEventListener('storage', e => {
  if (e.key === STORE_KEY) { state = load(); applyTheme(); render(); }
});

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

const darkMQ = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = state.settings.theme;
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && darkMQ.matches);
  $('meta[name="theme-color"]').content = dark ? '#0e1116' : '#f4f5f7';
}
darkMQ.addEventListener?.('change', applyTheme);

applyTheme();
render();

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

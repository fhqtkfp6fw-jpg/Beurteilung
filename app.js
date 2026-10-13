'use strict';

const APP_VERSION = '1.0';
const BACKUP_TAGE = 14;          // Erinnerung, wenn die letzte Sicherung älter ist
const PUNKTE_BUTTONS_MAX = 12;   // bis zu diesem Maximum Punkte-Buttons, darüber Stepper

/* ---------- Hilfsfunktionen ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const r1 = x => Math.round(x * 10 + 1e-9) / 10;
const fmt1 = x => (x == null || isNaN(x)) ? '–' : r1(x).toFixed(1);
const fmtP = x => (x == null || x === '') ? '' : String(r1(x)).replace(/\.0$/, '');
const heute = () => new Date().toISOString().slice(0, 10);
const datumCH = iso => iso ? iso.split('-').reverse().join('.') : '';
const clone = o => JSON.parse(JSON.stringify(o));
const norm = s => String(s ?? '').trim().toLowerCase();
const lkey = l => norm(l.name) + '|' + norm(l.vorname);
const sortLern = (a, b) => (a.name + ' ' + a.vorname).localeCompare(b.name + ' ' + b.vorname, 'de');

/* ---------- IndexedDB ---------- */
let DB;
function idb() {
  if (DB) return Promise.resolve(DB);
  return new Promise((res, rej) => {
    const r = indexedDB.open('beurteilung', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('lernende', { keyPath: 'id' });
      d.createObjectStore('vorlagen', { keyPath: 'id' });
      d.createObjectStore('durchf', { keyPath: 'id' });
      d.createObjectStore('kv');
    };
    r.onsuccess = () => { DB = r.result; res(DB); };
    r.onerror = () => rej(r.error);
  });
}
const tx = (store, mode, fn) => idb().then(d => new Promise((res, rej) => {
  const t = d.transaction(store, mode); const s = t.objectStore(store);
  const out = fn(s);
  t.oncomplete = () => res(out instanceof IDBRequest ? out.result : out);
  t.onerror = () => rej(t.error);
}));
const dbAll = st => tx(st, 'readonly', s => s.getAll());
const dbPut = (st, v, k) => tx(st, 'readwrite', s => k === undefined ? s.put(v) : s.put(v, k));
const dbGet = (st, k) => tx(st, 'readonly', s => s.get(k));
const dbDel = (st, k) => tx(st, 'readwrite', s => s.delete(k));
const dbClear = st => tx(st, 'readwrite', s => s.clear());

/* ---------- Zustand ---------- */
const S = {
  view: 'uebersicht',
  lernende: [], vorlagen: [], durchf: [],
  dfId: null, kIdx: 0, teilIdx: 0,
  editVorlage: null,
  meta: { lastBackup: null },
};
const lernById = id => S.lernende.find(l => l.id === id);
const curDf = () => S.durchf.find(d => d.id === S.dfId);

async function load() {
  [S.lernende, S.vorlagen, S.durchf] = await Promise.all([dbAll('lernende'), dbAll('vorlagen'), dbAll('durchf')]);
  S.meta = Object.assign({ lastBackup: null }, await dbGet('kv', 'meta'));
  const nav = await dbGet('kv', 'nav');
  if (nav) Object.assign(S, { dfId: nav.dfId, kIdx: nav.kIdx || 0, teilIdx: nav.teilIdx || 0 });
  if (!S.vorlagen.length && !(await dbGet('kv', 'seeded'))) {
    for (const v of START_VORLAGEN) { await dbPut('vorlagen', v); }
    await dbPut('kv', true, 'seeded');
    S.vorlagen = await dbAll('vorlagen');
  }
  S.lernende.sort(sortLern);
}

/* ---------- Speichern ---------- */
let saveTimer = null;
function setSaved(ok) {
  const el = $('#savestate');
  el.textContent = ok ? '✓ Gespeichert' : '… speichert';
  el.className = ok ? 'saved' : 'dirty';
}
function saveDf(now) {
  const d = curDf(); if (!d) return;
  setSaved(false);
  clearTimeout(saveTimer);
  const doit = () => dbPut('durchf', d).then(() => setSaved(true));
  if (now) return doit();
  saveTimer = setTimeout(doit, 400);
}
const saveNav = () => dbPut('kv', { dfId: S.dfId, kIdx: S.kIdx, teilIdx: S.teilIdx }, 'nav');
const saveMeta = () => dbPut('kv', S.meta, 'meta');
document.addEventListener('visibilitychange', () => { if (document.hidden) saveDf(true); });
window.addEventListener('pagehide', () => saveDf(true));

/* ---------- Notenberechnung ---------- */
// Teil: { modus:'kriterien'|'total', kriterien:[{id,text,max}], max, gewicht }
// Kandidat: { lid, p:{kritId:punkte}, tot:{teilId:punkte}, b:{kritId:bemerkung}, bem }
function teilMax(t) { return t.modus === 'total' ? (+t.max || 0) : t.kriterien.reduce((s, k) => s + (+k.max || 0), 0); }
function teilStand(t, k) {
  if (t.modus === 'total') {
    const v = k.tot[t.id];
    const has = v !== undefined && v !== null && v !== '';
    return { err: has ? +v : 0, max: teilMax(t), offen: has ? 0 : 1, anz: 1 };
  }
  let err = 0, offen = 0;
  for (const kr of t.kriterien) {
    const v = k.p[kr.id];
    if (v === undefined || v === null || v === '') offen++; else err += +v;
  }
  return { err, max: teilMax(t), offen, anz: t.kriterien.length };
}
function teilNote(t, k) {
  const st = teilStand(t, k);
  if (st.offen === st.anz || !st.max) return null;     // noch nichts erfasst
  return r1(st.err / st.max * 5 + 1);
}
function gesamtNote(v, k) {
  let sw = 0, sn = 0;
  for (const t of v.teile) {
    const n = teilNote(t, k);
    if (n == null) return null;
    const w = +t.gewicht || 0;
    sw += w; sn += w * n;
  }
  return sw ? r1(sn / sw) : null;
}
function kandStatus(v, k) {
  let offen = 0, anz = 0;
  for (const t of v.teile) { const st = teilStand(t, k); offen += st.offen; anz += st.anz; }
  return offen === anz ? 'neu' : offen ? 'wip' : 'ok';
}

/* ---------- Navigation ---------- */
function go(view) { S.view = view; render(); window.scrollTo(0, 0); }
$('#tabbar').addEventListener('click', e => {
  const b = e.target.closest('button[data-view]'); if (!b || b.disabled) return;
  go(b.dataset.view);
});
function render() {
  $$('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === S.view));
  $('#tabbar button[data-view=bewerten]').disabled = !curDf();
  $('#ctxtitle').textContent = '';
  ({ uebersicht: renderUebersicht, bewerten: renderBewerten, lernende: renderLernende, vorlagen: renderVorlagen, optionen: renderOptionen }[S.view] || renderUebersicht)();
}

/* ---------- Modal ---------- */
function modal(html, wire) {
  const m = $('#modal');
  m.innerHTML = `<div class="box">${html}</div>`;
  m.hidden = false;
  wire && wire(m);
}
function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }
function confirmDlg(text, okText = 'OK', danger = false) {
  return new Promise(res => {
    modal(`<p>${text}</p><div class="row"><div class="spacer"></div>
      <button class="btn" data-a="0">Abbrechen</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-a="1">${esc(okText)}</button></div>`, m => {
      m.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { closeModal(); res(b.dataset.a === '1'); });
    });
  });
}
function alertDlg(text) { return confirmDlg(text, 'OK').then(() => {}); }

/* ---------- Übersicht ---------- */
function backupFaellig() {
  if (!S.durchf.length && !S.lernende.length) return false;
  if (!S.meta.lastBackup) return true;
  return (Date.now() - new Date(S.meta.lastBackup).getTime()) / 864e5 > BACKUP_TAGE;
}
function renderUebersicht() {
  const list = [...S.durchf].sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
  $('#view').innerHTML = `
    <h1>Übersicht</h1>
    ${backupFaellig() ? `<div class="banner row"><div class="grow">💾 ${S.meta.lastBackup ? 'Die letzte Sicherung ist vom ' + new Date(S.meta.lastBackup).toLocaleDateString('de-CH') + '.' : 'Es gibt noch keine Sicherung.'} Bitte Daten sichern.</div><div class="spacer"></div><button class="btn small" id="bk">Jetzt sichern</button></div>` : ''}
    ${!S.lernende.length ? `<div class="banner">Noch keine Lernenden vorhanden. Unter <b>Lernende</b> die Excel-Liste importieren.</div>` : ''}
    <div class="row" style="margin-bottom:12px"><button class="btn primary" id="neu" ${S.lernende.length ? '' : 'disabled'}>＋ Neue Prüfung eröffnen</button></div>
    <div class="card list">
      ${list.length ? list.map(d => {
        const fertig = d.kandidaten.filter(k => kandStatus(d.vorlage, k) === 'ok').length;
        return `<div class="item" data-id="${d.id}">
          <div class="grow"><div class="title">${esc(d.vorlage.titel)}</div>
          <div class="muted small">${datumCH(d.datum)} · ${d.kandidaten.length} Kandidat${d.kandidaten.length === 1 ? '' : 'en'} ·
          <span class="badge ${fertig === d.kandidaten.length ? 'ok' : 'wip'}">${fertig}/${d.kandidaten.length} fertig</span></div></div>
          <button class="btn small" data-a="open">Öffnen</button>
          <button class="btn small danger" data-a="del">Löschen</button></div>`;
      }).join('') : '<div class="muted">Noch keine Prüfungen eröffnet.</div>'}
    </div>`;
  $('#bk') && ($('#bk').onclick = exportBackup);
  $('#neu').onclick = () => dlgNeueDurchf();
  $$('#view .item[data-id]').forEach(it => {
    it.querySelector('[data-a=open]').onclick = () => openDf(it.dataset.id);
    it.querySelector('[data-a=del]').onclick = async () => {
      const d = S.durchf.find(x => x.id === it.dataset.id);
      if (!await confirmDlg(`Prüfung «${esc(d.vorlage.titel)}» vom ${datumCH(d.datum)} mit allen Bewertungen löschen?`, 'Löschen', true)) return;
      await dbDel('durchf', d.id);
      S.durchf = S.durchf.filter(x => x !== d);
      if (S.dfId === d.id) S.dfId = null;
      render();
    };
  });
}
function openDf(id, kIdx = 0) {
  S.dfId = id; S.kIdx = kIdx; S.teilIdx = 0; saveNav(); go('bewerten');
}

/* Kandidaten-Auswahl (für neue Prüfung und «Kandidat hinzufügen») */
function lernAuswahlHtml(ausgeschlossen = []) {
  const ljs = [...new Set(S.lernende.map(l => l.lj).filter(Boolean))].sort();
  const berufe = [...new Set(S.lernende.map(l => l.beruf).filter(Boolean))].sort();
  return `
    <div class="chips" id="fLj"><button data-v="" class="active">Alle LJ</button>${ljs.map(x => `<button data-v="${esc(x)}">${esc(x)}. LJ</button>`).join('')}</div>
    <div class="chips" id="fBe"><button data-v="" class="active">Alle Berufe</button>${berufe.map(x => `<button data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <input type="search" id="fSu" placeholder="Suchen …" style="margin-bottom:8px">
    <div class="list checklist" id="lernList">
      ${S.lernende.filter(l => !ausgeschlossen.includes(l.id)).map(l => `<label class="item" data-lj="${esc(l.lj)}" data-be="${esc(l.beruf)}" data-n="${esc(norm(l.name + ' ' + l.vorname))}">
        <input type="checkbox" value="${l.id}"><div class="grow"><div class="title">${esc(l.name)} ${esc(l.vorname)}</div>
        <div class="muted small">${l.lj ? esc(l.lj) + '. LJ · ' : ''}${esc(l.beruf || '')}</div></div></label>`).join('')}
    </div>`;
}
function wireLernAuswahl(m) {
  const f = { lj: '', be: '', su: '' };
  const apply = () => m.querySelectorAll('#lernList .item').forEach(it => {
    it.hidden = (f.lj && String(it.dataset.lj) !== f.lj) || (f.be && it.dataset.be !== f.be) || (f.su && !it.dataset.n.includes(f.su));
  });
  const chips = (sel, key) => m.querySelectorAll(sel + ' button').forEach(b => b.onclick = () => {
    m.querySelectorAll(sel + ' button').forEach(x => x.classList.toggle('active', x === b));
    f[key] = b.dataset.v; apply();
  });
  chips('#fLj', 'lj'); chips('#fBe', 'be');
  m.querySelector('#fSu').oninput = e => { f.su = norm(e.target.value); apply(); };
  return () => [...m.querySelectorAll('#lernList input:checked')].map(i => i.value);
}
function neuerKandidat(lid) { return { lid, p: {}, tot: {}, b: {}, bem: '' }; }

function dlgNeueDurchf() {
  if (!S.vorlagen.length) return alertDlg('Zuerst eine Bewertungsvorlage erstellen.');
  modal(`<h2 style="margin-top:0">Neue Prüfung eröffnen</h2>
    <label class="field"><span>Vorlage</span><select id="nVo">${S.vorlagen.map(v => `<option value="${v.id}">${esc(v.titel)}</option>`).join('')}</select></label>
    <label class="field"><span>Datum</span><input type="date" id="nDa" value="${heute()}"></label>
    <h2>Kandidaten</h2>${lernAuswahlHtml()}
    <div class="row" style="margin-top:14px"><div class="spacer"></div><button class="btn" id="cx">Abbrechen</button><button class="btn primary" id="ok">Eröffnen</button></div>`, m => {
    const sel = wireLernAuswahl(m);
    m.querySelector('#cx').onclick = closeModal;
    m.querySelector('#ok').onclick = async () => {
      const ids = sel();
      if (!ids.length) return;
      const v = S.vorlagen.find(x => x.id === m.querySelector('#nVo').value);
      const d = { id: uid('df'), vorlage: clone(v), datum: m.querySelector('#nDa').value || heute(),
        kandidaten: ids.map(lid => lernById(lid)).sort(sortLern).map(l => neuerKandidat(l.id)) };
      await dbPut('durchf', d);
      S.durchf.push(d);
      closeModal();
      openDf(d.id);
    };
  });
}

/* ---------- Bewerten ---------- */
function renderBewerten() {
  const d = curDf();
  if (!d) return go('uebersicht');
  const v = d.vorlage;
  if (S.kIdx >= d.kandidaten.length) S.kIdx = Math.max(0, d.kandidaten.length - 1);
  const k = d.kandidaten[S.kIdx];
  const nTeile = v.teile.length;           // letzter Reiter = Abschluss
  if (S.teilIdx > nTeile) S.teilIdx = 0;
  $('#ctxtitle').textContent = `${v.titel} · ${datumCH(d.datum)}`;

  const kandHtml = d.kandidaten.map((kk, i) => {
    const l = lernById(kk.lid) || { name: '?', vorname: '' };
    const st = kandStatus(v, kk), g = gesamtNote(v, kk);
    return `<button class="kand ${i === S.kIdx ? 'active' : ''}" data-i="${i}">
      <div class="n"><span class="dot ${st}"></span>${esc(l.name)} ${esc(l.vorname)}</div>
      <div class="s">${g != null ? 'Note ' + fmt1(g) : st === 'neu' ? 'offen' : 'in Arbeit'}</div></button>`;
  }).join('') + `<button class="kand" id="addK"><div class="n">＋</div><div class="s">Kandidat</div></button>`;

  const tabs = v.teile.map((t, i) => `<button data-t="${i}" class="${i === S.teilIdx ? 'active' : ''}">${esc(t.titel)}<span class="nt">${k ? fmt1(teilNote(t, k)) : ''}</span></button>`).join('')
    + `<button data-t="${nTeile}" class="${S.teilIdx === nTeile ? 'active' : ''}">Abschluss<span class="nt">${k ? fmt1(gesamtNote(v, k)) : ''}</span></button>`;

  let body = '';
  if (!k) body = '<div class="card muted">Keine Kandidaten. Mit «＋ Kandidat» hinzufügen.</div>';
  else if (S.teilIdx < nTeile) body = teilHtml(v.teile[S.teilIdx], k);
  else body = abschlussHtml(d, k);

  const l = k && lernById(k.lid);
  $('#view').innerHTML = `
    <div class="kandbar">${kandHtml}</div>
    <div class="teiltabs">${tabs}</div>
    ${body}
    ${k ? `<div class="sumbar">
      <button class="btn" id="prevK" ${S.kIdx === 0 ? 'disabled' : ''}>◀</button>
      <div class="mid" id="sumtxt"></div>
      <button class="btn" id="nextK" ${S.kIdx >= d.kandidaten.length - 1 ? 'disabled' : ''}>▶</button></div>` : ''}`;

  $$('.kand[data-i]').forEach(b => b.onclick = () => { S.kIdx = +b.dataset.i; saveNav(); renderBewerten(); });
  $('#addK').onclick = () => dlgKandidatHinzu(d);
  $$('.teiltabs button').forEach(b => b.onclick = () => { S.teilIdx = +b.dataset.t; saveNav(); renderBewerten(); window.scrollTo(0, 0); });
  if (!k) return;
  $('#prevK').onclick = () => { S.kIdx--; saveNav(); renderBewerten(); window.scrollTo(0, 0); };
  $('#nextK').onclick = () => { S.kIdx++; saveNav(); renderBewerten(); window.scrollTo(0, 0); };
  if (S.teilIdx < nTeile) wireTeil(d, v.teile[S.teilIdx], k); else wireAbschluss(d, k);
  updateSum(d, k);
}

function updateSum(d, k) {
  const v = d.vorlage, el = $('#sumtxt'); if (!el) return;
  const l = lernById(k.lid);
  if (S.teilIdx < v.teile.length) {
    const t = v.teile[S.teilIdx], st = teilStand(t, k);
    el.innerHTML = `${esc(l ? l.vorname : '')} · ${esc(t.titel)}: ${fmtP(st.err)} / ${fmtP(st.max)} P. → <b>${fmt1(teilNote(t, k))}</b>${st.offen && t.modus !== 'total' ? ` <span class="muted small">(${st.offen} offen)</span>` : ''}`;
  } else {
    el.innerHTML = `${esc(l ? l.vorname : '')} · Gesamtnote <b>${fmt1(gesamtNote(v, k))}</b>`;
  }
  // Noten in Reitern und Kandidatenleiste nachführen
  $$('.teiltabs button').forEach(b => {
    const i = +b.dataset.t, nt = b.querySelector('.nt');
    nt.textContent = i < v.teile.length ? fmt1(teilNote(v.teile[i], k)) : fmt1(gesamtNote(v, k));
  });
  const kb = $(`.kand[data-i="${S.kIdx}"]`);
  if (kb) {
    const st = kandStatus(v, k), g = gesamtNote(v, k);
    kb.querySelector('.dot').className = 'dot ' + st;
    kb.querySelector('.s').textContent = g != null ? 'Note ' + fmt1(g) : st === 'neu' ? 'offen' : 'in Arbeit';
  }
}

function teilHtml(t, k) {
  if (t.modus === 'total') {
    const v = k.tot[t.id];
    return `<div class="krit ${v !== undefined && v !== '' ? 'done' : ''}">
      <div class="kt"><div class="t">${esc(t.titel)} – erreichte Punkte</div><div class="m">max. ${fmtP(t.max)}</div></div>
      <div class="stepper" data-max="${t.max}" data-step="0.5"><button data-d="-0.5">−</button>
      <input type="number" inputmode="decimal" step="0.5" min="0" max="${t.max}" value="${v ?? ''}" id="totIn"><button data-d="0.5">＋</button>
      <span class="muted">/ ${fmtP(t.max)}</span></div>
      <input type="text" class="bem" data-bem="${t.id}" placeholder="Bemerkung" value="${esc(k.b[t.id] || '')}"></div>`;
  }
  return t.kriterien.map(kr => {
    const v = k.p[kr.id];
    const has = v !== undefined && v !== null && v !== '';
    let ctl;
    if (kr.max <= PUNKTE_BUTTONS_MAX && Number.isInteger(+kr.max)) {
      ctl = `<div class="pts">${Array.from({ length: kr.max + 1 }, (_, i) => `<button data-v="${i}" class="${has && +v === i ? 'sel' : ''}">${i}</button>`).join('')}</div>`;
    } else {
      ctl = `<div class="stepper" data-max="${kr.max}" data-step="1"><button data-d="-1">−</button>
        <input type="number" inputmode="decimal" step="0.5" min="0" max="${kr.max}" value="${has ? v : ''}"><button data-d="1">＋</button>
        <span class="muted">/ ${fmtP(kr.max)}</span></div>`;
    }
    return `<div class="krit ${has ? 'done' : ''}" data-k="${kr.id}">
      <div class="kt"><div class="t">${esc(kr.text)}</div><div class="m">${has ? fmtP(v) + ' / ' : 'max. '}${fmtP(kr.max)}</div></div>
      ${ctl}
      <input type="text" class="bem" data-bem="${kr.id}" placeholder="Bemerkung" value="${esc(k.b[kr.id] || '')}"></div>`;
  }).join('');
}

function setWert(d, k, target, key, val, max, card) {
  if (val === '' || val === null || isNaN(val)) delete target[key];
  else target[key] = Math.min(Math.max(0, r1(+val)), +max);
  if (card) {
    const has = target[key] !== undefined;
    card.classList.toggle('done', has);
    const m = card.querySelector('.kt .m');
    if (m) m.textContent = (has ? fmtP(target[key]) + ' / ' : (card.dataset.k ? 'max. ' : 'max. ')) + fmtP(max);
  }
  saveDf(); updateSum(d, k);
}

function wireTeil(d, t, k) {
  if (t.modus === 'total') {
    const card = $('.krit'), inp = $('#totIn');
    const set = val => { setWert(d, k, k.tot, t.id, val, t.max, null); card.classList.toggle('done', k.tot[t.id] !== undefined); };
    inp.onchange = () => { set(inp.value === '' ? '' : +inp.value); inp.value = k.tot[t.id] ?? ''; };
    card.querySelectorAll('.stepper button').forEach(b => b.onclick = () => {
      set((+inp.value || 0) + +b.dataset.d); inp.value = k.tot[t.id] ?? '';
    });
  } else {
    $$('.krit[data-k]').forEach(card => {
      const kr = t.kriterien.find(x => x.id === card.dataset.k);
      card.querySelectorAll('.pts button').forEach(b => b.onclick = () => {
        const already = b.classList.contains('sel');
        card.querySelectorAll('.pts button').forEach(x => x.classList.remove('sel'));
        if (already) setWert(d, k, k.p, kr.id, '', kr.max, card);         // nochmals tippen = leeren
        else { b.classList.add('sel'); setWert(d, k, k.p, kr.id, +b.dataset.v, kr.max, card); }
      });
      const inp = card.querySelector('.stepper input');
      if (inp) {
        inp.onchange = () => { setWert(d, k, k.p, kr.id, inp.value === '' ? '' : +inp.value, kr.max, card); inp.value = k.p[kr.id] ?? ''; };
        card.querySelectorAll('.stepper button').forEach(b => b.onclick = () => {
          setWert(d, k, k.p, kr.id, (+inp.value || 0) + +b.dataset.d, kr.max, card); inp.value = k.p[kr.id] ?? '';
        });
      }
    });
  }
  $$('input.bem').forEach(inp => inp.oninput = () => {
    if (inp.value.trim()) k.b[inp.dataset.bem] = inp.value; else delete k.b[inp.dataset.bem];
    saveDf();
  });
}

function abschlussHtml(d, k) {
  const v = d.vorlage, l = lernById(k.lid) || {};
  const gewAnders = v.teile.some(t => +t.gewicht !== 1);
  return `<div class="card">
    <h2 style="margin-top:0">${esc(l.name)} ${esc(l.vorname)}</h2>
    <table class="noten"><tr><th>Teil</th><th class="r">Punkte</th>${gewAnders ? '<th class="r">Gewicht</th>' : ''}<th class="r">Note</th></tr>
    ${v.teile.map(t => { const st = teilStand(t, k); return `<tr><td>${esc(t.titel)}${st.offen && st.offen < st.anz ? ` <span class="badge wip">${st.offen} offen</span>` : ''}</td>
      <td class="r">${fmtP(st.err)} / ${fmtP(st.max)}</td>${gewAnders ? `<td class="r">${fmtP(t.gewicht)}×</td>` : ''}<td class="r">${fmt1(teilNote(t, k))}</td></tr>`; }).join('')}
    <tr class="total"><td>Gesamtnote</td><td></td>${gewAnders ? '<td></td>' : ''}<td class="r">${fmt1(gesamtNote(v, k))}</td></tr></table></div>
    <div class="card"><label class="field"><span>Bemerkungen (erscheinen auf dem Beurteilungsblatt)</span>
    <textarea id="bemGes">${esc(k.bem || '')}</textarea></label></div>
    <div class="row">
      <button class="btn primary" id="pdf1">📄 Beurteilungsblatt (PDF)</button>
      <button class="btn" id="pdfAll">📄 Alle Kandidaten (ein PDF)</button>
      <div class="spacer"></div>
      <button class="btn danger" id="rmK">Kandidat entfernen</button>
    </div>`;
}
function wireAbschluss(d, k) {
  $('#bemGes').oninput = e => { k.bem = e.target.value; saveDf(); };
  $('#pdf1').onclick = async () => { await saveDf(true); pdfErstellen(d, [k]); };
  $('#pdfAll').onclick = async () => { await saveDf(true); pdfErstellen(d, d.kandidaten); };
  $('#rmK').onclick = async () => {
    const l = lernById(k.lid) || {};
    if (!await confirmDlg(`${esc(l.name)} ${esc(l.vorname)} mit allen Punkten aus dieser Prüfung entfernen?`, 'Entfernen', true)) return;
    d.kandidaten.splice(S.kIdx, 1);
    await saveDf(true);
    renderBewerten();
  };
}
function dlgKandidatHinzu(d) {
  const da = d.kandidaten.map(k => k.lid);
  if (da.length >= S.lernende.length) return alertDlg('Alle Lernenden sind bereits in dieser Prüfung.');
  modal(`<h2 style="margin-top:0">Kandidaten hinzufügen</h2>${lernAuswahlHtml(da)}
    <div class="row" style="margin-top:14px"><div class="spacer"></div><button class="btn" id="cx">Abbrechen</button><button class="btn primary" id="ok">Hinzufügen</button></div>`, m => {
    const sel = wireLernAuswahl(m);
    m.querySelector('#cx').onclick = closeModal;
    m.querySelector('#ok').onclick = async () => {
      const ids = sel(); if (!ids.length) return;
      ids.forEach(lid => d.kandidaten.push(neuerKandidat(lid)));
      d.kandidaten.sort((a, b) => sortLern(lernById(a.lid), lernById(b.lid)));
      await saveDf(true); closeModal();
      S.kIdx = d.kandidaten.findIndex(k => k.lid === ids[0]); saveNav();
      renderBewerten();
    };
  });
}

/* ---------- Lernende / Import ---------- */
function renderLernende() {
  $('#view').innerHTML = `
    <h1>Lernende <span class="muted small">(${S.lernende.length})</span></h1>
    <div class="row" style="margin-bottom:12px">
      <button class="btn primary" id="imp">📥 Aus Excel importieren</button>
      <input type="file" id="impFile" accept=".xlsx,.xlsm,.xls,.csv" hidden>
      <div class="spacer"></div>
      <input type="search" id="su" placeholder="Suchen …" style="max-width:260px">
    </div>
    <p class="muted small">Import liest das Blatt «Adresse» (oder das erste Blatt mit den Spalten Name und Vorname).
    Vorhandene Lernende werden über Name + Vorname aktualisiert, neue hinzugefügt. <b>Wer in der Datei fehlt, wird mitsamt Bewertungen gelöscht.</b></p>
    <div class="card list" id="ll">
      ${S.lernende.length ? S.lernende.map(l => `<div class="item" data-n="${esc(norm(l.name + ' ' + l.vorname))}">
        <div class="grow"><div class="title">${esc(l.name)} ${esc(l.vorname)}</div>
        <div class="muted small">${[l.anrede, l.lj ? l.lj + '. Lehrjahr' : '', l.beruf, l.sem ? 'Sem. ' + l.sem : ''].filter(Boolean).map(esc).join(' · ')}</div></div></div>`).join('')
      : '<div class="muted">Noch keine Lernenden importiert.</div>'}
    </div>`;
  $('#imp').onclick = () => $('#impFile').click();
  $('#impFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importLernende(f); };
  $('#su').oninput = e => { const q = norm(e.target.value); $$('#ll .item').forEach(it => it.hidden = q && !it.dataset.n.includes(q)); };
}

const SPALTEN = {
  name: ['name', 'nachname'], vorname: ['vorname'], anrede: ['anrede'],
  lj: ['l.jahr', 'lj', 'lehrjahr', 'l. jahr'], beruf: ['beruf'], sem: ['sem.', 'sem', 'semester'],
};
function parseLernende(wb) {
  const namen = [...wb.SheetNames];
  const adr = namen.findIndex(n => norm(n) === 'adresse');
  if (adr > 0) namen.unshift(namen.splice(adr, 1)[0]);
  for (const sn of namen) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: false });
    for (let h = 0; h < Math.min(rows.length, 15); h++) {
      const hdr = rows[h].map(norm);
      const col = {};
      for (const [k, al] of Object.entries(SPALTEN)) col[k] = hdr.findIndex(c => al.includes(c));
      if (col.name < 0 || col.vorname < 0) continue;
      const out = [];
      for (const r of rows.slice(h + 1)) {
        const g = k => col[k] >= 0 ? String(r[col[k]] ?? '').trim() : '';
        if (!g('name') || !g('vorname')) continue;
        out.push({ name: g('name'), vorname: g('vorname'), anrede: g('anrede'), lj: g('lj'), beruf: g('beruf'), sem: g('sem') });
      }
      return { blatt: sn, lernende: out };
    }
  }
  return null;
}
async function importLernende(file) {
  let res;
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    res = parseLernende(wb);
  } catch (e) { return alertDlg('Die Datei konnte nicht gelesen werden: ' + esc(e.message)); }
  if (!res || !res.lernende.length) return alertDlg('In der Datei wurde keine Tabelle mit den Spalten «Name» und «Vorname» gefunden.');

  const alt = new Map(S.lernende.map(l => [lkey(l), l]));
  const neu = new Map(res.lernende.map(l => [lkey(l), l]));
  const plus = [], upd = [], minus = [];
  for (const [key, l] of neu) {
    const a = alt.get(key);
    if (!a) plus.push(l);
    else if (['anrede', 'lj', 'beruf', 'sem', 'name', 'vorname'].some(f => (a[f] || '') !== (l[f] || ''))) upd.push(l);
  }
  for (const [key, a] of alt) if (!neu.has(key)) minus.push(a);
  const betroffen = minus.map(a => ({ a, n: S.durchf.reduce((s, d) => s + d.kandidaten.filter(k => k.lid === a.id).length, 0) }));
  const liste = arr => arr.map(l => `${esc(l.name)} ${esc(l.vorname)}`).join(', ');

  modal(`<h2 style="margin-top:0">Import prüfen</h2>
    <p class="muted small">Datei «${esc(file.name)}», Blatt «${esc(res.blatt)}»: ${res.lernende.length} Lernende gefunden.</p>
    <p>➕ <b>${plus.length} neu</b>${plus.length ? ': ' + liste(plus) : ''}</p>
    <p>✏️ <b>${upd.length} geändert</b>${upd.length ? ': ' + liste(upd) : ''}</p>
    <p style="color:var(--bad)">🗑 <b>${minus.length} werden gelöscht</b>${minus.length ? ': ' + betroffen.map(x => `${esc(x.a.name)} ${esc(x.a.vorname)}${x.n ? ` (${x.n} Bewertung${x.n > 1 ? 'en' : ''})` : ''}`).join(', ') : ''}</p>
    ${minus.length ? `<label class="row" style="margin:10px 0"><input type="checkbox" id="bkVor" checked style="width:22px;height:22px"> Vorher Sicherung herunterladen</label>` : ''}
    <div class="row" style="margin-top:14px"><div class="spacer"></div><button class="btn" id="cx">Abbrechen</button>
    <button class="btn primary" id="ok" ${plus.length + upd.length + minus.length ? '' : 'disabled'}>Übernehmen</button></div>`, m => {
    m.querySelector('#cx').onclick = closeModal;
    m.querySelector('#ok').onclick = async () => {
      if (minus.length && m.querySelector('#bkVor').checked) await exportBackup();
      for (const l of [...plus, ...upd]) {
        const a = alt.get(lkey(l));
        await dbPut('lernende', Object.assign({ id: a ? a.id : uid('l') }, l));
      }
      const weg = new Set(minus.map(a => a.id));
      for (const a of minus) await dbDel('lernende', a.id);
      for (const d of [...S.durchf]) {
        const vorher = d.kandidaten.length;
        d.kandidaten = d.kandidaten.filter(k => !weg.has(k.lid));
        if (!d.kandidaten.length) { await dbDel('durchf', d.id); S.durchf = S.durchf.filter(x => x !== d); if (S.dfId === d.id) S.dfId = null; }
        else if (d.kandidaten.length !== vorher) await dbPut('durchf', d);
      }
      S.lernende = (await dbAll('lernende')).sort(sortLern);
      closeModal();
      render();
    };
  });
}

/* ---------- Vorlagen ---------- */
function renderVorlagen() {
  if (S.editVorlage) return renderVorlageEditor();
  $('#view').innerHTML = `
    <h1>Bewertungsvorlagen</h1>
    <div class="row" style="margin-bottom:12px"><button class="btn primary" id="neu">＋ Neue Vorlage</button></div>
    <p class="muted small">Änderungen an einer Vorlage wirken nur auf neu eröffnete Prüfungen. Bereits eröffnete Prüfungen behalten ihren Stand.</p>
    <div class="card list">${S.vorlagen.length ? [...S.vorlagen].sort((a, b) => a.titel.localeCompare(b.titel, 'de')).map(v => `
      <div class="item" data-id="${v.id}"><div class="grow"><div class="title">${esc(v.titel)}</div>
      <div class="muted small">${v.teile.map(t => `${esc(t.titel)} ${fmtP(teilMax(t))} P.${+t.gewicht !== 1 ? ' (' + fmtP(t.gewicht) + '×)' : ''}`).join(' · ')}</div></div>
      <button class="btn small" data-a="ed">Bearbeiten</button><button class="btn small" data-a="cp">Kopieren</button>
      <button class="btn small danger" data-a="del">Löschen</button></div>`).join('') : '<div class="muted">Keine Vorlagen.</div>'}</div>`;
  $('#neu').onclick = () => { S.editVorlage = { id: uid('v'), titel: '', teile: [neuerTeil('kriterien')] }; render(); };
  $$('#view .item[data-id]').forEach(it => {
    const v = S.vorlagen.find(x => x.id === it.dataset.id);
    it.querySelector('[data-a=ed]').onclick = () => { S.editVorlage = clone(v); render(); };
    it.querySelector('[data-a=cp]').onclick = () => { const c = clone(v); c.id = uid('v'); c.titel += ' (Kopie)'; S.editVorlage = c; render(); };
    it.querySelector('[data-a=del]').onclick = async () => {
      if (!await confirmDlg(`Vorlage «${esc(v.titel)}» löschen? Eröffnete Prüfungen bleiben erhalten.`, 'Löschen', true)) return;
      await dbDel('vorlagen', v.id); S.vorlagen = S.vorlagen.filter(x => x !== v); render();
    };
  });
}
function neuerTeil(modus) {
  return modus === 'total' ? { id: uid('t'), titel: '', gewicht: 1, modus, max: 0, kriterien: [] }
    : { id: uid('t'), titel: '', gewicht: 1, modus, kriterien: [{ id: uid('k'), text: '', max: 4 }] };
}
function renderVorlageEditor() {
  const v = S.editVorlage;
  $('#view').innerHTML = `
    <h1>Vorlage bearbeiten</h1>
    <label class="field"><span>Titel (erscheint als «Bewertung …» auf dem Blatt)</span><input type="text" id="vT" value="${esc(v.titel)}" placeholder="z.B. Eintrittstest MOE 3. Lehrjahr"></label>
    ${v.teile.map((t, ti) => `<div class="teil-ed" data-ti="${ti}">
      <div class="row" style="margin-bottom:8px">
        <input type="text" data-f="titel" value="${esc(t.titel)}" placeholder="Teil, z.B. Schema" style="flex:2;min-width:160px">
        <label class="row small" style="gap:4px">Gewicht <input type="number" data-f="gewicht" inputmode="decimal" step="0.5" min="0" value="${t.gewicht}" style="width:80px"></label>
        <select data-f="modus" style="width:auto"><option value="kriterien" ${t.modus === 'kriterien' ? 'selected' : ''}>Mit Kriterien</option><option value="total" ${t.modus === 'total' ? 'selected' : ''}>Nur Totalpunkte</option></select>
        <button class="iconbtn" data-a="up" title="nach oben">↑</button><button class="iconbtn" data-a="dn" title="nach unten">↓</button>
        <button class="iconbtn" data-a="rm" title="Teil löschen" style="color:var(--bad)">✕</button>
      </div>
      ${t.modus === 'total' ? `<label class="row small">Maximale Punkte <input type="number" data-f="max" inputmode="decimal" step="0.5" min="0" value="${t.max}" style="width:110px"></label>`
      : `<div class="small muted krit-ed"><span>Kriterium</span><span>Max. Punkte</span><span></span></div>
        ${t.kriterien.map((k, ki) => `<div class="krit-ed" data-ki="${ki}"><input type="text" data-k="text" value="${esc(k.text)}" placeholder="Kriterium">
          <input type="number" data-k="max" inputmode="decimal" min="0" step="1" value="${k.max}">
          <div class="row" style="gap:4px;flex-wrap:nowrap"><button class="iconbtn" data-ka="up">↑</button><button class="iconbtn" data-ka="dn">↓</button><button class="iconbtn" data-ka="rm" style="color:var(--bad)">✕</button></div></div>`).join('')}
        <div class="row"><button class="btn small" data-a="addk">＋ Kriterium</button><span class="muted small">Total: ${fmtP(teilMax(t))} Punkte</span></div>`}
    </div>`).join('')}
    <div class="row" style="margin-bottom:16px"><button class="btn" id="addT">＋ Teil mit Kriterien</button><button class="btn" id="addTT">＋ Teil nur Totalpunkte</button></div>
    <div class="row"><div class="spacer"></div><button class="btn" id="cx">Abbrechen</button><button class="btn primary" id="sv">Speichern</button></div>`;

  $('#vT').oninput = e => v.titel = e.target.value;
  $$('.teil-ed').forEach(box => {
    const ti = +box.dataset.ti, t = v.teile[ti];
    box.querySelectorAll('[data-f]').forEach(inp => inp.onchange = inp.oninput = () => {
      const f = inp.dataset.f;
      if (f === 'modus') {
        if (inp.value === t.modus) return;
        t.modus = inp.value;
        if (t.modus === 'total') t.max = teilMax({ modus: 'kriterien', kriterien: t.kriterien }) || 0;
        else if (!t.kriterien.length) t.kriterien = [{ id: uid('k'), text: '', max: 4 }];
        return renderVorlageEditor();
      }
      t[f] = f === 'titel' ? inp.value : (inp.value === '' ? 0 : +inp.value);
    });
    box.querySelector('[data-a=up]').onclick = () => { if (ti > 0) { v.teile.splice(ti - 1, 0, v.teile.splice(ti, 1)[0]); renderVorlageEditor(); } };
    box.querySelector('[data-a=dn]').onclick = () => { if (ti < v.teile.length - 1) { v.teile.splice(ti + 1, 0, v.teile.splice(ti, 1)[0]); renderVorlageEditor(); } };
    box.querySelector('[data-a=rm]').onclick = async () => { if (await confirmDlg(`Teil «${esc(t.titel || 'ohne Titel')}» entfernen?`, 'Entfernen', true)) { v.teile.splice(ti, 1); renderVorlageEditor(); } };
    const addk = box.querySelector('[data-a=addk]');
    if (addk) addk.onclick = () => { t.kriterien.push({ id: uid('k'), text: '', max: 4 }); renderVorlageEditor(); const ins = $$(`.teil-ed[data-ti="${ti}"] [data-k=text]`); ins[ins.length - 1].focus(); };
    box.querySelectorAll('.krit-ed[data-ki]').forEach(row => {
      const ki = +row.dataset.ki, k = t.kriterien[ki];
      row.querySelector('[data-k=text]').oninput = e => k.text = e.target.value;
      row.querySelector('[data-k=max]').oninput = e => { k.max = e.target.value === '' ? 0 : +e.target.value; };
      row.querySelector('[data-k=max]').onchange = () => renderVorlageEditor();
      row.querySelector('[data-ka=up]').onclick = () => { if (ki > 0) { t.kriterien.splice(ki - 1, 0, t.kriterien.splice(ki, 1)[0]); renderVorlageEditor(); } };
      row.querySelector('[data-ka=dn]').onclick = () => { if (ki < t.kriterien.length - 1) { t.kriterien.splice(ki + 1, 0, t.kriterien.splice(ki, 1)[0]); renderVorlageEditor(); } };
      row.querySelector('[data-ka=rm]').onclick = () => { t.kriterien.splice(ki, 1); renderVorlageEditor(); };
    });
  });
  $('#addT').onclick = () => { v.teile.push(neuerTeil('kriterien')); renderVorlageEditor(); };
  $('#addTT').onclick = () => { v.teile.push(neuerTeil('total')); renderVorlageEditor(); };
  $('#cx').onclick = () => { S.editVorlage = null; render(); };
  $('#sv').onclick = async () => {
    if (!v.titel.trim()) return alertDlg('Bitte einen Titel eingeben.');
    if (!v.teile.length) return alertDlg('Die Vorlage braucht mindestens einen Teil.');
    for (const t of v.teile) {
      if (!t.titel.trim()) return alertDlg('Jeder Teil braucht einen Titel.');
      if (t.modus === 'kriterien') {
        t.kriterien = t.kriterien.filter(k => k.text.trim());
        if (!t.kriterien.length) return alertDlg(`Teil «${esc(t.titel)}» hat keine Kriterien.`);
      }
      if (!teilMax(t)) return alertDlg(`Teil «${esc(t.titel)}» hat 0 Punkte.`);
    }
    await dbPut('vorlagen', v);
    S.vorlagen = await dbAll('vorlagen');
    S.editVorlage = null; render();
  };
}

/* ---------- Optionen / Sicherung ---------- */
function renderOptionen() {
  $('#view').innerHTML = `
    <h1>Optionen</h1>
    <div class="card">
      <h2 style="margin-top:0">💾 Sicherung</h2>
      <p class="muted small">Alle Daten (Lernende, Vorlagen, Prüfungen und Bewertungen) als eine Datei sichern, z.B. in Google Drive.
      Die Daten liegen sonst nur auf diesem Gerät.</p>
      <p>Letzte Sicherung: <b>${S.meta.lastBackup ? new Date(S.meta.lastBackup).toLocaleString('de-CH') : 'noch nie'}</b></p>
      <div class="row"><button class="btn primary" id="bk">Sicherung herunterladen</button>
      <button class="btn" id="rs">Sicherung wiederherstellen …</button><input type="file" id="rsFile" accept=".json,application/json" hidden></div>
    </div>
    <div class="card small muted">Beurteilung Lernende · Version ${APP_VERSION} · ${S.lernende.length} Lernende, ${S.vorlagen.length} Vorlagen, ${S.durchf.length} Prüfungen</div>`;
  $('#bk').onclick = exportBackup;
  $('#rs').onclick = () => $('#rsFile').click();
  $('#rsFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) restoreBackup(f); };
}
async function exportBackup() {
  await saveDf(true);
  const data = { app: 'beurteilung', version: 1, erstellt: new Date().toISOString(),
    lernende: S.lernende, vorlagen: S.vorlagen, durchf: S.durchf };
  const name = `Beurteilung_Sicherung_${heute()}.json`;
  await dateiAusgeben(new Blob([JSON.stringify(data)], { type: 'application/json' }), name);
  S.meta.lastBackup = new Date().toISOString();
  await saveMeta();
  if (S.view === 'uebersicht' || S.view === 'optionen') render();
}
async function restoreBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { return alertDlg('Die Datei ist keine gültige Sicherung.'); }
  if (data.app !== 'beurteilung' || !Array.isArray(data.lernende)) return alertDlg('Die Datei ist keine Sicherung dieser App.');
  if (!await confirmDlg(`Sicherung vom ${new Date(data.erstellt).toLocaleString('de-CH')} wiederherstellen?<br>
    (${data.lernende.length} Lernende, ${data.vorlagen.length} Vorlagen, ${data.durchf.length} Prüfungen)<br><br>
    <b>Alle aktuellen Daten auf diesem Gerät werden ersetzt.</b>`, 'Wiederherstellen', true)) return;
  for (const st of ['lernende', 'vorlagen', 'durchf']) {
    await dbClear(st);
    for (const x of data[st]) await dbPut(st, x);
  }
  S.dfId = null; await saveNav();
  await load();
  go('uebersicht');
}

/* Datei an den Benutzer geben: Teilen-Dialog (iPad) oder Download */
async function dateiAusgeben(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPad|iPhone|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

/* ---------- PDF Beurteilungsblatt ---------- */
const LOGOS = {};
async function ladeLogos() {
  const f = async n => {
    if (LOGOS[n]) return LOGOS[n];
    const b = await (await fetch(n)).blob();
    const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = url; });
    return LOGOS[n] = { url, w: img.naturalWidth, h: img.naturalHeight };
  };
  return { logo: await f('logo-burkhalter.jpg'), absender: await f('logo-absender.jpg'), tagline: await f('logo-tagline.jpg'), group: await f('logo-group.jpg') };
}

async function pdfErstellen(d, kandidaten) {
  const L = await ladeLogos();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const v = d.vorlage;
  const ML = 15, MR = 15, PW = 210, W = PW - ML - MR, TOP = 34, BOTTOM = 276;
  const C = { k: ML, p: ML + 92, e: ML + 110, b: ML + 128 };   // Spalten: Kriterium, Punkte, Erreicht, Bemerkung
  const BEMW = ML + W - C.b - 1;
  const gewAnders = v.teile.some(t => +t.gewicht !== 1);

  const kopf = () => {
    const img = (o, x, y, h) => doc.addImage(o.url, 'JPEG', x, y, h * o.w / o.h, h);
    img(L.absender, ML, 9, 13);
    const lw = 15 * L.logo.w / L.logo.h; img(L.logo, PW - MR - lw, 8, 15);
    img(L.tagline, ML, 283, 4.2);
    const gw = 7 * L.group.w / L.group.h; img(L.group, PW - MR - gw, 281, 7);
  };

  kandidaten.forEach((k, ki) => {
    if (ki > 0) doc.addPage();
    kopf();
    const l = lernById(k.lid) || { name: '', vorname: '' };
    let y = TOP;
    const neueSeite = () => { doc.addPage(); kopf(); y = TOP; };
    const platz = h => { if (y + h > BOTTOM) neueSeite(); };

    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text('Bewertung ' + v.titel, ML, y); y += 8;
    doc.setFontSize(11); doc.setFont('helvetica', 'normal');
    doc.text(`Name: ${l.name} ${l.vorname}`, ML, y);
    doc.text(`Datum: ${datumCH(d.datum)}`, C.p, y); y += 8;

    const zeile = (txt, p, e, bem, opt = {}) => {
      doc.setFontSize(9.5);
      doc.setFont('helvetica', opt.bold ? 'bold' : 'normal');
      const tl = doc.splitTextToSize(txt, C.p - C.k - 3);
      doc.setFontSize(8.5);
      const bl = bem ? doc.splitTextToSize(bem, BEMW) : [];
      const h = Math.max(tl.length * 4.2, bl.length * 3.7) + 1.8;
      platz(h);
      if (opt.fill) { doc.setFillColor(...opt.fill); doc.rect(ML, y, W, h, 'F'); }
      doc.setFontSize(9.5); doc.setFont('helvetica', opt.bold ? 'bold' : 'normal');
      doc.text(tl, C.k + 1, y + 4);
      if (p !== '') doc.text(String(p), C.e - 3, y + 4, { align: 'right' });
      if (e !== '') doc.text(String(e), C.b - 3, y + 4, { align: 'right' });
      if (bl.length) { doc.setFontSize(8.5); doc.setFont('helvetica', 'italic'); doc.text(bl, C.b + 1, y + 3.8); }
      y += h;
      doc.setDrawColor(215); doc.setLineWidth(0.2); doc.line(ML, y, ML + W, y);
    };

    for (const t of v.teile) {
      const st = teilStand(t, k), note = teilNote(t, k);
      platz(5.8 + 6 * 2 + (t.modus === 'total' ? 6 : 6 * Math.min(3, t.kriterien.length)));
      y += 2;
      zeile('Bewertung ' + t.titel + (gewAnders ? `  (Gewicht ${fmtP(t.gewicht)}×)` : ''), 'Punkte', 'Erreicht', '', { bold: true, fill: [255, 237, 0] });
      if (t.modus === 'total') {
        zeile('Erreichte Punkte', fmtP(t.max), fmtP(k.tot[t.id]), k.b[t.id] || '');
      } else {
        for (const kr of t.kriterien) zeile(kr.text, fmtP(kr.max), fmtP(k.p[kr.id]), k.b[kr.id] || '');
        zeile('Total', fmtP(st.max), fmtP(st.err), '', { bold: true });
      }
      zeile('Note', '', fmt1(note), '', { bold: true, fill: [240, 241, 243] });
      y += 3;
    }

    platz(12);
    y += 1;
    doc.setFillColor(27, 30, 35); doc.rect(ML, y, W, 9, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text('Gesamtnote', ML + 2, y + 6.2);
    doc.setTextColor(255, 237, 0); doc.text(fmt1(gesamtNote(v, k)), C.b - 3, y + 6.2, { align: 'right' });
    doc.setTextColor(0);
    y += 14;

    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    const bl = doc.splitTextToSize(k.bem || '', W - 4);
    const bh = Math.max(22, bl.length * 4.6 + 10);
    platz(bh);
    doc.setDrawColor(150); doc.setLineWidth(0.3); doc.rect(ML, y, W, bh);
    doc.setFont('helvetica', 'bold'); doc.text('Bemerkungen', ML + 2, y + 5);
    doc.setFont('helvetica', 'normal'); if (bl.length) doc.text(bl, ML + 2, y + 10.5);
    y += bh;
  });

  const l0 = lernById(kandidaten[0].lid) || {};
  const name = (kandidaten.length === 1 ? `Beurteilung ${v.titel} ${l0.name} ${l0.vorname}` : `Beurteilung ${v.titel} alle`).replace(/[\\/:*?"<>|]/g, '') + '.pdf';
  await dateiAusgeben(doc.output('blob'), name);
}

/* ---------- Start ---------- */
(async () => {
  await load();
  if (S.dfId && curDf()) S.view = 'bewerten'; else S.dfId = null;
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && location.hostname !== 'localhost') navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();

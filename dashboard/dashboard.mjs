// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Alessandro (dado) Scapuzzi <dado70@gmail.com>

import {
  DAY_MS, ageInDays, buildCsv, filterRows, severity, sortRows
} from '../src/core.mjs';
import { t, localizeDocument, formatDateTime, toDateInput, fromDateInput } from '../src/i18n.mjs';
import { icon } from '../src/icons.mjs';
import { scan, ScanAborted } from '../src/scanner.mjs';
import * as store from '../src/store.mjs';
import { listTags, openMessage, replyToMessage, setMessageTags } from '../src/actions.mjs';

const $ = id => document.getElementById(id);

const state = {
  settings: null,
  notes: {},
  ignored: {},
  tags: [],
  scan: null,
  filters: { view: 'pending', text: '', account: '', type: '', tag: '', severity: '', hideTransactional: false },
  sort: { key: 'age', dir: 'desc' },
  abort: null,
  visible: []
};

// ---------------------------------------------------------------- helpers

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...children.filter(c => c !== null && c !== undefined));
  return node;
}

let toastTimer;
function toast(message, isError = false) {
  const box = $('toast');
  box.textContent = message;
  box.classList.toggle('error', isError);
  box.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.add('hidden'), isError ? 7000 : 3500);
}

function errorMessage(e) {
  const known = {
    'no-receive-folders': 'errNoReceiveFolders',
    'message-not-found': 'errMessageNotFound',
    'invalid-backup': 'errInvalidBackup'
  };
  return known[e?.message] ? t(known[e.message]) : t('errGeneric', [e?.message || String(e)]);
}

const tagByKey = key => state.tags.find(tg => tg.key === key);

// ---------------------------------------------------------------- data

function allRows() {
  const now = Date.now();
  const { warningDays, criticalDays } = state.settings;
  const rows = (state.scan?.rows || []).map(r => {
    const days = ageInDays(r.date, now);
    return {
      ...r,
      days,
      severity: severity(days, warningDays, criticalDays),
      ignored: Boolean(r.headerMessageId && state.ignored[r.headerMessageId]),
      note: r.headerMessageId ? state.notes[r.headerMessageId]?.text || '' : ''
    };
  });
  // Ignored messages outside the scanned range are still listed in the
  // "ignored" view, so they can always be restored.
  const inScan = new Set(rows.map(r => r.headerMessageId));
  for (const [hmid, info] of Object.entries(state.ignored)) {
    if (inScan.has(hmid)) continue;
    const days = ageInDays(info.date, now);
    rows.push({
      headerMessageId: hmid, author: info.author, authorName: info.author, authorEmail: '',
      subject: info.subject, date: info.date, accountId: '', accountName: '', folderName: '',
      folderPath: '', tags: [], read: true, transactional: false, days,
      severity: severity(days, warningDays, criticalDays), ignored: true, outOfRange: true,
      note: state.notes[hmid]?.text || ''
    });
  }
  return rows;
}

// ---------------------------------------------------------------- render

function renderHeader() {
  const s = state.scan;
  $('lastScan').textContent = s
    ? t('lastScanInfo', [formatDateTime(s.at), String(s.stats.receivedMessages), String(s.stats.sentMessages)])
    : t('neverScanned');
  if (s?.stats.headerErrors) {
    $('lastScan').textContent += ' · ' + t('headerErrors', [String(s.stats.headerErrors)]);
  }
}

function renderStats(rows) {
  const pending = rows.filter(r => !r.ignored && !(state.filters.hideTransactional && r.transactional));
  $('statPending').textContent = state.scan ? pending.length : '–';
  $('statCritical').textContent = state.scan ? pending.filter(r => r.severity === 'critical').length : '–';
  $('statWarning').textContent = state.scan ? pending.filter(r => r.severity === 'warning').length : '–';
  $('statTransactional').textContent = state.scan ? rows.filter(r => !r.ignored && r.transactional).length : '–';
  $('statCriticalLabel').textContent = t('statCritical', [String(state.settings.criticalDays)]);
  $('statWarningLabel').textContent = t('statWarning', [String(state.settings.warningDays)]);
  for (const b of document.querySelectorAll('[data-filter-severity]')) {
    b.setAttribute('aria-pressed', String(b.dataset.filterSeverity === state.filters.severity && state.scan !== null));
  }
}

function renderFilterOptions(rows) {
  const accSel = $('filterAccount');
  const accounts = new Map();
  for (const r of rows) if (r.accountId) accounts.set(r.accountId, r.accountName);
  const keepAcc = accSel.value;
  accSel.replaceChildren(el('option', { value: '', text: t('all') }),
    ...[...accounts].map(([id, name]) => el('option', { value: id, text: name })));
  accSel.value = accounts.has(keepAcc) ? keepAcc : '';

  const tagSel = $('filterTag');
  const keepTag = tagSel.value;
  tagSel.replaceChildren(el('option', { value: '', text: t('all') }),
    ...state.tags.map(tg => el('option', { value: tg.key, text: tg.tag })));
  tagSel.value = state.tags.some(tg => tg.key === keepTag) ? keepTag : '';
}

function actionButton(name, label, onClick, disabled = false) {
  const b = el('button', { type: 'button', class: 'icon-only', title: label, 'aria-label': label, disabled, onclick: onClick });
  b.append(icon(name));
  return b;
}

function renderRow(r) {
  const ageLabel = r.days === 1 ? t('dayOne') : t('dayMany', [String(r.days)]);
  const tagsCell = el('td', { class: 'tags' }, ...r.tags.map(key => {
    const tg = tagByKey(key);
    const dot = el('span', { class: 'dot' });
    if (tg) dot.style.backgroundColor = tg.color;
    return el('span', { class: 'tag-chip' }, dot, tg ? tg.tag : key);
  }));
  const subjectCell = el('td', { class: 'subject' }, r.subject || t('noSubject'));
  if (r.note) subjectCell.append(el('span', { class: 'note', text: r.note }));

  const noHeaderId = !r.headerMessageId;
  const outOfRange = Boolean(r.outOfRange);
  const group = el('span', { class: 'group' },
    actionButton('mail-opened', t('actionOpen'), () => run(() => openMessage(r))),
    actionButton('arrow-back-up', t('actionReply'), () => run(() => replyToMessage(r))),
    actionButton('tag', t('actionTags'), () => openTagDialog(r), outOfRange),
    actionButton('note', t('actionNote'), () => openNoteDialog(r), noHeaderId),
    r.ignored
      ? actionButton('restore', t('actionRestore'), () => toggleIgnore(r, false))
      : actionButton('eye-off', t('actionIgnore'), () => toggleIgnore(r, true), noHeaderId)
  );

  const folder = r.outOfRange
    ? el('td', { class: 'small muted', text: t('outOfRange') })
    : el('td', { class: 'small' }, el('span', { text: r.accountName }), el('br'), el('span', { class: 'muted', text: r.folderName }));

  return el('tr', { class: r.read ? '' : 'unread' },
    el('td', {}, el('span', { class: `badge ${r.severity}`, text: ageLabel })),
    el('td', { class: 'author' }, r.authorName || r.author, r.authorEmail && r.authorEmail !== r.authorName
      ? el('span', { class: 'email', text: r.authorEmail }) : null),
    subjectCell,
    el('td', { class: 'when', text: r.date ? formatDateTime(r.date) : '' }),
    folder,
    tagsCell,
    el('td', {}, r.transactional
      ? el('span', { class: 'badge transactional', text: t('typeTransactional') })
      : el('span', { class: 'badge action', text: t('typeAction') })),
    el('td', { class: 'actions' }, group)
  );
}

function render() {
  const rows = allRows();
  renderHeader();
  renderStats(rows);
  renderFilterOptions(rows);

  const visible = sortRows(filterRows(rows, state.filters), state.sort.key, state.sort.dir);
  state.visible = visible;
  $('results').replaceChildren(...visible.map(renderRow));

  const empty = $('emptyState');
  if (!state.scan && state.filters.view === 'pending') empty.textContent = t('emptyNoScan');
  else if (!visible.length) empty.textContent = state.filters.view === 'ignored' ? t('emptyIgnored') : t('emptyAllDone');
  empty.classList.toggle('hidden', visible.length > 0);
  $('countLabel').textContent = t('countShown', [String(visible.length)]);
  $('exportBtn').disabled = visible.length === 0;

  for (const th of document.querySelectorAll('th[data-sort]')) {
    th.setAttribute('aria-sort', th.dataset.sort === state.sort.key
      ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
  }
  for (const b of document.querySelectorAll('[data-view]')) {
    b.setAttribute('aria-pressed', String(b.dataset.view === state.filters.view));
  }
}

// ---------------------------------------------------------------- actions

async function run(fn) {
  try {
    await fn();
  } catch (e) {
    console.error(e);
    toast(errorMessage(e), true);
  }
}

async function toggleIgnore(r, ignore) {
  await run(async () => {
    state.ignored = await store.setIgnored(r.headerMessageId,
      ignore ? { subject: r.subject, author: r.author, date: r.date } : null);
    render();
    toast(ignore ? t('toastIgnored') : t('toastRestored'));
  });
}

async function persistRowTags(r) {
  const cached = state.scan?.rows.find(x => (r.headerMessageId
    ? x.headerMessageId === r.headerMessageId
    : !x.headerMessageId && x.id === r.id));
  if (cached) {
    cached.tags = [...r.tags];
    cached.id = r.id;
    await store.saveLastScan(state.scan);
  }
}

let dialogRow = null;

async function openTagDialog(r) {
  await run(async () => {
    state.tags = await listTags();
    dialogRow = r;
    $('tagDialogSubject').textContent = r.subject || t('noSubject');
    $('tagList').replaceChildren(...(state.tags.length ? state.tags.map(tg => {
      const dot = el('span', { class: 'dot' });
      dot.style.backgroundColor = tg.color;
      return el('label', { class: 'tag-option' },
        el('input', { type: 'checkbox', value: tg.key, checked: r.tags.includes(tg.key) }), dot, tg.tag);
    }) : [el('p', { class: 'muted', text: t('noTags') })]));
    $('tagDialog').returnValue = '';
    $('tagDialog').showModal();
  });
}

async function onTagDialogClose() {
  const dlg = $('tagDialog');
  if (dlg.returnValue !== 'save' || !dialogRow) return;
  const r = dialogRow;
  const checked = [...$('tagList').querySelectorAll('input:checked')].map(i => i.value);
  // Keep tags unknown to the list (e.g. deleted tags) as they were.
  const known = new Set(state.tags.map(tg => tg.key));
  const tags = [...r.tags.filter(k => !known.has(k)), ...checked];
  await run(async () => {
    await setMessageTags(r, tags);
    await persistRowTags(r);
    render();
    toast(t('toastTagsSaved'));
  });
}

function openNoteDialog(r) {
  dialogRow = r;
  $('noteDialogSubject').textContent = r.subject || t('noSubject');
  $('noteText').value = r.note || '';
  $('noteDialog').returnValue = '';
  $('noteDialog').showModal();
}

async function onNoteDialogClose() {
  const dlg = $('noteDialog');
  if (!dialogRow || !['save', 'delete'].includes(dlg.returnValue)) return;
  const text = dlg.returnValue === 'delete' ? '' : $('noteText').value;
  await run(async () => {
    state.notes = await store.setNote(dialogRow.headerMessageId, text);
    render();
    toast(text.trim() ? t('toastNoteSaved') : t('toastNoteDeleted'));
  });
}

// ---------------------------------------------------------------- scan

function setScanning(on) {
  for (const id of ['startDate', 'endDate', 'scanBtn']) $(id).disabled = on;
  for (const b of document.querySelectorAll('[data-range]')) b.disabled = on;
  $('cancelBtn').classList.toggle('hidden', !on);
  $('progress').classList.toggle('hidden', !on);
}

function onProgress(p) {
  const bar = $('progressBar');
  if (p.total) {
    bar.max = p.total;
    bar.value = p.done;
  } else {
    bar.removeAttribute('value');
  }
  const key = { sent: 'progressSent', headers: 'progressHeaders', inbox: 'progressInbox' }[p.phase];
  $('progressText').textContent = t(key, [String(p.done), String(p.total ?? '')]);
}

async function startScan(ev) {
  ev.preventDefault();
  const startVal = $('startDate').value;
  const endVal = $('endDate').value;
  if (!startVal || !endVal) return;
  const startDate = fromDateInput(startVal);
  const endDate = fromDateInput(endVal, true);
  if (startDate > endDate) {
    toast(t('errDateOrder'), true);
    return;
  }
  state.abort = new AbortController();
  setScanning(true);
  onProgress({ phase: 'sent', done: 0 });
  try {
    state.settings = await store.loadSettings();
    state.scan = await scan({
      startDate, endDate, settings: state.settings, onProgress, signal: state.abort.signal
    });
    state.tags = await listTags();
    render();
    toast(t('toastScanDone', [String(state.scan.rows.length)]));
  } catch (e) {
    if (e instanceof ScanAborted) toast(t('toastScanCancelled'));
    else {
      console.error(e);
      toast(errorMessage(e), true);
    }
  } finally {
    state.abort = null;
    setScanning(false);
  }
}

function setRange(days) {
  const end = new Date();
  const start = new Date(end.getTime() - days * DAY_MS);
  $('startDate').value = toDateInput(start);
  $('endDate').value = toDateInput(end);
}

// ---------------------------------------------------------------- export

async function exportCsv() {
  await run(async () => {
    const sep = messenger.i18n.getUILanguage().startsWith('it') ? ';' : ',';
    const headers = ['csvDays', 'csvName', 'csvEmail', 'csvSubject', 'csvDate', 'csvAccount', 'csvFolder',
      'csvTags', 'csvType', 'csvNote'].map(k => t(k));
    const rows = state.visible.map(r => [
      r.days, r.authorName, r.authorEmail, r.subject, r.date ? formatDateTime(r.date) : '',
      r.accountName, r.folderPath, r.tags.map(k => tagByKey(k)?.tag || k).join(', '),
      r.transactional ? t('typeTransactional') : t('typeAction'), r.note
    ]);
    // The BOM makes spreadsheet applications detect UTF-8.
    const blob = new Blob(['﻿', buildCsv(headers, rows, sep)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      await messenger.downloads.download({
        url, filename: `unanswered-emails-${toDateInput(new Date())}.csv`, saveAs: true
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  });
}

// ---------------------------------------------------------------- init

function decorateButtons() {
  for (const b of document.querySelectorAll('button[data-icon]')) b.prepend(icon(b.dataset.icon));
}

function bindFilters() {
  const f = state.filters;
  $('filterText').addEventListener('input', e => { f.text = e.target.value; render(); });
  $('filterAccount').addEventListener('change', e => { f.account = e.target.value; render(); });
  $('filterType').addEventListener('change', e => { f.type = e.target.value; render(); });
  $('filterTag').addEventListener('change', e => { f.tag = e.target.value; render(); });
  $('hideTransactional').addEventListener('change', e => { f.hideTransactional = e.target.checked; render(); });
  for (const b of document.querySelectorAll('[data-view]')) {
    b.addEventListener('click', () => { f.view = b.dataset.view; render(); });
  }
  for (const b of document.querySelectorAll('[data-filter-severity]')) {
    b.addEventListener('click', () => {
      const sev = b.dataset.filterSeverity;
      f.severity = f.severity === sev ? '' : sev;
      render();
    });
  }
  for (const th of document.querySelectorAll('th[data-sort]')) {
    th.querySelector('button').addEventListener('click', () => {
      const key = th.dataset.sort;
      state.sort = state.sort.key === key
        ? { key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'age' || key === 'date' ? 'desc' : 'asc' };
      render();
    });
  }
}

async function init() {
  localizeDocument();
  decorateButtons();
  [state.settings, state.notes, state.ignored, state.scan, state.tags] = await Promise.all([
    store.loadSettings(), store.loadNotes(), store.loadIgnored(), store.loadLastScan(), listTags()
  ]);
  state.filters.hideTransactional = state.settings.hideTransactional;
  $('hideTransactional').checked = state.settings.hideTransactional;

  if (state.scan) {
    $('startDate').value = toDateInput(new Date(state.scan.startDate));
    $('endDate').value = toDateInput(new Date());
  } else {
    setRange(state.settings.defaultRangeDays);
  }

  $('scanForm').addEventListener('submit', startScan);
  $('cancelBtn').addEventListener('click', () => state.abort?.abort());
  for (const b of document.querySelectorAll('[data-range]')) {
    b.addEventListener('click', () => setRange(Number(b.dataset.range)));
  }
  $('exportBtn').addEventListener('click', exportCsv);
  $('optionsBtn').addEventListener('click', () => messenger.runtime.openOptionsPage());
  $('tagDialog').addEventListener('close', onTagDialogClose);
  $('noteDialog').addEventListener('close', onNoteDialogClose);
  bindFilters();

  // Settings, notes or ignored list changed in the options page (or import).
  messenger.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes[store.KEYS.settings]) state.settings = await store.loadSettings();
    if (changes[store.KEYS.notes]) state.notes = changes[store.KEYS.notes].newValue || {};
    if (changes[store.KEYS.ignored]) state.ignored = changes[store.KEYS.ignored].newValue || {};
    if (changes[store.KEYS.lastScan] && !changes[store.KEYS.lastScan].newValue) state.scan = null;
    render();
  });

  render();
}

init().catch(e => {
  console.error(e);
  toast(errorMessage(e), true);
});

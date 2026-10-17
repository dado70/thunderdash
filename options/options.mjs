// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Alessandro (dado) Scapuzzi <dado70@gmail.com>

import {
  DEFAULT_TRANSACTIONAL_KEYWORDS, nextOccurrence, parseKeywordList, parseRecipients, sanitizeSchedule
} from '../src/core.mjs';
import { listAccountFolders } from '../src/folders.mjs';
import { t, localizeDocument, toDateInput, formatDateTime } from '../src/i18n.mjs';
import { canSendSilently } from '../src/mailer.mjs';
import { ensureReplyTag } from '../src/actions.mjs';
import * as store from '../src/store.mjs';

const $ = id => document.getElementById(id);
let accounts = [];
let settings = null;
let identities = [];   // [{id, label, email}]
let scheduleState = {};

let toastTimer;
function toast(message, isError = false) {
  const box = $('toast');
  box.textContent = message;
  box.classList.toggle('error', isError);
  box.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.add('hidden'), isError ? 7000 : 3500);
}

async function run(fn) {
  try {
    await fn();
  } catch (e) {
    console.error(e);
    toast(e?.message === 'invalid-backup' ? t('errInvalidBackup') : t('errGeneric', [e?.message || String(e)]), true);
  }
}

function checkbox(folder, kind) {
  const overrides = kind === 'receive' ? settings.receiveOverrides : settings.sentOverrides;
  const def = kind === 'receive' ? folder.defaultReceive : folder.defaultSent;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.dataset.kind = kind;
  input.dataset.key = folder.key;
  input.dataset.default = String(def);
  input.disabled = folder.excluded;
  input.checked = !folder.excluded && (typeof overrides[folder.key] === 'boolean' ? overrides[folder.key] : def);
  input.setAttribute('aria-label', `${t(kind === 'receive' ? 'optReceived' : 'optSent')}: ${folder.accountName} / ${folder.name}`);
  return input;
}

function renderFolders() {
  const rows = [];
  for (const acc of accounts) {
    const head = document.createElement('tr');
    head.className = 'account-row';
    const td = document.createElement('td');
    td.colSpan = 3;
    td.textContent = acc.name;
    head.append(td);
    rows.push(head);
    for (const f of acc.folders) {
      const tr = document.createElement('tr');
      if (f.excluded) tr.className = 'excluded';
      const name = document.createElement('td');
      name.className = 'name';
      name.style.paddingLeft = `${10 + f.depth * 18}px`;
      name.textContent = f.excluded ? `${f.name} (${t('optExcluded')})` : f.name;
      const rc = document.createElement('td');
      rc.append(checkbox(f, 'receive'));
      const sc = document.createElement('td');
      sc.append(checkbox(f, 'sent'));
      tr.append(name, rc, sc);
      rows.push(tr);
    }
  }
  $('folderRows').replaceChildren(...rows);
}

function fillForm() {
  $('warningDays').value = settings.warningDays;
  $('criticalDays').value = settings.criticalDays;
  $('defaultRangeDays').value = settings.defaultRangeDays;
  $('subjectFallback').checked = settings.subjectFallback;
  $('hideTransactional').checked = settings.hideTransactional;
  $('transactionalKeywords').value = settings.transactionalKeywords.join('\n');
  $('customExclusions').value = settings.customExclusions.join('\n');
  $('reportRangeDays').value = settings.reportRangeDays;
  renderFolders();
  renderSchedules(settings.schedules);
}

function readForm() {
  const receiveOverrides = {};
  const sentOverrides = {};
  // Only differences from the default selection are stored, so new folders
  // keep following the defaults.
  for (const input of document.querySelectorAll('#folderRows input[type="checkbox"]')) {
    if (input.disabled) continue;
    if (String(input.checked) === input.dataset.default) continue;
    (input.dataset.kind === 'receive' ? receiveOverrides : sentOverrides)[input.dataset.key] = input.checked;
  }
  return {
    ...settings,
    warningDays: Number($('warningDays').value),
    criticalDays: Number($('criticalDays').value),
    defaultRangeDays: Number($('defaultRangeDays').value),
    subjectFallback: $('subjectFallback').checked,
    hideTransactional: $('hideTransactional').checked,
    transactionalKeywords: parseKeywordList($('transactionalKeywords').value),
    customExclusions: parseKeywordList($('customExclusions').value),
    receiveOverrides,
    sentOverrides,
    reportRangeDays: Number($('reportRangeDays').value),
    schedules: readSchedules()
  };
}

async function save(ev) {
  ev.preventDefault();
  await run(async () => {
    const next = readForm();
    if (next.criticalDays <= next.warningDays) {
      toast(t('errThresholds'), true);
      return;
    }
    const invalid = invalidSchedule();
    if (invalid) {
      toast(t('errScheduleRecipients', [invalid]), true);
      return;
    }
    settings = await store.saveSettings(next);
    fillForm();
    toast(t('toastSettingsSaved'));
  });
}

// ------------------------------------------------------------ schedules

const SCHEDULE_FIELDS = ['enabled', 'label', 'to', 'identityId', 'frequency', 'time', 'weekday', 'monthDay',
  'includeZero', 'excludeTransactional'];

function weekdayNames() {
  const lang = messenger.i18n.getUILanguage();
  // 2024-01-07 was a Sunday: index 0 = Sunday, as Date.getDay().
  return Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 7 + i).toLocaleDateString(lang, { weekday: 'long' }));
}

function field(labelKey, control, hintKey) {
  const label = document.createElement('label');
  label.className = 'field';
  const span = document.createElement('span');
  span.textContent = t(labelKey);
  label.append(span, control);
  if (hintKey) {
    // Always visible (a placeholder disappears as soon as the field has a value).
    const hint = document.createElement('small');
    hint.className = 'hint';
    hint.id = `hint-${crypto.randomUUID()}`;
    hint.textContent = t(hintKey);
    control.setAttribute('aria-describedby', hint.id);
    label.append(hint);
  }
  return label;
}

function input(type, name, value, attrs = {}) {
  const el = document.createElement('input');
  el.type = type;
  el.dataset.field = name;
  if (type === 'checkbox') el.checked = Boolean(value);
  else el.value = value ?? '';
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function select(name, options, value) {
  const el = document.createElement('select');
  el.dataset.field = name;
  for (const [v, text] of options) {
    const o = document.createElement('option');
    o.value = String(v);
    o.textContent = text;
    el.append(o);
  }
  el.value = String(value);
  return el;
}

function checkLabel(control, labelKey) {
  const label = document.createElement('label');
  label.className = 'inline';
  const span = document.createElement('span');
  span.textContent = t(labelKey);
  label.append(control, span);
  return label;
}

function statusText(s) {
  const st = scheduleState[s.id] || {};
  const parts = [];
  if (s.enabled && s.to.length && s.updatedAt) parts.push(t('scheduleNext', [formatDateTime(nextOccurrence(s, Date.now()))]));
  if (st.lastOkAt) parts.push(st.lastSkipped
    ? t('scheduleLastSkipped', [formatDateTime(st.lastOkAt)])
    : t('scheduleLastSent', [formatDateTime(st.lastOkAt), String(st.lastPending ?? 0)]));
  return { text: parts.join(' · ') || t('scheduleNeverSent'), error: st.lastError && (!st.lastOkAt || st.lastErrorAt > st.lastOkAt) ? st.lastError : '' };
}

function renderStatus(container, s) {
  const st = statusText(s);
  container.textContent = st.text;
  if (st.error) {
    const err = document.createElement('div');
    err.className = 'error';
    err.textContent = t('scheduleLastError', [st.error]);
    container.append(err);
  }
}

function scheduleCard(s) {
  const card = document.createElement('fieldset');
  card.className = 'schedule' + (s.enabled ? '' : ' disabled');
  card.dataset.id = s.id;
  card.dataset.updatedAt = String(s.updatedAt || 0);
  card.dataset.original = JSON.stringify(SCHEDULE_FIELDS.map(k => s[k]));

  const legend = document.createElement('legend');
  legend.className = 'visually-hidden';
  legend.textContent = s.label || t('scheduleUntitled');

  const head = document.createElement('div');
  head.className = 'head';
  const enabled = input('checkbox', 'enabled', s.enabled);
  enabled.addEventListener('change', () => card.classList.toggle('disabled', !enabled.checked));
  head.append(checkLabel(enabled, 'scheduleEnabled'),
    input('text', 'label', s.label, { maxlength: '80', placeholder: t('scheduleLabelPlaceholder'), 'aria-label': t('scheduleLabel') }));

  const grid = document.createElement('div');
  grid.className = 'settings-grid';
  const freq = select('frequency', [['daily', t('freqDaily')], ['weekly', t('freqWeekly')], ['monthly', t('freqMonthly')]], s.frequency);
  const weekday = field('scheduleWeekday', select('weekday', weekdayNames().map((n, i) => [i, n]), s.weekday));
  const monthDay = field('scheduleMonthDay', input('number', 'monthDay', s.monthDay, { min: '1', max: '31' }));
  const syncFreq = () => {
    weekday.classList.toggle('hidden', freq.value !== 'weekly');
    monthDay.classList.toggle('hidden', freq.value !== 'monthly');
  };
  freq.addEventListener('change', syncFreq);
  const idOptions = [['', t('scheduleDefaultIdentity')], ...identities.map(i => [i.id, i.label])];
  grid.append(
    field('scheduleTo', input('text', 'to', s.to.join(', '), { placeholder: t('scheduleToPlaceholder') }), 'scheduleToHint'),
    field('scheduleFrom', select('identityId', idOptions, identities.some(i => i.id === s.identityId) ? s.identityId : '')),
    field('scheduleFrequency', freq),
    field('scheduleTime', input('time', 'time', s.time, { required: '' })),
    weekday,
    monthDay
  );
  syncFreq();

  const opts = document.createElement('div');
  opts.className = 'row mt';
  opts.append(
    checkLabel(input('checkbox', 'includeZero', s.includeZero), 'scheduleIncludeZero'),
    checkLabel(input('checkbox', 'excludeTransactional', s.excludeTransactional), 'scheduleExcludeTransactional')
  );

  const status = document.createElement('div');
  status.className = 'status';
  renderStatus(status, s);

  const buttons = document.createElement('div');
  buttons.className = 'buttons';
  const sendNow = document.createElement('button');
  sendNow.type = 'button';
  sendNow.textContent = t('scheduleSendNow');
  sendNow.addEventListener('click', () => sendScheduleNow(s.id, sendNow));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'danger';
  remove.textContent = t('scheduleRemove');
  // Removal takes effect on Save, like every other change on this page.
  remove.addEventListener('click', () => card.remove());
  buttons.append(sendNow, remove);

  card.append(legend, head, grid, opts, status, buttons);
  return card;
}

function renderSchedules(list) {
  $('scheduleList').replaceChildren(...list.map(scheduleCard));
}

function readSchedules() {
  const now = Date.now();
  return [...document.querySelectorAll('#scheduleList .schedule')].map(card => {
    const get = name => card.querySelector(`[data-field="${name}"]`);
    const raw = {
      id: card.dataset.id,
      enabled: get('enabled').checked,
      label: get('label').value.trim(),
      to: parseRecipients(get('to').value),
      identityId: get('identityId').value,
      frequency: get('frequency').value,
      time: get('time').value,
      weekday: Number(get('weekday').value),
      monthDay: Number(get('monthDay').value),
      includeZero: get('includeZero').checked,
      excludeTransactional: get('excludeTransactional').checked
    };
    // A changed schedule restarts from now: past occurrences are not sent.
    const changed = JSON.stringify(SCHEDULE_FIELDS.map(k => raw[k])) !== card.dataset.original;
    raw.updatedAt = changed || !Number(card.dataset.updatedAt) ? now : Number(card.dataset.updatedAt);
    return sanitizeSchedule(raw);
  }).filter(Boolean);
}

/** Returns the label of the first enabled schedule with invalid recipients. */
function invalidSchedule() {
  for (const card of document.querySelectorAll('#scheduleList .schedule')) {
    const get = name => card.querySelector(`[data-field="${name}"]`);
    if (!get('enabled').checked) continue;
    const text = get('to').value;
    const tokens = text.split(/[\s,;]+/).filter(Boolean);
    if (!tokens.length || parseRecipients(text).length !== new Set(tokens.map(x => x.toLowerCase())).size) {
      return get('label').value.trim() || t('scheduleUntitled');
    }
  }
  return '';
}

function addSchedule() {
  const me = identities[0]?.email || '';
  const s = sanitizeSchedule({ id: crypto.randomUUID(), to: me ? [me] : [], updatedAt: 0 });
  $('scheduleList').append(scheduleCard(s));
  $('scheduleList').lastElementChild.querySelector('[data-field="label"]').focus();
}

async function sendScheduleNow(id, button) {
  await run(async () => {
    // Save pending edits first, so the report uses what is on screen.
    const next = readForm();
    const invalid = invalidSchedule();
    if (invalid) {
      toast(t('errScheduleRecipients', [invalid]), true);
      return;
    }
    settings = await store.saveSettings(next);
    if (!settings.schedules.some(s => s.id === id)) return;
    button.disabled = true;
    toast(t('toastReportSending'));
    try {
      const res = await messenger.runtime.sendMessage({ type: 'thunderdash:sendReportNow', id });
      if (res?.busy) toast(t('toastReportBusy'));
      else if (!res?.ok) throw new Error(res?.error || 'unknown');
      else toast(t('toastReportSent', [String(res.pending)]));
    } finally {
      button.disabled = false;
      scheduleState = await store.loadScheduleState();
      fillForm();
    }
  });
}

async function loadIdentities() {
  const list = await messenger.accounts.list(false);
  return list.flatMap(acc => (acc.identities || []).map(i => ({
    id: i.id,
    email: (i.email || '').toLowerCase(),
    label: `${i.name ? `${i.name} <${i.email}>` : i.email} — ${acc.name}`
  })));
}

async function exportBackup() {
  await run(async () => {
    const data = await store.exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    try {
      await messenger.downloads.download({
        url, filename: `thunderdash-backup-${toDateInput(new Date())}.json`, saveAs: true
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  });
}

async function importBackup(ev) {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  await run(async () => {
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      throw new Error('invalid-backup');
    }
    const mode = $('importReplace').checked ? 'replace' : 'merge';
    const res = await store.importBackup(data, mode);
    settings = await store.loadSettings();
    fillForm();
    toast(t('toastImported', [String(res.notes), String(res.ignored)]));
  });
}

async function init() {
  localizeDocument();
  [settings, accounts, identities, scheduleState] = await Promise.all([
    store.loadSettings(), listAccountFolders(), loadIdentities(), store.loadScheduleState()
  ]);
  $('composeHint').textContent = canSendSilently() ? t('optSendSilent') : t('optSendCompose');
  fillForm();
  $('addSchedule').addEventListener('click', addSchedule);
  messenger.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== 'local' || !changes[store.KEYS.scheduleState]) return;
    scheduleState = changes[store.KEYS.scheduleState].newValue || {};
    for (const s of settings.schedules) {
      const status = document.querySelector(`#scheduleList .schedule[data-id="${CSS.escape(s.id)}"] .status`);
      if (status) renderStatus(status, s);
    }
  });

  $('settingsForm').addEventListener('submit', save);
  $('resetKeywords').addEventListener('click', () => {
    $('transactionalKeywords').value = DEFAULT_TRANSACTIONAL_KEYWORDS.join('\n');
  });
  $('resetFolders').addEventListener('click', () => {
    for (const input of document.querySelectorAll('#folderRows input[type="checkbox"]')) {
      if (!input.disabled) input.checked = input.dataset.default === 'true';
    }
  });
  $('exportBackup').addEventListener('click', exportBackup);
  $('importFile').addEventListener('change', importBackup);
  $('clearCache').addEventListener('click', () => run(async () => {
    await store.clearCaches();
    toast(t('toastCacheCleared'));
  }));
  $('createReplyTag').addEventListener('click', () => run(async () => {
    await ensureReplyTag();
    toast(t('toastReplyTag', [t('replyTagName')]));
  }));
}

init().catch(e => {
  console.error(e);
  toast(t('errGeneric', [e?.message || String(e)]), true);
});

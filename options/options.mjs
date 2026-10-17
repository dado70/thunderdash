// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Alessandro (dado) Scapuzzi <dado70@gmail.com>

import { DEFAULT_TRANSACTIONAL_KEYWORDS, parseKeywordList } from '../src/core.mjs';
import { listAccountFolders } from '../src/folders.mjs';
import { t, localizeDocument, toDateInput } from '../src/i18n.mjs';
import { ensureReplyTag } from '../src/actions.mjs';
import * as store from '../src/store.mjs';

const $ = id => document.getElementById(id);
let accounts = [];
let settings = null;

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
  renderFolders();
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
    sentOverrides
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
    settings = await store.saveSettings(next);
    fillForm();
    toast(t('toastSettingsSaved'));
  });
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
  [settings, accounts] = await Promise.all([store.loadSettings(), listAccountFolders()]);
  fillForm();

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

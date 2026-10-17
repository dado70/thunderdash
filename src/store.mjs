// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Alessandro (dado) Scapuzzi <dado70@gmail.com>
//
// Persistence in messenger.storage.local. Notes and ignored messages are keyed
// by the Message-ID header, which (unlike MessageHeader.id) survives restarts
// and moves between folders.

import { mergeSettings, sanitizeBackup } from './core.mjs';

const local = () => messenger.storage.local;

export const KEYS = Object.freeze({
  settings: 'settings',
  notes: 'notes',
  ignored: 'ignored',
  headerCache: 'headerCache',
  lastScan: 'lastScan'
});

async function getKey(key, fallback) {
  const res = await local().get(key);
  return res[key] ?? fallback;
}

export async function loadSettings() {
  return mergeSettings(await getKey(KEYS.settings, {}));
}

export async function saveSettings(settings) {
  const clean = mergeSettings(settings);
  await local().set({ [KEYS.settings]: clean });
  return clean;
}

export const loadNotes = () => getKey(KEYS.notes, {});
export const loadIgnored = () => getKey(KEYS.ignored, {});
export const loadHeaderCache = () => getKey(KEYS.headerCache, {});
export const loadLastScan = () => getKey(KEYS.lastScan, null);

export const saveHeaderCache = cache => local().set({ [KEYS.headerCache]: cache });
export const saveLastScan = scan => local().set({ [KEYS.lastScan]: scan });

export async function setNote(headerMessageId, text) {
  const notes = await loadNotes();
  const trimmed = (text || '').trim();
  if (trimmed) {
    notes[headerMessageId] = { text: trimmed.slice(0, 5000), updated: Date.now() };
  } else {
    delete notes[headerMessageId];
  }
  await local().set({ [KEYS.notes]: notes });
  return notes;
}

export async function setIgnored(headerMessageId, info) {
  const ignored = await loadIgnored();
  if (info) {
    ignored[headerMessageId] = {
      subject: info.subject || '',
      author: info.author || '',
      date: info.date || 0,
      ignoredAt: Date.now()
    };
  } else {
    delete ignored[headerMessageId];
  }
  await local().set({ [KEYS.ignored]: ignored });
  return ignored;
}

export async function clearCaches() {
  await local().remove([KEYS.headerCache, KEYS.lastScan]);
}

/** Backup of user data (not caches) as a plain object. */
export async function exportBackup() {
  const [settings, notes, ignored] = await Promise.all([loadSettings(), loadNotes(), loadIgnored()]);
  return {
    app: 'thunderdash',
    version: messenger.runtime.getManifest().version,
    exportedAt: new Date().toISOString(),
    settings,
    notes,
    ignored
  };
}

/** Restores a backup. mode 'merge' keeps existing entries not in the backup. */
export async function importBackup(data, mode = 'merge') {
  const clean = sanitizeBackup(data);
  let { notes, ignored } = clean;
  if (mode === 'merge') {
    notes = { ...(await loadNotes()), ...notes };
    ignored = { ...(await loadIgnored()), ...ignored };
  }
  await local().set({
    [KEYS.settings]: clean.settings,
    [KEYS.notes]: notes,
    [KEYS.ignored]: ignored
  });
  return { notes: Object.keys(notes).length, ignored: Object.keys(ignored).length };
}

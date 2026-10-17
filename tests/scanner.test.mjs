// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Alessandro (dado) Scapuzzi <dado70@gmail.com>
//
// Exercises folders.mjs and scanner.mjs against a fake `messenger` object that
// mimics the documented shapes of the Thunderbird 128+ MailExtension APIs
// (MailAccount, MailFolder, MessageList, MessageHeader, getFull()).

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { DAY, T0, IN, SUB, SENT, JUNK, makeMessenger, msg, fixture } from './helpers/fake-messenger.mjs';

let scan, listAccountFolders, DEFAULT_SETTINGS;
beforeEach(async () => {
  ({ scan } = await import('../src/scanner.mjs'));
  ({ listAccountFolders } = await import('../src/folders.mjs'));
  ({ DEFAULT_SETTINGS } = await import('../src/core.mjs'));
});


test('listAccountFolders computes defaults and exclusions', async () => {
  const { messenger } = makeMessenger(fixture());
  globalThis.messenger = messenger;
  const [acc] = await listAccountFolders();
  const byPath = Object.fromEntries(acc.folders.map(f => [f.path, f]));
  assert.equal(byPath['/INBOX'].defaultReceive, true);
  assert.equal(byPath['/INBOX/Clienti'].defaultReceive, true);
  assert.equal(byPath['/INBOX/Clienti'].depth, 1);
  assert.equal(byPath['/Sent'].defaultSent, true);
  assert.equal(byPath['/Junk'].excluded, true);
  assert.equal(byPath['/Trash/Old'].excluded, true);
  assert.deepEqual(acc.identities, ['me@studio.it']);
});

test('scan finds unanswered mail, skips own/junk/duplicates, uses cache', async () => {
  const { messenger, storage, calls } = makeMessenger(fixture());
  globalThis.messenger = messenger;
  const opts = {
    startDate: new Date(T0 - DAY), endDate: new Date(T0 + 10 * DAY),
    settings: { ...DEFAULT_SETTINGS }
  };
  const res = await scan(opts);
  const ids = res.rows.map(r => r.id).sort((a, b) => a - b);
  assert.deepEqual(ids, [3, 4]);
  assert.equal(res.rows.find(r => r.id === 4).transactional, true);
  assert.equal(res.rows.find(r => r.id === 3).folderName, 'Clienti');
  assert.equal(calls.getFull, 2);
  assert.ok(storage.lastScan && storage.headerCache['m101@test']);
  assert.ok(calls.queries.every(q => !q.folderId.includes(JUNK)));

  // Second scan: headers come from the cache.
  await scan(opts);
  assert.equal(calls.getFull, 2);

  // Without subject fallback, message 2 is unanswered.
  const strict = await scan({ ...opts, settings: { ...DEFAULT_SETTINGS, subjectFallback: false } });
  assert.deepEqual(strict.rows.map(r => r.id).sort((a, b) => a - b), [2, 3, 4]);
});

test('scan prefers messages.getHeaders when available', async () => {
  const { messenger, calls } = makeMessenger({ ...fixture(), withGetHeaders: true });
  globalThis.messenger = messenger;
  const res = await scan({
    startDate: new Date(T0 - DAY), endDate: new Date(T0 + 10 * DAY), settings: { ...DEFAULT_SETTINGS }
  });
  assert.equal(calls.getHeaders, 2);
  assert.equal(calls.getFull, 0);
  assert.deepEqual(res.rows.map(r => r.id).sort((a, b) => a - b), [3, 4]);
});

test('scan honours folder overrides and abort', async () => {
  const { messenger } = makeMessenger(fixture());
  globalThis.messenger = messenger;
  const settings = { ...DEFAULT_SETTINGS, receiveOverrides: { 'acc1|/INBOX/Clienti': false } };
  const res = await scan({ startDate: new Date(T0 - DAY), endDate: new Date(T0 + 10 * DAY), settings });
  assert.deepEqual(res.rows.map(r => r.id), [4]);

  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(
    scan({ startDate: new Date(T0 - DAY), endDate: new Date(T0 + 10 * DAY), settings, signal: ctrl.signal }),
    { name: 'ScanAborted' }
  );

  await assert.rejects(
    scan({ startDate: new Date(T0), endDate: new Date(T0 + DAY), settings: { ...DEFAULT_SETTINGS, receiveOverrides: { 'acc1|/INBOX': false, 'acc1|/INBOX/Clienti': false } } }),
    /no-receive-folders/
  );
});

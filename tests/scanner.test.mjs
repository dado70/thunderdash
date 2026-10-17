// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Alessandro (dado) Scapuzzi <dado70@gmail.com>
//
// Exercises folders.mjs and scanner.mjs against a fake `messenger` object that
// mimics the documented shapes of the Thunderbird 128+ MailExtension APIs
// (MailAccount, MailFolder, MessageList, MessageHeader, getFull()).

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 1, 9);

function folder(accountId, path, name, specialUse = [], subFolders = []) {
  return {
    id: `${accountId}:/${path.replace(/^\//, "")}`, accountId, path, name, specialUse, subFolders,
    isRoot: path === '/', isTag: false, isUnified: false, isVirtual: false, isFavorite: false
  };
}

function makeMessenger({ messages, headers, pageSize = 2, withGetHeaders = false }) {
  const storage = {};
  const lists = new Map();
  let listSeq = 0;
  const calls = { getFull: 0, getHeaders: 0, queries: [] };

  const page = all => {
    const id = all.length > pageSize ? `list-${++listSeq}` : null;
    if (id) lists.set(id, all.slice(pageSize));
    return { id, messages: all.slice(0, pageSize) };
  };

  const root = folder('acc1', '/', 'Root', [], [
    folder('acc1', '/INBOX', 'Inbox', ['inbox'], [folder('acc1', '/INBOX/Clienti', 'Clienti')]),
    folder('acc1', '/Sent', 'Sent', ['sent']),
    folder('acc1', '/Junk', 'Junk', ['junk']),
    folder('acc1', '/Trash', 'Trash', ['trash'], [folder('acc1', '/Trash/Old', 'Old')])
  ]);

  const messenger = {
    accounts: {
      list: async includeSubFolders => {
        assert.equal(includeSubFolders, true);
        return [{ id: 'acc1', name: 'Lavoro', type: 'imap', identities: [{ email: 'Me@Studio.it' }], rootFolder: root }];
      }
    },
    messages: {
      query: async q => {
        calls.queries.push(q);
        const ids = new Set(q.folderId);
        return page(messages.filter(m =>
          ids.has(m.folder.id) &&
          (!q.fromDate || m.date > q.fromDate) &&
          (!q.toDate || m.date < q.toDate)));
      },
      continueList: async id => {
        const rest = lists.get(id);
        lists.delete(id);
        return page(rest);
      },
      abortList: async id => { lists.delete(id); },
      getFull: async id => {
        calls.getFull++;
        return { headers: headers[id] || {} };
      }
    },
    storage: {
      local: {
        get: async key => ({ [key]: storage[key] }),
        set: async obj => Object.assign(storage, structuredClone(obj)),
        remove: async keys => [].concat(keys).forEach(k => delete storage[k])
      }
    },
    runtime: { getManifest: () => ({ version: 'test' }) }
  };
  if (withGetHeaders) {
    messenger.messages.getHeaders = async id => {
      calls.getHeaders++;
      return headers[id] || {};
    };
  }
  return { messenger, storage, calls };
}

const msg = (id, folderId, author, subject, date, extra = {}) => ({
  id, folder: { id: folderId, accountId: 'acc1', path: folderId.split(':/')[1], name: 'x' },
  author, subject, date: new Date(date), headerMessageId: `m${id}@test`, recipients: [], ccList: [], bccList: [],
  tags: [], read: false, flagged: false, ...extra
});

let scan, listAccountFolders, DEFAULT_SETTINGS;
beforeEach(async () => {
  ({ scan } = await import('../src/scanner.mjs'));
  ({ listAccountFolders } = await import('../src/folders.mjs'));
  ({ DEFAULT_SETTINGS } = await import('../src/core.mjs'));
});

const IN = 'acc1:/INBOX', SUB = 'acc1:/INBOX/Clienti', SENT = 'acc1:/Sent', JUNK = 'acc1:/Junk';

function fixture() {
  const messages = [
    msg(1, IN, 'Cliente <cli@x.it>', 'Preventivo', T0),                       // replied by header
    msg(2, IN, 'Fornitore <forn@x.it>', 'Fattura 12', T0 + DAY),              // replied by subject
    msg(3, SUB, 'Amico <ami@x.it>', 'Cena', T0 + 2 * DAY),                    // unanswered, subfolder
    msg(4, IN, 'Shop <noreply@shop.it>', 'Il tuo ordine', T0 + 3 * DAY),      // unanswered, transactional
    msg(5, IN, 'Io <me@studio.it>', 'Nota per me', T0 + 3 * DAY),             // from me: skipped
    msg(6, JUNK, 'Spam <s@spam.it>', 'Vinci', T0 + 3 * DAY),                  // junk: never scanned
    msg(7, SUB, 'Cliente <cli@x.it>', 'Preventivo', T0, { headerMessageId: 'm1@test' }), // duplicate of 1 (copy)
    msg(101, SENT, 'Io <me@studio.it>', 'Re: Preventivo', T0 + DAY, { recipients: ['Cliente <cli@x.it>'] }),
    msg(102, SENT, 'Io <me@studio.it>', 'R: Fattura 12', T0 + 2 * DAY, { recipients: ['forn@x.it'] })
  ];
  const headers = {
    101: { 'In-Reply-To': ['<m1@test>'], references: ['<m1@test>'] },
    102: {}
  };
  return { messages, headers };
}

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

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Alessandro (dado) Scapuzzi <dado70@gmail.com>
//
// Fake `messenger` object mimicking the documented shapes of the Thunderbird
// 128+ MailExtension APIs (MailAccount, MailFolder, MessageList,
// MessageHeader, getFull(), tags, alarms, compose, i18n).

import assert from 'node:assert/strict';

export const DAY = 24 * 60 * 60 * 1000;
export const T0 = Date.UTC(2026, 9, 1, 9);

function folder(accountId, path, name, specialUse = [], subFolders = []) {
  return {
    id: `${accountId}:/${path.replace(/^\//, "")}`, accountId, path, name, specialUse, subFolders,
    isRoot: path === '/', isTag: false, isUnified: false, isVirtual: false, isFavorite: false
  };
}

export function makeMessenger({ messages, headers, pageSize = 2, withGetHeaders = false, withSendMessage = false, failSend = false }) {
  const storage = {};
  const lists = new Map();
  let listSeq = 0;
  const calls = { getFull: 0, getHeaders: 0, queries: [], sent: [], composed: [], alarms: new Map() };

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
    runtime: { getManifest: () => ({ version: 'test' }) },
    i18n: {
      getMessage: (key, subs = []) => `${key}(${[].concat(subs).join('|')})`,
      getUILanguage: () => 'it'
    },
    alarms: {
      getAll: async () => [...calls.alarms.entries()].map(([name, a]) => ({ name, ...a })),
      create: (name, info) => { calls.alarms.set(name, { scheduledTime: info.when }); },
      clear: async name => calls.alarms.delete(name)
    },
    compose: {
      beginNew: async details => { calls.composed.push(details); return { id: 77 }; },
      sendMessage: async (tabId, options) => {
        if (failSend) throw new Error('smtp-down');
        calls.sent.push({ via: 'compose', tabId, details: calls.composed.at(-1), options });
        return { mode: 'sendNow', messages: [] };
      }
    }
  };
  messenger.messages.tags = { list: async () => [{ key: '$label1', tag: 'Importante', color: '#FF0000', ordinal: '' }] };
  if (withSendMessage) {
    messenger.messages.sendMessage = async (details, options) => {
      if (failSend) throw new Error('smtp-down');
      calls.sent.push({ via: 'messages', details, options });
      return { mode: 'sendNow', messages: [] };
    };
  }
  if (withGetHeaders) {
    messenger.messages.getHeaders = async id => {
      calls.getHeaders++;
      return headers[id] || {};
    };
  }
  return { messenger, storage, calls };
}

export const msg = (id, folderId, author, subject, date, extra = {}) => ({
  id, folder: { id: folderId, accountId: 'acc1', path: folderId.split(':/')[1], name: 'x' },
  author, subject, date: new Date(date), headerMessageId: `m${id}@test`, recipients: [], ccList: [], bccList: [],
  tags: [], read: false, flagged: false, ...extra
});


export const IN = 'acc1:/INBOX', SUB = 'acc1:/INBOX/Clienti', SENT = 'acc1:/Sent', JUNK = 'acc1:/Junk';


export function fixture() {
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

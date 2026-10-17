// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Alessandro (dado) Scapuzzi <dado70@gmail.com>
//
// Run with: node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_MS, DEFAULT_SETTINGS, ageInDays, buildCsv, buildReplyIndex, displayName, extractEmail,
  filterRows, findReply, folderKey, matchesKeyword, mergeSettings, normalizeMessageId,
  normalizeSubject, parseKeywordList, parseMessageIdList, pruneHeaderCache, sanitizeBackup,
  severity, sortRows
} from '../src/core.mjs';
import { resolveSelection } from '../src/folders.mjs';

test('normalizeSubject strips repeated and localized prefixes', () => {
  assert.equal(normalizeSubject('Re: Re: Offerta'), 'offerta');
  assert.equal(normalizeSubject('R: I: Fwd: Offerta  2026'), 'offerta 2026');
  assert.equal(normalizeSubject('RIF: offerta'), 'offerta');
  assert.equal(normalizeSubject('AW: WG: Angebot'), 'angebot');
  assert.equal(normalizeSubject('Re[2]: Offerta'), 'offerta');
  assert.equal(normalizeSubject('[lista] Re: Offerta'), 'offerta');
  assert.equal(normalizeSubject('[lista] Offerta'), '[lista] offerta');
  assert.equal(normalizeSubject('Resoconto mensile'), 'resoconto mensile');
  assert.equal(normalizeSubject('Ricevuta'), 'ricevuta');
  assert.equal(normalizeSubject(undefined), '');
});

test('normalizeMessageId and parseMessageIdList', () => {
  assert.equal(normalizeMessageId(' <abc@x> '), 'abc@x');
  assert.equal(normalizeMessageId('abc@x'), 'abc@x');
  assert.equal(normalizeMessageId(null), '');
  assert.deepEqual(parseMessageIdList(['<a@x> <b@y>\r\n <c@z>']), ['a@x', 'b@y', 'c@z']);
  assert.deepEqual(parseMessageIdList('a@x'), ['a@x']);
  assert.deepEqual(parseMessageIdList(undefined), []);
});

test('extractEmail and displayName', () => {
  assert.equal(extractEmail('Mario Rossi <Mario.Rossi@Example.IT>'), 'mario.rossi@example.it');
  assert.equal(extractEmail('mario@example.it'), 'mario@example.it');
  assert.equal(extractEmail('Nobody'), '');
  assert.equal(displayName('"Rossi, Mario" <m@x.it>'), 'Rossi, Mario');
  assert.equal(displayName('<m@x.it>'), '<m@x.it>');
});

test('keywords', () => {
  assert.deepEqual(parseKeywordList(' NoReply, newsletter\nnoreply ;\n'), ['noreply', 'newsletter']);
  assert.ok(matchesKeyword('No-Reply <no-reply@shop.it>', 'Ordine', ['no-reply']));
  assert.ok(matchesKeyword('a@b.it', 'Conferma ordine', ['conferma']));
  assert.ok(!matchesKeyword('a@b.it', 'Ciao', ['noreply']));
});

test('age and severity', () => {
  const now = Date.UTC(2026, 9, 17, 12);
  assert.equal(ageInDays(now - 3 * DAY_MS - 1000, now), 3);
  assert.equal(ageInDays(now + 1000, now), 0);
  assert.equal(severity(1, 2, 5), 'normal');
  assert.equal(severity(2, 2, 5), 'warning');
  assert.equal(severity(5, 2, 5), 'critical');
});

test('findReply by header and by subject fallback', () => {
  const t0 = Date.UTC(2026, 9, 1);
  const index = buildReplyIndex([
    { refs: ['orig@x'], subject: 'Re: Preventivo', date: t0 + DAY_MS, recipients: ['cli@x.it'] },
    { refs: [], subject: 'R: Fattura', date: t0 + DAY_MS, recipients: ['forn@x.it'] }
  ]);
  const base = { subject: 'Altro', date: t0, authorEmail: 'cli@x.it' };
  assert.equal(findReply({ ...base, headerMessageId: '<orig@x>' }, index), 'header');
  assert.equal(findReply({ headerMessageId: 'z@x', subject: 'Fattura', date: t0, authorEmail: 'forn@x.it' }, index), 'subject');
  // Same subject but different recipient, or reply sent before the message.
  assert.equal(findReply({ headerMessageId: 'z@x', subject: 'Fattura', date: t0, authorEmail: 'other@x.it' }, index), null);
  assert.equal(findReply({ headerMessageId: 'z@x', subject: 'Fattura', date: t0 + 2 * DAY_MS, authorEmail: 'forn@x.it' }, index), null);
  assert.equal(findReply({ headerMessageId: 'z@x', subject: 'Fattura', date: t0, authorEmail: 'forn@x.it' }, index, { subjectFallback: false }), null);
});

test('mergeSettings validates types and thresholds', () => {
  assert.deepEqual(mergeSettings(null), { ...DEFAULT_SETTINGS });
  const s = mergeSettings({ warningDays: 4, criticalDays: 3, transactionalKeywords: ['a', 1], bogus: 1, receiveOverrides: [] });
  assert.equal(s.warningDays, 4);
  assert.equal(s.criticalDays, 5);
  assert.deepEqual(s.transactionalKeywords, ['a']);
  assert.deepEqual(s.receiveOverrides, {});
  assert.equal('bogus' in s, false);
});

test('filterRows and sortRows', () => {
  const rows = [
    { author: 'A', subject: 'Uno', date: 3, ignored: false, transactional: false, tags: ['$label1'], accountId: 'a1', severity: 'normal' },
    { author: 'B', subject: 'Due', date: 1, ignored: false, transactional: true, tags: [], accountId: 'a2', severity: 'critical' },
    { author: 'C', subject: 'Tre', date: 2, ignored: true, transactional: false, tags: [], accountId: 'a1', severity: 'warning', note: 'chiamare' }
  ];
  assert.equal(filterRows(rows, {}).length, 2);
  assert.equal(filterRows(rows, { view: 'ignored' }).length, 1);
  assert.equal(filterRows(rows, { hideTransactional: true }).length, 1);
  assert.equal(filterRows(rows, { tag: '$label1' })[0].author, 'A');
  assert.equal(filterRows(rows, { view: 'ignored', text: 'CHIAMARE' }).length, 1);
  assert.deepEqual(sortRows(rows, 'age', 'desc').map(r => r.author), ['B', 'C', 'A']);
  assert.deepEqual(sortRows(rows, 'author', 'desc').map(r => r.author), ['C', 'B', 'A']);
});

test('buildCsv quotes and neutralizes formulas', () => {
  const csv = buildCsv(['a', 'b'], [['x;y', '=SUM(A1)'], ['he said "hi"', 3]], ';');
  assert.equal(csv, 'a;b\r\n"x;y";\'=SUM(A1)\r\n"he said ""hi""";3\r\n');
});

test('pruneHeaderCache drops old and malformed entries', () => {
  const now = 100 * DAY_MS;
  const out = pruneHeaderCache({ a: { r: [], d: now - DAY_MS }, b: { r: [], d: 0 }, c: { d: now } }, now, 30);
  assert.deepEqual(Object.keys(out), ['a']);
});

test('sanitizeBackup', () => {
  assert.throws(() => sanitizeBackup({}), /invalid-backup/);
  const b = sanitizeBackup({ app: 'thunderdash', notes: { 'm@x': { text: 'ok', updated: 1 }, bad: 3 }, ignored: { 'n@x': { subject: 's' } } });
  assert.deepEqual(Object.keys(b.notes), ['m@x']);
  assert.equal(b.ignored['n@x'].subject, 's');
});

test('resolveSelection applies overrides and never selects excluded folders', () => {
  const mk = (path, extra) => ({ key: folderKey('acc1', path), excluded: false, defaultReceive: false, defaultSent: false, ...extra });
  const accounts = [{
    identities: ['me@x.it'],
    folders: [
      mk('/INBOX', { defaultReceive: true }),
      mk('/INBOX/Clienti', { defaultReceive: true }),
      mk('/Sent', { defaultSent: true }),
      mk('/Archivio'),
      mk('/Trash', { excluded: true })
    ]
  }];
  const settings = {
    receiveOverrides: { [folderKey('acc1', '/INBOX/Clienti')]: false, [folderKey('acc1', '/Trash')]: true },
    sentOverrides: { [folderKey('acc1', '/Archivio')]: true }
  };
  const sel = resolveSelection(accounts, settings);
  assert.deepEqual(sel.receive.map(f => f.key), ['acc1|/INBOX']);
  assert.deepEqual(sel.sent.map(f => f.key), ['acc1|/Sent', 'acc1|/Archivio']);
  assert.ok(sel.identities.has('me@x.it'));
});

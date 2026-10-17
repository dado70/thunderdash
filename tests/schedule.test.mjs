// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Alessandro (dado) Scapuzzi <dado70@gmail.com>

// Fixed time zone with DST, so the local-time arithmetic is deterministic.
process.env.TZ = 'Europe/Rome';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_MS, escapeHtml, filterRows, groupByCorrespondent, isDue, mergeSettings, nextOccurrence,
  parseRecipients, previousOccurrence, sanitizeSchedule
} from '../src/core.mjs';
import { buildReport } from '../src/report.mjs';

const local = (y, m, d, hh = 0, mm = 0) => new Date(y, m - 1, d, hh, mm).getTime();
const sch = extra => sanitizeSchedule({ id: 'a', to: ['me@x.it'], ...extra });

test('sanitizeSchedule and parseRecipients', () => {
  assert.equal(sanitizeSchedule(null), null);
  assert.equal(sanitizeSchedule({ to: [] }), null);
  const s = sanitizeSchedule({ id: 'x', to: ['A@B.it', 'bad', 'a@b.it'], frequency: 'yearly', time: '25:00', weekday: 9, monthDay: 0 });
  assert.deepEqual(s.to, ['a@b.it']);
  assert.equal(s.frequency, 'daily');
  assert.equal(s.time, '08:00');
  assert.equal(s.weekday, 1);
  assert.equal(s.monthDay, 1);
  assert.equal(s.enabled, true);
  assert.equal(s.includeZero, true);
  assert.equal(s.excludeTransactional, true);
  assert.deepEqual(parseRecipients('a@b.it; C@D.com,\nnope  a@b.it'), ['a@b.it', 'c@d.com']);
  const m = mergeSettings({ schedules: [{ id: 'k', to: ['q@w.it'] }, { nope: 1 }], reportRangeDays: 0 });
  assert.equal(m.schedules.length, 1);
  assert.equal(m.reportRangeDays, 30);
});

test('daily occurrences', () => {
  const s = sch({ frequency: 'daily', time: '08:30' });
  const now = local(2026, 10, 17, 9, 0);
  assert.equal(previousOccurrence(s, now), local(2026, 10, 17, 8, 30));
  assert.equal(nextOccurrence(s, now), local(2026, 10, 18, 8, 30));
  const early = local(2026, 10, 17, 7, 0);
  assert.equal(previousOccurrence(s, early), local(2026, 10, 16, 8, 30));
  assert.equal(nextOccurrence(s, early), local(2026, 10, 17, 8, 30));
  // Exactly at the occurrence: it is the previous one, the next is tomorrow.
  const exact = local(2026, 10, 17, 8, 30);
  assert.equal(previousOccurrence(s, exact), exact);
  assert.equal(nextOccurrence(s, exact), local(2026, 10, 18, 8, 30));
});

test('weekly occurrences', () => {
  const s = sch({ frequency: 'weekly', weekday: 1, time: '08:00' }); // Monday
  const sat = local(2026, 10, 17, 12); // Saturday
  assert.equal(previousOccurrence(s, sat), local(2026, 10, 12, 8));
  assert.equal(nextOccurrence(s, sat), local(2026, 10, 19, 8));
  const monEarly = local(2026, 10, 19, 7);
  assert.equal(previousOccurrence(s, monEarly), local(2026, 10, 12, 8));
  assert.equal(nextOccurrence(s, monEarly), local(2026, 10, 19, 8));
});

test('monthly occurrences clamp to short months', () => {
  const s = sch({ frequency: 'monthly', monthDay: 31, time: '09:00' });
  assert.equal(nextOccurrence(s, local(2026, 2, 10)), local(2026, 2, 28, 9));
  assert.equal(nextOccurrence(s, local(2026, 2, 28, 10)), local(2026, 3, 31, 9));
  assert.equal(previousOccurrence(s, local(2026, 3, 15)), local(2026, 2, 28, 9));
  assert.equal(nextOccurrence(s, local(2026, 12, 31, 10)), local(2027, 1, 31, 9));
  assert.equal(previousOccurrence(s, local(2026, 1, 5)), local(2025, 12, 31, 9));
});

test('occurrences across DST changes keep the local time', () => {
  const s = sch({ frequency: 'daily', time: '08:00' });
  // Europe/Rome: DST ends 2026-10-25, starts 2026-03-29.
  assert.equal(new Date(nextOccurrence(s, local(2026, 10, 24, 9))).getHours(), 8);
  assert.equal(nextOccurrence(s, local(2026, 10, 24, 9)) - local(2026, 10, 24, 8), DAY_MS + 3600_000);
  assert.equal(new Date(nextOccurrence(s, local(2026, 3, 28, 9))).getHours(), 8);
});

test('isDue: catch-up once, ignores past occurrences after edits', () => {
  const s = sch({ frequency: 'daily', time: '08:00', updatedAt: local(2026, 10, 1) });
  const now = local(2026, 10, 17, 10);
  assert.equal(isDue(s, local(2026, 10, 15, 8), now), true);   // missed two days: due (once)
  assert.equal(isDue(s, local(2026, 10, 17, 8, 1), now), false); // already sent today
  assert.equal(isDue({ ...s, updatedAt: local(2026, 10, 17, 9) }, 0, now), false); // edited after 08:00
  assert.equal(isDue({ ...s, enabled: false }, 0, now), false);
  assert.equal(isDue({ ...s, to: [] }, 0, now), false);
});

test('groupByCorrespondent and sender filter', () => {
  const rows = [
    { authorEmail: 'a@x.it', authorName: 'Anna', date: 5, severity: 'normal', ignored: false },
    { authorEmail: 'b@x.it', authorName: 'Bruno', date: 1, severity: 'critical', ignored: false },
    { authorEmail: 'a@x.it', authorName: 'Anna', date: 3, severity: 'warning', ignored: false },
    { authorEmail: 'a@x.it', authorName: 'Anna', date: 4, severity: 'normal', ignored: false }
  ];
  const g = groupByCorrespondent(rows);
  assert.deepEqual(g.map(x => [x.email, x.count, x.critical, x.warning, x.oldest]),
    [['b@x.it', 1, 1, 0, 1], ['a@x.it', 3, 0, 1, 3]]);
  assert.equal(filterRows(rows, { sender: 'a@x.it' }).length, 3);
});

test('escapeHtml', () => {
  assert.equal(escapeHtml('<a href="x">\'&</a>'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
});

test('buildReport: counters, grouping, critical list, escaping, transactional', () => {
  const now = local(2026, 10, 17, 8);
  const t = (k, subs = []) => `${k}(${subs.join('|')})`;
  const rows = [
    { accountId: 'a1', accountName: 'Lavoro', authorName: 'Anna <b>', authorEmail: 'a@x.it', subject: 'Offerta <script>',
      date: now - 10 * DAY_MS, headerMessageId: 'm1', tags: ['$label1'], transactional: false },
    { accountId: 'a1', accountName: 'Lavoro', authorName: 'Bruno', authorEmail: 'b@x.it', subject: 'Ciao',
      date: now - 3 * DAY_MS, headerMessageId: 'm2', tags: [], transactional: false },
    { accountId: 'a2', accountName: 'Personale', authorName: 'Shop', authorEmail: 'noreply@s.it', subject: 'Ordine',
      date: now - 20 * DAY_MS, headerMessageId: 'm3', tags: [], transactional: true }
  ];
  const base = {
    rows, now, rangeStart: now - 30 * DAY_MS, t, formatDate: ms => new Date(ms).toISOString().slice(0, 10),
    settings: { warningDays: 2, criticalDays: 5 },
    notes: { m1: { text: 'Chiamare\nlunedì' } },
    tags: [{ key: '$label1', tag: 'Importante', color: '#FF0000' }]
  };
  const r = buildReport({ ...base, schedule: sch({ excludeTransactional: true }) });
  assert.equal(r.pending, 2);
  assert.equal(r.critical, 1);
  assert.equal(r.subject, 'reportSubject(2|1)');
  assert.ok(r.html.includes('Offerta &lt;script&gt;'));
  assert.ok(!r.html.includes('<script>'));
  assert.ok(r.html.includes('Anna &lt;b&gt;'));
  assert.ok(r.html.includes('Chiamare<br>lunedì'));
  assert.ok(r.html.includes('Importante'));
  assert.ok(r.html.includes('reportAccountCounts(2|1|1)'));
  assert.ok(!r.html.includes('Personale'));
  assert.ok(!r.html.includes('Bruno'), 'only critical emails are listed');

  const all = buildReport({ ...base, schedule: sch({ excludeTransactional: false, label: 'Collega' }) });
  assert.equal(all.pending, 3);
  assert.equal(all.subject, 'reportSubjectLabel(Collega|3|2)');
  assert.ok(all.html.indexOf('Lavoro') < all.html.indexOf('Personale'));

  const none = buildReport({ ...base, rows: [], schedule: sch({}) });
  assert.equal(none.pending, 0);
  assert.ok(none.html.includes('reportNothingPending()'));
});

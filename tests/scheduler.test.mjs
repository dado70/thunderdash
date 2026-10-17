// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Alessandro (dado) Scapuzzi <dado70@gmail.com>
//
// Scheduled reports end to end against the fake messenger: scan → report →
// send (TB 153 background send, or TB 128 compose fallback) and alarms.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMessenger, fixture } from './helpers/fake-messenger.mjs';
import { DEFAULT_SETTINGS } from '../src/core.mjs';
import { ALARM_PREFIX, reconcileSchedules, runSchedule } from '../src/scheduler.mjs';

const schedule = extra => ({
  id: 's1', enabled: true, label: '', to: ['boss@x.it'], identityId: 'id1', frequency: 'daily',
  time: '08:00', weekday: 1, monthDay: 1, includeZero: true, excludeTransactional: true, updatedAt: 1, ...extra
});

function setup(opts = {}, schedules = [schedule()]) {
  const env = makeMessenger({ ...fixture(), ...opts });
  globalThis.messenger = env.messenger;
  // Very long range: the fixture messages are dated October 2026.
  env.storage.settings = { ...DEFAULT_SETTINGS, reportRangeDays: 36500, schedules };
  return env;
}

const until = async cond => {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise(r => setTimeout(r, 5));
};

test('manual send uses messages.sendMessage on TB 153+', async () => {
  const { calls, storage } = setup({ withSendMessage: true });
  const res = await runSchedule('s1', { manual: true });
  assert.equal(res.sent, true);
  assert.equal(res.pending, 1); // message 3; message 4 is transactional and excluded
  assert.equal(calls.sent.length, 1);
  const { details, options, via } = calls.sent[0];
  assert.equal(via, 'messages');
  assert.equal(options.mode, 'default');
  assert.deepEqual(details.to, ['boss@x.it']);
  assert.equal(details.identityId, 'id1');
  assert.equal(details.isPlainText, false);
  assert.deepEqual(details.customHeaders, [{ name: 'X-Thunderdash-Report', value: '1' }]);
  assert.ok(details.body.includes('Cena'));
  assert.ok(!details.body.includes('Il tuo ordine'));
  assert.equal(details.subject, 'reportSubject(1|1)');
  // A manual run does not move the schedule forward, and keeps the dashboard scan.
  assert.equal(storage.scheduleState.s1.lastRunAt, undefined);
  assert.ok(storage.scheduleState.s1.lastOkAt);
  assert.equal(storage.lastScan, undefined);
});

test('falls back to a compose window on TB 128–152', async () => {
  const { calls } = setup();
  await runSchedule('s1', { manual: true });
  assert.equal(calls.sent.length, 1);
  assert.equal(calls.sent[0].via, 'compose');
  assert.equal(calls.sent[0].tabId, 77);
  assert.deepEqual(calls.sent[0].details.to, ['boss@x.it']);
});

test('ignored emails are excluded; includeZero=false skips empty reports', async () => {
  const { calls, storage } = setup({ withSendMessage: true }, [schedule({ includeZero: false })]);
  storage.ignored = { 'm3@test': { subject: 'Cena', author: '', date: 0, ignoredAt: 1 } };
  const res = await runSchedule('s1');
  assert.equal(res.sent, false);
  assert.equal(calls.sent.length, 0);
  assert.equal(storage.scheduleState.s1.lastSkipped, true);
  assert.ok(storage.scheduleState.s1.lastRunAt);
});

test('send errors are recorded and rethrown', async () => {
  const { storage } = setup({ withSendMessage: true, failSend: true });
  await assert.rejects(runSchedule('s1'), /smtp-down/);
  assert.equal(storage.scheduleState.s1.lastError, 'smtp-down');
});

test('reconcile sends a missed report once and schedules alarms', async () => {
  const { calls, storage } = setup({ withSendMessage: true }, [
    schedule(),
    schedule({ id: 's2', enabled: false }),
    schedule({ id: 's3', to: [] })
  ]);
  calls.alarms.set(ALARM_PREFIX + 'gone', { scheduledTime: 1 });
  await reconcileSchedules();
  await until(() => calls.sent.length > 0 && storage.scheduleState?.s1?.lastOkAt);
  assert.equal(calls.sent.length, 1);
  assert.deepEqual([...calls.alarms.keys()], [ALARM_PREFIX + 's1']);
  assert.ok(calls.alarms.get(ALARM_PREFIX + 's1').scheduledTime > Date.now());

  // Second reconciliation (e.g. next wake-up): already sent, nothing new.
  await reconcileSchedules();
  await new Promise(r => setTimeout(r, 30));
  assert.equal(calls.sent.length, 1);
});

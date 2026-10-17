// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Alessandro (dado) Scapuzzi <dado70@gmail.com>
//
// Scheduled HTML reports, run from the background page.
//
// Alarms are not relied upon to survive a restart: every time the background
// page starts, reconcileSchedules() sends the reports whose occurrence was
// missed while Thunderbird was closed (once, not once per missed occurrence)
// and re-creates one alarm per schedule at its next occurrence.
// Each extension API call resets the event page idle timer (Gecko
// ExtensionParent "parentapicall"), so a scan in progress keeps it alive.

import { DAY_MS, isDue, nextOccurrence } from './core.mjs';
import { formatDateTime } from './i18n.mjs';
import { sendHtmlMail } from './mailer.mjs';
import { buildReport } from './report.mjs';
import { scan } from './scanner.mjs';
import * as store from './store.mjs';

export const ALARM_PREFIX = 'thunderdash-schedule:';

const t = (key, subs) => messenger.i18n.getMessage(key, subs) || key;
const running = new Set();

/**
 * Builds and sends one report.
 * manual = "Send now" from the options: does not move the schedule forward.
 * @returns {Promise<{sent: boolean, pending: number, critical: number}>}
 */
export async function runSchedule(id, { manual = false } = {}) {
  // Checked and set synchronously: concurrent triggers (alarm + startup
  // reconciliation) cannot start the same report twice.
  if (running.has(id)) return { sent: false, pending: 0, critical: 0, busy: true };
  running.add(id);
  try {
    const settings = await store.loadSettings();
    const schedule = settings.schedules.find(s => s.id === id);
    if (!schedule) throw new Error('schedule-not-found');
    if (!schedule.to.length) throw new Error('no-recipients');
    const now = Date.now();
    if (!manual) await store.updateScheduleState(id, { lastRunAt: now });
    try {
      const startDate = new Date(now - settings.reportRangeDays * DAY_MS);
      startDate.setHours(0, 0, 0, 0);
      const result = await scan({ startDate, endDate: new Date(now), settings, persist: false });
      const [notes, ignored, tags] = await Promise.all([
        store.loadNotes(), store.loadIgnored(), messenger.messages.tags.list()
      ]);
      const rows = result.rows.filter(r => !(r.headerMessageId && ignored[r.headerMessageId]));
      const report = buildReport({
        rows, settings, schedule, notes, tags, now, rangeStart: startDate.getTime(), t, formatDate: formatDateTime
      });
      if (!report.pending && !schedule.includeZero && !manual) {
        await store.updateScheduleState(id, { lastOkAt: Date.now(), lastError: '', lastPending: 0, lastSkipped: true });
        return { sent: false, pending: 0, critical: 0 };
      }
      await sendHtmlMail({ identityId: schedule.identityId, to: schedule.to, subject: report.subject, html: report.html });
      await store.updateScheduleState(id, {
        lastOkAt: Date.now(), lastError: '', lastPending: report.pending, lastSkipped: false
      });
      return { sent: true, pending: report.pending, critical: report.critical };
    } catch (e) {
      await store.updateScheduleState(id, { lastError: e?.message || String(e), lastErrorAt: Date.now() });
      throw e;
    }
  } finally {
    running.delete(id);
  }
}

/** Sends missed reports and (re)creates the alarms. Safe to call repeatedly. */
export async function reconcileSchedules() {
  const [settings, state, alarms] = await Promise.all([
    store.loadSettings(), store.loadScheduleState(), messenger.alarms.getAll()
  ]);
  const now = Date.now();
  const active = new Map(settings.schedules.filter(s => s.enabled && s.to.length).map(s => [s.id, s]));

  for (const a of alarms) {
    if (a.name.startsWith(ALARM_PREFIX) && !active.has(a.name.slice(ALARM_PREFIX.length))) {
      await messenger.alarms.clear(a.name);
    }
  }
  for (const s of active.values()) {
    if (isDue(s, state[s.id]?.lastRunAt, now)) {
      runSchedule(s.id).catch(e => console.error('thunderdash: scheduled report failed', s.id, e));
    }
    messenger.alarms.create(ALARM_PREFIX + s.id, { when: nextOccurrence(s, now) });
  }
}

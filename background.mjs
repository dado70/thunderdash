// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Alessandro (dado) Scapuzzi <dado70@gmail.com>

import { ensureReplyTag } from './src/actions.mjs';
import { ALARM_PREFIX, reconcileSchedules, runSchedule } from './src/scheduler.mjs';
import { KEYS } from './src/store.mjs';

const DASHBOARD_URL = messenger.runtime.getURL('dashboard/dashboard.html');

// Focuses the existing dashboard tab, or opens a new one. The tab id is kept
// in storage.session because the background page may be suspended.
async function openDashboard() {
  const { dashboardTabId } = await messenger.storage.session.get('dashboardTabId');
  if (typeof dashboardTabId === 'number') {
    try {
      const tab = await messenger.tabs.update(dashboardTabId, { active: true });
      await messenger.windows.update(tab.windowId, { focused: true });
      return;
    } catch {
      // Tab was closed.
    }
  }
  const tab = await messenger.tabs.create({ url: DASHBOARD_URL });
  await messenger.storage.session.set({ dashboardTabId: tab.id });
}

messenger.action.onClicked.addListener(() => {
  openDashboard().catch(e => console.error('thunderdash: cannot open dashboard', e));
});

messenger.tabs.onRemoved.addListener(async tabId => {
  const { dashboardTabId } = await messenger.storage.session.get('dashboardTabId');
  if (tabId === dashboardTabId) await messenger.storage.session.remove('dashboardTabId');
});

// Only on first install: if the user later deletes the tag, it is not recreated.
messenger.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    ensureReplyTag().catch(e => console.error('thunderdash: cannot create reply tag', e));
  }
});

// ------------------------------------------------------------ scheduled reports

const reconcile = () =>
  reconcileSchedules().catch(e => console.error('thunderdash: cannot reconcile schedules', e));

messenger.alarms.onAlarm.addListener(alarm => {
  if (alarm.name.startsWith(ALARM_PREFIX)) reconcile();
});

// Schedules edited in the options page.
messenger.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[KEYS.settings]) reconcile();
});

// "Send now" from the options page. The report runs here, so it completes
// even if the options tab is closed meanwhile.
messenger.runtime.onMessage.addListener(message => {
  if (message?.type !== 'thunderdash:sendReportNow') return undefined;
  return runSchedule(message.id, { manual: true })
    .then(res => ({ ok: true, ...res }))
    .catch(e => ({ ok: false, error: e?.message || String(e) }));
});

// Runs every time the background page starts (Thunderbird start-up or wake-up):
// catches up on reports missed while Thunderbird was closed.
reconcile();

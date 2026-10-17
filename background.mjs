// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Alessandro (dado) Scapuzzi <dado70@gmail.com>

import { ensureReplyTag } from './src/actions.mjs';

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

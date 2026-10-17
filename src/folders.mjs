// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Alessandro (dado) Scapuzzi <dado70@gmail.com>
//
// Account / folder discovery and selection of the folders to analyze.

import { folderKey } from './core.mjs';

// Folders that are never analyzed, together with their subfolders.
const ALWAYS_EXCLUDED = ['junk', 'trash', 'drafts', 'templates', 'outbox'];

const hasUse = (folder, use) => (folder.specialUse || []).includes(use);

/**
 * Returns all accounts with a flat, ordered list of their folders.
 * Each folder carries: id, name, path, depth, accountId, accountName, key,
 * excluded (cannot be selected), defaultReceive, defaultSent.
 */
export async function listAccountFolders() {
  const accounts = await messenger.accounts.list(true);
  return accounts.map(account => {
    const folders = [];
    const walk = (folder, depth, ctx) => {
      const excluded = ctx.excluded || ALWAYS_EXCLUDED.some(u => hasUse(folder, u)) ||
        folder.isVirtual || folder.isTag || folder.isUnified;
      const inInbox = !excluded && (ctx.inInbox || hasUse(folder, 'inbox'));
      const inSent = !excluded && (ctx.inSent || hasUse(folder, 'sent'));
      if (!folder.isRoot) {
        folders.push({
          id: folder.id,
          name: folder.name,
          path: folder.path,
          depth,
          accountId: account.id,
          accountName: account.name,
          key: folderKey(account.id, folder.path),
          excluded,
          defaultReceive: inInbox,
          defaultSent: inSent
        });
      }
      for (const sub of folder.subFolders || []) {
        walk(sub, folder.isRoot ? depth : depth + 1, { excluded, inInbox, inSent });
      }
    };
    if (account.rootFolder) walk(account.rootFolder, 0, {});
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      identities: (account.identities || []).map(i => (i.email || '').toLowerCase()).filter(Boolean),
      folders
    };
  });
}

function selected(folder, overrides, defKey) {
  if (folder.excluded) return false;
  const o = overrides[folder.key];
  return typeof o === 'boolean' ? o : folder[defKey];
}

/** Applies the user's overrides to the default selection. */
export function resolveSelection(accounts, settings) {
  const receive = [];
  const sent = [];
  const identities = new Set();
  for (const acc of accounts) {
    acc.identities.forEach(e => identities.add(e));
    for (const f of acc.folders) {
      if (selected(f, settings.receiveOverrides, 'defaultReceive')) receive.push(f);
      if (selected(f, settings.sentOverrides, 'defaultSent')) sent.push(f);
    }
  }
  return { receive, sent, identities };
}

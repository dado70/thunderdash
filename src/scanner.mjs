// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Alessandro (dado) Scapuzzi <dado70@gmail.com>
//
// Scans the selected folders and returns the received messages that have no
// reply among the sent messages.

import {
  buildReplyIndex, displayName, extractEmail, findReply, matchesKeyword,
  normalizeMessageId, parseMessageIdList, pruneHeaderCache
} from './core.mjs';
import { listAccountFolders, resolveSelection } from './folders.mjs';
import { loadHeaderCache, saveHeaderCache, saveLastScan } from './store.mjs';

const HEADER_CONCURRENCY = 4;

export class ScanAborted extends Error {
  constructor() { super('scan-aborted'); this.name = 'ScanAborted'; }
}

/** Iterates all messages of a query, page by page (see the messageLists guide). */
async function* queryMessages(queryInfo, signal) {
  let page = await messenger.messages.query(queryInfo);
  for (;;) {
    if (signal?.aborted) {
      if (page.id) await messenger.messages.abortList(page.id).catch(() => {});
      throw new ScanAborted();
    }
    yield page.messages;
    if (!page.id) return;
    page = await messenger.messages.continueList(page.id);
  }
}

/** Lower-cases header names, so lookups do not depend on their casing. */
function lowerKeys(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) out[k.toLowerCase()] = v;
  return out;
}

async function readHeaders(messageId) {
  // messages.getHeaders() exists since Thunderbird 153 and is much faster than
  // getFull(); older versions fall back to getFull().
  if (typeof messenger.messages.getHeaders === 'function') {
    return lowerKeys(await messenger.messages.getHeaders(messageId));
  }
  const full = await messenger.messages.getFull(messageId);
  return lowerKeys(full.headers);
}

/** Runs fn over items with a bounded number of concurrent calls. */
async function runPool(items, limit, fn, signal) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      if (signal?.aborted) throw new ScanAborted();
      const item = items[next++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

const recipientsOf = m =>
  [...(m.recipients || []), ...(m.ccList || []), ...(m.bccList || [])]
    .map(extractEmail).filter(Boolean);

/**
 * @param {object} opts
 * @param {Date} opts.startDate
 * @param {Date} opts.endDate
 * @param {object} opts.settings  merged settings (see core.mergeSettings)
 * @param {(p: {phase: string, done: number, total?: number}) => void} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 * @param {boolean} [opts.persist]  save the result as the dashboard's last scan
 */
export async function scan({ startDate, endDate, settings, onProgress = () => {}, signal, persist = true }) {
  const accounts = await listAccountFolders();
  const sel = resolveSelection(accounts, settings);
  if (!sel.receive.length) throw new Error('no-receive-folders');

  // 1. Sent messages since the start date: a reply cannot predate the message.
  const now = Date.now();
  const cache = pruneHeaderCache(await loadHeaderCache(), now, settings.headerCacheDays);
  const sent = [];
  const toFetch = [];
  let sentSeen = 0;
  if (sel.sent.length) {
    const query = { folderId: sel.sent.map(f => f.id), fromDate: startDate };
    for await (const messages of queryMessages(query, signal)) {
      for (const m of messages) {
        const entry = {
          refs: [],
          subject: m.subject || '',
          date: new Date(m.date).getTime(),
          recipients: recipientsOf(m)
        };
        const key = normalizeMessageId(m.headerMessageId);
        if (key && cache[key]) entry.refs = cache[key].r;
        else toFetch.push({ m, entry, key });
        sent.push(entry);
      }
      sentSeen += messages.length;
      onProgress({ phase: 'sent', done: sentSeen });
    }
  }

  let headerErrors = 0;
  let fetched = 0;
  await runPool(toFetch, HEADER_CONCURRENCY, async ({ m, entry, key }) => {
    try {
      const h = await readHeaders(m.id);
      entry.refs = [...parseMessageIdList(h['in-reply-to']), ...parseMessageIdList(h['references'])];
      if (key) cache[key] = { r: entry.refs, d: entry.date };
    } catch (e) {
      // E.g. IMAP message not available offline and server unreachable:
      // the subject fallback still applies.
      headerErrors++;
      console.warn('thunderdash: cannot read headers', m.id, e);
    }
    fetched++;
    if (fetched % 20 === 0 || fetched === toFetch.length) {
      onProgress({ phase: 'headers', done: fetched, total: toFetch.length });
    }
  }, signal);
  await saveHeaderCache(cache);

  const index = buildReplyIndex(sent);

  // 2. Received messages in the range.
  const keywords = [...settings.transactionalKeywords, ...settings.customExclusions];
  const rows = [];
  const seen = new Set();
  let inboxSeen = 0;
  const folderById = new Map(sel.receive.map(f => [f.id, f]));
  const query = { folderId: sel.receive.map(f => f.id), fromDate: startDate, toDate: endDate };
  for await (const messages of queryMessages(query, signal)) {
    for (const m of messages) {
      const authorEmail = extractEmail(m.author);
      if (authorEmail && sel.identities.has(authorEmail)) continue;
      const hmid = normalizeMessageId(m.headerMessageId);
      // The same message can live in several folders (e.g. Gmail labels).
      if (hmid) {
        if (seen.has(hmid)) continue;
        seen.add(hmid);
      }
      const date = new Date(m.date).getTime();
      const reply = findReply(
        { headerMessageId: hmid, subject: m.subject, date, authorEmail },
        index,
        { subjectFallback: settings.subjectFallback }
      );
      if (reply) continue;
      const folder = folderById.get(m.folder?.id);
      rows.push({
        id: m.id,
        headerMessageId: hmid,
        author: m.author || '',
        authorName: displayName(m.author),
        authorEmail,
        subject: m.subject || '',
        date,
        accountId: folder?.accountId ?? m.folder?.accountId ?? '',
        accountName: folder?.accountName ?? '',
        folderName: folder?.name ?? m.folder?.name ?? '',
        folderPath: folder?.path ?? m.folder?.path ?? '',
        tags: m.tags || [],
        read: Boolean(m.read),
        flagged: Boolean(m.flagged),
        transactional: matchesKeyword(m.author, m.subject, keywords)
      });
    }
    inboxSeen += messages.length;
    onProgress({ phase: 'inbox', done: inboxSeen });
  }

  const result = {
    at: now,
    startDate: startDate.getTime(),
    endDate: endDate.getTime(),
    rows,
    stats: {
      receiveFolders: sel.receive.length,
      sentFolders: sel.sent.length,
      sentMessages: sent.length,
      receivedMessages: inboxSeen,
      headerErrors
    }
  };
  if (persist) await saveLastScan(result);
  return result;
}

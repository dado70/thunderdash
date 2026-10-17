// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Alessandro (dado) Scapuzzi <dado70@gmail.com>
//
// Actions on single messages. MessageHeader.id is valid only for the current
// session and folder, so cached rows are re-resolved by Message-ID header.

import { normalizeMessageId } from './core.mjs';

export const REPLY_TAG_KEY = 'thunderdash_reply';
const REPLY_TAG_COLOR = '#E8590C';

/** Returns a currently valid MessageHeader for the row, or null. */
export async function resolveMessage(row) {
  if (row.id !== undefined) {
    try {
      const m = await messenger.messages.get(row.id);
      if (m && normalizeMessageId(m.headerMessageId) === row.headerMessageId) return m;
    } catch {
      // Stale id (e.g. after a restart): fall through.
    }
  }
  if (!row.headerMessageId) return null;
  const page = await messenger.messages.query({ headerMessageId: row.headerMessageId });
  const m = page.messages[0] || null;
  if (page.id) await messenger.messages.abortList(page.id).catch(() => {});
  return m;
}

async function requireMessage(row) {
  const m = await resolveMessage(row);
  if (!m) throw new Error('message-not-found');
  row.id = m.id;
  return m;
}

export async function openMessage(row) {
  const m = await requireMessage(row);
  await messenger.messageDisplay.open({ messageId: m.id, location: 'tab', active: true });
}

export async function replyToMessage(row, replyType = 'replyToSender') {
  const m = await requireMessage(row);
  await messenger.compose.beginReply(m.id, replyType);
}

export async function setMessageTags(row, tags) {
  const m = await requireMessage(row);
  await messenger.messages.update(m.id, { tags });
  row.tags = [...tags];
}

export const listTags = () => messenger.messages.tags.list();

/**
 * Makes sure a "reply" tag exists. An existing tag with the same name
 * (case-insensitive) is reused instead of creating a duplicate.
 */
export async function ensureReplyTag() {
  const name = messenger.i18n.getMessage('replyTagName');
  const tags = await messenger.messages.tags.list();
  if (tags.some(t => t.key === REPLY_TAG_KEY || t.tag.toLowerCase() === name.toLowerCase())) return;
  await messenger.messages.tags.create(REPLY_TAG_KEY, name, REPLY_TAG_COLOR);
}

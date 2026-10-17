// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Alessandro (dado) Scapuzzi <dado70@gmail.com>
//
// Sends an HTML e-mail through the user's own Thunderbird account (SMTP
// settings and Sent copy as configured for the identity).

export const REPORT_HEADER = 'X-Thunderdash-Report';

/** True if mail can be sent without opening a compose window (TB 153+). */
export const canSendSilently = () => typeof messenger.messages.sendMessage === 'function';

/**
 * Mode "default": sent immediately when online, otherwise queued in the
 * Outbox and sent by Thunderbird later.
 */
export async function sendHtmlMail({ identityId, to, subject, html }) {
  const details = {
    to,
    subject,
    body: html,
    isPlainText: false,
    // HTML plus a plain text alternative derived by Thunderbird.
    deliveryFormat: 'both',
    customHeaders: [{ name: REPORT_HEADER, value: '1' }]
  };
  if (identityId) details.identityId = identityId;

  if (canSendSilently()) {
    // Thunderbird 153+: background send, no window.
    return messenger.messages.sendMessage(details, { mode: 'default' });
  }
  // Thunderbird 128–152: a compose window opens briefly and is sent.
  const tab = await messenger.compose.beginNew(details);
  return messenger.compose.sendMessage(tab.id, { mode: 'default' });
}

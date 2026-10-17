// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Alessandro (dado) Scapuzzi <dado70@gmail.com>
//
// Minimal localization of static markup through data-i18n* attributes.

export const t = (key, subs) => messenger.i18n.getMessage(key, subs) || key;

const ATTRS = [
  ['data-i18n-title', 'title'],
  ['data-i18n-placeholder', 'placeholder'],
  ['data-i18n-aria-label', 'aria-label']
];

export function localizeDocument(root = document) {
  document.documentElement.lang = messenger.i18n.getUILanguage();
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const [attr, target] of ATTRS) {
    for (const el of root.querySelectorAll(`[${attr}]`)) {
      el.setAttribute(target, t(el.getAttribute(attr)));
    }
  }
}

/** Short date + time in the UI language. */
export function formatDateTime(ms) {
  return new Date(ms).toLocaleString(messenger.i18n.getUILanguage(), {
    dateStyle: 'short',
    timeStyle: 'short'
  });
}

/** yyyy-mm-dd in local time, for <input type="date">. */
export function toDateInput(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parses yyyy-mm-dd as local midnight (new Date('yyyy-mm-dd') is UTC). */
export function fromDateInput(value, endOfDay = false) {
  const [y, m, d] = value.split('-').map(Number);
  return endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
}

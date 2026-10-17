// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Alessandro (dado) Scapuzzi <dado70@gmail.com>
//
// Builds the HTML summary e-mail. Pure: translations and date formatting are
// injected, so it can be unit tested. Inline styles only, for compatibility
// with mail clients.

import { ageInDays, escapeHtml, severity } from './core.mjs';

const C = {
  text: '#1d2228', muted: '#5d6670', border: '#dde1e6', head: '#f0f2f5',
  critical: '#a51d1d', criticalBg: '#fde4e4', warning: '#7a5200', warningBg: '#fff3d6', accent: '#1c6fc4'
};

/**
 * @param {object} p
 * @param {Array} p.rows        scan rows (already without ignored ones)
 * @param {object} p.settings   merged settings (thresholds)
 * @param {object} p.schedule   sanitized schedule
 * @param {object} p.notes      { headerMessageId: {text} }
 * @param {Array}  p.tags       Thunderbird tags [{key, tag, color}]
 * @param {number} p.now
 * @param {number} p.rangeStart
 * @param {(key: string, subs?: string[]) => string} p.t
 * @param {(ms: number) => string} p.formatDate
 * @returns {{subject: string, html: string, pending: number, critical: number}}
 */
export function buildReport({ rows, settings, schedule, notes, tags, now, rangeStart, t, formatDate }) {
  const { warningDays, criticalDays } = settings;
  const tagName = key => tags.find(x => x.key === key)?.tag || key;
  const items = rows
    .filter(r => !(schedule.excludeTransactional && r.transactional))
    .map(r => {
      const days = ageInDays(r.date, now);
      return { ...r, days, severity: severity(days, warningDays, criticalDays) };
    });

  const total = items.length;
  const critical = items.filter(r => r.severity === 'critical').length;
  const warning = items.filter(r => r.severity === 'warning').length;

  const accounts = new Map();
  for (const r of items) {
    const key = r.accountId || '';
    if (!accounts.has(key)) accounts.set(key, { name: r.accountName || t('reportUnknownAccount'), rows: [] });
    accounts.get(key).rows.push(r);
  }

  const cell = 'padding:6px 8px;border-bottom:1px solid ' + C.border + ';vertical-align:top;';
  const th = cell + 'background:' + C.head + ';text-align:left;font-size:12px;color:' + C.muted + ';';

  const counter = (label, value, color, bg) =>
    `<td style="padding:10px 14px;border:1px solid ${C.border};background:${bg};border-radius:6px;">` +
    `<div style="font-size:22px;font-weight:bold;color:${color};">${value}</div>` +
    `<div style="font-size:12px;color:${C.muted};">${escapeHtml(label)}</div></td>`;

  let body = '';
  body += `<h1 style="font-size:20px;margin:0 0 4px;">${escapeHtml(t('reportTitle'))}</h1>`;
  body += `<p style="margin:0 0 16px;color:${C.muted};font-size:13px;">` +
    escapeHtml(t('reportPeriod', [formatDate(rangeStart), formatDate(now)])) + '</p>';
  body += '<table role="presentation" cellspacing="8" style="border-collapse:separate;margin:0 0 16px -8px;"><tr>' +
    counter(t('statPending'), total, C.text, '#ffffff') +
    counter(t('statCritical', [String(criticalDays)]), critical, C.critical, C.criticalBg) +
    counter(t('statWarning', [String(warningDays)]), warning, C.warning, C.warningBg) +
    '</tr></table>';

  if (!total) {
    body += `<p style="font-size:15px;">${escapeHtml(t('reportNothingPending'))}</p>`;
  }

  const sortedAccounts = [...accounts.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const acc of sortedAccounts) {
    const accCritical = acc.rows.filter(r => r.severity === 'critical').sort((a, b) => a.date - b.date);
    const accWarning = acc.rows.filter(r => r.severity === 'warning').length;
    body += `<h2 style="font-size:16px;margin:20px 0 6px;">${escapeHtml(acc.name)}</h2>`;
    body += `<p style="margin:0 0 8px;color:${C.muted};font-size:13px;">` +
      escapeHtml(t('reportAccountCounts', [String(acc.rows.length), String(accCritical.length), String(accWarning)])) + '</p>';
    if (!accCritical.length) {
      body += `<p style="margin:0 0 8px;font-size:13px;">${escapeHtml(t('reportNoCritical'))}</p>`;
      continue;
    }
    body += '<table cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px;">' +
      `<tr><th style="${th}">${escapeHtml(t('colAge'))}</th><th style="${th}">${escapeHtml(t('colFrom'))}</th>` +
      `<th style="${th}">${escapeHtml(t('colSubject'))}</th><th style="${th}">${escapeHtml(t('colReceived'))}</th>` +
      `<th style="${th}">${escapeHtml(t('colTags'))}</th></tr>`;
    for (const r of accCritical) {
      const note = r.headerMessageId ? notes[r.headerMessageId]?.text : '';
      const tagHtml = (r.tags || []).map(k => {
        const tg = tags.find(x => x.key === k);
        const color = tg && /^#[0-9a-f]{3,8}$/i.test(tg.color) ? tg.color : C.muted;
        return `<span style="display:inline-block;margin:0 4px 2px 0;padding:0 6px;border:1px solid ${color};` +
          `border-radius:9px;font-size:11px;color:${color};">${escapeHtml(tagName(k))}</span>`;
      }).join('');
      const days = r.days === 1 ? t('dayOne') : t('dayMany', [String(r.days)]);
      body += '<tr>' +
        `<td style="${cell}white-space:nowrap;"><span style="background:${C.criticalBg};color:${C.critical};` +
        `padding:1px 7px;border-radius:9px;font-weight:bold;">${escapeHtml(days)}</span></td>` +
        `<td style="${cell}">${escapeHtml(r.authorName || r.author)}` +
        (r.authorEmail && r.authorEmail !== r.authorName
          ? `<br><span style="color:${C.muted};font-size:12px;">${escapeHtml(r.authorEmail)}</span>` : '') + '</td>' +
        `<td style="${cell}"><strong>${escapeHtml(r.subject || t('noSubject'))}</strong>` +
        (note ? `<br><em style="color:${C.muted};">${escapeHtml(note).replace(/\n/g, '<br>')}</em>` : '') + '</td>' +
        `<td style="${cell}white-space:nowrap;">${escapeHtml(formatDate(r.date))}</td>` +
        `<td style="${cell}">${tagHtml}</td>` +
        '</tr>';
    }
    body += '</table>';
  }

  body += `<p style="margin:24px 0 0;color:${C.muted};font-size:11px;">` +
    escapeHtml(t('reportFooter', [t('extensionName')])) + '</p>';

  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
    `<body style="margin:0;padding:16px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${C.text};">` +
    `<div style="max-width:820px;">${body}</div></body></html>`;

  const subject = schedule.label
    ? t('reportSubjectLabel', [schedule.label, String(total), String(critical)])
    : t('reportSubject', [String(total), String(critical)]);
  return { subject, html, pending: total, critical };
}

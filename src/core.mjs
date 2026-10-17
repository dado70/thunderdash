// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Alessandro (dado) Scapuzzi <dado70@gmail.com>
//
// Pure logic, with no dependency on the Thunderbird APIs, so it can be unit
// tested with Node (see tests/core.test.mjs).

export const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_TRANSACTIONAL_KEYWORDS = [
  'noreply', 'no-reply', 'no_reply', 'donotreply', 'do-not-reply',
  'newsletter', 'mailer-daemon', 'postmaster', 'notification', 'notifiche',
  'notifica', 'bounce', 'billing', 'conferma', 'confirm'
];

export const DEFAULT_SETTINGS = Object.freeze({
  warningDays: 2,
  criticalDays: 5,
  defaultRangeDays: 30,
  hideTransactional: false,
  subjectFallback: true,
  transactionalKeywords: DEFAULT_TRANSACTIONAL_KEYWORDS,
  customExclusions: [],
  // Overrides of the default folder selection, keyed by folderKey().
  // true = include, false = exclude. Missing key = default behaviour.
  receiveOverrides: {},
  sentOverrides: {},
  headerCacheDays: 400,
  // Scheduled reports (see sanitizeSchedule).
  reportRangeDays: 30,
  schedules: []
});

/**
 * Merges stored settings over the defaults, discarding unknown keys and
 * values of the wrong type.
 */
export function mergeSettings(stored) {
  // Copy arrays and objects, so callers never mutate the frozen defaults.
  const out = {};
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    out[key] = Array.isArray(def) ? [...def] : typeof def === 'object' ? { ...def } : def;
  }
  if (!stored || typeof stored !== 'object') return out;
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    const val = stored[key];
    if (val === undefined || val === null) continue;
    if (key === 'schedules') {
      if (Array.isArray(val)) out.schedules = val.map(sanitizeSchedule).filter(Boolean);
    } else if (Array.isArray(def)) {
      if (Array.isArray(val)) out[key] = val.filter(v => typeof v === 'string');
    } else if (typeof def === 'object') {
      if (typeof val === 'object' && !Array.isArray(val)) out[key] = { ...val };
    } else if (typeof val === typeof def) {
      out[key] = val;
    }
  }
  if (!(out.warningDays >= 0)) out.warningDays = DEFAULT_SETTINGS.warningDays;
  if (!(out.criticalDays > out.warningDays)) out.criticalDays = out.warningDays + 1;
  if (!(out.defaultRangeDays >= 1)) out.defaultRangeDays = DEFAULT_SETTINGS.defaultRangeDays;
  if (!(out.reportRangeDays >= 1)) out.reportRangeDays = DEFAULT_SETTINGS.reportRangeDays;
  return out;
}

/** Stable key for a folder, independent of the session-scoped folder id. */
export function folderKey(accountId, path) {
  return `${accountId}|${path}`;
}

/** Strips angle brackets and whitespace from a Message-ID. */
export function normalizeMessageId(id) {
  if (typeof id !== 'string') return '';
  return id.trim().replace(/^<+/, '').replace(/>+$/, '').trim();
}

/**
 * Extracts the Message-IDs contained in In-Reply-To / References header
 * values. Accepts a string or an array of strings (as returned by the
 * Thunderbird headers dictionary).
 */
export function parseMessageIdList(value) {
  const values = Array.isArray(value) ? value : [value];
  const ids = [];
  for (const v of values) {
    if (typeof v !== 'string' || !v.trim()) continue;
    const bracketed = v.match(/<[^<>\s]+>/g);
    const tokens = bracketed || v.split(/\s+/);
    for (const t of tokens) {
      const id = normalizeMessageId(t);
      if (id) ids.push(id);
    }
  }
  return ids;
}

// Reply / forward prefixes used by common mail clients in several languages:
// re, r, ris, rif (it), aw, wg (de), sv, vs (nordic), antw (nl), tr, rv, enc,
// res (fr/es/pt), fw, fwd, i (it, Outlook "Inoltro").
const PREFIX_RE = /^\s*(?:re|r|ris|rif|aw|sv|vs|antw|fw|fwd|i|wg|tr|rv|enc|res)\s*(?:\[\d+\]|\(\d+\))?\s*:\s*/i;
const TAG_PREFIX_RE = /^\s*\[[^\]]{1,40}\]\s*/;

/** Normalizes a subject for reply matching (prefixes, case, whitespace). */
export function normalizeSubject(subject) {
  if (typeof subject !== 'string') return '';
  let s = subject;
  let prev;
  do {
    prev = s;
    s = s.replace(PREFIX_RE, '');
    // "[list] Re: subject" -> strip a leading list tag only if a prefix follows.
    const tagged = s.match(TAG_PREFIX_RE);
    if (tagged && PREFIX_RE.test(s.slice(tagged[0].length))) {
      s = s.slice(tagged[0].length);
    }
  } while (s !== prev);
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Extracts the lower-cased address from "Name <addr@host>" or "addr@host". */
export function extractEmail(mailbox) {
  if (typeof mailbox !== 'string') return '';
  const bracket = mailbox.match(/<([^<>\s]+@[^<>\s]+)>/);
  if (bracket) return bracket[1].toLowerCase();
  const bare = mailbox.match(/[^\s<>"',;]+@[^\s<>"',;]+/);
  return bare ? bare[0].toLowerCase() : '';
}

/** Display name of a mailbox, falling back to the address. */
export function displayName(mailbox) {
  if (typeof mailbox !== 'string') return '';
  const m = mailbox.match(/^\s*"?([^"<]*?)"?\s*<[^>]*>\s*$/);
  if (m && m[1].trim()) return m[1].trim();
  return mailbox.trim();
}

/** Splits a comma/newline separated keyword list into clean lower-case terms. */
export function parseKeywordList(text) {
  if (typeof text !== 'string') return [];
  const seen = new Set();
  for (const raw of text.split(/[\n,;]+/)) {
    const kw = raw.trim().toLowerCase();
    if (kw) seen.add(kw);
  }
  return [...seen];
}

/** True if author or subject contains one of the keywords. */
export function matchesKeyword(author, subject, keywords) {
  const a = (author || '').toLowerCase();
  const s = (subject || '').toLowerCase();
  return keywords.some(kw => kw && (a.includes(kw) || s.includes(kw)));
}

/** Whole days elapsed between date and now (never negative). */
export function ageInDays(date, now) {
  const diff = now - date;
  return diff > 0 ? Math.floor(diff / DAY_MS) : 0;
}

export function severity(days, warningDays, criticalDays) {
  if (days >= criticalDays) return 'critical';
  if (days >= warningDays) return 'warning';
  return 'normal';
}

/**
 * Builds the reply index from the sent messages.
 * @param {Array<{refs: string[], subject: string, date: number, recipients: string[]}>} sent
 */
export function buildReplyIndex(sent) {
  const ids = new Set();
  const subjects = new Map();
  for (const s of sent) {
    for (const id of s.refs || []) ids.add(id);
    const subj = normalizeSubject(s.subject);
    if (!subj) continue;
    if (!subjects.has(subj)) subjects.set(subj, []);
    subjects.get(subj).push({ date: s.date, recipients: new Set(s.recipients || []) });
  }
  return { ids, subjects };
}

/**
 * Returns how a received message was answered: 'header' (referenced by
 * In-Reply-To/References of a sent message), 'subject' (fallback: a later
 * sent message with the same normalized subject addressed to the sender),
 * or null if no reply was found.
 * @param {{headerMessageId: string, subject: string, date: number, authorEmail: string}} msg
 */
export function findReply(msg, index, { subjectFallback = true } = {}) {
  const id = normalizeMessageId(msg.headerMessageId);
  if (id && index.ids.has(id)) return 'header';
  if (!subjectFallback) return null;
  const subj = normalizeSubject(msg.subject);
  if (subj.length < 3 || !msg.authorEmail) return null;
  const candidates = index.subjects.get(subj);
  if (!candidates) return null;
  return candidates.some(c => c.date >= msg.date && c.recipients.has(msg.authorEmail))
    ? 'subject'
    : null;
}

/** Applies dashboard filters to result rows. */
export function filterRows(rows, f) {
  const text = (f.text || '').trim().toLowerCase();
  return rows.filter(r => {
    // view: 'pending' (default) hides ignored rows, 'ignored' shows only them.
    if ((f.view === 'ignored') !== Boolean(r.ignored)) return false;
    if (f.hideTransactional && r.transactional) return false;
    if (f.type === 'action' && r.transactional) return false;
    if (f.type === 'transactional' && !r.transactional) return false;
    if (f.account && r.accountId !== f.account) return false;
    if (f.tag && !(r.tags || []).includes(f.tag)) return false;
    if (f.sender && r.authorEmail !== f.sender) return false;
    if (f.severity && r.severity !== f.severity) return false;
    if (text) {
      const hay = `${r.author} ${r.subject} ${r.note || ''}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });
}

// 'age' grows as the date gets older: descending age = oldest first.
const SORTERS = {
  age: r => -r.date,
  author: r => (r.author || '').toLowerCase(),
  subject: r => normalizeSubject(r.subject),
  date: r => r.date,
  folder: r => `${r.accountName} ${r.folderPath}`.toLowerCase(),
  type: r => (r.transactional ? 1 : 0)
};

/** Returns a sorted copy of rows. */
export function sortRows(rows, key, dir) {
  const get = SORTERS[key] || SORTERS.age;
  const mul = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = get(a), vb = get(b);
    if (va < vb) return -1 * mul;
    if (va > vb) return 1 * mul;
    return 0;
  });
}

function csvCell(value, sep) {
  let s = value === null || value === undefined ? '' : String(value);
  // Neutralize spreadsheet formula injection (OWASP CSV injection).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (s.includes(sep) || /["\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** RFC 4180 CSV with a configurable separator. */
export function buildCsv(headers, rows, sep = ',') {
  const lines = [headers.map(h => csvCell(h, sep)).join(sep)];
  for (const row of rows) lines.push(row.map(c => csvCell(c, sep)).join(sep));
  return lines.join('\r\n') + '\r\n';
}

/** Drops header-cache entries older than maxAgeDays. Returns a new object. */
export function pruneHeaderCache(cache, now, maxAgeDays) {
  const limit = now - maxAgeDays * DAY_MS;
  const out = {};
  for (const [k, v] of Object.entries(cache || {})) {
    if (v && typeof v.d === 'number' && v.d >= limit && Array.isArray(v.r)) out[k] = v;
  }
  return out;
}

/** Validates an imported backup object; returns the clean subset. */
export function sanitizeBackup(data) {
  if (!data || typeof data !== 'object' || data.app !== 'thunderdash') {
    throw new Error('invalid-backup');
  }
  const clean = { notes: {}, ignored: {}, settings: mergeSettings(data.settings) };
  for (const [k, v] of Object.entries(data.notes || {})) {
    if (typeof k === 'string' && v && typeof v.text === 'string') {
      clean.notes[k] = { text: v.text.slice(0, 5000), updated: Number(v.updated) || 0 };
    }
  }
  for (const [k, v] of Object.entries(data.ignored || {})) {
    if (typeof k === 'string' && v && typeof v === 'object') {
      clean.ignored[k] = {
        subject: String(v.subject || ''),
        author: String(v.author || ''),
        date: Number(v.date) || 0,
        ignoredAt: Number(v.ignoredAt) || 0
      };
    }
  }
  return clean;
}

/**
 * Groups rows by sender address, most urgent correspondents first.
 * @returns {Array<{email: string, name: string, count: number, critical: number,
 *   warning: number, oldest: number}>}
 */
export function groupByCorrespondent(rows) {
  const map = new Map();
  for (const r of rows) {
    const email = r.authorEmail || (r.author || '').toLowerCase();
    if (!email) continue;
    let g = map.get(email);
    if (!g) {
      g = { email, name: r.authorName || r.author || email, count: 0, critical: 0, warning: 0, oldest: r.date };
      map.set(email, g);
    }
    g.count++;
    if (r.severity === 'critical') g.critical++;
    else if (r.severity === 'warning') g.warning++;
    if (r.date < g.oldest) g.oldest = r.date;
  }
  return [...map.values()].sort((a, b) =>
    b.critical - a.critical || b.count - a.count || a.oldest - b.oldest || a.email.localeCompare(b.email));
}

// ------------------------------------------------------------- schedules

export const FREQUENCIES = ['daily', 'weekly', 'monthly'];
const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

export const isValidEmail = s => typeof s === 'string' && EMAIL_RE.test(s.trim());

/** Splits a recipients text (comma, semicolon, newline) into valid addresses. */
export function parseRecipients(text) {
  if (typeof text !== 'string') return [];
  return [...new Set(text.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(isValidEmail))];
}

/**
 * Validates a scheduled report definition; returns a clean copy or null.
 * weekday: 0 = Sunday … 6 = Saturday (as Date.getDay()). monthDay: 1–31,
 * clamped to the length of shorter months.
 */
export function sanitizeSchedule(s) {
  if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !s.id) return null;
  const time = typeof s.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time) ? s.time : '08:00';
  const int = (v, min, max, def) => (Number.isInteger(v) && v >= min && v <= max ? v : def);
  return {
    id: s.id,
    enabled: s.enabled !== false,
    label: typeof s.label === 'string' ? s.label.slice(0, 80) : '',
    to: Array.isArray(s.to) ? [...new Set(s.to.map(x => String(x).trim().toLowerCase()).filter(isValidEmail))] : [],
    identityId: typeof s.identityId === 'string' ? s.identityId : '',
    frequency: FREQUENCIES.includes(s.frequency) ? s.frequency : 'daily',
    time,
    weekday: int(s.weekday, 0, 6, 1),
    monthDay: int(s.monthDay, 1, 31, 1),
    includeZero: s.includeZero !== false,
    excludeTransactional: s.excludeTransactional !== false,
    updatedAt: Number(s.updatedAt) || 0
  };
}

const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

function at(y, m, d, time) {
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m, d, hh, mm, 0, 0);
}

function monthly(y, m, s) {
  // Normalize month overflow before clamping the day.
  const first = new Date(y, m, 1);
  const yy = first.getFullYear(), mo = first.getMonth();
  return at(yy, mo, Math.min(s.monthDay, daysInMonth(yy, mo)), s.time);
}

/** Latest scheduled time <= now (local time, DST-safe). */
export function previousOccurrence(s, now) {
  const n = new Date(now);
  const y = n.getFullYear(), m = n.getMonth(), d = n.getDate();
  let c;
  if (s.frequency === 'daily') {
    c = at(y, m, d, s.time);
    if (c > n) c = at(y, m, d - 1, s.time);
  } else if (s.frequency === 'weekly') {
    c = at(y, m, d - ((n.getDay() - s.weekday + 7) % 7), s.time);
    if (c > n) c = at(c.getFullYear(), c.getMonth(), c.getDate() - 7, s.time);
  } else {
    c = monthly(y, m, s);
    if (c > n) c = monthly(y, m - 1, s);
  }
  return c.getTime();
}

/** First scheduled time > now. */
export function nextOccurrence(s, now) {
  const n = new Date(now);
  const y = n.getFullYear(), m = n.getMonth(), d = n.getDate();
  let c;
  if (s.frequency === 'daily') {
    c = at(y, m, d, s.time);
    if (c <= n) c = at(y, m, d + 1, s.time);
  } else if (s.frequency === 'weekly') {
    c = at(y, m, d + ((s.weekday - n.getDay() + 7) % 7), s.time);
    if (c <= n) c = at(c.getFullYear(), c.getMonth(), c.getDate() + 7, s.time);
  } else {
    c = monthly(y, m, s);
    if (c <= n) c = monthly(y, m + 1, s);
  }
  return c.getTime();
}

/**
 * True if an occurrence passed since the last run and since the schedule was
 * last edited. Missed occurrences (Thunderbird closed) collapse into one run.
 */
export function isDue(s, lastRunAt, now) {
  if (!s.enabled || !s.to.length) return false;
  return previousOccurrence(s, now) > Math.max(lastRunAt || 0, s.updatedAt || 0);
}

/** Escapes text for inclusion in an HTML string (used for report e-mails). */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-10-17

### Added
- **Scheduled summary e-mail** (HTML), configured in Options → *Scheduled summary*:
  - any number of schedules (e.g. one for you and one for a colleague), each with its own
    recipients, sending identity, frequency (daily / weekly / monthly), time, weekday or
    day of the month;
  - content: counters, critical e-mails grouped by account, with Thunderbird tags and
    personal notes; uses the accounts/folders selected in Options; ignored e-mails are
    left out, transactional ones optionally;
  - period: last N days (default 30);
  - option to send even when nothing is pending;
  - **catch-up**: a summary missed while Thunderbird was closed is sent once at the next
    start-up;
  - **Save and send now** button, last send / next send / last error shown per schedule;
  - sent through your own Thunderbird account; on Thunderbird 153+ in the background,
    on 128–152 through a compose window that opens briefly;
  - messages carry the `X-Thunderdash-Report: 1` header, usable in message filters.
- **Correspondents to reply to** panel in the dashboard: senders with pending e-mails,
  critical count and oldest pending e-mail, with search; clicking a sender filters the list
  (removable filter chip).
- New permissions: `alarms`, `compose.send`, `messages.send` (the latter only on
  Thunderbird 153+, ignored by older versions).

### Changed
- Settings merge copies default arrays/objects (no shared mutable defaults).

## [0.1.0] - 2026-10-17

### Added
- First release: dashboard of received e-mails without a reply (Message-ID /
  In-Reply-To / References matching with subject fallback), configurable folders,
  filters, sorting, CSV export, Thunderbird tags, personal notes, ignore/restore,
  header cache, JSON backup, Italian and English UI.

[Unreleased]: https://github.com/dado70/thunderdash/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/dado70/thunderdash/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/dado70/thunderdash/releases/tag/v0.1.0

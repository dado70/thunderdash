// SPDX-License-Identifier: MIT
// Path data copied verbatim from Tabler Icons 3.49.0 (outline set),
// https://github.com/tabler/tabler-icons - Copyright (c) 2020-2026 Paweł Kuna,
// MIT License (see icons/LICENSE-tabler-icons.txt).

const PATHS = {
  'mail-opened': ["M3 9l9 6l9 -6l-9 -6l-9 6", "M21 9v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10", "M3 19l6 -6", "M15 13l6 6"],
  'arrow-back-up': ["M9 14l-4 -4l4 -4", "M5 10h11a4 4 0 1 1 0 8h-1"],
  'tag': ["M6.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3"],
  'note': ["M13 20l7 -7", "M13 20v-6a1 1 0 0 1 1 -1h6v-7a2 2 0 0 0 -2 -2h-12a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7"],
  'eye-off': ["M10.585 10.587a2 2 0 0 0 2.829 2.828", "M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87", "M3 3l18 18"],
  'restore': ["M3.06 13a9 9 0 1 0 .49 -4.087", "M3 4.001v5h5", "M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"],
  'refresh': ["M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4", "M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"],
  'download': ["M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2", "M7 11l5 5l5 -5", "M12 4l0 12"],
  'settings': ["M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065", "M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"],
  'search': ["M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0", "M21 21l-6 -6"],
  'x': ["M18 6l-12 12", "M6 6l12 12"],
  'chevron-down': ["M6 9l6 6l6 -6"],
  'chevron-right': ["M9 6l6 6l-6 6"],
  'player-stop': ["M5 7a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2l0 -10"]
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Returns a decorative inline SVG element for a Tabler icon. */
export function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({
    viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none', stroke: 'currentColor',
    'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'aria-hidden': 'true', focusable: 'false', class: 'icon'
  })) svg.setAttribute(k, v);
  for (const d of PATHS[name] || []) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

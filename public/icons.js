// Set di icone SVG inline (tratto 2px, angoli arrotondati, colore = currentColor).
// Le icone sono sempre decorative (aria-hidden): il nome accessibile va sul pulsante (testo o aria-label).
const P = {
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  settings: '<path d="M4 7h8M16 7h4M4 17h4M12 17h8"/><circle cx="14" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M18 13l-6 6-6-6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chat: '<path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1.4-4.4a8.5 8.5 0 1 1 15.6-4.6z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7.5l8 5.5 8-5.5"/>',
  link: '<path d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1 1"/><path d="M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1-1"/>',
  share: '<path d="M12 3v12M7.5 7.5L12 3l4.5 4.5"/><path d="M5 12v6a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  reorder: '<path d="M8 20V4M4 8l4-4 4 4M16 4v16M12 16l4 4 4-4"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20.5V16h-4.5"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="3"/><path d="M11 18h2"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 15V4M7 9l5-5 5 5M5 20h14"/>',
  logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 16.5L4.5 12 9 7.5M4.5 12H15"/>',
  a11y: '<circle cx="12" cy="4.5" r="1.8"/><path d="M4.5 8.5L12 10l7.5-1.5M12 10v4.5M12 14.5L9 21M12 14.5l3 6.5"/>',
  text: '<path d="M4 18L8.5 6 13 18M5.6 14h5.8M15 18l2.75-7.5L20.5 18M15.9 15.5h3.7"/>',
  contrast: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>',
  motion: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.4-2.2-.6-1.2.2-2.6 1.6-2.6H17a3.5 3.5 0 0 0 3.5-3.5c0-4.9-3.8-8.7-8.5-8.7z"/><circle cx="7.5" cy="11" r="1.1" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1.1" fill="currentColor"/><circle cx="15" cy="7.8" r="1.1" fill="currentColor"/>',
  // pattino: scarpone + lama
  skate: '<path d="M6 3.5h5.5v6l4.2 1.6A3.3 3.3 0 0 1 18 14.2V16H6z"/><path d="M3 20h15.5a2.5 2.5 0 0 0 2.5-2.5M8.5 16v4M15.5 16v4"/>',
  // stati dei progressi: forma diversa per ciascuno (mai solo colore)
  todo: '<circle cx="12" cy="12" r="8" stroke-dasharray="3.2 3"/>',
  doing: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
  done: '<circle cx="12" cy="12" r="9" fill="currentColor"/><path d="M8 12.3l2.8 2.8L16.2 9.5" stroke="#fff"/>',
};

export const icon = (name, cls = "") =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[name] || ""}</svg>`;

export const ICON_NAMES = Object.keys(P);

// Set di icone SVG inline (tratto 2px, angoli arrotondati, colore = currentColor).
// Le icone sono sempre decorative (aria-hidden): il nome accessibile va sul pulsante (testo o aria-label).
const P = {
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  spark: '<path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/><path d="M19 15.5c.25 1.6.9 2.25 2.5 2.5-1.6.25-2.25.9-2.5 2.5-.25-1.6-.9-2.25-2.5-2.5 1.6-.25 2.25-.9 2.5-2.5z"/>',
  gift: '<path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13"/><path d="M12 7c-1.5-3-5-3.5-5-1.2C7 7 9 7 12 7zm0 0c1.5-3 5-3.5 5-1.2C17 7 15 7 12 7z"/>',
  alert: '<path d="M12 3.5L2.8 19.5h18.4z"/><path d="M12 10v4.5"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6"/><path d="M12 17.2v.1"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  settings: '<path d="M19.02 9.67 L21.41 10.09 L21.41 13.91 L19.02 14.33 L18.61 15.32 L20.00 17.30 L17.30 20.00 L15.32 18.61 L14.33 19.02 L13.91 21.41 L10.09 21.41 L9.67 19.02 L8.68 18.61 L6.70 20.00 L4.00 17.30 L5.39 15.32 L4.98 14.33 L2.59 13.91 L2.59 10.09 L4.98 9.67 L5.39 8.68 L4.00 6.70 L6.70 4.00 L8.68 5.39 L9.67 4.98 L10.09 2.59 L13.91 2.59 L14.33 4.98 L15.32 5.39 L17.30 4.00 L20.00 6.70 L18.61 8.68Z"/><circle cx="12" cy="12" r="3"/>',
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
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  auto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.4-2.2-.6-1.2.2-2.6 1.6-2.6H17a3.5 3.5 0 0 0 3.5-3.5c0-4.9-3.8-8.7-8.5-8.7z"/><circle cx="7.5" cy="11" r="1.1" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1.1" fill="currentColor"/><circle cx="15" cy="7.8" r="1.1" fill="currentColor"/>',
  home: '<path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19z"/>',
  users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  group: '<path d="M4 6.5h16M4 12h16M4 17.5h10"/>',
  chart: '<path d="M4 20h16"/><rect x="5.5" y="11" width="3.2" height="6.5" rx="1"/><rect x="10.4" y="7" width="3.2" height="10.5" rx="1"/><rect x="15.3" y="3.5" width="3.2" height="14" rx="1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  // pattino: scarpone + lama
  skate: '<path d="M6 3.5h5.5v6l4.2 1.6A3.3 3.3 0 0 1 18 14.2V16H6z"/><path d="M3 20h15.5a2.5 2.5 0 0 0 2.5-2.5M8.5 16v4M15.5 16v4"/>',
  // stati dei progressi: forma diversa per ciascuno (mai solo colore)
  todo: '<circle cx="12" cy="12" r="8" stroke-dasharray="3.2 3"/>',
  doing: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
  done: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.8 2.8L16.2 9.5" stroke-width="2.4"/>',
};

export const icon = (name, cls = "") =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[name] || ""}</svg>`;

export const ICON_NAMES = Object.keys(P);

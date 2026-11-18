// Preferenze di accessibilità scelte dall'utente (alunno o allenatrice), valide in tutte le modalità.
// Si sommano alle impostazioni di sistema: "Testo più grande" moltiplica la dimensione che il telefono
// già usa (Dynamic Type su iPhone), quindi non può mai rimpicciolire il testo.
const LS = "pg_a11y";
export const TEXT_SCALE = 1.3;
const root = document.documentElement;

export function loadA11y() {
  try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; }
}
export function saveA11y(p) {
  try { localStorage.setItem(LS, JSON.stringify(p)); } catch { /* storage non disponibile: vale solo per questa sessione */ }
  applyA11y(p);
}
export function applyA11y(p = loadA11y()) {
  root.style.removeProperty("font-size");
  if (p.text) {
    const base = parseFloat(getComputedStyle(root).fontSize) || 16; // dimensione di sistema
    root.style.fontSize = `${Math.round(base * TEXT_SCALE * 10) / 10}px`;
  }
  p.contrast ? root.setAttribute("data-contrast", "more") : root.removeAttribute("data-contrast");
  p.motion ? root.setAttribute("data-motion", "reduce") : root.removeAttribute("data-motion");
  // tema: "auto" segue il telefono (prefers-color-scheme), altrimenti scelta esplicita
  const t = p.theme === "light" || p.theme === "dark" ? p.theme : null;
  t ? root.setAttribute("data-theme", t) : root.removeAttribute("data-theme");
  syncThemeColor();
}
// colore della barra del browser/sistema: segue il tema effettivo
const dark = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
export const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : !!(dark && dark.matches);
function syncThemeColor() {
  const c = getComputedStyle(root).getPropertyValue("--bg").trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    if (m.dataset.c == null) { m.dataset.c = m.content; m.dataset.media = m.getAttribute("media") || ""; }
    if (root.dataset.theme) { m.content = c; m.removeAttribute("media"); }
    else { m.content = m.dataset.c; if (m.dataset.media) m.setAttribute("media", m.dataset.media); }
  });
}
if (dark && dark.addEventListener) dark.addEventListener("change", () => applyA11y());
// se l'utente cambia la dimensione del testo di sistema mentre l'app è aperta in background
document.addEventListener("visibilitychange", () => { if (!document.hidden) applyA11y(); });

export const THEMES = [["auto", "auto", "Automatico"], ["light", "sun", "Chiaro"], ["dark", "moon", "Scuro"]];

export const A11Y_OPTIONS = [
  ["text", "text", "Testo più grande", "Ingrandisce il testo oltre la dimensione scelta nel telefono."],
  ["contrast", "contrast", "Contrasto elevato", "Bordi e testi secondari più marcati."],
  ["motion", "motion", "Riduci animazioni", "Toglie movimenti e transizioni."],
];

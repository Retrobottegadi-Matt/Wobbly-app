// Design tokens modificabili dalla pagina #/dev. Gli override vengono salvati
// solo in questo browser (localStorage) e applicati solo in modalità dev.
export const LS_THEME = "pg_theme_v1";

// Colori editabili: [token, etichetta, gruppo]
export const COLOR_TOKENS = [
  ["--bg", "Sfondo", "base"], ["--surface", "Superficie (card bianca)", "base"],
  ["--ink", "Testo / inchiostro", "base"], ["--muted", "Testo secondario", "base"],
  ["--accent", "Accento (link, enfasi)", "base"], ["--focus", "Anello di focus", "base"],
  ["--yellow", "Giallo", "toni"], ["--pink", "Rosa", "toni"], ["--blue", "Azzurro", "toni"],
  ["--green", "Verde", "toni"], ["--lilac", "Lilla", "toni"], ["--orange", "Arancio", "toni"],
];

// Coppie testo/sfondo verificate: [testo, sfondo, minimo richiesto, descrizione]
export const PAIRS = [
  ["--ink", "--bg", 4.5, "Testo su sfondo"],
  ["--ink", "--surface", 4.5, "Testo su card bianca"],
  ["--muted", "--bg", 4.5, "Testo secondario su sfondo"],
  ["--muted", "--surface", 4.5, "Testo secondario su card"],
  ["--accent", "--bg", 4.5, "Accento su sfondo"],
  ["--ink", "--yellow", 4.5, "Testo su giallo"],
  ["--ink", "--pink", 4.5, "Testo su rosa"],
  ["--ink", "--blue", 4.5, "Testo su azzurro"],
  ["--ink", "--green", 4.5, "Testo su verde"],
  ["--ink", "--lilac", 4.5, "Testo su lilla"],
  ["--ink", "--orange", 4.5, "Testo su arancio"],
  ["--muted", "--yellow", 4.5, "Secondario su giallo"],
  ["--muted", "--blue", 4.5, "Secondario su azzurro"],
  ["--muted", "--green", 4.5, "Secondario su verde"],
  ["--focus", "--bg", 3, "Focus su sfondo (UI 3:1)"],
  ["--focus", "--yellow", 3, "Focus su giallo (UI 3:1)"],
];

const root = document.documentElement;
const mq = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : { matches: false };

export const load = () => {
  try { return JSON.parse(localStorage.getItem(LS_THEME)) || {}; } catch { return {}; }
};
const save = (t) => { try { localStorage.setItem(LS_THEME, JSON.stringify(t)); } catch { /* ok */ } };

// schema effettivo: "light" | "dark"
export const scheme = (t = load()) =>
  t.scheme === "light" || t.scheme === "dark" ? t.scheme : (mq.matches ? "dark" : "light");

const SIMPLE = ["--r", "--scale"];
export function apply(t = load()) {
  const sc = scheme(t);
  if (t.scheme === "light" || t.scheme === "dark") root.dataset.theme = t.scheme;
  else delete root.dataset.theme;
  root.dataset.contrast = t.contrast ? "more" : "";
  root.dataset.motion = t.motion ? "reduce" : "";
  COLOR_TOKENS.forEach(([k]) => root.style.removeProperty(k));
  SIMPLE.forEach((k) => root.style.removeProperty(k));
  const col = (t.colors && t.colors[sc]) || {};
  Object.entries(col).forEach(([k, v]) => root.style.setProperty(k, v));
  if (t.r != null) root.style.setProperty("--r", t.r + "px");
  if (t.scale != null) root.style.setProperty("--scale", String(t.scale / 100));
}
export function patch(fn) { const t = load(); fn(t); save(t); apply(t); return t; }
export function reset() { try { localStorage.removeItem(LS_THEME); } catch { /* ok */ } apply({}); }
export function initTheme(devOn) {
  if (!devOn) { apply({}); return; }
  apply();
  mq.addEventListener && mq.addEventListener("change", () => apply());
}

// valore corrente (calcolato) di un token
export const cssVar = (k) => getComputedStyle(root).getPropertyValue(k).trim();

// ---- contrasto WCAG 2.x
function rgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lum = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// CSS da copiare nel file style.css (solo ciò che è stato cambiato)
export function exportCss(t = load()) {
  const out = [];
  const sc = scheme(t);
  const col = (t.colors && t.colors[sc]) || {};
  const sel = sc === "dark" ? ':root[data-theme="dark"]' : ":root";
  const lines = Object.entries(col).map(([k, v]) => `  ${k}: ${v};`);
  if (t.r != null) lines.push(`  --r: ${t.r}px;`);
  if (lines.length) out.push(`${sel} {\n${lines.join("\n")}\n}`);
  return out.join("\n\n") || "/* nessuna modifica */";
}

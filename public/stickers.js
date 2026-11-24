// Sticker di incoraggiamento: l'allenatrice li manda, l'alunno li vede arrivare animati.
// Disegni SVG fatti a mano (niente emoji): colori dai token CSS, bordo bianco "fustellato" come un adesivo vero.
// Nel documento dell'alunno: stickers: [{ id, k, msg, at }] (ultimi 30). Chi li ha già visti lo ricorda il telefono
// dell'alunno (localStorage), così non servono nuovi permessi di scrittura.

export const STICKERS = [
  ["star", "Stellina", "Sei una stella!"],
  ["ok", "Ok", "Ottimo lavoro!"],
  ["keep", "Continua così", "Continua così!"],
  ["heart", "Cuore", "Che passione!"],
  ["fire", "Fuoco", "Sei in forma!"],
  ["medal", "Medaglia", "Te la sei meritata!"],
  ["skate", "Pattino d'oro", "Gran pattinata oggi!"],
  ["spark", "Wow", "Wow, che salto!"],
];
export const STICKER_LABEL = Object.fromEntries(STICKERS.map(([k, l]) => [k, l]));
export const STICKER_MSG = Object.fromEntries(STICKERS.map(([k, , m]) => [k, m]));

// bordo bianco spesso + contorno scuro sottile: si leggono su ogni sfondo, chiaro o scuro
const W = 'stroke="var(--on-pastel-inv)" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"';
const L = 'stroke="var(--on-pastel)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';
const both = (shape) => `<g ${W} fill="var(--on-pastel-inv)">${shape}</g>`;
const T = (x, y, s, t, fill = "var(--on-pastel)") => `<text x="${x}" y="${y}" font-size="${s}" font-weight="900" text-anchor="middle" fill="${fill}" font-family="system-ui,-apple-system,sans-serif">${t}</text>`;

const STAR = "M50 8l12.4 25.1 27.7 4-20 19.6 4.7 27.6L50 71.3 25.2 84.3l4.7-27.6-20-19.6 27.7-4z";
const HEART = "M50 86S12 63 12 37c0-13 10-23 22-23 7 0 12.6 3.4 16 9 3.4-5.6 9-9 16-9 12 0 22 10 22 23 0 26-38 49-38 49z";
const FLAME = "M50 92c-19 0-31-12-31-29 0-15 9-24 15-33 2 8 6 12 10 13-2-13 4-26 16-35 0 14 7 21 13 28 6 7 9 14 9 25 0 18-13 31-32 31z";
const BUBBLE = "M16 18h68a8 8 0 0 1 8 8v36a8 8 0 0 1-8 8H44L26 86l3-16H16a8 8 0 0 1-8-8V26a8 8 0 0 1 8-8z";
const BOOT = "M24 14h28v30l20 8a14 14 0 0 1 10 13v9H24z";

const ART = {
  star: `${both(`<path d="${STAR}"/>`)}<path d="${STAR}" fill="var(--yellow)" ${L}/><path d="M36 40l4-2M58 34l3 1" ${L}/>
    <circle cx="40" cy="52" r="3.2" fill="var(--on-pastel)"/><circle cx="60" cy="52" r="3.2" fill="var(--on-pastel)"/><path d="M43 61q7 6 14 0" ${L} fill="none"/>`,
  ok: `${both('<circle cx="50" cy="50" r="40"/>')}<circle cx="50" cy="50" r="40" fill="var(--sage)" ${L}/>
    <path d="M30 51l13 13 27-28" fill="none" stroke="var(--on-pastel)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`,
  keep: `${both(`<path d="${BUBBLE}"/>`)}<path d="${BUBBLE}" fill="var(--lilac)" ${L}/>${T(50, 42, 15, "CONTINUA")}${T(50, 60, 15, "COSÌ!")}`,
  heart: `${both(`<path d="${HEART}"/>`)}<path d="${HEART}" fill="var(--pink)" ${L}/><path d="M26 34q3-9 12-9" fill="none" stroke="var(--on-pastel-inv)" stroke-width="5" stroke-linecap="round"/>`,
  fire: `${both(`<path d="${FLAME}"/>`)}<path d="${FLAME}" fill="var(--orange)" ${L}/>
    <path d="M50 88c-9 0-15-6-15-14 0-8 6-13 10-18 1 6 4 8 7 8-1-6 2-11 7-15 0 8 6 12 6 21 0 10-6 18-15 18z" fill="var(--yellow)" ${L}/>`,
  medal: `${both('<path d="M30 8h16l8 30H38zM70 8H54l-8 30h16z"/><circle cx="50" cy="62" r="28"/>')}
    <path d="M30 8h16l8 30H38z" fill="var(--sky)" ${L}/><path d="M70 8H54l-8 30h16z" fill="var(--pink)" ${L}/>
    <circle cx="50" cy="62" r="28" fill="var(--yellow)" ${L}/><circle cx="50" cy="62" r="19" fill="none" ${L}/>${T(50, 71, 24, "1")}`,
  skate: `${both(`<path d="${BOOT}"/><path d="M12 84h64a10 10 0 0 0 10-10"/>`)}
    <path d="${BOOT}" fill="var(--sky)" ${L}/><path d="M52 30H38M52 38H40" ${L}/>
    <path d="M12 84h64a10 10 0 0 0 10-10" fill="none" stroke="var(--on-pastel)" stroke-width="6" stroke-linecap="round"/><path d="M34 74v10M66 74v10" ${L}/>
    <path d="M80 18l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="var(--yellow)" ${L}/>`,
  spark: `${both('<rect x="10" y="10" width="80" height="80" rx="24"/>')}<rect x="10" y="10" width="80" height="80" rx="24" fill="var(--orange)" ${L}/>
    <circle cx="36" cy="70" r="22" fill="var(--pink)"/><circle cx="66" cy="74" r="16" fill="var(--sky)"/><rect x="10" y="10" width="80" height="80" rx="24" fill="none" ${L}/>
    <g stroke="var(--on-pastel-inv)" stroke-width="6" stroke-linecap="round" fill="none"><path d="M50 24v14M50 62v14M24 50h14M62 50h14M32 32l9 9M59 59l9 9M68 32l-9 9M41 59l-9 9"/></g>`,
};

export const sticker = (k, cls = "") => `<svg class="stk ${cls}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${ART[k] || ART.star}</svg>`;
export const isSticker = (k) => !!ART[k];

// visti: solo su questo telefono
const LS_SEEN = "pg_seen_stk";
export const seenStickers = () => { try { return new Set(JSON.parse(localStorage.getItem(LS_SEEN) || "[]")); } catch { return new Set(); } };
export function markSeen(ids) {
  const s = seenStickers(); ids.forEach((i) => s.add(i));
  try { localStorage.setItem(LS_SEEN, JSON.stringify([...s].slice(-100))); } catch {}
}

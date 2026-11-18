// Alunni di esempio per la modalità sviluppo (?dev). Dati inventati.
import { CATALOG } from "./catalog.js";

const NAMES = ["Giulia B.", "Marco", "Sofi", "Luca R.", "Emma", "Tommy", "Alice", "Nico", "Bea", "Leo"];
const NOTES = ["", "", "Tenere la spalla ferma", "Più spinta in uscita", "Guardare avanti, non il ghiaccio",
  "Braccia più aperte", "Ottima postura", "Ginocchio più piegato", "Atterraggio pulito, continuare così"];
const PLAN = [
  ["Incrociati avanti in cerchio", "5 giri per lato"],
  ["Incrociati indietro in cerchio", "3 giri per lato"],
  ["Tre alternati lungo il lato lungo", "3 vasche"],
  ["Spirale tenuta 5 secondi", "4 volte per gamba"],
  ["Swizzle avanti e indietro", "2 vasche"],
  ["Salti preparatori sul posto", "10 ripetizioni"],
  ["Entrata in trottola", "6 tentativi"],
  ["Filo esterno avanti su un piede", "Tutto il lato corto"],
];
// livello di ogni alunno: quanti elementi del percorso ha già affrontato
const ORDER = [
  ["Base", 0], ["Base", 1], ["Base", 2], ["Base", 4], ["Base", 6],
  ["Passi e giri", 0], ["Passi e giri", 1], ["Passi e giri", 2], ["Salti", 0], ["Trottole", 0],
  ["Passi e giri", 4], ["Salti", 1], ["Salti", 2], ["Trottole", 1], ["Salti", 3], ["Trottole", 2],
  ["Passi e giri", 5], ["Salti", 4],
];

// generatore pseudo-casuale con seme fisso: gli esempi sono sempre gli stessi
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

export function sampleStudents(makeCode, makeId) {
  const r = rng(42);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const out = {};
  const now = Date.now();
  NAMES.forEach((name, i) => {
    const level = 3 + Math.floor((i / NAMES.length) * (ORDER.length - 3)) + Math.floor(r() * 3);
    const items = ORDER.slice(0, Math.min(level, ORDER.length));
    const progress = items.map(([cat, idx], k) => {
      const left = items.length - k;
      const status = left > 3 ? "done" : left > 1 ? (r() < 0.6 ? "doing" : "done") : (r() < 0.5 ? "todo" : "doing");
      const d = new Date(now - (left * 9 + Math.floor(r() * 6)) * 86400000).toISOString().slice(0, 10);
      return { id: makeId(), cat, name: CATALOG[cat][idx], status, date: status === "done" ? d : "", note: status === "todo" ? "" : pick(NOTES) };
    });
    const start = Math.floor(r() * 4);
    const plan = PLAN.slice(start, start + 3 + Math.floor(r() * 3)).map(([title, detail]) => ({ id: makeId(), title, detail }));
    const checks = {};
    let checksAt;
    if (r() < 0.7) {
      const t = now - Math.floor(r() * 3) * 86400000 - Math.floor(r() * 5) * 3600000;
      plan.forEach((p, k) => { if (r() < 0.55) checks[p.id] = t + k * 300000; });
      if (Object.keys(checks).length) checksAt = Math.max(...Object.values(checks));
    }
    const code = i === 0 ? "DEMOALUNNO23" : makeCode();
    out[code] = { name, createdAt: now - (60 - i) * 86400000, progress, plan, checks, ...(checksAt ? { checksAt } : {}) };
  });
  return out;
}

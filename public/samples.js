// Alunni di esempio per la modalità sviluppo (?dev). Dati inventati.
import { lookup } from "./catalog.js";
import { addDays } from "./sched.js";

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
// percorso tipico: ogni alunno ha affrontato i primi N elementi
const ORDER = [
  "Pattinaggio avanti", "Pattinaggio indietro", "Frenata a spazzaneve", "Swizzle avanti", "Spirale",
  "Incrociati avanti", "Incrociati indietro", "Tre avanti esterno", "Mezzo giro (waltz)", "Trottola verticale (upright)",
  "Mohawk", "Toe loop", "Salchow", "Trottola bassa (sit)", "Loop", "Trottola ad angelo (camel)",
  "Bracket", "Flip",
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
    const progress = items.map((name, k) => {
      const { cat, level: lv } = lookup(name);
      const left = items.length - k;
      const status = left > 3 ? "done" : left > 1 ? (r() < 0.6 ? "doing" : "done") : (r() < 0.5 ? "todo" : "doing");
      const d = new Date(now - (left * 9 + Math.floor(r() * 6)) * 86400000).toISOString().slice(0, 10);
      return { id: makeId(), level: lv, cat, name, status, date: status === "done" ? d : "", note: status === "todo" ? "" : pick(NOTES) };
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
    const stuLevel = items.length < 9 ? "base" : items.length < 15 ? "intermedio" : "avanzato";
    out[code] = { name, level: stuLevel, createdAt: now - (60 - i) * 86400000, progress, plan, checks, ...(checksAt ? { checksAt } : {}) };
  });
  return out;
}

// gruppi e allenamenti di esempio, con date relative a oggi (sempre "prossimi")
export function sampleMeta(makeId) {
  const groups = [["Agonisti"], ["Sabato mattina"], ["Principianti"]].map(([name]) => ({ id: makeId(), name }));
  const [ag, sab, pr] = groups.map((g) => g.id);
  const T = (d, time, group, place = "", note = "") => ({ id: makeId(), date: addDays(d), time, group, place, note });
  return {
    groups,
    trainings: [
      T(-3, "18:00", ag, "Palaghiaccio"),
      T(1, "18:00", ag, "Palaghiaccio", "Portare i pattini da salto"),
      T(2, "09:00", sab, "Palaghiaccio"),
      T(4, "17:00", "", "Palaghiaccio", "Prova dei costumi per il saggio"),
      T(5, "17:30", pr, "Pista piccola"),
      T(9, "09:00", sab, "Palaghiaccio"),
    ],
  };
}

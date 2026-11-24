// Elementi proposti all'allenatrice, divisi per livello e poi per categoria
// (può sempre aggiungerne di personalizzati). La divisione è indicativa: va adattata al programma reale.
export const LEVELS = [["base", "Base"], ["intermedio", "Intermedio"], ["avanzato", "Avanzato"]];
export const LEVEL_LABEL = Object.fromEntries(LEVELS);
export const CATEGORIES = ["Fondamentali", "Passi e giri", "Salti", "Trottole", "Altro"];

// Nomi in italiano. Restano come nome proprio solo i termini che si usano così anche in Italia
// (salti con il nome di chi li ha inventati, alcune curve): l'allenatrice può comunque rinominarli.
export const CATALOG = {
  base: {
    "Fondamentali": ["Pattinaggio avanti", "Pattinaggio indietro", "Frenata a spazzaneve", "Frenata a T",
      "Limoni avanti", "Limoni indietro"],
    "Passi e giri": ["Incrociati avanti", "Incrociati indietro"],
    "Salti": ["Salto a due piedi", "Salto del valzer"],
    "Trottole": ["Trottola a due piedi"],
  },
  intermedio: {
    "Fondamentali": ["Spirale"],
    "Passi e giri": ["Tre avanti esterno", "Tre avanti interno", "Mohawk"],
    "Salti": ["Toe loop", "Salchow", "Rittberger"],
    "Trottole": ["Trottola verticale", "Trottola bassa"],
  },
  avanzato: {
    "Passi e giri": ["Bracket", "Rocker", "Controvolta", "Twizzle"],
    "Salti": ["Flip", "Lutz", "Axel", "Doppio toe loop", "Doppio salchow"],
    "Trottole": ["Trottola ad angelo", "Trottola con cambio piede", "Trottola layback"],
  },
};

// nome dell'elemento → { level, cat } (per i dati salvati prima dei livelli)
const key = (name) => String(name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const INDEX = {};
for (const [level, cats] of Object.entries(CATALOG)) {
  for (const [cat, names] of Object.entries(cats)) names.forEach((n) => { INDEX[key(n)] = { level, cat }; });
}
// nomi della prima versione del catalogo → nome italiano (gli elementi già salvati si mostrano col nome nuovo)
const RENAMED = Object.fromEntries([
  ["Swizzle avanti", "Limoni avanti"], ["Swizzle indietro", "Limoni indietro"], ["Mezzo giro (waltz)", "Salto del valzer"],
  ["Loop", "Rittberger"], ["Trottola verticale (upright)", "Trottola verticale"], ["Trottola bassa (sit)", "Trottola bassa"],
  ["Counter", "Controvolta"], ["Trottola ad angelo (camel)", "Trottola ad angelo"], ["Layback", "Trottola layback"],
].map(([a, b]) => [key(a), b]));
export const itName = (name) => RENAMED[key(name)] || name;
export const lookup = (name) => INDEX[key(itName(name))] || null;
export const itemKey = (item) => key(itName(item.name));
export const nameKey = key;

// Elenco modificabile dall'allenatrice (nuova versione): in meta/coach.elements = [{id, name, level, cat}].
// Finché non lo cambia vale il catalogo qui sopra (id fissi "d1", "d2"…).
export function defaultElements() {
  let n = 0;
  return Object.entries(CATALOG).flatMap(([level, cats]) => Object.entries(cats).flatMap(([cat, names]) =>
    names.map((name) => ({ id: `d${++n}`, name, level, cat }))));
}
// elenco → { livello: { categoria: [nomi] } }, categorie nell'ordine di CATEGORIES
export function catalogFrom(list) {
  const out = Object.fromEntries(LEVELS.map(([l]) => [l, {}]));
  for (const c of CATEGORIES) for (const e of list) if (e.cat === c && out[e.level]) (out[e.level][c] ||= []).push(e.name);
  return out;
}

// Vecchie categorie rinominate: "Base" ora è un livello, la categoria si chiama "Fondamentali".
const CAT_ALIAS = { "Base": "Fondamentali" };
export const normLevel = (l) => (LEVEL_LABEL[l] ? l : null);

// Rende valido qualsiasi elemento (anche da backup vecchi): categoria nota (altrimenti "Altro")
// e livello (dal catalogo, altrimenti "base"). Così nessun elemento sparisce dalla lista.
export function normItem(i) {
  let cat = CAT_ALIAS[i.cat] || i.cat;
  if (!CATEGORIES.includes(cat)) cat = "Altro";
  const known = lookup(i.name);
  return { ...i, name: itName(i.name), cat, level: normLevel(i.level) || (known ? known.level : "base") };
}

// Suggerimenti per la scheda (esercizi da fare in pattinaggio libero).
export const EXERCISE_IDEAS = [
  "Incrociati avanti in cerchio",
  "Incrociati indietro in cerchio",
  "Tre alternati lungo il lato lungo",
  "Spirale tenuta 5 secondi",
  "Limoni avanti e indietro",
  "Salti preparatori sul posto",
  "Entrata in trottola",
  "Filo esterno avanti su un piede",
  "Filo interno avanti su un piede",
];

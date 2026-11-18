// Elementi proposti all'allenatrice, divisi per livello e poi per categoria
// (può sempre aggiungerne di personalizzati). La divisione è indicativa: va adattata al programma reale.
export const LEVELS = [["base", "Base"], ["intermedio", "Intermedio"], ["avanzato", "Avanzato"]];
export const LEVEL_LABEL = Object.fromEntries(LEVELS);
export const CATEGORIES = ["Fondamentali", "Passi e giri", "Salti", "Trottole", "Altro"];

export const CATALOG = {
  base: {
    "Fondamentali": ["Pattinaggio avanti", "Pattinaggio indietro", "Frenata a spazzaneve", "Frenata a T",
      "Swizzle avanti", "Swizzle indietro"],
    "Passi e giri": ["Incrociati avanti", "Incrociati indietro"],
    "Salti": ["Salto a due piedi", "Mezzo giro (waltz)"],
    "Trottole": ["Trottola a due piedi"],
  },
  intermedio: {
    "Fondamentali": ["Spirale"],
    "Passi e giri": ["Tre avanti esterno", "Tre avanti interno", "Mohawk"],
    "Salti": ["Toe loop", "Salchow", "Loop"],
    "Trottole": ["Trottola verticale (upright)", "Trottola bassa (sit)"],
  },
  avanzato: {
    "Passi e giri": ["Bracket", "Rocker", "Counter", "Twizzle"],
    "Salti": ["Flip", "Lutz", "Axel", "Doppio toe loop", "Doppio salchow"],
    "Trottole": ["Trottola ad angelo (camel)", "Trottola con cambio piede", "Layback"],
  },
};

// nome dell'elemento → { level, cat } (per i dati salvati prima dei livelli)
const key = (name) => String(name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const INDEX = {};
for (const [level, cats] of Object.entries(CATALOG)) {
  for (const [cat, names] of Object.entries(cats)) names.forEach((n) => { INDEX[key(n)] = { level, cat }; });
}
export const lookup = (name) => INDEX[key(name)] || null;
export const itemKey = (item) => key(item.name);

// Vecchie categorie rinominate: "Base" ora è un livello, la categoria si chiama "Fondamentali".
const CAT_ALIAS = { "Base": "Fondamentali" };
export const normLevel = (l) => (LEVEL_LABEL[l] ? l : null);

// Rende valido qualsiasi elemento (anche da backup vecchi): categoria nota (altrimenti "Altro")
// e livello (dal catalogo, altrimenti "base"). Così nessun elemento sparisce dalla lista.
export function normItem(i) {
  let cat = CAT_ALIAS[i.cat] || i.cat;
  if (!CATEGORIES.includes(cat)) cat = "Altro";
  const known = lookup(i.name);
  return { ...i, cat, level: normLevel(i.level) || (known ? known.level : "base") };
}

// Suggerimenti per la scheda (esercizi da fare in pattinaggio libero).
export const EXERCISE_IDEAS = [
  "Incrociati avanti in cerchio",
  "Incrociati indietro in cerchio",
  "Tre alternati lungo il lato lungo",
  "Spirale tenuta 5 secondi",
  "Swizzle avanti e indietro",
  "Salti preparatori sul posto",
  "Entrata in trottola",
  "Filo esterno avanti su un piede",
  "Filo interno avanti su un piede",
];

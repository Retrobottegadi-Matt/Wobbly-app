// Gruppi e allenamenti.
// L'elenco completo sta in meta/coach (lo legge solo l'allenatrice). Ogni alunno riceve nel proprio
// documento una copia dei soli allenamenti futuri che lo riguardano (campo `sched`): così l'alunno
// non ha bisogno di nuovi permessi di lettura.

// data locale YYYY-MM-DD (toISOString è in UTC: in Italia dopo mezzanotte darebbe il giorno prima)
export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const addDays = (n, d = new Date()) => localDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
// "YYYY-MM-DD" → Date locale (mai new Date("YYYY-MM-DD"), che è UTC)
export function parseDate(s) {
  const [y, m, d] = String(s || "").split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

export const emptyMeta = () => ({ groups: [], trainings: [] });
export function normMeta(m) {
  return {
    groups: Array.isArray(m && m.groups) ? m.groups.filter((g) => g && g.id && g.name) : [],
    trainings: Array.isArray(m && m.trainings) ? m.trainings.filter((t) => t && t.id && t.date) : [],
  };
}

const byWhen = (a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""));
export const sortTrainings = (list) => [...list].sort(byWhen);
export const groupName = (meta, id) => (id ? (meta.groups.find((g) => g.id === id) || {}).name || "" : "");

// allenamenti futuri (da oggi) di un alunno: quelli per tutti + quelli del suo gruppo
export function schedFor(meta, s, from = localDate()) {
  return sortTrainings(meta.trainings.filter((t) => t.date >= from && (!t.group || t.group === (s.group || ""))))
    .slice(0, 30)
    .map((t) => ({ id: t.id, date: t.date, time: t.time || "", place: t.place || "", note: t.note || "",
      gname: t.group ? groupName(meta, t.group) : "" }));
}
const key = (list) => JSON.stringify((list || []).map((t) => [t.id, t.date, t.time || "", t.place || "", t.note || "", t.gname || ""]));
export const sameSched = (a, b) => key(a) === key(b);

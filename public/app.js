import { CONFIG } from "./config.js";
import { createBackend, normCode, fmtCode, newId, CODE_LEN } from "./backend.js";
import { CATALOG, CATEGORIES, EXERCISE_IDEAS, LEVELS, LEVEL_LABEL, normItem, normLevel, itemKey, nameKey, defaultElements, catalogFrom } from "./catalog.js";
import { renderDesign, applyDevVars } from "./design.js";
import { icon } from "./icons.js";
import { initDrag, isDragging } from "./drag.js";
import { loadA11y, saveA11y, applyA11y, A11Y_OPTIONS, THEMES } from "./a11y.js";
import { localDate, addDays, parseDate, emptyMeta, normMeta, sortTrainings, groupName, schedFor, sameSched,
  openFor, lessonsFor, sameSlots, canCancel, CANCEL_HOURS, startOf, MAX_SLOTS } from "./sched.js";
import { HELP, INTRO, startTour, endTour, tourOn, tourPlace, tourStep } from "./help.js";
import { STICKERS, STICKER_LABEL, STICKER_MSG, sticker, isSticker, seenStickers, markSeen } from "./stickers.js";

applyA11y(); // prima di tutto, così la prima schermata ha già testo e contrasto giusti

const $root = document.getElementById("app");
const $sheet = document.getElementById("sheet");
const LS_CODE = "pg_my_code";
const LS_ROLE = "pg_role"; // "coach" su un telefono abilitato: l'app si apre direttamente nell'area allenatrice
const STATUS = { todo: "Da iniziare", doing: "In corso", done: "Completato" };
const NEXT = { todo: "doing", doing: "done", done: "todo" };
const AV = ["--yellow", "--pink", "--lilac", "--sage", "--sky"];

let be;
let unsub = [];
const S = { coach: null, students: [], student: null, reorder: false, q: "", gf: "", meta: emptyMeta(), metaErr: false,
  page: "", calM: "", calD: "", calView: "mese", cleaned: false };

// ---------------------------------------------------------- utilità
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => localDate();
const fmtDate = (d) => (d ? d.split("-").reverse().join("/") : "");
const fmtLong = (d) => (d ? new Date(`${d}T12:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }) : "");
function fmtWhen(ts) {
  if (!ts) return "";
  const d = new Date(ts), n = new Date();
  const hm = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === n.toDateString()) return `oggi ${hm}`;
  const y = new Date(n); y.setDate(n.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `ieri ${hm}`;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}
// "sab 23 nov" (con "Oggi"/"Domani" quando serve)
function fmtDay(d, long = false) {
  const dt = parseDate(d);
  if (!dt) return "";
  const rel = d === today() ? "Oggi" : d === addDays(1) ? "Domani" : "";
  const txt = dt.toLocaleDateString("it-IT", long ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "numeric", month: "short" });
  return rel ? `${rel} · ${txt}` : txt;
}
const dayNum = (d) => (parseDate(d) || new Date()).getDate();
const monShort = (d) => (parseDate(d) || new Date()).toLocaleDateString("it-IT", { month: "short" }).replace(".", "");
// Avviso: un'unica regione "status" sempre presente (VoiceOver annuncia in modo affidabile solo le
// regioni che esistono già). Ogni nuovo avviso sostituisce il precedente, niente avvisi sovrapposti.
let $toast = null, toastTimer = 0, toastSet = 0;
function ensureToast() {
  if ($toast) return $toast;
  $toast = document.createElement("div");
  $toast.className = "toast idle";
  $toast.setAttribute("role", "status");
  $toast.setAttribute("aria-live", "polite");
  document.body.appendChild($toast);
  return $toast;
}
// kind (nuova versione): "ok" = salvato/aggiunto, "del" = eliminato/tolto, "err" = errore o dato da correggere
function toast(msg, kind = "") {
  const t = ensureToast();
  clearTimeout(toastTimer); clearTimeout(toastSet);
  t.textContent = ""; // svuota prima: così anche un messaggio uguale al precedente viene riletto
  toastSet = setTimeout(() => { t.textContent = msg; t.dataset.kind = beta() ? kind : ""; t.classList.remove("idle"); }, 50);
  toastTimer = setTimeout(() => { t.classList.add("idle"); t.textContent = ""; }, kind === "err" ? 5500 : 3500);
}
const ok = (msg) => toast(msg, "ok");
const gone = (msg) => toast(msg, "del");
const oops = (msg) => toast(msg, "err");

// Conferma prima di un'azione importante. Nuova versione: finestra dell'app (pulsanti chiari, "Indietro" sempre
// a sinistra, rosso per eliminare); versione attuale: confirm() del browser.
const ASK_VERB = [[/^(vuoi )?togliere/i, "Togli"], [/^eliminare/i, "Elimina"], [/^disdire/i, "Disdici"], [/^scollegare/i, "Scollega"],
  [/^disabilitare/i, "Disabilita"], [/^generare/i, "Genera"], [/^sostituire/i, "Sostituisci"], [/^annullare/i, "Sì, annulla"], [/^uscire/i, "Esci senza salvare"]];
function ask(text, { yes, danger } = {}) {
  if (!beta()) return Promise.resolve(confirm(text));
  const v = ASK_VERB.find(([re]) => re.test(text));
  yes = yes || (v ? v[1] : /ripristinarli/i.test(text) ? "Ripristina" : /aggiungere lo stesso/i.test(text) ? "Aggiungi lo stesso" : "Conferma");
  if (danger === undefined) danger = /^(Elimina|Togli|Disdici|Scollega|Disabilita|Sostituisci|Esci)/.test(yes);
  return new Promise((res) => {
    const opener = document.activeElement, box = document.createElement("div");
    const was = [$root.inert, $sheet.inert];
    box.id = "ask"; box.setAttribute("role", "alertdialog"); box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "askT");
    box.innerHTML = `<div class="ask-bg" data-ask="no"></div><div class="ask-card${danger ? " danger" : ""}">
      <span class="ask-ic" aria-hidden="true">${icon(danger ? "alert" : "help")}</span>
      <h2 id="askT" tabindex="-1">${esc(text)}</h2>
      <div class="sheet-btns"><button type="button" class="btn ghost" data-ask="no">Indietro</button>
        <button type="button" class="btn${danger ? " danger-solid" : ""}" data-ask="yes">${esc(yes)}</button></div></div>`;
    document.body.appendChild(box); $root.inert = true; $sheet.inert = true;
    const done = (v) => { document.removeEventListener("keydown", key, true); box.remove(); $root.inert = was[0]; $sheet.inert = was[1];
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true }); res(v); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); done(false); } };
    document.addEventListener("keydown", key, true);
    box.addEventListener("click", (e) => { const b = e.target.closest("[data-ask]"); if (b) done(b.dataset.ask === "yes"); });
    // per un'azione pericolosa il primo pulsante è "Indietro": un tocco distratto non cancella nulla
    setTimeout(() => box.querySelector(danger ? "[data-ask=no].btn" : "[data-ask=yes]").focus(), 30);
  });
}
const askOpen = () => !!document.getElementById("ask");

// Errori nei moduli (nuova versione): il messaggio compare sotto il campo, il campo diventa rosso e riceve il focus.
const ERR_MISSING = { name: "Scrivi un nome.", title: "Scrivi il nome dell'esercizio.", date: "Scegli la data.", time: "Scegli l'ora." };
function fieldErr(el, msg) {
  if (!el) { oops(msg); return false; }
  clearErr(el);
  const id = `err-${el.name || "f"}`;
  el.setAttribute("aria-invalid", "true");
  el.setAttribute("aria-describedby", `${id} ${el.getAttribute("aria-describedby") || ""}`.trim());
  el.insertAdjacentHTML("afterend", `<small class="f-err" id="${id}">${icon("alert")}<span>${esc(msg)}</span></small>`);
  const clear = () => { clearErr(el); el.removeEventListener("input", clear); el.removeEventListener("change", clear); };
  el.addEventListener("input", clear); el.addEventListener("change", clear);
  return false;
}
function clearErr(el) {
  const e = el.parentElement && el.parentElement.querySelector(`:scope > .f-err`);
  if (e) { el.setAttribute("aria-describedby", (el.getAttribute("aria-describedby") || "").replace(e.id, "").trim()); e.remove(); }
  el.removeAttribute("aria-invalid");
}
// segna l'errore su un campo del pannello aperto, lo annuncia e porta lì il focus; restituisce false (il pannello resta aperto)
function bad(name, msg) {
  const el = $sheet.querySelector(`[name="${name}"]:not(:disabled)`);
  if (!beta()) { toast(msg); return false; }
  fieldErr(el, msg); oops(msg);
  if (el) { el.closest("details")?.setAttribute("open", ""); el.focus(); }
  return false;
}
function checkForm(f) {
  let first = null;
  f.querySelectorAll("input, select, textarea").forEach((el) => {
    if (el.disabled || el.closest("[hidden]") || el.validity.valid) return clearErr(el);
    const v = el.validity, label = (el.closest("label")?.firstChild?.textContent || "").trim().toLowerCase();
    const msg = v.valueMissing ? (ERR_MISSING[el.name] || `Compila il campo ${label}.`)
      : v.rangeUnderflow ? (el.type === "date" ? "Scegli un giorno da oggi in poi." : "Valore troppo basso.")
      : v.tooLong ? "Testo troppo lungo." : v.badInput ? "Valore non valido." : "Controlla questo campo.";
    fieldErr(el, msg);
    first = first || el;
  });
  if (first) { first.closest("details")?.setAttribute("open", ""); first.focus(); oops(f.querySelectorAll(".f-err").length > 1 ? "Controlla i campi in rosso" : first.parentElement.querySelector(".f-err").textContent); }
  return !first;
}

// Dopo un tocco il focus torna sull'elemento giusto (serve a VoiceOver), ma senza l'anello viola
// che Safari mostrerebbe: l'anello resta solo per chi usa la tastiera.
let lastPointer = false;
document.addEventListener("pointerdown", () => { lastPointer = true; }, true);
document.addEventListener("keydown", () => {
  lastPointer = false;
  document.querySelectorAll("[data-quiet]").forEach((el) => el.removeAttribute("data-quiet"));
}, true);
function restoreFocus(el) {
  if (lastPointer) {
    el.setAttribute("data-quiet", "");
    el.addEventListener("blur", () => el.removeAttribute("data-quiet"), { once: true });
  }
  el.focus({ preventScroll: true });
}
function fail(e) {
  console.error(e);
  const m = e && e.code === "permission-denied" ? "Permesso negato." : beta() ? "Non salvato: controlla la connessione e riprova." : "Operazione non riuscita. Controlla la connessione.";
  toast(m, "err");
}
const clearSubs = () => { unsub.forEach((f) => f && f()); unsub = []; };
const go = (h) => { location.hash = h; };
const pct = (s) => {
  const p = s.progress || [];
  return p.length ? Math.round((p.filter((x) => x.status === "done").length / p.length) * 100) : 0;
};
const checksDone = (s) => (s.plan || []).filter((x) => s.checks && s.checks[x.id]).length;
// soprannome vuoto o già usato da un altro alunno (nuova versione: due "Giulia" uguali confondono)
const nameErr = (v, self = "") => (!(v || "").trim() ? "Scrivi un nome."
  : beta() && S.students.some((x) => x.code !== self && norm(x.name) === norm(v)) ? "C'è già un alunno con questo soprannome: aggiungi un'iniziale." : "");
const findStudent = (code) => S.students.find((s) => s.code === code);
const inviteLink = (code) => `${location.origin}${location.pathname}?c=${code}`;
const avatarColor = (name) => AV[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
const LS_DEV = "pg_dev";
// Nuova versione (navigazione più semplice, calendario del mese, aiuto "?", pulizia degli appuntamenti passati):
// per ora solo in modalità sviluppo, dove si può confrontare con quella attuale. Quando viene approvata,
// beta() diventa sempre vero e il codice della versione attuale si toglie.
// La "nuova versione" (prima solo in modalità sviluppo) è ora l'app per tutti (approvata dall'utente il 27/11).
// beta() resta come segnaposto: i rami per la versione vecchia rimasti nel codice non vengono più usati.
const beta = () => true;
const demoBanner = () => {
  if (!be || !be.demo) return "";
  if (be.dev) return `<div class="demo dev"><b>Modalità sviluppo</b>: dati di esempio, solo in questo browser.
    <span class="dev-as" role="group" aria-label="Entra come">Entra come:
      <a href="#/coach" data-act="dev-coach"${location.hash.startsWith("#/coach") ? ' aria-current="page"' : ""}>Allenatrice</a> ·
      <a href="#" data-act="dev-student"${location.hash.startsWith("#/coach") ? "" : ' aria-current="page"'}>Alunno</a></span>
    <a href="#/design">Design system</a> · <a href="#" data-act="dev-exit">Esci</a></div>`;
  return `<div class="demo">Modalità demo: i dati restano solo su questo dispositivo.</div>`;
};
const logo = (sm) => `<div class="logo${sm ? " sm" : ""}" aria-hidden="true">${icon("skate")}</div>`;

// Ridisegna la schermata. Se il pulsante appena toccato è stato ricreato, gli ridà il focus
// (altrimenti VoiceOver e la tastiera ripartirebbero dall'inizio della pagina).
// Entrata animata solo quando si cambia schermata (route), non a ogni aggiornamento dei dati;
// il riscontro animato (.just) va solo sull'elemento appena toccato.
let pendingFocus = null, flashSel = null, animateNext = false;
function paint(html) {
  // se arriva un secondo ridisegno di fila (es. alunni e allenamenti aggiornati insieme) il focus resta dov'era
  const prev = !pendingFocus && $root.contains(document.activeElement) ? selOf(document.activeElement) : null;
  if (prev) pendingFocus = prev;
  $root.innerHTML = html;
  if (tourOn()) requestAnimationFrame(tourPlace); // la guida resta sull'elemento anche dopo un ridisegno
  delete $root.dataset.view;
  $root.classList.remove("enter");
  if (animateNext) { animateNext = false; $root.dataset.dir = S.dir || ""; void $root.offsetWidth; $root.classList.add("enter"); if (beta()) countUp(); }
  if (beta()) navGlide();
  if (flashSel) {
    const el = $root.querySelector(flashSel); flashSel = null;
    if (el) (el.dataset.act === "c-move" ? el.closest("li") : el).classList.add("just");
  }
  if (!pendingFocus) return;
  const sel = pendingFocus; pendingFocus = null;
  if (document.activeElement && document.activeElement !== document.body) return;
  let el = $root.querySelector(sel);
  if (el && el.disabled) el = $root.querySelector(`${sel.replace(/\[data-d="-?\d+"\]/, "")}:not([disabled])`);
  if (el) restoreFocus(el);
}

// barra in basso (nuova versione): la pillola nera scorre morbida dalla voce di prima a quella nuova
let lastPill = null;
function navGlide() {
  const nav = $root.querySelector(".bnav.ico"), on = nav && nav.querySelector("a.on");
  if (!on) { lastPill = null; return; }
  const pill = document.createElement("span");
  pill.className = "bnav-pill"; pill.setAttribute("aria-hidden", "true");
  // dentro la voce attiva: segue da sola testo più grande, rotazione e cambi di larghezza
  const r = { x: on.offsetLeft, nav: nav.dataset.who };
  on.prepend(pill);
  if (lastPill && lastPill.nav === r.nav && lastPill.x !== r.x && !still() && pill.animate) {
    const dx = lastPill.x - r.x;
    pill.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], { duration: 340, easing: "cubic-bezier(.32, .72, 0, 1)" });
  }
  lastPill = r;
}
// festa sul ghiaccio: un pattino attraversa lo schermo lasciando la scia, con fiocchi di neve (solo decorazione)
function celebrate() {
  if (still()) return;
  const box = document.createElement("div");
  box.className = "cele"; box.setAttribute("aria-hidden", "true");
  box.innerHTML = `<span class="cele-trail"></span><span class="cele-boot">${icon("skate")}</span>${Array.from({ length: 12 }, (_, k) => `<i style="--k:${k};--x:${(k * 53 + 7) % 100}%"></i>`).join("")}`;
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2200);
}

// senza connessione (nuova versione): una striscia lo dice finché non torna
function netBanner() {
  let b = document.getElementById("offline");
  if (!(beta() && navigator.onLine === false)) { if (b) b.remove(); return !!b; }
  if (!b) {
    b = document.createElement("p"); b.id = "offline"; b.setAttribute("role", "status");
    b.innerHTML = `${icon("alert")}<span>Sei offline: le modifiche partono appena torna la connessione.</span>`;
    document.body.appendChild(b);
  }
  return false;
}
window.addEventListener("offline", netBanner);
window.addEventListener("online", () => { if (netBanner()) ok("Di nuovo online"); });

// numeri che salgono all'entrata nella pagina (nuova versione); niente con "Riduci animazioni"
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce";
function countUp() {
  if (still()) return;
  $root.querySelectorAll("[data-count]").forEach((el) => {
    const to = Number(el.dataset.count), t0 = performance.now(), D = 550;
    if (!(to > 0)) return;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(to * e);
      if (k < 1 && document.contains(el)) requestAnimationFrame(step);
    };
    el.textContent = "0"; requestAnimationFrame(step);
  });
}

// ---------------------------------------------------------- avvio
async function main() {
  ensureToast();
  try {
    const q = new URLSearchParams(location.search);
    if (q.has("dev")) localStorage.setItem(LS_DEV, "1");
    be = await createBackend(CONFIG, { dev: localStorage.getItem(LS_DEV) === "1" });
  } catch (e) {
    console.error(e);
    $root.innerHTML = `<div class="center"><p>Impossibile avviare l'app. Controlla la connessione e riprova.</p>
      <button class="btn" onclick="location.reload()">Riprova</button></div>`;
    return;
  }
  const c = normCode(new URLSearchParams(location.search).get("c"));
  if (c) localStorage.setItem(LS_CODE, c);
  if (c || new URLSearchParams(location.search).has("dev")) {
    history.replaceState(null, "", location.pathname + location.hash);
  }
  if (be.dev) applyDevVars();
  window.addEventListener("ds-toast", (e) => toast(e.detail));
  window.addEventListener("ds-sheet", () => openSheet({ title: "Esempio di pannello", focus: "input",
    body: `<label>Campo di testo<input name="x" placeholder="Scrivi qui"></label>
    <div class="sheet-btns"><button type="button" class="btn ghost" data-act="close">Annulla</button>
    <button class="btn" type="submit">Salva</button></div>`, onSubmit: () => {} }));
  window.addEventListener("hashchange", route);
  document.addEventListener("click", onClick);
  document.addEventListener("touchstart", () => {}, { passive: true }); // attiva :active su iPhone
  initDrag($root, {
    onDrop: (kind, group, ids, id, to) => applyOrder(kind, group, ids, id, to).catch(fail),
    onEnd: () => { const f = S.pendingRender; S.pendingRender = null; if (f) f(); },
  });
  route();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

let lastCode = null;
const isCode = (x) => /^[A-Z0-9]{12}$/.test(x || "");
function route() {
  clearSubs();
  endTour(false);
  closeSheet();
  document.documentElement.classList.toggle("beta", beta());
  netBanner();
  const r = pageRank();
  S.dir = lastRank === null || Math.floor(r / 10) !== Math.floor(lastRank / 10) ? "" : r > lastRank ? "r" : r < lastRank ? "l" : "";
  lastRank = r;
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const code = parts[0] === "coach" && isCode(parts[1]) ? parts[1] : null;
  if (code !== lastCode) { S.reorder = false; lastCode = code; }
  if (parts[0] !== "coach") { S.q = ""; S.gf = ""; }
  animateNext = true;
  if (parts[0] === "design" && be.dev) return renderDesign($root);
  if (parts[0] === "coach") routeCoach(parts[1] || "home", parts[2] || "progressi");
  else routeStudent(["progressi", "profilo"].includes(parts[0]) ? parts[0] : "oggi");
}
const loading = () => { $root.innerHTML = beta()
  ? `<div class="center" role="status" aria-label="Caricamento"><div class="skater" aria-hidden="true"><span class="sk-trail"></span><span class="sk-boot">${icon("skate")}</span><span class="sk-ice"></span></div></div>`
  : `<div class="center" role="status" aria-label="Caricamento"><div class="spinner"></div></div>`; };
// ordine delle pagine: andando "avanti" la pagina entra scivolando da destra, tornando indietro da sinistra
const RANK = { "": 0, statistiche: .5, alunni: 1, calendario: 2, progressi: 1, profilo: 2 }, TABR = { profilo: 0, progressi: .01, scheda: .02, invito: .03 };
function pageRank() {
  const p = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (p[0] === "coach") return isCode(p[1]) ? 1.5 + (TABR[p[2] || "progressi"] || 0) : RANK[p[1] || ""] ?? 0;
  return (RANK[p[0] || ""] ?? 0) - 10;
}
let lastRank = null;

// ======================================================== ALUNNO
function routeStudent(view) {
  const code = localStorage.getItem(LS_CODE);
  if (!code) {
    // telefono dell'allenatrice: dall'icona sulla Home si apre l'app senza passare dalla schermata del codice
    if (localStorage.getItem(LS_ROLE) === "coach" && !be.dev) { location.replace("#/coach"); return; }
    renderCodeEntry();
    // telefono dell'allenatrice abilitato prima che l'app se lo ricordasse: lo riconosce e va all'area allenatrice
    be.isCoachDevice().then((yes) => {
      if (!yes || location.hash.replace(/^#\/?/, "") || localStorage.getItem(LS_CODE)) return;
      localStorage.setItem(LS_ROLE, "coach"); location.replace("#/coach");
    }).catch(() => {});
    return;
  }
  loading();
  unsub.push(be.watchStudent(code, (s, meta) => {
    if (!s) {
      if (meta && meta.fromCache) return; // offline: aspetta il server
      localStorage.removeItem(LS_CODE);
      return renderCodeEntry("Codice non valido o non più attivo. Chiedi un nuovo invito alla tua allenatrice.");
    }
    S.student = s;
    renderStudent(view);
  }, (e) => {
    if (e && e.code === "permission-denied") localStorage.removeItem(LS_CODE);
    renderCodeEntry("Codice non valido. Controllalo e riprova.");
  }));
}

// codice da quello che si scrive o si incolla: anche il link dell'invito o il messaggio intero di WhatsApp
function codeFrom(t) {
  t = String(t || "");
  const m = t.match(/[?&]c=([A-Za-z0-9-]{12,16})/) || t.match(/\b([A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4})\b/);
  return normCode(m ? m[1] : t);
}

function renderCodeEntry(msg = "") {
  paint(`${demoBanner()}
  <div class="hero">
    ${logo()}
    <h1>${esc(CONFIG.appName)}</h1>
    <p>Inserisci il codice che ti ha mandato la tua allenatrice.</p>
  </div>
  <form class="card" id="codeForm">
    <label for="codeIn" class="sr">Codice invito</label>
    <input id="codeIn" class="code-in" autocomplete="off" autocapitalize="characters" spellcheck="false"
      placeholder="XXXX-XXXX-XXXX" maxlength="600" inputmode="text" ${msg ? 'aria-invalid="true" aria-describedby="codeErr"' : ""}>
    ${msg ? `<p class="err" id="codeErr" role="alert">${esc(msg)}</p>` : ""}
    ${beta() && navigator.clipboard && navigator.clipboard.readText ? `<button type="button" class="btn ghost wide" data-act="code-paste">${icon("copy")} Incolla il codice</button>` : ""}
    <button class="btn wide" type="submit">Apri la mia scheda</button>
    ${beta() ? `<p class="muted small">Puoi incollare anche tutto il messaggio dell'invito: il codice lo trovo io.</p>` : ""}
  </form>
  ${be.dev ? `<div class="card"><h2 class="h3">Entra come allenatrice</h2>
      <p class="muted small">Con gli alunni di esempio: puoi provare tutto senza toccare i dati veri.</p>
      <a class="btn wide" href="#/coach">Area allenatrice</a></div>
    <div class="card"><h2 class="h3">Entra come alunno di esempio</h2><div class="chips">
      ${be.sampleCodes().map((x) => `<button class="chip" data-act="dev-as" data-code="${x.code}">${esc(x.name)}</button>`).join("")}
    </div></div>`
    : be.demo ? `<p class="hint">Demo: prova il codice <b>DEMO-ALUN-NO23</b></p>` : ""}
  <p class="foot"><a href="#/coach">Sei l'allenatrice?</a></p>
  <p class="foot"><button class="linkbtn" data-act="a11y">${icon("a11y")} Accessibilità</button></p>`);
  document.getElementById("codeForm").onsubmit = (e) => {
    e.preventDefault();
    const c = codeFrom(document.getElementById("codeIn").value);
    if (c.length !== CODE_LEN) return renderCodeEntry("Il codice ha 12 caratteri, come XXXX-XXXX-XXXX.");
    localStorage.setItem(LS_CODE, c);
    route();
  };
}

// ---------------------------------------------------------- parti comuni (stile iOS: titolo grande, sezioni, barra flottante)
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const longToday = () => cap(new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }));
// titolo grande con riga sopra (data o contesto) e un pulsante a destra
// la riga sopra c'è sempre (anche vuota), così il titolo sta alla stessa altezza in tutte le pagine
const head = (title, eyebrow = "", right = "", left = "") => `<header class="top${left ? " back" : ""}">${left}<div class="grow"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1></div>${right}</header>`;
// stato vuoto: un solo modello per tutte le pagine
const empty = (ic, title, text, btn = "") => `<div class="empty">${icon(ic)}<b>${title}</b>${text ? `<p>${text}</p>` : ""}${btn}</div>`;
const NO_GROUPS = "Dividi gli alunni in gruppi per trovarli prima e programmare allenamenti solo per loro.";
// sezione con titolo fuori dalla carta (come le liste raggruppate di iOS)
const sect = (id, title, body, right = "", cls = "card") => `<section class="sect" aria-labelledby="${id}" data-help="${id.replace(/^h/, "").toLowerCase()}">
  <div class="sec-h out"><h2 id="${id}">${title}</h2>${right}</div><div class="${cls}">${body}</div></section>`;
// barra flottante in basso; action = pulsante tondo accanto (azione principale della schermata)
// badges: { chiave: numero } → pallino con il numero sull'icona (es. richieste da confermare)
// nuova versione: solo icone (il nome resta per VoiceOver)
const tabbar = (items, on, action = "", badges = {}) => `<div class="dock"><nav class="bnav${beta() ? " ico" : ""}" aria-label="Sezioni" data-help="nav" data-who="${items[0][0]}">${items
  .map(([href, ic, l, k]) => { const b = badges[k] || 0; return `<a href="${href}" class="${k === on ? "on" : ""}"${k === on ? ' aria-current="page"' : ""}>${icon(ic)}${b ? `<b class="badge" aria-hidden="true">${b}</b>` : ""}<span${beta() ? ' class="sr"' : ""}>${l}${b ? `<i class="sr">, ${b} da confermare</i>` : ""}</span></a>`; }).join("")}</nav>${action}</div>`;
// pulsante "?" (nuova versione): spiega la pagina
const helpBtn = () => (beta() ? `<button class="icon" data-act="help" data-help="help" aria-label="Aiuto: come funziona questa pagina">${icon("help")}</button>` : "");
const STUDENT_TABS = [["#/", "home", "Oggi", "oggi"], ["#/progressi", "chart", "Progressi", "progressi"], ["#/profilo", "user", "Profilo", "profilo"]];

// allenamenti del gruppo + lezioni private prenotate, in ordine di data (le lezioni si aprono per vederle o disdirle)
function studentAgenda(s) {
  const t0 = today();
  return [...(s.sched || []).map((t) => ({ t, who: t.gname || "Tutti", act: "" })),
    ...(s.lessons || []).map((t) => ({ t, who: lessonWho(s, t), act: "s-lesson" }))]
    .filter((x) => x.t.date >= t0).sort((a, b) => (a.t.date + (a.t.time || "")).localeCompare(b.t.date + (b.t.time || "")));
}
const lessonWho = (s, t) => (s.reqs && s.reqs[t.id] && s.reqs[t.id].cancel ? "Lezione privata · disdetta inviata" : "Lezione privata");
// richieste dell'alunno ancora da mostrare: in attesa o non confermate (con i dati dell'orario, presi da open o da quanto salvato)
function myReqs(s) {
  return Object.entries(s.reqs || {}).filter(([, r]) => r && !r.cancel && r.st !== "ok")
    .map(([id, r]) => ({ id, r, t: (s.open || []).find((o) => o.id === id) || r.slot || null }))
    .filter((x) => x.t && x.t.date >= today())
    .sort((a, b) => (a.t.date + a.t.time).localeCompare(b.t.date + b.t.time));
}
function privBox(s) {
  const reqs = myReqs(s), free = (s.open || []).filter((o) => !(s.reqs || {})[o.id]);
  const rows = reqs.map(({ id, r, t }) => `<li><div class="tr"><span class="date" aria-hidden="true"><b>${dayNum(t.date)}</b><small>${monShort(t.date)}</small></span>
    <span class="txt"><b>${fmtDay(t.date)}${t.time ? ` · ${esc(t.time)}` : ""}</b><small>${r.st === "no" ? "Non confermata: l'orario non è più disponibile" : "In attesa di conferma"}</small></span></div>
    <button class="btn sm ghost" data-act="s-req-del" data-id="${id}">${r.st === "no" ? "Ok" : "Annulla"}<span class="sr"> la richiesta del ${fmtDay(t.date)}</span></button></li>`).join("");
  const booked = (s.lessons || []).filter((t) => t.date >= today());
  return `${booked.length ? `<ul class="trs">${booked.map((t) => trRow(t, lessonWho(s, t), "s-lesson")).join("")}</ul>` : ""}
    ${rows ? `<ul class="trs reqs">${rows}</ul>` : ""}
    ${free.length ? `<button class="btn ghost wide" data-act="s-ask">${icon("calendar")} Chiedi una lezione</button>`
      : rows || booked.length ? "" : empty("calendar", "Nessun orario libero", "Quando la tua allenatrice pubblica degli orari, li trovi qui.")}`;
}

// nuova versione: la settimana in una riga (come un'agenda), con un segno nei giorni con un appuntamento
function weekStrip(list) {
  const days = Array.from({ length: 7 }, (_, k) => addDays(k));
  return `<ol class="week" data-help="week" aria-label="I prossimi 7 giorni">${days.map((d, k) => {
    const n = list.filter((x) => x.t.date === d).length, dt = parseDate(d);
    return `<li class="${k === 0 ? "today" : ""}${n ? " has" : ""}" aria-label="${fmtDay(d, true)}: ${n ? plural(n, "appuntamento", "appuntamenti") : "niente"}">
      <span aria-hidden="true">${dt.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "")}</span><b aria-hidden="true">${dt.getDate()}</b>
      <i aria-hidden="true">${n ? icon("skate") : ""}</i></li>`; }).join("")}</ol>`;
}
const myStickers = (s) => (s.stickers || []).filter((x) => x && isSticker(x.k)).sort((a, b) => b.at - a.at);
const stickerWall = (list, act) => `<ul class="stk-wall">${list.map((x, i) => `<li style="--i:${i}"><button class="stk-b" data-act="${act}" data-id="${x.id}"
  aria-label="${esc(STICKER_LABEL[x.k])}: ${esc(x.msg || "")}, ${fmtWhen(x.at)}">${sticker(x.k)}</button></li>`).join("")}</ul>`;
// sticker nuovi: arrivano uno alla volta a tutto schermo, poi restano nella raccolta (Progressi)
let stkOpen = false;
function showStickers(list, mark = true) {
  if (!list.length || stkOpen || introOn || !$sheet.hidden) return;
  stkOpen = true;
  const opener = document.activeElement;
  const box = document.createElement("div");
  box.className = "stk-show";
  box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-labelledby", "stkT");
  document.body.appendChild(box); $root.inert = true;
  let i = 0;
  const draw = () => {
    const x = list[i], last = i === list.length - 1;
    box.innerHTML = `<div class="stk-card">
      <div class="confetti" aria-hidden="true">${Array.from({ length: 16 }, (_, k) => `<i style="--k:${k}"></i>`).join("")}</div>
      <div class="stk-big">${sticker(x.k)}</div>
      <p class="stk-from">${list.length > 1 ? `${i + 1} di ${list.length} · ` : ""}Dalla tua allenatrice · ${fmtWhen(x.at)}</p>
      <h2 id="stkT" tabindex="-1">${esc(x.msg || STICKER_MSG[x.k])}</h2>
      <button type="button" class="btn wide" data-stk="next">${last ? "Grazie!" : "Avanti"}</button></div>`;
    box.querySelector("#stkT").focus({ preventScroll: true });
    if (mark) markSeen([x.id]);
  };
  const close = () => { box.remove(); $root.inert = false; stkOpen = false; document.removeEventListener("keydown", esc_); if (opener && document.contains(opener)) opener.focus({ preventScroll: true }); };
  const esc_ = (e) => { if (e.key === "Escape") close(); };
  box.addEventListener("click", (e) => { if (e.target.closest("[data-stk=next]")) { if (i < list.length - 1) { i++; draw(); } else close(); } });
  document.addEventListener("keydown", esc_);
  draw();
}

// ---------------------------------------------------------- presentazione al primo avvio (nuova versione)
// Una volta per ruolo su questo telefono (pg_intro = {s, c}); si rivede da Profilo / Impostazioni.
const LS_INTRO = "pg_intro";
let introOn = false;
const introSeen = (r) => { try { return !!(JSON.parse(localStorage.getItem(LS_INTRO)) || {})[r]; } catch { return true; } };
function markIntro(r) { try { const o = JSON.parse(localStorage.getItem(LS_INTRO) || "{}") || {}; o[r] = 1; localStorage.setItem(LS_INTRO, JSON.stringify(o)); } catch {} }
const standalone = () => navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
// vero se la presentazione sta per aprirsi: chi chiama (sticker) aspetta che si chiuda
function maybeIntro(r) {
  if (!beta() || introOn || introSeen(r)) return introOn;
  introOn = true;
  setTimeout(() => {
    if (!$sheet.hidden || askOpen() || tourOn() || stkOpen || !document.contains($root.querySelector(".dock"))) { introOn = false; return; }
    showIntro(r);
  }, 450);
  return true;
}
function showIntro(r, opener = null) {
  introOn = true;
  const slides = INTRO[r].filter((x) => !(x[4] === "home" && standalone()));
  const box = document.createElement("div");
  box.id = "intro"; box.className = "intro";
  box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-labelledby", "introT");
  document.body.appendChild(box); $root.inert = true;
  let i = 0, dir = "";
  const draw = () => {
    const [ic, c, t, txt] = slides[i], n = slides.length, last = i === n - 1;
    box.innerHTML = `<div class="intro-card" data-dir="${dir}">
      <div class="intro-top"><p class="intro-n">${i + 1} di ${n}</p>${last ? "" : `<button type="button" class="btn ghost sm" data-in="skip">Salta</button>`}</div>
      <div class="intro-art" style="--c:var(${c})" aria-hidden="true"><span class="intro-ic">${icon(ic)}</span><i></i><i></i><i></i></div>
      <h2 id="introT" tabindex="-1">${t}</h2><p class="intro-p">${txt}</p>
      <div class="intro-dots" aria-hidden="true">${slides.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>
      <div class="sheet-btns">${i ? `<button type="button" class="btn ghost" data-in="prev">Indietro</button>` : `<span></span>`}
        <button type="button" class="btn" data-in="next">${last ? "Inizia" : "Avanti"}</button></div>
      ${last && (HELP[S.page] || []).some(([k]) => $root.querySelector(`[data-help="${k}"]`)) ? `<button type="button" class="btn ghost wide" data-in="show">${icon("help")} Mostrami sulla pagina</button>` : ""}
    </div>`;
    box.querySelector("#introT").focus({ preventScroll: true });
  };
  const go_ = (d) => { const j = i + d; if (j < 0) return; if (j >= slides.length) return close(); dir = d > 0 ? "r" : "l"; i = j; draw(); };
  const close = (then) => {
    box.remove(); $root.inert = false; introOn = false; markIntro(r);
    document.removeEventListener("keydown", key, true);
    if (then === "show") return ACTIONS["help-tour"]();
    const el = opener && document.contains(opener) ? opener : $root.querySelector('[data-act="help"]');
    if (el) restoreFocus(el);
    if (r === "s") stickerCheck();
  };
  const key = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowRight" && !e.target.closest("input")) go_(1);
    else if (e.key === "ArrowLeft" && !e.target.closest("input")) go_(-1);
  };
  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-in]"); if (!b) return;
    const a = b.dataset.in;
    if (a === "next") go_(1); else if (a === "prev") go_(-1); else if (a === "skip") close(); else if (a === "show") close("show");
  });
  // scorrere col dito: solo un aiuto in più, i pulsanti restano
  let x0 = null;
  box.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
  box.addEventListener("pointerup", (e) => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 60 && !e.target.closest("button")) go_(dx < 0 ? 1 : -1); });
  document.addEventListener("keydown", key, true);
  draw();
}
// sticker nuovi dell'alunno: a tutto schermo uno alla volta (dopo la presentazione, se è aperta)
function stickerCheck() {
  const s = S.student;
  if (!beta() || !s || !S.page.startsWith("s-")) return;
  const seen = seenStickers(), fresh = myStickers(s).filter((x) => !seen.has(x.id)).reverse();
  if (fresh.length) setTimeout(() => showStickers(fresh), 350);
}

function renderStudent(view = "oggi") {
  const s = S.student;
  S.page = `s-${view}`;
  let body = "";
  if (view === "progressi") {
    const items = (s.progress || []).length, dn = (s.progress || []).filter((x) => x.status === "done").length;
    const stk = beta() ? myStickers(s) : [];
    body = `${head("Progressi", `Livello ${LEVEL_LABEL[lvlOf(s) || "base"].toLowerCase()}`, helpBtn())}
    ${stk.length ? sect("hStickers", "I tuoi sticker", `${stickerWall(stk, "s-stk")}<p class="muted small">Tocca uno sticker per rivederlo.</p>`) : ""}
    ${!items ? `<div class="card">${empty("chart", "Ancora nessun elemento", "Qui vedrai gli elementi tecnici e a che punto sei.")}</div>` : `<div class="card sum-card" data-help="sum"><div class="big-pct"><b>${pct(s)}%</b><span>${items ? `${dn} di ${items} elementi completati` : "Ancora nessun elemento"}</span></div>${progressBar(s)}</div>
    <div class="card" aria-label="Elementi" data-help="list">${progressList(s.progress, "student")}</div>`}`;
  } else if (view === "profilo") {
    body = `${head("Profilo", "Dati e impostazioni", helpBtn())}
    <div class="card profile" data-help="profile"><div class="prof-h"><span class="av lg" style="background:var(${avatarColor(s.name)})" aria-hidden="true">${esc([...s.name][0] || "?").toUpperCase()}</span>
      <div class="grow"><h2>${esc(s.name)}</h2><small>Livello ${LEVEL_LABEL[lvlOf(s) || "base"].toLowerCase()}</small></div></div>
      ${s.bio ? `<p class="bio">${esc(s.bio)}</p>` : ""}</div>
    ${sect("hSet", "Impostazioni", `<ul class="menu">
      <li><button type="button" class="mi" data-act="a11y">${icon("a11y")}<span>Accessibilità</span>${icon("chevron", "chev")}</button></li>
      ${beta() ? `<li><button type="button" class="mi" data-act="intro" data-help="intro">${icon("help")}<span>Rivedi la presentazione</span>${icon("chevron", "chev")}</button></li>` : ""}
      <li><button type="button" class="mi danger-row" data-act="s-logout" aria-describedby="logoutHelp">${icon("logout")}<span>Scollega questo telefono</span></button>
        <small class="mi-help" id="logoutHelp">Per rientrare ti servirà di nuovo il codice dell'invito.</small></li></ul>`, "", "plain")}`;
  } else {
    const plan = s.plan || [], done = checksDone(s);
    const up = studentAgenda(s), first = up[0], next = up.slice(1, 3);
    body = `${head(`Ciao, ${esc(s.name)}`, longToday(), helpBtn())}
    ${beta() ? weekStrip(up) : ""}
    ${first ? feature(first.t, first.who, first.act, first.act ? "La tua prossima lezione" : "Il tuo prossimo allenamento") : ""}
    ${next.length ? sect("hNext", "Poi in calendario",
      `<ul class="trs">${next.map((x) => trRow(x.t, x.who, x.act)).join("")}</ul>`) : ""}
    ${s.priv ? sect("hPriv", "Lezioni private", privBox(s)) : ""}
    ${sect("hScheda", "La tua scheda", plan.length
      ? `<ul class="checks">${plan.map((x) => checkRow(x, s.checks && s.checks[x.id], "student")).join("")}</ul>
        ${done ? `<button class="btn ghost wide" data-act="s-reset">${icon("refresh")} Ricomincia la scheda</button>` : ""}`
      : empty("skate", "Scheda in arrivo", "La tua allenatrice non l'ha ancora preparata."),
      plan.length ? `<span class="pill" aria-label="${done} su ${plan.length} fatti">${done} di ${plan.length}</span>` : "")}`;
  }
  paint(`${demoBanner()}${body}${tabbar(STUDENT_TABS, view)}`);
  if (!maybeIntro("s")) stickerCheck();
}

// mode: "student" (spunta), "coach" (apre la modifica), "reorder" (solo lettura + frecce)
function checkRow(x, val, mode) {
  const on = !!val;
  const inner = `<span class="box" aria-hidden="true">${on ? icon("check") : ""}</span>
    <span class="txt"><b>${esc(x.title)}</b>${x.detail ? `<small>${esc(x.detail)}</small>` : ""}
    ${on && typeof val === "number" ? `<small class="when">Fatto ${fmtWhen(val)}</small>` : ""}</span>`;
  if (mode === "student") {
    return `<li><button class="check ${on ? "on" : ""}" data-act="s-check" data-id="${x.id}" aria-pressed="${on}">${inner}</button></li>`;
  }
  if (mode === "coach") {
    return `<li data-id="${x.id}"><button class="check coach ${on ? "on" : ""}" data-act="c-edit-ex" data-id="${x.id}">${inner}
      <span class="sr">${on ? "Spuntato dall'alunno." : "Non ancora spuntato."} Tocca per modificare.</span>${icon("chevron", "chev")}</button></li>`;
  }
  return `<div class="check ro ${on ? "on" : ""}">${inner}<span class="sr">${on ? "Spuntato." : ""}</span></div>`;
}

function progressBar(s) {
  return `<div class="bar" aria-hidden="true"><span style="width:${pct(s)}%"></span></div>`;
}

const stPill = (st) => `${icon(st)}<span>${STATUS[st]}</span>`;

const groupKey = (i) => `${i.level}|${i.cat}`;
// livelli → categorie → elementi (gli elementi arrivano già normalizzati: nessuno resta fuori)
function groups(items) {
  return LEVELS.map(([lv, label]) => {
    const inLv = items.filter((i) => i.level === lv);
    return { lv, label, cats: CATEGORIES.filter((c) => inLv.some((i) => i.cat === c)).map((c) => ({ cat: c, items: inLv.filter((i) => i.cat === c) })) };
  }).filter((g) => g.cats.length);
}
const legend = () => `<p class="legend" aria-hidden="true">${Object.keys(STATUS).map((k) =>
  `<span class="lg"><span class="st-ic xs ${k}">${icon(k)}</span>${STATUS[k]}</span>`).join("")}</p>`;
const arrows = (kind, id, title, i, n) =>
  `<button class="icon sm" data-act="c-move" data-kind="${kind}" data-id="${id}" data-d="-1" aria-label="Sposta su: ${esc(title)}" ${i ? "" : "disabled"}>${icon("up")}</button>
   <button class="icon sm" data-act="c-move" data-kind="${kind}" data-id="${id}" data-d="1" aria-label="Sposta giù: ${esc(title)}" ${i < n - 1 ? "" : "disabled"}>${icon("down")}</button>`;

// mode: "student" (sola lettura), "coach" (stato a destra + modifica), "reorder" (frecce)
function progressList(raw, mode) {
  const items = (raw || []).map(normItem);
  if (!items.length) return `<p class="muted">${mode === "student" ? "Ancora nessun elemento." : "Nessun elemento. Aggiungine uno."}</p>`;
  return `${mode === "reorder" ? "" : legend()}${groups(items).map((g) => `
    <h3 class="lvl">${g.label}</h3>
    ${g.cats.map((c) => `<h4 class="cat">${esc(c.cat)}</h4>
    <ul class="prog" ${mode === "student" ? "" : `data-drag="prog" data-group="${g.lv}|${esc(c.cat)}"`}>${c.items.map((i, k) => progRow(i, mode, k, c.items.length)).join("")}</ul>`).join("")}`).join("")}`;
}
function progRow(i, mode, k, n) {
  const meta = `${i.status === "done" && i.date ? `<small>Completato il ${beta() ? fmtLong(i.date) : fmtDate(i.date)}</small>` : ""}
    ${i.note ? `<small class="note">${esc(i.note)}</small>` : ""}`;
  const txt = `<span class="txt"><b>${esc(i.name)}</b>${meta}</span>`;
  if (mode === "coach") return `<li data-id="${i.id}">
      <button class="rowbtn" data-act="c-edit-prog" data-id="${i.id}">${txt}<span class="sr">Modifica livello, stato, data e note</span></button>
      <button class="st-ic ${i.status}" data-nodrag data-act="c-cycle" data-id="${i.id}"
        aria-label="${esc(i.name)}: ${STATUS[i.status]}. Tocca per passare a ${STATUS[NEXT[i.status]]}">${icon(i.status)}</button></li>`;
  if (mode === "reorder") return `<li data-id="${i.id}"><div class="rowbtn ro">${txt}</div><div class="ops" data-nodrag>${arrows("prog", i.id, i.name, k, n)}</div></li>`;
  return `<li>${txt}<span class="st-ic ${i.status}">${icon(i.status)}<span class="sr">${STATUS[i.status]}</span></span></li>`;
}
// nuovo ordine dopo un trascinamento: la scheda intera, oppure le sole posizioni di un gruppo dei progressi
async function applyOrder(kind, group, ids, id, to) {
  const s = cur();
  if (!s) return;
  if (kind === "plan") {
    const by = Object.fromEntries((s.plan || []).map((x) => [x.id, x]));
    const plan = ids.map((k) => by[k]).filter(Boolean);
    if (plan.length !== (s.plan || []).length) return;
    pendingFocus = `[data-act="c-edit-ex"][data-id="${id}"]`; flashSel = `li[data-id="${id}"]`;
    await be.updateStudent(s.code, { plan });
    return toast(`${by[id].title}: posizione ${to + 1} di ${plan.length}`);
  }
  const arr = (s.progress || []).map(normItem);
  const slots = arr.map((x, k) => (groupKey(x) === group ? k : -1)).filter((k) => k >= 0);
  const by = Object.fromEntries(arr.map((x) => [x.id, x]));
  if (slots.length !== ids.length || ids.some((k) => !by[k] || groupKey(by[k]) !== group)) return;
  slots.forEach((k, j) => { arr[k] = by[ids[j]]; });
  pendingFocus = `[data-act="c-edit-prog"][data-id="${id}"]`; flashSel = `li[data-id="${id}"]`;
  await be.updateStudent(s.code, { progress: arr });
  toast(`${by[id].name}: posizione ${to + 1} di ${slots.length}`);
}
const reorderBtn = (tab, on) => `<button class="btn ghost sm" data-act="c-reorder" data-tab="${tab}" aria-pressed="${on}">${icon(on ? "check" : "reorder")} ${on ? "Fine" : "Riordina"}</button>`;
const lvlOf = (s) => normLevel(s.level);

// ======================================================== ALLENATRICE
function routeCoach(view, tab) {
  let stu = null, met = null;
  loading();
  unsub.push(() => { stu && stu(); met && met(); });
  unsub.push(be.onCoachAuth((u) => {
    S.coach = u;
    if (stu) { stu(); stu = null; }
    if (met) { met(); met = null; }
    if (!u || !u.isCoach) { if (u && !u.error && !be.dev) localStorage.removeItem(LS_ROLE); return renderCoachLogin(u); }
    if (!be.dev) localStorage.setItem(LS_ROLE, "coach");
    loading();
    let gotS = false, gotM = false;
    const draw = () => { if (gotS && gotM) { renderCoach(view, tab); cleanPast(); maybeIntro("c"); } };
    stu = be.watchStudents((list) => {
      S.students = list.sort((a, b) => a.name.localeCompare(b.name, "it"));
      gotS = true; draw();
    }, (e) => {
      console.error(e);
      $root.innerHTML = `<div class="center"><p>Accesso negato o errore di rete.</p>
        <button class="btn" onclick="location.reload()">Riprova</button></div>`;
    });
    // gruppi e allenamenti: se la regola del database non è ancora aggiornata, il resto funziona lo stesso
    met = be.watchMeta((m, info) => { S.meta = normMeta(m); S.metaErr = false; S.metaCache = !!(info && info.fromCache); gotM = true; draw(); },
      (e) => { console.warn(e); S.meta = emptyMeta(); S.metaErr = true; gotM = true; draw(); });
  }));
}
function renderCoach(view, tab) {
  if (isCode(view)) return renderCoachStudent(view, tab);
  if (view === "alunni") return renderCoachList();
  if (view === "calendario") return renderCoachMonth();
  if (view === "statistiche") return renderCoachStats();
  return renderCoachHome();
}
// nuova versione: allenamenti e lezioni dei giorni passati si cancellano da soli, una volta per sessione,
// solo con i dati arrivati dal server (una copia vecchia dalla cache potrebbe cancellare modifiche fatte da un altro telefono)
function cleanPast() {
  if (!beta() || S.cleaned || S.metaErr || S.metaCache) return;
  S.cleaned = true;
  const t0 = today();
  if (S.meta.trainings.some((t) => t.date < t0) || S.meta.slots.some((t) => t.date < t0)) saveMeta(S.meta).catch((e) => console.warn(e));
}

function renderCoachLogin(u) {
  const uid = u && u.uid;
  paint(`${demoBanner()}
  <div class="hero">${logo()}<h1>Area allenatrice</h1>
    <p>Questo telefono non è ancora abilitato. Non servono email né password.</p></div>
  ${be.demo ? `<div class="card"><button class="btn wide" data-act="c-demo">Entra (demo)</button></div>` : `
  <form class="card" id="trForm">
    <h2 class="h3">Hai già l'app su un altro telefono?</h2>
    <p class="muted small" id="trHelp">Sul vecchio telefono apri Impostazioni → “Aggiungi un dispositivo” e scrivi qui il codice (vale 15 minuti).</p>
    <label for="trIn" class="sr">Codice di trasferimento</label>
    <input id="trIn" class="code-in" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX" maxlength="20" aria-describedby="trHelp">
    <button class="btn wide" type="submit">Abilita questo telefono</button>
  </form>
  ${uid ? `<details class="card setup">
    <summary class="h3">Primo telefono (solo la prima volta)</summary>
    <p class="muted small">Chi ha creato il progetto Firebase aggiunge questo ID nella raccolta <b>coaches</b> (vedi guida). Dopo non serve più.</p>
    <div class="bigcode small-code">${esc(uid)}</div>
    <button class="btn ghost wide" data-act="c-copy-id" data-id="${esc(uid)}">${icon("link")} Copia ID</button>
  </details>` : `<p class="err">${u && u.error ? "Connessione non riuscita. Riprova." : ""}</p>`}`}
  <p class="foot"><a href="#">${icon("back")} Torna alla schermata alunno</a></p>
  <p class="foot"><button class="linkbtn" data-act="a11y">${icon("a11y")} Accessibilità</button></p>`);
  const trForm = document.getElementById("trForm");
  if (trForm) trForm.onsubmit = async (e) => {
    e.preventDefault();
    const t = normCode(document.getElementById("trIn").value);
    if (t.length !== CODE_LEN) return oops("Il codice ha 12 caratteri");
    try { await be.redeemTransfer(t); route(); }
    catch (err) { console.error(err); oops("Codice non valido o scaduto"); }
  };
}

// ---------------------------------------------------------- parti comuni dell'area allenatrice
const coachTop = (title, eyebrow) => head(title, eyebrow, `<div class="top-acts">${helpBtn()}<button class="icon" data-act="c-settings" data-help="settings" aria-label="Impostazioni">${icon("settings")}</button></div>`);
// barra flottante: Oggi / Alunni / Calendario (+ azione principale della schermata)
const COACH_TABS = [["#/coach", "home", "Oggi", ""], ["#/coach/alunni", "users", "Alunni", "alunni"], ["#/coach/calendario", "calendar", "Calendario", "calendario"]];
const bnav = (on, action = "") => tabbar(COACH_TABS, on, action, beta() && !S.metaErr ? { "": inbox().length } : {});
const fab = (act, label, ic = "plus") => `<button class="fab" data-act="${act}" data-help="fab" aria-label="${label}">${icon(ic)}</button>`;
const metaWarn = () => S.metaErr ? `<div class="card warn" role="note"><b>Gruppi e allenamenti non disponibili.</b>
  <p class="small">Va aggiornata la regola di sicurezza del database (Firestore → Regole): vedi la guida.</p></div>` : "";
const upcoming = () => sortTrainings(S.meta.trainings.filter((t) => t.date >= today()));
const nameOf = (code) => (S.students.find((x) => x.code === code) || {}).name || "Alunno eliminato";
const upSlots = () => sortTrainings(S.meta.slots.filter((t) => t.date >= today()));
// Home: allenamenti e lezioni prenotate insieme
const coachAgenda = () => [...upcoming().map((t) => ({ t, who: beta() ? `Allenamento · ${whoOf(t)}` : whoOf(t), act: "c-edit-tr" })),
  ...upSlots().filter((t) => t.who).map((t) => ({ t, who: `Lezione privata · ${nameOf(t.who)}`, act: "c-edit-slot" }))]
  .sort((a, b) => (a.t.date + (a.t.time || "")).localeCompare(b.t.date + (b.t.time || "")));
// richieste e disdette degli alunni, da confermare con un tocco
function inbox() {
  const out = [];
  for (const s of S.students) for (const [id, r] of Object.entries(s.reqs || {})) {
    const t = S.meta.slots.find((x) => x.id === id);
    if (!r || !t || t.date < today()) continue;
    if (r.cancel && t.who === s.code) out.push({ kind: "cancel", s, t, at: r.cancel });
    else if (!r.cancel && !r.st && !t.who) out.push({ kind: "req", s, t, at: r.at || 0 });
  }
  return out.sort((a, b) => (a.t.date + a.t.time).localeCompare(b.t.date + b.t.time) || a.at - b.at);
}
const slotWho = (t) => {
  if (t.who) return `Prenotata · ${nameOf(t.who)}`;
  const n = S.students.filter((s) => s.reqs && s.reqs[t.id] && !s.reqs[t.id].st && !s.reqs[t.id].cancel).length;
  return n ? `Libero · ${n === 1 ? "1 richiesta" : `${n} richieste`}` : "Libero";
};
const whoOf = (t) => (t.group ? groupName(S.meta, t.group) || "Gruppo eliminato" : "Tutti");
const inGroup = (id) => S.students.filter((s) => (s.group || "") === id).length;
const nAlunni = (n) => (n === 1 ? "1 alunno" : `${n} alunni`);

// riga di un allenamento; con act diventa un pulsante che apre la modifica
function trRow(t, who, act) {
  if (t.dur) who = `${who} · ${t.dur} min`; // lezioni private: durata nella seconda riga
  const inner = `<span class="date" aria-hidden="true"><b>${dayNum(t.date)}</b><small>${monShort(t.date)}</small></span>
    <span class="txt"><b>${fmtDay(t.date)}${t.time ? ` · ${esc(t.time)}` : ""}</b>
      <small>${esc(who)}${t.place ? ` · ${esc(t.place)}` : ""}</small>${t.note ? `<small class="note">${esc(t.note)}</small>` : ""}</span>`;
  return act ? `<li><button class="tr" data-act="${act}" data-id="${t.id}">${inner}<span class="sr">Tocca per modificare</span>${icon("chevron", "chev")}</button></li>`
    : `<li><div class="tr">${inner}</div></li>`;
}

// riga di diagnosi (solo iPhone dalla Home): dice se la correzione dell'altezza è attiva
function screenInfo() {
  const p = document.createElement("div");
  p.style.cssText = "position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top)";
  document.body.appendChild(p);
  const top = parseFloat(getComputedStyle(p).paddingTop) || 0; p.remove();
  const sa = matchMedia("(display-mode: standalone)").matches ? "sì" : "no";
  return `${screen.width}×${screen.height} · pagina ${innerHeight} · alto ${top} · documento ${document.documentElement.scrollHeight} · min ${getComputedStyle(document.documentElement).minHeight} · Home ${sa}`;
}

// carta in evidenza (blu con il "sole"): il prossimo allenamento in cima alla schermata Oggi
function feature(t, who, act, label) {
  const inner = `<span class="sun" aria-hidden="true">${icon(beta() ? (t.dur ? "user" : "skate") : "calendar")}</span>
    <span class="feat-k">${label}</span>
    <b class="feat-t">${fmtDay(t.date)}</b>
    <span class="feat-s">${[t.time, who, t.place].filter(Boolean).map(esc).join(" · ")}</span>
    ${t.note ? `<span class="feat-s note">${esc(t.note)}</span>` : ""}`;
  return act ? `<button class="feat" data-act="${act}" data-id="${t.id}" data-help="feat">${inner}<span class="sr">Tocca per modificare</span><span class="feat-go" aria-hidden="true">${icon("arrow")}</span></button>`
    : `<div class="feat" role="group" aria-label="${label}" data-help="feat">${inner}</div>`;
}

function inboxRow({ kind, s, t }) {
  const when = `${fmtDay(t.date)}${t.time ? ` · ${esc(t.time)}` : ""}`;
  return `<li><div class="tr"><span class="date" aria-hidden="true"><b>${dayNum(t.date)}</b><small>${monShort(t.date)}</small></span>
    <span class="txt"><b>${esc(s.name)}</b><small>${kind === "cancel" ? "Ha disdetto la lezione del" : "Chiede una lezione"} ${when}</small></span></div>
    <span class="row-btns">${kind === "cancel"
      ? `<button class="btn sm" data-act="c-lr-free" data-code="${s.code}" data-id="${t.id}">Libera l'orario<span class="sr"> del ${when}</span></button>`
      : `<button class="btn sm" data-act="c-lr-ok" data-code="${s.code}" data-id="${t.id}">Conferma<span class="sr"> la lezione di ${esc(s.name)}</span></button>
         <button class="btn sm ghost" data-act="c-lr-no" data-code="${s.code}" data-id="${t.id}">Rifiuta<span class="sr"> la lezione di ${esc(s.name)}</span></button>`}</span></li>`;
}

// ---------------------------------------------------------- Home (dashboard)
function renderCoachHome() {
  const list = S.students, n = list.length;
  const avg = n ? Math.round(list.reduce((a, s) => a + pct(s), 0) / n) : 0;
  const since = Date.now() - 7 * 86400000;
  const active = list.filter((s) => (s.checksAt || 0) >= since && checksDone(s) > 0).length;
  const up = coachAgenda(), first = up[0], next = up.slice(1, 4), box = S.metaErr ? [] : inbox();
  const g = S.meta.groups, none = inGroup("");
  S.page = "c-home";
  paint(`${demoBanner()}
  ${coachTop("Oggi", longToday())}
  ${metaWarn()}
  <section class="statbox" aria-labelledby="hNum" data-help="stats"><h2 class="sr" id="hNum">In sintesi</h2>
    <ul class="stats">
      <li class="stat"><span>${icon("users")}Alunni</span><b><span data-count="${n}">${n}</span></b></li>
      <li class="stat"><span>${icon("chart")}Media progressi</span><b>${n ? `<span data-count="${avg}">${avg}</span>%` : "–"}</b></li>
      <li class="stat"><span>${icon("clock")}Attivi in 7 giorni</span><b><span data-count="${active}">${active}</span><small> su ${n}</small></b></li>
    </ul>${beta() ? `<a class="btn ghost wide" href="#/coach/statistiche">${icon("chart")} Tutte le statistiche</a>` : ""}</section>
  ${box.length ? sect("hInbox", "Da confermare", `<ul class="trs reqs">${box.map(inboxRow).join("")}</ul>`) : ""}
  ${first ? feature(first.t, first.who, S.metaErr ? "" : first.act, first.act === "c-edit-slot" ? "Prossima lezione privata" : "Prossimo allenamento") : ""}
  ${first && !next.length ? "" : sect("hNext", first ? "Poi in calendario" : "Prossimi allenamenti",
    next.length ? `<ul class="trs">${next.map((x) => trRow(x.t, x.who, x.act)).join("")}</ul>`
      : empty("calendar", "Nessun allenamento in programma", "Tocca + per aggiungerne uno."),
    next.length ? `<a class="more" href="#/coach/calendario">Vedi tutti</a>` : "")}
  ${bnav("", S.metaErr ? "" : fab("c-new-appt", "Nuovo appuntamento"))}`);
}

// ---------------------------------------------------------- Alunni (elenco con gruppi e ricerca)
const norm = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const SEARCH_MIN = 6; // la ricerca compare da 6 alunni in su
const byGroup = (s) => !S.gf || (S.gf === "none" ? !s.group : S.gf === "priv" ? !!s.priv : s.group === S.gf);
const shownStudents = () => { const q = norm(S.q); return S.students.filter((s) => byGroup(s) && (!q || norm(s.name).includes(q))); };

function gfChips() {
  const anyPriv = S.students.some((s) => s.priv);
  if (beta()) return anyPriv ? [["", "Tutti"], ["priv", "Lezioni private"]].map(([k, l]) =>
    `<button class="chip f" data-act="c-gf" data-id="${k || "all"}" aria-pressed="${S.gf === k}">${l}</button>`).join("") : "";
  if (!S.meta.groups.length && !anyPriv) return "";
  const opts = [["", "Tutti"], ...S.meta.groups.map((g) => [g.id, g.name]), ...(S.meta.groups.length && inGroup("") ? [["none", "Senza gruppo"]] : []),
    ...(anyPriv ? [["priv", "Lezioni private"]] : [])];
  return opts.map(([k, l]) => `<button class="chip f" data-act="c-gf" data-id="${k || "all"}" aria-pressed="${S.gf === k}">${esc(l)}</button>`).join("");
}

// nuova versione: righe semplici (nome, livello, %), divise per gruppo; i gruppi si gestiscono qui
const sub = (s) => [LEVEL_LABEL[lvlOf(s) || "base"], s.priv ? "Lezioni private" : ""].filter(Boolean).join(" · ");
const srow = (s) => `<li><a href="#/coach/${s.code}" class="srow">
  <span class="av" style="background:var(${avatarColor(s.name)})" aria-hidden="true">${esc([...s.name][0] || "?").toUpperCase()}</span>
  <span class="txt"><b>${esc(s.name)}</b><small>${sub(s)}</small></span>
  <span class="pill" aria-label="progressi ${pct(s)}%">${pct(s)}%</span>${icon("chevron", "chev")}</a></li>`;
const srows = (list) => `<ul class="rows">${list.map(srow).join("")}</ul>`;
function groupedRows() {
  if (!S.students.length) return `<div class="card">${empty("users", "Ancora nessun alunno", "Tocca + per aggiungerne uno e mandargli l'invito.")}</div>`;
  const newG = S.metaErr ? "" : `<button class="btn ghost wide" data-act="c-new-group" data-help="groups">${icon("plus")} Nuovo gruppo</button>`;
  if (S.q || S.gf) {
    const shown = shownStudents();
    return shown.length ? `<div class="card plainlist">${srows(shown)}</div>`
      : `<div class="card"><p class="muted">${S.q ? `Nessun alunno corrisponde a “${esc(S.q)}”.` : "Nessun alunno."}</p></div>`;
  }
  const g = S.meta.groups;
  if (!g.length) return `<div class="card plainlist">${srows(S.students)}</div>
    <div class="card">${empty("group", "Vuoi dividerli in gruppi?", NO_GROUPS, newG)}</div>`;
  const parts = g.map((x) => { const list = S.students.filter((s) => s.group === x.id);
    return sect(`hG${x.id}`, `${esc(x.name)} <small class="cnt">${list.length}</small>`,
      list.length ? srows(list) : `<p class="muted">Nessun alunno. Tocca Modifica per aggiungerli.</p>`,
      `<span class="g-acts">${list.length ? `<button class="btn sm ghost ic" data-act="c-stk" data-group="${x.id}" data-help="gstk" aria-label="Manda uno sticker al gruppo ${esc(x.name)}">${icon("gift")}</button>` : ""}<button class="btn sm ghost" data-act="c-edit-group" data-id="${x.id}">Modifica<span class="sr"> il gruppo ${esc(x.name)}</span></button></span>`, "card plainlist"); });
  const none = S.students.filter((s) => !validGroup(s.group));
  if (none.length) parts.push(sect("hGnone", `Senza gruppo <small class="cnt">${none.length}</small>`, srows(none), "", "card plainlist"));
  return parts.join("") + newG;
}

function studentRows() {
  if (beta()) return groupedRows();
  if (!S.students.length) return `<div class="card">${empty("users", "Ancora nessun alunno", "Tocca + per aggiungerne uno e mandargli l'invito.")}</div>`;
  const shown = shownStudents();
  if (!shown.length) return `<div class="card"><p class="muted">${S.q ? `Nessun alunno corrisponde a “${esc(S.q)}”.` : "Nessun alunno in questo gruppo."}</p></div>`;
  return `<ul class="students">${shown.map((s) => {
      const done = checksDone(s), tot = (s.plan || []).length, gn = groupName(S.meta, s.group);
      return `<li><a href="#/coach/${s.code}" class="card stu">
        <span class="av" style="background:var(${avatarColor(s.name)})" aria-hidden="true">${esc([...s.name][0] || "?").toUpperCase()}</span>
        <span class="stu-main"><span class="row"><b>${esc(s.name)}</b><span class="pill">${pct(s)}%</span></span>
        ${progressBar(s)}
        <small class="muted">${[lvlOf(s) ? LEVEL_LABEL[lvlOf(s)] : "", gn ? esc(gn) : "", s.priv ? "Lezioni private" : ""].filter(Boolean).join(" · ")}</small>
        <small class="muted">Scheda: ${done}/${tot} spuntati${s.checksAt && done ? ` · ${fmtWhen(s.checksAt)}` : ""}</small></span>
      </a></li>`;
    }).join("")}</ul>`;
}

let countTimer = null;
function announceCount() {
  clearTimeout(countTimer);
  countTimer = setTimeout(() => {
    const el = document.getElementById("stuCount");
    if (!el) return;
    const n = shownStudents().length;
    el.textContent = !S.q && !S.gf ? "" : n === 0 ? "Nessun alunno trovato" : n === 1 ? "1 alunno trovato" : `${n} alunni trovati`;
  }, 400); // aspetta una pausa nella digitazione, così VoiceOver non legge ogni tasto
}
// aggiorna solo filtri e righe: il campo di ricerca non perde testo e focus
function refreshList() {
  $root.classList.remove("enter"); // le righe filtrate non rifanno l'animazione d'entrata
  const gf = document.getElementById("gfBox");
  if (gf) gf.innerHTML = gfChips();
  document.getElementById("stuList").innerHTML = studentRows();
  const c = document.getElementById("stuTot");
  if (c) c.textContent = nAlunni(S.students.length);
}

function renderCoachList() {
  S.page = "c-alunni";
  if (document.getElementById("stuList") && $root.dataset.view === "list" && !animateNext) return refreshList();
  paint(`${demoBanner()}
  ${coachTop("Alunni", `<span id="stuTot">${nAlunni(S.students.length)}</span>`)}
  ${gfChips() ? `<div class="chips gf" id="gfBox" role="group" aria-label="Filtra gli alunni" data-help="filters">${gfChips()}</div>` : ""}
  ${S.students.length >= SEARCH_MIN ? `<div class="search" role="search" data-help="search">
    <label for="stuSearch" class="sr">Cerca alunno</label>${icon("search")}
    <input id="stuSearch" type="search" placeholder="Cerca alunno" autocomplete="off" autocorrect="off" spellcheck="false"
      enterkeyhint="search" value="${esc(S.q)}" aria-describedby="stuCount"></div>` : ""}
  <p id="stuCount" class="sr" aria-live="polite"></p>
  <div id="stuList" data-help="list">${studentRows()}</div>
  ${bnav("alunni", fab("c-new", "Nuovo alunno"))}`);
  $root.dataset.view = "list";
  const inp = document.getElementById("stuSearch");
  if (inp) {
    inp.oninput = () => { S.q = inp.value; refreshList(); announceCount(); };
    inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); inp.blur(); } };
  }
}


// ---------------------------------------------------------- Calendario del mese (nuova versione)
const ym = (d) => d.slice(0, 7);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// richieste ancora senza risposta per un orario libero
const reqsFor = (t) => S.students.filter((s) => s.reqs && s.reqs[t.id] && !s.reqs[t.id].st && !s.reqs[t.id].cancel);
// che cosa è, scritto per esteso: nella nuova versione ogni riga lo dice
function kindWho(t) {
  if (!t.dur) return `Allenamento · ${whoOf(t)}`;
  if (t.who) return `Lezione privata · ${nameOf(t.who)}`;
  const n = reqsFor(t).length;
  return n ? `Orario libero · ${plural(n, "richiesta", "richieste")}` : "Orario libero";
}
const DAYC = ["--lilac", "--pink", "--sky", "--sage", "--yellow", "--orange", "--lilac"]; // un colore per giorno della settimana
const allItems = () => sortTrainings([...S.meta.trainings, ...S.meta.slots].filter((t) => t.date >= today()));
const actOf = (t) => (t.dur ? "c-edit-slot" : "c-edit-tr");
function monthMap(m) {
  const map = {};
  const add = (d, k, n = 1) => { if (!d.startsWith(m)) return; const x = map[d] || (map[d] = { tr: 0, les: 0, free: 0, ask: 0 }); x[k] += n; };
  S.meta.trainings.forEach((t) => add(t.date, "tr"));
  S.meta.slots.forEach((t) => { add(t.date, t.who ? "les" : "free"); if (!t.who) { const n = reqsFor(t).length; if (n) add(t.date, "ask", n); } });
  return map;
}
const daySummary = (x) => !x ? "niente in programma" : [x.tr && plural(x.tr, "allenamento", "allenamenti"),
  x.les && plural(x.les, "lezione prenotata", "lezioni prenotate"), x.free && plural(x.free, "orario libero", "orari liberi"),
  x.ask && plural(x.ask, "richiesta da confermare", "richieste da confermare")].filter(Boolean).join(", ");
// segni sul giorno: forme diverse, mai solo colore (quadrato = allenamento, cerchio pieno = prenotata, cerchio vuoto = libero)
const MK = { tr: "Allenamento", les: "Lezione prenotata", free: "Orario libero" };
const mk = (k) => `<i class="mk k-${k}"></i>`;
function monthGrid() {
  const t0 = today(), m = S.calM, [y, mo] = m.split("-").map(Number);
  const pad = (new Date(y, mo - 1, 1).getDay() + 6) % 7, n = new Date(y, mo, 0).getDate(), map = monthMap(m);
  const prevN = new Date(y, mo - 1, 0).getDate();
  // giorni del mese prima e dopo (solo da vedere, non si toccano): la griglia è sempre a settimane intere
  const cells = Array.from({ length: pad }, (_, i) => `<span class="cal-o" aria-hidden="true">${prevN - pad + 1 + i}</span>`);
  for (let d = 1; d <= n; d++) {
    const ds = `${m}-${String(d).padStart(2, "0")}`, x = map[ds], on = ds === S.calD, wk = (pad + d - 1) % 7 > 4;
    cells.push(`<button type="button" class="cal-d${on ? " on" : ""}${ds === t0 ? " today" : ""}${x && x.ask ? " ask" : ""}${x ? " has" : ""}${wk ? " wk" : ""}" data-act="c-cal-day" data-id="${ds}"
      aria-pressed="${on}" aria-label="${fmtDay(ds, true)}: ${daySummary(x)}"${ds < t0 ? " disabled" : ""}><b>${d}</b><span class="mks" aria-hidden="true">${x ? Object.keys(MK).filter((k) => x[k]).map(mk).join("") : ""}</span></button>`);
  }
  for (let i = 1; cells.length % 7; i++) cells.push(`<span class="cal-o" aria-hidden="true">${i}</span>`);
  const dt = new Date(y, mo - 1, 1), mon = cap(dt.toLocaleDateString("it-IT", { month: "long" }));
  const away = m !== ym(t0) || S.calD !== t0;
  return `<section class="card cal" aria-labelledby="hMonth" data-help="month">
    <div class="cal-h"><h2 id="hMonth">${mon} <small>${y}</small></h2>
      ${away ? `<button type="button" class="btn sm ghost" data-act="c-cal-today">Oggi</button>` : ""}
      <span class="cal-nav"><button type="button" class="icon" data-act="c-cal-m" data-d="-1" aria-label="Mese precedente"${m <= ym(t0) ? " disabled" : ""}>${icon("back")}</button>
      <button type="button" class="icon" data-act="c-cal-m" data-d="1" aria-label="Mese successivo">${icon("arrow")}</button></span></div>
    <div class="cal-w" aria-hidden="true">${["lun", "mar", "mer", "gio", "ven", "sab", "dom"].map((w, i) => `<span${i > 4 ? ' class="wk"' : ""}>${w}</span>`).join("")}</div>
    <div class="cal-g"${S.calSlide ? ` data-slide="${S.calSlide > 0 ? "r" : "l"}"` : ""}>${cells.join("")}</div>
    <p class="legend cal-lg" data-help="legend" aria-hidden="true">${Object.entries(MK).map(([k, l]) => `<span class="lg">${mk(k)}${l}</span>`).join("")}<span class="lg"><i class="mk k-ask"></i>Richiesta</span></p>
  </section>`;
}
function renderCoachMonth() {
  S.page = "c-cal";
  const t0 = today();
  if (!S.calD || S.calD < t0) S.calD = t0;
  if (!S.calM || S.calM < ym(t0)) S.calM = ym(S.calD);
  const all = allItems(), box = S.metaErr ? [] : inbox();
  const view = `<div class="chips seg-tabs" role="group" aria-label="Vista" data-help="view">${[["mese", "Mese"], ["elenco", "Elenco"]].map(([k, l]) =>
    `<button type="button" class="chip f" data-act="c-cal-view" data-id="${k}" aria-pressed="${S.calView === k}">${l}</button>`).join("")}</div>`;
  let body;
  if (S.calView === "elenco") {
    const days = [...new Set(all.map((t) => t.date))];
    body = days.length ? days.map((d) => { const dt = parseDate(d), id = `hD${d.replace(/-/g, "")}`;
      return `<section class="dayc" style="--dc: var(${DAYC[(dt.getDay() + 6) % 7]})" aria-labelledby="${id}">
        <h2 class="dayc-d" id="${id}"><span aria-hidden="true"><small>${dt.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "")}</small><b>${dt.getDate()}</b><small>${monShort(d)}</small></span><span class="sr">${fmtDay(d, true)}</span></h2>
        <ul class="dayc-l">${all.filter((t) => t.date === d).map((t) => `<li><button class="dayc-i" data-act="${actOf(t)}" data-id="${t.id}">
          <span><b>${t.time ? esc(t.time) : "Orario da decidere"}</b>${esc(kindWho(t))}${t.place ? `<small>${esc(t.place)}</small>` : ""}</span>${icon("chevron", "chev")}</button></li>`).join("")}</ul></section>`; }).join("")
      : `<div class="card">${empty("calendar", "Niente in programma", "Tocca + per aggiungere un allenamento o una lezione privata.")}</div>`;
  } else {
    const items = sortTrainings([...S.meta.trainings, ...S.meta.slots].filter((t) => t.date === S.calD));
    body = `${monthGrid()}${sect("hDay", cap(fmtDay(S.calD, true)), items.length
      ? `<ul class="trs">${items.map((t) => trRow(t, kindWho(t), actOf(t))).join("")}</ul>`
      : empty("calendar", "Niente in programma", "Tocca + per aggiungere un allenamento o una lezione in questo giorno."))}`;
  }
  paint(`${demoBanner()}
  ${coachTop("Calendario", all.length ? `${all.length} in programma` : "Niente in programma")}
  ${metaWarn()}
  ${box.length ? sect("hInbox", "Da confermare", `<ul class="trs reqs">${box.map(inboxRow).join("")}</ul>`) : ""}
  ${view}${body}
  ${bnav("calendario", S.metaErr ? "" : fab("c-new-appt", "Nuovo appuntamento"))}`);
}

// ---------------------------------------------------------- Statistiche (nuova versione)
// barre orizzontali di un solo colore: etichetta e valore scritti, la barra è solo un aiuto visivo
// minuti in parole: "45 min", "1 ora", "1,5 ore"
const fmtMins = (m) => (m < 60 ? `${m} min` : m === 60 ? "1 ora" : `${String(Math.round(m / 6) / 10).replace(".", ",")} ore`);
const hbars = (rows, max, unit = "") => `<ul class="hbars">${rows.map(([label, v, sub]) => `<li>
  <span class="hb-l"><b>${label}</b>${sub ? `<small>${sub}</small>` : ""}</span><span class="hb-v">${v}${unit}</span>
  <span class="hb-t" aria-hidden="true"><i style="width:${max ? (v ? Math.max(2, Math.round((v / max) * 100)) : 0) : 0}%"></i></span></li>`).join("")}</ul>`;
function renderCoachStats() {
  S.page = "c-stats";
  const st = S.students, n = st.length, d30 = addDays(-30), now = Date.now();
  const items = st.flatMap((s) => (s.progress || []).map(normItem));
  const done30 = items.filter((i) => i.status === "done" && i.date >= d30).length;
  const avg = n ? Math.round(st.reduce((a, s) => a + pct(s), 0) / n) : 0;
  const active7 = st.filter((s) => (s.checksAt || 0) >= now - 7 * 864e5 && checksDone(s) > 0).length;
  const tile = (ic, label, v, unit = "", sub = "") => `<li class="stat"><span>${icon(ic)}${label}</span><b><span data-count="${v}">${v}</span>${unit}${sub ? `<small> ${sub}</small>` : ""}</b></li>`;
  // per livello: media dei progressi
  const lv = LEVELS.map(([k, l]) => { const g = st.filter((s) => (lvlOf(s) || "base") === k);
    return [l, g.length ? Math.round(g.reduce((a, s) => a + pct(s), 0) / g.length) : 0, nAlunni(g.length)]; }).filter((r) => r[2] !== "0 alunni");
  // chi ha completato più elementi in 30 giorni
  const top = st.map((s) => [esc(s.name), (s.progress || []).filter((i) => i.status === "done" && i.date >= d30).length])
    .filter((r) => r[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  // elementi su cui si lavora di più (stato "in corso")
  const cnt = {};
  items.filter((i) => i.status === "doing").forEach((i) => { cnt[i.name] = (cnt[i.name] || 0) + 1; });
  const doing = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => [esc(k), v]);
  // da seguire: hanno una scheda ma non la spuntano da 14 giorni
  const idle = st.filter((s) => (s.plan || []).length && (s.checksAt || 0) < now - 14 * 864e5);
  // lezioni private nelle prossime 4 settimane
  const up = S.meta.slots.filter((t) => t.date >= today());
  const weeks = [0, 1, 2, 3].map((k) => { const a = addDays(7 * k), b = addDays(7 * k + 7), w = up.filter((t) => t.who && t.date >= a && t.date < b);
    return [["Questa settimana", "Prossima settimana", "Tra 2 settimane", "Tra 3 settimane"][k], w.length, fmtMins(w.reduce((m, t) => m + (t.dur || 0), 0))]; });
  const free = up.filter((t) => !t.who).length, asks = S.metaErr ? 0 : inbox().filter((x) => x.kind === "req").length;
  const gr = [...S.meta.groups.map((g) => [esc(g.name), inGroup(g.id)]), ...(st.some((s) => !validGroup(s.group)) ? [["Senza gruppo", st.filter((s) => !validGroup(s.group)).length]] : [])];
  const mx = (r) => Math.max(1, ...r.map((x) => x[1]));
  paint(`${demoBanner()}
  ${head("Statistiche", "Panoramica degli alunni", `<div class="top-acts">${helpBtn()}</div>`,
    `<a href="#/coach" class="icon" data-help="back" aria-label="Torna a Oggi">${icon("back")}</a>`)}
  <section class="statbox" aria-labelledby="hNum" data-help="stats"><h2 class="sr" id="hNum">In sintesi</h2><ul class="stats four">
    ${tile("users", "Alunni", n)}${tile("chart", "Media progressi", avg, "%")}
    ${tile("done", "Completati in 30 giorni", done30)}${tile("clock", "Attivi in 7 giorni", active7, "", `su ${n}`)}</ul></section>
  ${sect("hLiv", "Progressi per livello", lv.length ? hbars(lv, 100, "%") : `<p class="muted">Ancora nessun alunno.</p>`)}
  ${sect("hTop", "Più elementi completati in 30 giorni", top.length ? hbars(top, mx(top)) : empty("chart", "Ancora niente questo mese", "Quando segni un elemento come completato, qui vedi chi è andato più avanti."))}
  ${sect("hDoing", "Elementi su cui stanno lavorando", doing.length ? hbars(doing.map(([k, v]) => [k, v, v === 1 ? "1 alunno" : `${v} alunni`]), mx(doing)) : `<p class="muted">Nessun elemento in corso.</p>`)}
  ${sect("hIdle", "Da seguire", idle.length ? `<p class="muted small">Hanno una scheda ma non spuntano esercizi da più di 14 giorni.</p>${srows(idle)}`
    : `<p class="muted">Tutti hanno usato la scheda nelle ultime due settimane.</p>`, "", "card plainlist")}
  ${sect("hPrivs", "Lezioni private", `<ul class="mini">
      <li><b data-count="${up.filter((t) => t.who).length}">${up.filter((t) => t.who).length}</b><span>prenotate</span></li>
      <li><b data-count="${free}">${free}</b><span>orari liberi</span></li><li><b data-count="${asks}">${asks}</b><span>da confermare</span></li></ul>
    ${hbars(weeks, mx(weeks))}`)}
  ${gr.length ? sect("hGrp", "Alunni per gruppo", hbars(gr, mx(gr))) : ""}
  ${bnav("", S.metaErr ? "" : fab("c-new-appt", "Nuovo appuntamento"))}`);
}

// lezioni private di un alunno, nel suo profilo (nuova versione): prenotate, richieste, prenota subito
function lessonsBox(s) {
  const les = lessonsFor(S.meta, s), box = S.metaErr ? [] : inbox().filter((x) => x.s.code === s.code);
  return sect("hLessons", "Lezioni private", `${les.length ? `<ul class="trs">${les.map((t) => trRow(t, "Lezione privata", "c-edit-slot")).join("")}</ul>`
      : `<p class="muted">${s.priv ? "Nessuna lezione prenotata." : "Non vede gli orari liberi (si attiva con la matita in basso), ma puoi prenotargli una lezione."}</p>`}
    ${box.length ? `<ul class="trs reqs">${box.map(inboxRow).join("")}</ul>` : ""}
    ${S.metaErr ? "" : `<button class="btn ghost wide" data-act="c-book" data-code="${s.code}">${icon("plus")} Prenota una lezione</button>`}`);
}

function renderCoachStudent(code, tab) {
  // niente ridisegno a metà trascinamento: si fa appena l'elemento viene lasciato
  if (isDragging()) { S.pendingRender = () => renderCoachStudent(code, tab); return; }
  const s = findStudent(code);
  if (!s) { go("#/coach/alunni"); return; }
  const tabs = [["profilo", "Profilo"], ["progressi", "Progressi"], ["scheda", "Scheda"], ["invito", "Invito"]];
  let body = "";
  if (tab === "profilo") {
    const gn = groupName(S.meta, s.group), B = beta();
    const next = [...schedFor(S.meta, s).map((t) => [t, t.gname || "Tutti"]), ...(B ? [] : lessonsFor(S.meta, s).map((t) => [t, "Lezione privata"]))]
      .sort((a, b) => (a[0].date + a[0].time).localeCompare(b[0].date + b[0].time)).slice(0, 3);
    body = `<section class="card profile" aria-labelledby="hTab" data-help="profile">
      <div class="prof-h"><span class="av lg" style="background:var(${avatarColor(s.name)})" aria-hidden="true">${esc([...s.name][0] || "?").toUpperCase()}</span>
        <div class="grow"><h2 id="hTab">${esc(s.name)}</h2>
        <small>${LEVEL_LABEL[lvlOf(s) || "base"]} · ${gn ? esc(gn) : "Nessun gruppo"}${s.priv ? " · Lezioni private" : ""}</small></div></div>
      ${s.bio ? `<p class="bio">${esc(s.bio)}</p>` : `<p class="muted">Nessuna descrizione.</p>`}
    </section>
    ${B ? sect("hStickers", "Sticker", `${myStickers(s).length ? `${stickerWall(myStickers(s).slice(0, 8), "c-stk-del")}<p class="muted small">Tocca uno sticker per toglierlo.</p>`
      : `<p class="muted">Un piccolo incoraggiamento: lo vedrà arrivare animato nella sua app.</p>`}
      <button class="btn wide" data-act="c-stk" data-code="${s.code}">${icon("gift")} Manda uno sticker</button>`) : ""}
    ${B ? lessonsBox(s) : ""}
    ${B ? sect("hSn", "Prossimi allenamenti", next.length ? `<ul class="trs">${next.map(([t, w]) => trRow(t, w)).join("")}</ul>`
        : `<p class="muted">Nessun allenamento in programma${gn ? " per il suo gruppo" : ""}.</p>`).replace('data-help="sn"', 'data-help="agenda"')
      : `<section class="card" aria-labelledby="hSn" data-help="agenda"><h2 class="h3" id="hSn">Prossimi allenamenti</h2>
      ${next.length ? `<ul class="trs">${next.map(([t, w]) => trRow(t, w)).join("")}</ul>`
        : `<p class="muted">Nessun allenamento in programma${gn ? " per il suo gruppo" : ""}.</p>`}</section>`}`;
  } else if (tab === "progressi") {
    const n = (s.progress || []).length, ro = S.reorder === "progressi" && n > 1;
    const dn = (s.progress || []).filter((x) => x.status === "done").length;
    body = !n ? `<section class="card" aria-labelledby="hTab"><h2 class="sr" id="hTab">Elementi tecnici</h2>
      ${empty("chart", "Ancora nessun elemento", "Tocca + per aggiungere i primi elementi tecnici.")}</section>`
      : `<div class="card sum-card" data-help="sum"><div class="big-pct"><b>${pct(s)}%</b><span>${dn} di ${n} elementi completati</span></div>${progressBar(s)}</div>
      <section class="card" aria-labelledby="hTab" data-help="list"><h2 class="sr" id="hTab">Elementi tecnici</h2>
      <div class="sec-h"><p class="muted small">${ro ? "Usa le frecce per cambiare l'ordine dentro ogni gruppo."
        : "Tocca il cerchio a destra per cambiare lo stato, l'elemento per modificarlo. Tieni premuto per spostarlo."}</p>
        ${n > 1 ? reorderBtn("progressi", ro) : ""}</div>
      ${progressList(s.progress, ro ? "reorder" : "coach")}
</section>`;
  } else if (tab === "scheda") {
    const plan = s.plan || [];
    const ro = S.reorder === "scheda" && plan.length > 1;
    body = `<section class="card" aria-labelledby="hTab" data-help="list"><h2 class="sr" id="hTab">Esercizi della scheda</h2>
      ${!plan.length ? "" : `<div class="sec-h"><p class="muted small">${ro ? "Usa le frecce per cambiare l'ordine."
        : `Esercizi da fare durante il pattinaggio libero. L'alunno li spunta dal suo telefono.${plan.length > 1 ? " Tieni premuto un esercizio per spostarlo." : ""}`}</p>
        ${plan.length > 1 ? reorderBtn("scheda", ro) : ""}</div>`}
      ${plan.length ? `<ul class="plan ${ro ? "reo" : ""}" data-drag="plan">${plan.map((x, i) => ro ? `<li data-id="${x.id}">
          ${checkRow(x, s.checks && s.checks[x.id], "reorder")}
          <div class="ops" data-nodrag>${arrows("plan", x.id, x.title, i, plan.length)}</div></li>` : checkRow(x, s.checks && s.checks[x.id], "coach")).join("")}</ul>` : empty("skate", "Scheda vuota", "Tocca + per aggiungere gli esercizi da fare durante il pattinaggio libero.")}
      ${ro ? "" : `${checksDone(s) ? `<button class="btn ghost wide" data-act="c-reset" data-code="${s.code}">${icon("refresh")} Togli tutte le spunte</button>` : ""}`}
    </section>`;
  } else {
    body = `<section class="card invite" aria-labelledby="hTab" data-help="invite"><h2 class="sr" id="hTab">Invito</h2>
      <p>Manda questo invito a <b>${esc(s.name)}</b>. Chi ha il link o il codice vede solo questa scheda.</p>
      ${beta() ? `<button type="button" class="bigcode tap" data-act="c-copy-code" data-help="code" aria-label="Codice: ${[...fmtCode(s.code)].join(" ")}. Tocca per copiarlo">${fmtCode(s.code)}<small>${icon("copy")} Tocca per copiarlo</small></button>
      <fieldset class="seg inv-what" data-help="what"><legend>Cosa mandi</legend><div class="seg-opts">
        ${[["link", "Link e codice"], ["code", "Solo il codice"]].map(([k, l]) => `<label class="seg-opt"><input type="radio" name="invWhat" value="${k}" ${invWhat() === k ? "checked" : ""}><span>${l}</span></label>`).join("")}
      </div></fieldset>
      <p class="muted small" id="invWhy">${INV_WHY[invWhat()]}</p>`
      : `<div class="bigcode" aria-label="Codice: ${[...fmtCode(s.code)].join(" ")}">${fmtCode(s.code)}</div>`}
      <div class="grid2">
        <button class="btn" data-act="c-wa">${icon("chat")} WhatsApp</button>
        <button class="btn" data-act="c-mail">${icon("mail")} Email</button>
        ${beta() ? `<button class="btn ghost" data-act="c-copy-code">${icon("copy")} Copia codice</button>` : ""}
        <button class="btn ghost" data-act="c-copy">${icon("link")} Copia link</button>
        ${navigator.share ? `<button class="btn ghost" data-act="c-share">${icon("share")} Condividi…</button>` : ""}
      </div>
    </section>
    <section class="card" aria-labelledby="hGest" data-help="manage">
      <h2 class="h3" id="hGest">Gestione</h2>
      <ul class="menu">
        <li><button class="mi" data-act="c-regen" aria-describedby="regenHelp">${icon("refresh")}<span>Genera un nuovo codice</span>${icon("chevron", "chev")}</button>
          <small id="regenHelp" class="mi-help">Il vecchio codice smette di funzionare: utile se è finito in mani sbagliate.</small></li>
      </ul>
      <button class="btn danger wide" data-act="c-del">${icon("trash")} Elimina alunno</button>
    </section>`;
  }
  const act = { profilo: ["c-profile", "Modifica profilo", "edit"], progressi: ["c-add-prog", "Aggiungi elementi", "plus"],
    scheda: ["c-add-ex", "Aggiungi esercizio", "plus"], invito: ["c-copy", "Copia link dell'invito", "link"] }[tab];
  S.page = `c-stu-${tab}`;
  paint(`${demoBanner()}
  ${head(esc(s.name), `Alunno${lvlOf(s) ? ` · ${LEVEL_LABEL[lvlOf(s)]}` : ""}`, helpBtn(),
    `<a href="#/coach/alunni" class="icon" data-help="back" aria-label="Torna all'elenco alunni">${icon("back")}</a>`)}
  <nav class="tabs" aria-label="Sezioni alunno" data-help="tabs">${tabs.map(([k, l]) => `<a href="#/coach/${code}/${k}" class="${k === tab ? "on" : ""}"${k === tab ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
  ${body}
  ${bnav("alunni", act ? fab(...act) : "")}`);
  $root.dataset.code = code;
}

// ---------------------------------------------------------- pannello (modale)
// focus: "title" per pannelli di modifica/informazione (niente tastiera o selettore data che si aprono da soli),
//        "input" per i moduli di creazione, dove si scrive subito.
let sheetOpener = null, sheetOpenerSel = null;
const selOf = (el) => el && el.dataset && el.dataset.act
  ? `[data-act="${el.dataset.act}"]${el.dataset.id ? `[data-id="${el.dataset.id}"]` : ""}` : null;
// live: pannello che applica subito ogni scelta (Accessibilità, Impostazioni, aiuto): niente "Uscire senza salvare?"
// (le scelte sono già valide, chiedere di "non salvare" sarebbe falso)
function openSheet({ title, body, onSubmit = () => {}, focus = "title", live = false }) {
  // se si apre un pannello da un altro pannello, il focus tornerà comunque al pulsante originale
  if (!$sheet.contains(document.activeElement)) {
    sheetOpener = document.activeElement;
    sheetOpenerSel = selOf(sheetOpener);
  }
  $sheet.innerHTML = `<div class="sheet-bg" data-act="close"></div>
    <form class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="sheetTitle" novalidate>
      <div class="sheet-h"><h2 id="sheetTitle" tabindex="-1">${title}</h2>
        <button type="button" class="icon" data-act="close" aria-label="Chiudi">${icon("close")}</button></div>
      ${body}
    </form>`;
  $sheet.hidden = false;
  $root.setAttribute("aria-hidden", "true");
  $root.inert = true;
  const f = $sheet.querySelector("form");
  f.onsubmit = async (e) => {
    e.preventDefault();
    const sub = e.submitter;
    if (!(sub && sub.hasAttribute("formnovalidate")) && !(beta() ? checkForm(f) : f.reportValidity())) return;
    const btns = f.querySelectorAll("[type=submit]");
    btns.forEach((b) => { b.disabled = true; });
    // nuova versione: mentre salva il pulsante lo dice (e non si può premere due volte)
    const label = sub && sub.innerHTML;
    if (beta() && sub) { f.setAttribute("aria-busy", "true"); sub.classList.add("busy"); }
    try { if ((await onSubmit(new FormData(f), sub)) !== false) { f.dataset.dirty = ""; closeSheet(); } }
    catch (err) { fail(err); }
    if (sub && document.contains(sub)) { sub.classList.remove("busy"); sub.innerHTML = label; }
    f.removeAttribute("aria-busy");
    btns.forEach((b) => { b.disabled = false; });
  };
  // modifiche non salvate: chiudendo il pannello si chiede conferma (nuova versione)
  if (!live) f.addEventListener("input", (e) => { if (e.isTrusted && !e.target.closest("[data-nodirty]")) f.dataset.dirty = "1"; });
  const target = focus === "input" ? f.querySelector("input:not([type=checkbox]):not([type=radio]):not([type=file]),textarea") : null;
  setTimeout(() => (target ? target.focus() : restoreFocus(f.querySelector("#sheetTitle"))), 50);
  return f;
}
async function canLeave() {
  const f = $sheet.querySelector("form");
  if (!beta() || !f || !f.dataset.dirty) return true;
  return ask("Uscire senza salvare? Le modifiche andranno perse.");
}
function closeSheet() {
  const wasOpen = !$sheet.hidden;
  $sheet.hidden = true; $sheet.innerHTML = "";
  $root.removeAttribute("aria-hidden"); $root.inert = false;
  if (wasOpen) {
    // dopo un salvataggio la lista viene ridisegnata e il pulsante originale non esiste più:
    // si cerca quello nuovo equivalente, adesso o al prossimo ridisegno
    const el = sheetOpener && document.contains(sheetOpener) ? sheetOpener : sheetOpenerSel && $root.querySelector(sheetOpenerSel);
    if (el) restoreFocus(el);
    if (sheetOpenerSel) pendingFocus = sheetOpenerSel;
  }
  sheetOpener = null; sheetOpenerSel = null;
}
// scelta "Cosa mandi" nell'Invito: resta finché l'app è aperta; cambia solo la frase sotto, senza ridisegnare
document.addEventListener("change", (e) => {
  if (e.target.name !== "invWhat") return;
  S.invWhat = e.target.value;
  const p = document.getElementById("invWhy");
  if (p) p.textContent = INV_WHY[invWhat()];
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (askOpen()) return;
  if (tourOn()) endTour(); else if (!$sheet.hidden) canLeave().then((y) => y && closeSheet());
});

const levelSeg = (cur) => `<fieldset class="seg"><legend>Livello</legend><div class="seg-opts">
  ${LEVELS.map(([k, l]) => `<label class="seg-opt lv"><input type="radio" name="level" value="${k}" ${k === cur ? "checked" : ""}><span>${l}</span></label>`).join("")}
  </div></fieldset>`;
const sheetBtns = (ok, cancel = "Annulla") => `<div class="sheet-btns">
  <button type="button" class="btn ghost" data-act="close">${cancel}</button><button class="btn" type="submit">${ok}</button></div>`;
const delBtn = (label) => `<button type="submit" name="del" value="1" class="btn danger wide del" formnovalidate>${icon("trash")} ${label}</button>`;

function a11ySheet() {
  const p = loadA11y();
  const f = openSheet({ title: "Accessibilità", live: true, body: `
    <p class="muted small">Si sommano alle impostazioni del telefono (Impostazioni → Accessibilità) e valgono solo su questo dispositivo.</p>
    <fieldset class="seg"><legend>Tema</legend><div class="seg-opts">
      ${THEMES.map(([k, ic, label]) => `<label class="seg-opt"><input type="radio" name="theme" value="${k}" ${(p.theme || "auto") === k ? "checked" : ""}>${icon(ic)}<span>${label}</span></label>`).join("")}
    </div></fieldset>
    <ul class="menu">${A11Y_OPTIONS.map(([k, ic, label, help]) => `<li>
      <label class="mi sw-row">${icon(ic)}<span class="txt"><b>${label}</b><small>${help}</small></span>
        <input type="checkbox" role="switch" class="switch" data-a11y="${k}" ${p[k] ? "checked" : ""}></label></li>`).join("")}
    </ul>
    <div class="sheet-btns"><button type="button" class="btn" data-act="close">Fatto</button></div>` });
  f.addEventListener("change", (e) => {
    const cur = loadA11y();
    if (e.target.name === "theme") cur.theme = e.target.value;
    else if (e.target.dataset.a11y) cur[e.target.dataset.a11y] = e.target.checked;
    else return;
    saveA11y(cur);
  });
}

// ---------------------------------------------------------- azioni
const curCode = () => location.hash.split("/")[2];
const cur = () => findStudent(curCode());
const KEEP_FOCUS = new Set(["s-check", "c-cycle", "c-move", "c-reorder", "c-cal-day", "c-cal-m", "c-cal-view"]);

async function onClick(e) {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (el.tagName === "A" && act) e.preventDefault();
  if (KEEP_FOCUS.has(act)) {
    const base = `[data-act="${act}"]${el.dataset.id ? `[data-id="${el.dataset.id}"]` : ""}`;
    pendingFocus = `${base}${el.dataset.d ? `[data-d="${el.dataset.d}"]` : ""}`;
    if (act !== "c-reorder") flashSel = base;
  }
  const fn = ACTIONS[act];
  if (fn) { try { await fn(el); } catch (err) { fail(err); } }
}

const ACTIONS = {
  async close() { if (await canLeave()) closeSheet(); },
  a11y: a11ySheet,

  // alunno
  async "s-check"(el) {
    const s = S.student, id = el.dataset.id, was = !!(s.checks && s.checks[id]);
    const all = !was && (s.plan || []).length && checksDone(s) + 1 === s.plan.length;
    await be.setCheck(s.code, id, was ? null : Date.now());
    if (all && beta()) { celebrate(); ok("Scheda completata, grande!"); }
  },
  async "s-reset"() {
    if (await ask("Vuoi togliere tutte le spunte e ricominciare la scheda?")) { await be.resetChecks(S.student.code); gone("Scheda ricominciata"); }
  },
  // lezioni private (alunno)
  "s-ask"() {
    const st = S.student, free = (st.open || []).filter((o) => !(st.reqs || {})[o.id]);
    openSheet({ title: "Chiedi una lezione", body: `
      <p class="muted small">Scegli un orario: la tua allenatrice riceve la richiesta e la conferma. Fino a quel momento l'orario resta libero anche per gli altri.</p>
      ${free.length ? `<ul class="trs">${free.map((t) => trRow(t, "Lezione privata", "s-req")).join("")}</ul>`
        : `<p class="muted">Al momento non ci sono orari liberi.</p>`}
      <div class="sheet-btns"><button type="button" class="btn ghost" data-act="close">Annulla</button></div>` });
  },
  async "s-req"(el) {
    const st = S.student, t = (st.open || []).find((o) => o.id === el.dataset.id);
    if (!t) return;
    if (Object.keys(st.reqs || {}).length >= 20) return oops("Hai già troppe richieste aperte");
    closeSheet();
    await reqWrite(st.code, t.id, { at: Date.now(), slot: { date: t.date, time: t.time, dur: t.dur, place: t.place } });
    ok(`Richiesta inviata: ${fmtDay(t.date)}${t.time ? ` · ${t.time}` : ""}`);
  },
  async "s-req-del"(el) {
    const st = S.student, r = (st.reqs || {})[el.dataset.id];
    if (r && !r.st && !(await ask("Annullare la richiesta?"))) return;
    await reqWrite(st.code, el.dataset.id, null);
  },
  "s-lesson"(el) {
    const st = S.student, t = (st.lessons || []).find((o) => o.id === el.dataset.id);
    if (!t) return;
    const sent = st.reqs && st.reqs[t.id] && st.reqs[t.id].cancel;
    openSheet({ title: "Lezione privata", body: `
      <ul class="trs">${trRow(t, "Lezione privata")}</ul>
      ${t.note ? `<p>${esc(t.note)}</p>` : ""}
      ${sent ? `<p class="muted">Hai disdetto questa lezione: la tua allenatrice la toglierà dal calendario.</p>`
        : canCancel(t) ? `<p class="muted small">Puoi disdirla fino a ${CANCEL_HOURS} ore prima.</p>`
        : `<p class="muted">Mancano meno di ${CANCEL_HOURS} ore: per disdire scrivi alla tua allenatrice.</p>`}
      <div class="sheet-btns"><button type="button" class="btn" data-act="close">Chiudi</button></div>
      ${!sent && canCancel(t) ? delBtn("Disdici la lezione") : ""}`,
    onSubmit: async (fd, sub) => {
      if (!(sub && sub.name === "del")) return;
      if (!canCancel(t)) { oops(`Mancano meno di ${CANCEL_HOURS} ore: scrivi alla tua allenatrice`); return false; }
      if (!(await ask(`Disdire la lezione di ${fmtDay(t.date)}${t.time ? ` alle ${t.time}` : ""}?`))) return false;
      await reqWrite(st.code, t.id, { cancel: Date.now() });
      gone("Lezione disdetta");
    } });
  },
  async "s-logout"() {
    if (!(await ask("Scollegare questo telefono? Ti servirà di nuovo il codice per rientrare."))) return;
    localStorage.removeItem(LS_CODE);
    location.hash = "";
    route();
  },

  // allenatrice
  async "c-demo"() { await be.demoEnable(); },
  async "code-paste"() {
    const inp = document.getElementById("codeIn");
    try {
      const c = codeFrom(await navigator.clipboard.readText());
      if (c.length !== CODE_LEN) return oops("Negli appunti non c'è un codice: copialo dal messaggio e riprova");
      inp.value = fmtCode(c); ok("Codice incollato"); document.querySelector("#codeForm [type=submit]").focus();
    } catch { inp.focus(); oops("Non riesco a leggere gli appunti: tieni premuto nel campo e scegli Incolla"); }
  },
  "dev-as"(el) { localStorage.setItem(LS_CODE, el.dataset.code); route(); },
  async "dev-reseed"() {
    if (!(await ask("Sostituire tutti i dati di sviluppo con gli alunni di esempio?"))) return;
    await be.reseed(); closeSheet(); ok("Alunni di esempio rigenerati");
  },
  "dev-coach"() { go("#/coach"); },
  // alunno: se non ne è ancora scelto uno, la schermata d'ingresso mostra quelli di esempio
  "dev-student"() { const c = localStorage.getItem(LS_CODE); if (c && !be.sampleCodes().some((x) => x.code === c)) localStorage.removeItem(LS_CODE); go("#/"); if (location.hash === "#/" || !location.hash) route(); },
  // aiuto: elenco degli elementi della pagina, poi (se si vuole) la visita guidata
  help() {
    const here = (HELP[S.page] || []).filter(([k]) => $root.querySelector(`[data-help="${k}"]`));
    openSheet({ title: "Come funziona questa pagina", live: true, body: `
      <p class="muted small">Ecco cosa trovi qui. Con «Mostrami sulla pagina» te li indico uno per uno.</p>
      <button type="button" class="btn wide" data-act="help-tour">${icon("help")} Mostrami sulla pagina</button>
      <ul class="help-l">${here.map(([, ic, t, d]) => `<li><span class="help-ic" aria-hidden="true">${icon(ic)}</span><span class="txt"><b>${t}</b><small>${d}</small></span></li>`).join("")}</ul>
      <div class="sheet-btns"><button type="button" class="btn ghost wide" data-act="close">Chiudi</button></div>` });
  },
  async "c-cat"() { if (await canLeave()) catSheet(); },
  "c-cat-ed"(el) { elementSheet(elements().find((e) => e.id === el.dataset.id)); },
  "c-cat-new"() { elementSheet(null); },
  async "c-cat-back"() { if (await canLeave()) catSheet(); },
  async "c-cat-reset"() {
    if (!(await ask("Ripristinare l'elenco iniziale degli elementi? Quelli aggiunti o cambiati da te spariscono dall'elenco, non dagli alunni."))) return;
    const { elements: _, ...rest } = S.meta;
    await saveMeta(rest); catSheet(); ok("Elenco iniziale ripristinato");
  },
  intro(el) {
    const coach = S.page.startsWith("c-");
    if (!$sheet.hidden) closeSheet();
    showIntro(coach ? "c" : "s", coach ? $root.querySelector('[data-act="c-settings"]') : el);
  },
  "help-tour"() {
    const steps = (HELP[S.page] || []).filter(([k]) => $root.querySelector(`[data-help="${k}"]`));
    closeSheet();
    if (steps.length) startTour($root, steps, $root.querySelector('[data-act="help"]'));
  },
  "tour-next"() { tourStep(1); },
  "tour-prev"() { tourStep(-1); },
  "tour-end"() { endTour(); },
  "dev-exit"() {
    localStorage.removeItem(LS_DEV);
    localStorage.removeItem(LS_CODE);
    location.href = location.pathname;
  },
  async "c-copy-id"(el) {
    try { await navigator.clipboard.writeText(el.dataset.id); ok("ID copiato"); }
    catch { prompt("Copia l'ID:", el.dataset.id); }
  },
  "c-settings"() {
    const mi = (act, ic, label, help) => `<li><button type="button" class="mi" data-act="${act}"${help ? ` aria-describedby="h-${act}"` : ""}>${icon(ic)}<span>${label}</span>${icon("chevron", "chev")}</button>
      ${help ? `<small class="mi-help" id="h-${act}">${help}</small>` : ""}</li>`;
    openSheet({ title: "Impostazioni", live: true, body: `<div class="scroll">
      <h3 class="cat">Generale</h3>
      <ul class="menu">${mi("a11y", "a11y", "Accessibilità")}
        ${mi("c-transfer", "phone", "Aggiungi un dispositivo", "Per usare l'app su un altro telefono o dopo averlo cambiato.")}
        ${beta() ? mi("intro", "help", "Rivedi la presentazione") : ""}</ul>
      ${beta() ? `<h3 class="cat">Alunni</h3><ul class="menu">${mi("c-cat", "skate", "Elementi del pattinaggio", "I nomi che proponi in «Aggiungi elementi»: puoi cambiarli, aggiungerne e toglierli.")}</ul>` : ""}
      <h3 class="cat">Backup</h3>
      <ul class="menu">${mi("c-export", "download", "Esporta backup")}
        ${mi("c-import", "upload", "Ripristina da backup", "Il backup è un file sul tuo telefono: tienine una copia ogni tanto.")}</ul>
      <input type="file" accept=".json,application/json" id="impIn" hidden tabindex="-1">
      ${be.dev ? `<h3 class="cat">Sviluppo</h3><ul class="menu">${mi("dev-reseed", "refresh", "Rigenera alunni di esempio")}</ul>` : ""}
      <button type="button" class="btn danger wide del" data-act="c-remove-dev">${icon("logout")} Disabilita questo telefono</button>
      ${navigator.standalone === true ? `<p class="muted small diag">Schermo: ${esc(screenInfo())}</p>` : ""}
      </div>` });
    document.getElementById("impIn").onchange = importBackup;
  },
  "c-import"() { document.getElementById("impIn").click(); },
  async "c-transfer"() {
    const t = await be.createTransfer();
    openSheet({ title: "Aggiungi un dispositivo", body: `
      <p>Sul nuovo telefono apri <b>${esc(location.origin + location.pathname)}#/coach</b> e inserisci:</p>
      <div class="bigcode">${fmtCode(t)}</div>
      <p class="muted small">Vale 15 minuti e una volta sola. Non mandarlo agli alunni.</p>
      <div class="sheet-btns"><button type="button" class="btn" data-act="close">Fatto</button></div>` });
  },
  "c-export"() {
    const data = { app: "pattinaggio", version: 2, exportedAt: new Date().toISOString(), meta: S.meta,
      students: S.students.map(({ code, ...rest }) => ({ code, ...rest })) };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
    a.download = `pattinaggio-backup-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    ok("Backup scaricato");
  },
  async "c-remove-dev"() {
    if (!(await ask("Disabilitare questo telefono? Per riabilitarlo servirà un codice da un altro dispositivo abilitato."))) return;
    await be.removeDevice();
    localStorage.removeItem(LS_ROLE);
    route();
  },

  "c-new"() {
    openSheet({ title: "Nuovo alunno", focus: "input", body: `
      <label>Soprannome<input name="name" required maxlength="40" placeholder="Es. Giulia B." aria-describedby="nameHelp"></label>
      ${levelSeg("base")}
      ${groupSelect(S.gf && S.gf !== "none" ? S.gf : "")}
      <p class="muted small" id="nameHelp">Usa solo un nome o un soprannome: niente cognome, email o telefono.
      L'invito lo mandi tu da WhatsApp o email, l'app non salva contatti.</p>
      ${sheetBtns("Crea")}`,
    onSubmit: async (fd) => {
      const e = nameErr(fd.get("name"));
      if (e) return bad("name", e);
      const group = validGroup(fd.get("group"));
      const code = await be.createStudent(fd.get("name").trim(), normLevel(fd.get("level")) || "base",
        { group, bio: "", priv: false, sched: schedFor(S.meta, { group }) });
      go(`#/coach/${code}/invito`);
      ok(`${fd.get("name").trim()} aggiunto: ora mandagli l'invito`);
    } });
  },

  async "c-cycle"(el) {
    const s = cur();
    let msg = "";
    const progress = (s.progress || []).map((p) => {
      if (p.id !== el.dataset.id) return p;
      const status = NEXT[p.status];
      msg = `${p.name}: ${STATUS[status]}`;
      return { ...p, status, date: status === "done" ? (p.date || today()) : p.date };
    });
    await be.updateStudent(s.code, { progress });
    if (msg) ok(msg);
  },

  "c-edit-prog"(el) {
    const s = cur(), raw = (s.progress || []).find((x) => x.id === el.dataset.id);
    if (!raw) return;
    const p = normItem(raw);
    openSheet({ title: esc(p.name), body: `
      <fieldset class="seg"><legend>Stato</legend><div class="seg-opts">
        ${Object.keys(STATUS).map((k) => `<label class="seg-opt ${k}"><input type="radio" name="status" value="${k}" ${k === p.status ? "checked" : ""}>${stPill(k)}</label>`).join("")}
      </div></fieldset>
      ${beta() ? "" : levelSeg(p.level)}
      ${beta() ? "" : `<label>Categoria<select name="cat">${CATEGORIES.map((c) => `<option ${c === p.cat ? "selected" : ""}>${c}</option>`).join("")}</select></label>`}
      <label id="doneDate"${beta() && p.status !== "done" ? " hidden" : ""}>${beta() ? "Completato il" : "Data completamento"}<input type="date" name="date" value="${esc(p.date)}"></label>
      <label>Note<textarea name="note" rows="3" maxlength="500" placeholder="Cosa migliorare, consigli…">${esc(p.note)}</textarea></label>
      ${beta() ? `<details class="more"><summary>Sposta in un altro livello o categoria</summary>${levelSeg(p.level)}
        <label>Categoria<select name="cat">${CATEGORIES.map((c) => `<option ${c === p.cat ? "selected" : ""}>${c}</option>`).join("")}</select></label></details>` : ""}
      ${sheetBtns("Salva")}
      ${delBtn("Elimina elemento")}`,
    onSubmit: async (fd, sub) => {
      const s2 = cur();
      if (sub && sub.name === "del") {
        if (!(await ask(`Eliminare “${p.name}” dai progressi?`))) return false;
        await be.updateStudent(s2.code, { progress: s2.progress.filter((x) => x.id !== p.id) });
        return gone(`${p.name} eliminato`);
      }
      const status = fd.get("status");
      let date = fd.get("date") || "";
      if (status === "done" && !date) date = today();
      await be.updateStudent(s2.code, {
        progress: s2.progress.map((x) => x.id === p.id ? { ...normItem(x), status, date, note: fd.get("note").trim(),
          level: normLevel(fd.get("level")) || p.level, cat: CATEGORIES.includes(fd.get("cat")) ? fd.get("cat") : p.cat } : x),
      });
      ok(`${p.name}: salvato`);
    } });
    // la data si vede solo quando l'elemento è completato (nascosta resta comunque salvata)
    const fe = $sheet.querySelector("form"), dd = fe.querySelector("#doneDate");
    if (beta()) fe.addEventListener("change", (e) => { if (e.target.name === "status") dd.hidden = e.target.value !== "done"; });
  },

  "c-add-prog"() { progPicker(); },

  "c-add-ex"() { exerciseSheet(null); },
  "c-edit-ex"(el) { exerciseSheet((cur().plan || []).find((x) => x.id === el.dataset.id)); },
  "c-reorder"(el) { const t = el.dataset.tab; S.reorder = S.reorder === t ? false : t; renderCoachStudent(curCode(), t); },

  async "c-move"(el) {
    const s = cur(), d = Number(el.dataset.d), id = el.dataset.id;
    if (el.dataset.kind === "prog") {
      // dentro il gruppo (livello + categoria) dell'elemento
      const arr = (s.progress || []).map(normItem), it = arr.find((x) => x.id === id);
      if (!it) return;
      const slots = arr.map((x, k) => (groupKey(x) === groupKey(it) ? k : -1)).filter((k) => k >= 0);
      const p = slots.indexOf(arr.indexOf(it)), q = p + d;
      if (q < 0 || q >= slots.length) return;
      [arr[slots[p]], arr[slots[q]]] = [arr[slots[q]], arr[slots[p]]];
      await be.updateStudent(s.code, { progress: arr });
      return toast(`${it.name}: posizione ${q + 1} di ${slots.length}`);
    }
    const plan = [...(s.plan || [])];
    const i = plan.findIndex((x) => x.id === id), j = i + d;
    if (i < 0 || j < 0 || j >= plan.length) return;
    [plan[i], plan[j]] = [plan[j], plan[i]];
    await be.updateStudent(s.code, { plan });
    toast(`${plan[j].title}: posizione ${j + 1} di ${plan.length}`);
  },
  async "c-reset"(el) {
    if (await ask("Togliere tutte le spunte dalla scheda?")) { await be.resetChecks(el.dataset.code); gone("Spunte tolte"); }
  },

  "c-wa"() {
    const s = cur();
    window.open(`https://wa.me/?text=${encodeURIComponent(inviteMsg(s))}`, "_blank");
  },
  "c-mail"() {
    const s = cur();
    location.href = `mailto:?subject=${encodeURIComponent(invWhat() === "code" ? "Il tuo codice per la scheda di pattinaggio" : "La tua scheda di pattinaggio")}&body=${encodeURIComponent(inviteMsg(s))}`;
  },
  async "c-copy-code"() {
    const c = fmtCode(cur().code);
    try { await navigator.clipboard.writeText(c); ok("Codice copiato"); }
    catch { prompt("Copia il codice:", c); }
  },
  async "c-copy"() {
    try { await navigator.clipboard.writeText(inviteLink(cur().code)); ok("Link copiato"); }
    catch { prompt("Copia il link:", inviteLink(cur().code)); }
  },
  async "c-share"() {
    const s = cur();
    try { await navigator.share({ title: invWhat() === "code" ? "Codice scheda pattinaggio" : "Scheda pattinaggio", text: inviteMsg(s) }); } catch {}
  },
  // filtro per gruppo nell'elenco: aggiorna solo filtri e righe, il focus resta sul filtro toccato
  "c-gf"(el) {
    const id = el.dataset.id;
    S.gf = id === "all" ? "" : id;
    refreshList(); announceCount();
    const b = $root.querySelector(`[data-act="c-gf"][data-id="${id}"]`);
    if (b) restoreFocus(b);
  },
  "c-open-group"(el) { S.gf = el.dataset.id; S.q = ""; go("#/coach/alunni"); },
  "c-new-appt"() { apptSheet({ date: S.page === "c-cal" && S.calView === "mese" ? S.calD : addDays(1) }); },
  // sticker: scegli, (cambia il messaggio), manda
  "c-stk"(el) { stickerSheet(el.dataset.code ? { code: el.dataset.code } : el.dataset.group ? { group: el.dataset.group } : { code: curCode() }); },
  async "c-stk-del"(el) {
    const s = cur(), x = s && (s.stickers || []).find((y) => y.id === el.dataset.id);
    if (!x || !(await ask(`Togliere lo sticker “${STICKER_LABEL[x.k]}”? Sparirà anche dall'app di ${s.name}.`))) return;
    await be.updateStudent(s.code, { stickers: s.stickers.filter((y) => y.id !== x.id) });
    gone("Sticker tolto");
  },
  "s-stk"(el) { const x = myStickers(S.student).find((y) => y.id === el.dataset.id); if (x) showStickers([x], false); },
  "c-book"(el) { apptSheet({ date: addDays(1), kind: "les", who: el.dataset.code }); },
  "c-cal-day"(el) { S.calD = el.dataset.id; renderCoachMonth(); },
  "c-cal-today"() { const m0 = S.calM; S.calD = today(); S.calM = ym(S.calD); S.calSlide = m0 > S.calM ? -1 : 0; renderCoachMonth(); S.calSlide = 0;
    const b = $root.querySelector(`.cal-d[data-id="${S.calD}"]`); if (b) restoreFocus(b); },
  "c-cal-m"(el) {
    const [y, m] = S.calM.split("-").map(Number), d = new Date(y, m - 1 + Number(el.dataset.d), 1);
    S.calM = ym(localDate(d));
    S.calD = S.calM === ym(today()) ? today() : `${S.calM}-01`;
    S.calSlide = Number(el.dataset.d);
    renderCoachMonth(); S.calSlide = 0;
    toast(cap(d.toLocaleDateString("it-IT", { month: "long", year: "numeric" })));
  },
  "c-cal-view"(el) { S.calView = el.dataset.id; renderCoachMonth(); },
  "c-edit-tr"(el) { trainingSheet(S.meta.trainings.find((t) => t.id === el.dataset.id)); },
  "c-new-group"() { groupSheet(null); },
  "c-edit-slot"(el) { slotSheet(S.meta.slots.find((t) => t.id === el.dataset.id)); },
  // richieste di lezione: conferma (l'orario diventa suo, le altre richieste per lo stesso orario diventano "non confermate")
  async "c-lr-ok"(el) {
    const { code, id } = el.dataset, t = S.meta.slots.find((x) => x.id === id);
    if (!t || t.who) return oops("Orario già prenotato");
    if (!$sheet.hidden) closeSheet();
    await saveMeta({ ...S.meta, slots: S.meta.slots.map((x) => (x.id === id ? { ...x, who: code } : x)) });
    ok(`Lezione confermata a ${nameOf(code)}`);
  },
  async "c-lr-no"(el) {
    const { code, id } = el.dataset, st = S.students.find((x) => x.code === code), r = st && st.reqs && st.reqs[id];
    if (!r) return;
    if (!$sheet.hidden) closeSheet();
    await syncSched(S.meta, { [code]: { [`reqs.${id}`]: { ...r, st: "no" } } });
    gone("Richiesta rifiutata");
  },
  async "c-lr-free"(el) {
    const { id } = el.dataset;
    if (!$sheet.hidden) closeSheet();
    await saveMeta({ ...S.meta, slots: S.meta.slots.map((x) => (x.id === id ? { ...x, who: "" } : x)) });
    ok("Orario di nuovo libero");
  },
  "c-edit-group"(el) { groupSheet(S.meta.groups.find((g) => g.id === el.dataset.id)); },
  "c-profile"() {
    const s = cur();
    openSheet({ title: "Profilo", body: `
      <label>Soprannome<input name="name" required maxlength="40" value="${esc(s.name)}"></label>
      ${levelSeg(lvlOf(s) || "base")}
      ${groupSelect(s.group || "")}
      <ul class="menu"><li><label class="mi sw-row">${icon("user")}<span class="txt"><b>Lezioni private</b><small>Vede gli orari liberi e può chiederti una lezione.</small></span>
        <input type="checkbox" role="switch" class="switch" name="priv" ${s.priv ? "checked" : ""}></label></li></ul>
      <label>Descrizione (facoltativa)<textarea name="bio" rows="3" maxlength="200" aria-describedby="bioHelp"
        placeholder="Es. Punta al test di livello a primavera">${esc(s.bio)}</textarea></label>
      <p class="muted small" id="bioHelp">La vede anche l'alunno. Niente cognomi, contatti o informazioni sulla salute.</p>
      ${sheetBtns("Salva")}`,
    onSubmit: async (fd) => {
      const s2 = cur(), group = validGroup(fd.get("group"));
      const e = nameErr(fd.get("name"), s.code);
      if (e) return bad("name", e);
      const patch = { name: fd.get("name").trim(), level: normLevel(fd.get("level")) || "base", group, bio: fd.get("bio").trim(), priv: fd.get("priv") === "on" };
      await be.updateStudent(s2.code, diffPatch(S.meta, s2, patch));
      ok("Profilo salvato");
    } });
  },
  async "c-regen"() {
    const s = cur();
    if (!(await ask(`Generare un nuovo codice per ${s.name}? Dovrai mandargli di nuovo l'invito.`))) return;
    const code = await be.regenerateCode(s.code);
    if (S.meta.slots.some((t) => t.who === s.code)) await be.saveMeta(S.meta = { ...S.meta, slots: S.meta.slots.map((t) => (t.who === s.code ? { ...t, who: code } : t)) });
    go(`#/coach/${code}/invito`);
    ok("Nuovo codice creato");
  },
  async "c-del"() {
    const s = cur();
    if (!(await ask(`Eliminare ${s.name} e tutti i suoi dati? Non si può annullare.`))) return;
    await be.deleteStudent(s.code);
    gone(`${s.name} eliminato`);
    if (S.meta.slots.some((t) => t.who === s.code)) { // le sue lezioni tornano orari liberi
      const meta = { ...S.meta, slots: S.meta.slots.map((t) => (t.who === s.code ? { ...t, who: "" } : t)) };
      S.students = S.students.filter((x) => x.code !== s.code);
      await saveMeta(meta);
    }
    go("#/coach/alunni");
  },
};

async function importBackup(e) {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.app !== "pattinaggio" || !Array.isArray(data.students)) throw new Error("formato");
    const existing = new Set(S.students.map((s) => s.code));
    const toAdd = data.students.filter((s) => s.code && !existing.has(s.code));
    // gruppi e allenamenti (backup dalla versione 2): solo se qui non ce ne sono ancora
    const bm = normMeta(data.meta), useMeta = !S.metaErr && (bm.groups.length || bm.trainings.length || bm.slots.length)
      && !S.meta.groups.length && !S.meta.trainings.length && !S.meta.slots.length;
    // elenco degli elementi cambiato dall'allenatrice: solo se qui c'è ancora quello iniziale
    const useEl = !S.metaErr && !!bm.elements && !S.meta.elements;
    if (!(await ask(`Nel backup ci sono ${data.students.length} alunni, ${toAdd.length} non presenti ora.${useMeta ? " Ci sono anche gruppi e allenamenti." : ""}${useEl ? " C'è anche il tuo elenco degli elementi." : ""} Ripristinarli?`))) return;
    const meta = { ...(useMeta ? bm : S.meta) }, el = useEl ? bm.elements : S.meta.elements;
    delete meta.elements; if (el) meta.elements = el;
    if (useMeta || useEl) { await be.saveMeta(meta); S.meta = meta; }
    const okGroup = (g) => (meta.groups.some((x) => x.id === g) ? g : "");
    for (const { code, ...rest } of toAdd) {
      const st = { ...rest, group: okGroup(rest.group) };
      await be.restoreStudent(code, { ...st, ...copiesFor(meta, { ...st, code }) });
    }
    if (useMeta) await syncSched(meta); // alunni già presenti che erano nei gruppi del backup
    closeSheet();
    ok(toAdd.length === 1 ? "1 alunno ripristinato" : `${toAdd.length} alunni ripristinati`);
  } catch (err) {
    console.error(err);
    oops("File di backup non valido");
  }
}

// cosa si manda dall'Invito (nuova versione): link e codice, oppure solo il codice (niente link: a volte il link
// si apre nel browser di WhatsApp e non nell'app installata, mentre il codice si scrive ovunque)
const INV_WHY = { code: "Arriva solo il codice: l'alunno apre l'app (anche dall'icona sulla Home) e lo scrive nella prima schermata.", link: "Il link apre subito la scheda. Se non si apre, basta scrivere il codice nella prima schermata." };
const invWhat = () => (beta() && S.invWhat === "code" ? "code" : "link");
function inviteMsg(s) {
  if (invWhat() === "code") return `Ciao ${s.name}! Questo è il tuo codice per la scheda di pattinaggio:\n\n${fmtCode(s.code)}\n\n` +
    `Apri l'app e scrivilo nella prima schermata.`;
  return `Ciao ${s.name}! ⛸️ Ecco la tua scheda di pattinaggio:\n${inviteLink(s.code)}\n\n` +
    `Se ti chiede un codice: ${fmtCode(s.code)}\n` +
    `Consiglio: aprila e aggiungila alla schermata Home del telefono.`;
}

// ---------------------------------------------------------- gruppi e allenamenti
const validGroup = (g) => (S.meta.groups.some((x) => x.id === g) ? g : "");
const groupSelect = (curG) => S.meta.groups.length ? `<label>Gruppo<select name="group">
  <option value="">Nessun gruppo</option>${S.meta.groups.map((g) => `<option value="${g.id}" ${g.id === curG ? "selected" : ""}>${esc(g.name)}</option>`).join("")}
  </select></label>` : "";

// aggiorna la copia degli allenamenti nel documento di ogni alunno (solo dove cambia, in un'unica scrittura).
// extra: modifiche da applicare insieme, { codice: { group: "" } }.
// Si chiama solo dopo un'azione dell'allenatrice, mai da un aggiornamento dei dati (niente cicli).
// copie nel documento dell'alunno: allenamenti del gruppo, orari liberi (se ha le lezioni private), sue lezioni
const copiesFor = (meta, s) => ({ sched: schedFor(meta, s), open: openFor(meta, s), lessons: lessonsFor(meta, s) });
const SAME = { sched: sameSched, open: sameSlots, lessons: sameSlots };
// modifiche da scrivere per un alunno: extra + copie cambiate + richieste da chiudere
// (orario sparito o passato, già prenotato da lui, preso da un altro → "non confermata", disdetta già gestita)
function diffPatch(meta, s, extra = {}) {
  const patch = { ...extra }, v = { ...s, ...extra }, c = copiesFor(meta, v);
  for (const k in c) if (!SAME[k](c[k], s[k])) patch[k] = c[k];
  for (const [id, r] of Object.entries(s.reqs || {})) {
    const key = `reqs.${id}`;
    if (key in extra || !r) continue;
    const t = meta.slots.find((x) => x.id === id);
    if (!t || t.date < today()) patch[key] = null;
    else if (r.cancel) { if (t.who !== s.code) patch[key] = null; }
    else if (t.who === s.code) patch[key] = null;
    else if (t.who && !r.st) patch[key] = { ...r, st: "no" };
  }
  return patch;
}
// si chiama solo dopo un'azione dell'allenatrice, mai da un aggiornamento dei dati (niente cicli);
// con withMeta gruppi/allenamenti/orari e alunni vanno nella stessa scrittura
async function syncSched(meta, extra = {}, withMeta = false) {
  const list = [];
  for (const s of S.students) {
    const patch = diffPatch(meta, s, extra[s.code] || {});
    if (Object.keys(patch).length) list.push([s.code, patch]);
  }
  if (withMeta || list.length) await be.updateMany(list, withMeta ? meta : undefined);
  return list.length;
}
async function saveMeta(meta, extra) {
  meta = { ...meta, slots: pruneOld(meta.slots || []), trainings: pruneOld(meta.trainings || []) };
  S.meta = meta;
  return syncSched(meta, extra, true);
}
// gli allenamenti passati da più di 60 giorni si tolgono, così il documento resta piccolo
// (nuova versione: appena il giorno è passato)
const pruneOld = (list) => list.filter((t) => t.date >= today());

// sovrapposizioni: un allenamento conta un'ora; senza ora non si controlla
function clashes(list, skip = "") {
  const span = (t) => { const a = startOf(t); return [a, a + (t.dur || 60) * 60000]; };
  const ex = [...S.meta.trainings, ...S.meta.slots].filter((t) => t.id !== skip && t.time && t.date >= today());
  const out = new Set();
  for (const n of list) {
    if (!n.time) continue;
    const [a, b] = span(n);
    for (const e of ex) { if (e.date !== n.date) continue; const [c, d] = span(e); if (a < d && c < b) out.add(e); }
  }
  return [...out];
}
function clashOk(list, skip) {
  const c = clashes(list, skip);
  if (!c.length) return true;
  const e = c[0], what = !e.dur ? "un allenamento" : e.who ? `la lezione di ${nameOf(e.who)}` : "un orario libero";
  return ask(`${fmtDay(e.date)} alle ${e.time} c'è già ${what}${c.length > 1 ? ` (e altri ${c.length - 1})` : ""}. Aggiungere lo stesso?`);
}
const addMin = (hm, min) => { const [h, m] = hm.split(":").map(Number), t = h * 60 + m + min; return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
const lastPlace = () => [...S.meta.trainings, ...S.meta.slots].filter((t) => t.place).sort((a, b) => a.date.localeCompare(b.date)).map((t) => t.place).pop() || "";

// nuova versione: un solo pannello per aggiungere allenamenti e lezioni private, già sul giorno scelto
function apptSheet({ date = addDays(1), kind = "tr", who = "" } = {}) {
  if (date < today()) date = today();
  const studs = S.students;
  const f = openSheet({ title: "Nuovo appuntamento", body: `
    <fieldset class="seg"><legend>Che cosa</legend><div class="seg-opts">
      <label class="seg-opt kind"><input type="radio" name="kind" value="tr" ${kind === "tr" ? "checked" : ""}>${icon("group")}<span>Allenamento di gruppo</span></label>
      <label class="seg-opt kind"><input type="radio" name="kind" value="les" ${kind === "les" ? "checked" : ""}>${icon("user")}<span>Lezione privata</span></label>
    </div></fieldset>
    <div class="two"><label>Data<input type="date" name="date" required min="${today()}" value="${esc(date)}"></label>
      <label>Ora<input type="time" name="time" value="${kind === "les" ? "16:00" : ""}"></label></div>
    <fieldset class="kf" data-k="tr"><legend class="sr">Allenamento di gruppo</legend>
      <label>Per chi<select name="group"><option value="">Tutti gli alunni</option>
        ${S.meta.groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select></label></fieldset>
    <fieldset class="kf" data-k="les"><legend class="sr">Lezione privata</legend>
      <label>Con chi<select name="who"><option value="">Nessuno (orario libero)</option>
        ${studs.map((x) => `<option value="${x.code}" ${x.code === who ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label></fieldset>
    <details class="more"><summary>Altre opzioni</summary>
      <fieldset class="kf" data-k="les"><legend class="sr">Durata e ripetizioni</legend>
        <div class="two"><label>Durata<select name="dur">${[30, 45, 60, 90].map((m) => `<option value="${m}">${m} minuti</option>`).join("")}</select></label>
          <label>Quante di fila<select name="many">${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}">${n === 1 ? "Una" : `${n} lezioni`}</option>`).join("")}</select></label></div>
        <label>Ripeti<select name="rep"><option value="1">Solo questa volta</option>${[2, 4, 8].map((n) => `<option value="${n}">Ogni settimana, per ${n} settimane</option>`).join("")}</select></label></fieldset>
      <label>Luogo<input name="place" maxlength="60" value="${esc(lastPlace())}" placeholder="Es. Palaghiaccio"></label>
      <label>Note<input name="note" maxlength="120" placeholder="Es. Portare i pattini da salto"></label>
    </details>
    <p class="appt-sum" id="apptSum"></p>
    ${sheetBtns("Salva")}`,
  onSubmit: async (fd) => {
    const k = fd.get("kind"), date = fd.get("date");
    if (!parseDate(date)) return bad("date", "Scegli la data.");
    if (date < today()) return bad("date", "Scegli un giorno da oggi in poi.");
    const time = fd.get("time") || "", place = fd.get("place").trim(), note = fd.get("note").trim();
    if (k !== "les") {
      if (!(await clashOk([{ date, time }]))) return false;
      await saveMeta({ ...S.meta, trainings: [...S.meta.trainings, { id: newId(), date, time, group: validGroup(fd.get("group")), place, note }] });
      S.calD = date; S.calM = ym(date);
      return ok("Allenamento aggiunto");
    }
    const dur = Number(fd.get("dur")) || 30, many = Math.min(6, Number(fd.get("many")) || 1), rep = Math.min(8, Number(fd.get("rep")) || 1);
    const w = S.students.some((x) => x.code === fd.get("who")) ? fd.get("who") : "", d0 = parseDate(date), add = [];
    for (let r = 0; r < rep; r++) for (let i = 0; i < many; i++) {
      add.push({ id: newId(), date: localDate(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 7 * r)), time: addMin(time, i * dur), dur, place, note, who: w });
    }
    const have = S.meta.slots.filter((t) => t.date >= today()).length;
    if (have + add.length > MAX_SLOTS) return bad("many", `Al massimo ${MAX_SLOTS} orari in programma: ne puoi aggiungere ancora ${Math.max(0, MAX_SLOTS - have)}.`);
    if (!(await clashOk(add))) return false;
    await saveMeta({ ...S.meta, slots: [...S.meta.slots, ...add] });
    S.calD = date; S.calM = ym(date);
    ok(add.length === 1 ? (w ? `Lezione prenotata per ${nameOf(w)}` : "Orario libero aggiunto") : `${add.length} ${w ? `lezioni prenotate per ${nameOf(w)}` : "orari liberi aggiunti"}`);
  } });
  // si vedono (e si inviano) solo i campi del tipo scelto
  const sync = () => {
    const k = f.elements.kind.value;
    f.querySelectorAll(".kf").forEach((x) => { const off = x.dataset.k !== k; x.hidden = off; x.disabled = off; });
    f.elements.time.required = k === "les";
    if (k === "les" && !f.elements.time.value) f.elements.time.value = "16:00";
  };
  // riassunto in una frase di quello che verrà salvato (non annunciato a ogni tasto: niente aria-live)
  const summary = () => {
    const E = f.elements, d = E.date.value, t = E.time.value, when = `${d ? fmtDay(d).replace(/^\p{Lu}/u, (c) => c.toLowerCase()) : "giorno da scegliere"}${t ? ` alle ${t}` : ""}`;
    if (E.kind.value !== "les") {
      const g = groupName(S.meta, E.group.value);
      return `Allenamento per ${g ? `il gruppo ${g}` : "tutti gli alunni"}, ${when}.`;
    }
    const many = Number(E.many.value) || 1, rep = Number(E.rep.value) || 1, n = many * rep, w = E.who.value;
    const what = w ? `${n === 1 ? "Lezione" : `${n} lezioni`} con ${nameOf(w)}` : n === 1 ? "Un orario libero" : `${n} orari liberi`;
    return `${what} da ${E.dur.value} minuti, ${when}${many > 1 ? `, ${many} di fila` : ""}${rep > 1 ? `, ogni settimana per ${rep} settimane` : ""}.`;
  };
  const upd = () => { f.querySelector("#apptSum").textContent = summary(); };
  f.addEventListener("change", (e) => { if (e.target.name === "kind") sync(); upd(); });
  f.addEventListener("input", upd);
  sync(); upd();
}

function trainingSheet(t) {
  if (t === undefined) return;
  openSheet({ title: t ? "Modifica allenamento" : "Nuovo allenamento", body: `
    <div class="two"><label>Data<input type="date" name="date" required value="${esc(t ? t.date : addDays(1))}"></label>
      <label>Ora<input type="time" name="time" value="${esc(t ? t.time : "")}"></label></div>
    <label>Per chi<select name="group"><option value="">Tutti gli alunni</option>
      ${S.meta.groups.map((g) => `<option value="${g.id}" ${t && t.group === g.id ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select></label>
    <label>Luogo (facoltativo)<input name="place" maxlength="60" value="${esc(t && t.place)}" placeholder="Es. Palaghiaccio"></label>
    <label>Note (facoltative)<input name="note" maxlength="120" value="${esc(t && t.note)}" placeholder="Es. Portare i pattini da salto"></label>
    <p class="muted small">Gli alunni del gruppo vedono data, ora, luogo e note nella loro scheda.</p>
    ${sheetBtns("Salva")}
    ${t ? delBtn("Elimina allenamento") : ""}`,
  onSubmit: async (fd, sub) => {
    const all = S.meta.trainings;
    if (sub && sub.name === "del") {
      if (!(await ask("Eliminare questo allenamento?"))) return false;
      await saveMeta({ ...S.meta, trainings: all.filter((x) => x.id !== t.id) });
      return gone("Allenamento eliminato");
    }
    const date = fd.get("date");
    if (!parseDate(date)) return bad("date", "Scegli la data.");
    const item = { id: t ? t.id : newId(), date, time: fd.get("time") || "", group: validGroup(fd.get("group")),
      place: fd.get("place").trim(), note: fd.get("note").trim() };
    if (beta() && !(await clashOk([item], item.id))) return false;
    await saveMeta({ ...S.meta, trainings: pruneOld(t ? all.map((x) => (x.id === t.id ? item : x)) : [...all, item]) });
    ok(t ? "Allenamento aggiornato" : "Allenamento aggiunto");
  } });
}

// nuova versione: nome e componenti del gruppo nello stesso pannello (prima bisognava aprire il profilo di ogni alunno)

// sticker: a un alunno (con la scelta "tutto il suo gruppo") oppure a un gruppo intero
function stickerSheet({ code, group }) {
  const s = code && findStudent(code);
  const gid = group || (s && validGroup(s.group)), gname = groupName(S.meta, gid);
  const members = () => (gid ? S.students.filter((x) => x.group === gid) : []);
  if (!s && !members().length) return;
  const both = s && members().length > 1;
  const f = openSheet({ title: s ? `Sticker per ${esc(s.name)}` : `Sticker per il gruppo ${esc(gname)}`, body: `
    <fieldset class="stk-pick"><legend class="sr">Scegli lo sticker</legend>
      ${STICKERS.map(([k, l], i) => `<label class="stk-opt"><input type="radio" name="k" value="${k}" ${i === 0 ? "checked" : ""}>${sticker(k)}<span>${l}</span></label>`).join("")}</fieldset>
    <label>Messaggio<input name="msg" maxlength="60" value="${esc(STICKERS[0][2])}"></label>
    ${both ? `<fieldset class="seg"><legend>A chi</legend><div class="seg-opts">
      <label class="seg-opt"><input type="radio" name="to" value="one" checked><span>Solo a ${esc(s.name)}</span></label>
      <label class="seg-opt"><input type="radio" name="to" value="grp"><span>Tutto il gruppo (${members().length})</span></label></div></fieldset>` : ""}
    ${!s ? `<p class="muted small">Lo ricevono tutti i ${members().length} alunni del gruppo ${esc(gname)}.</p>` : ""}
    <p class="muted small">Appena apre l'app lo vede arrivare animato, poi resta nei suoi Progressi.</p>
    ${sheetBtns("Manda")}`,
  onSubmit: async (fd) => {
    const k = fd.get("k");
    if (!isSticker(k)) return false;
    const to = s && fd.get("to") !== "grp" ? [findStudent(s.code)].filter(Boolean) : members();
    if (!to.length) return false;
    const msg = (fd.get("msg") || "").trim() || STICKER_MSG[k], at = Date.now();
    await be.updateMany(to.map((x) => [x.code, { stickers: [...(x.stickers || []), { id: newId(), k, msg, at }].slice(-30) }]));
    ok(to.length === 1 ? `Sticker mandato a ${to[0].name}` : `Sticker mandato a ${to.length} alunni`);
  } });
  // il messaggio segue lo sticker scelto, finché non lo cambi a mano
  let touched = false;
  f.elements.msg.addEventListener("input", () => { touched = true; });
  f.addEventListener("change", (e) => { if (e.target.name === "k" && !touched) f.elements.msg.value = STICKER_MSG[e.target.value]; });
}

function groupSheet2(g) {
  const st = S.students;
  openSheet({ title: g ? "Modifica gruppo" : "Nuovo gruppo", focus: g ? "title" : "input", body: `
    <label>Nome del gruppo<input name="name" required maxlength="30" value="${esc(g && g.name)}" placeholder="Es. Sabato mattina"></label>
    ${st.length ? `<fieldset class="grp members"><legend class="cat">Chi ne fa parte</legend>
      ${st.map((x) => { const other = x.group && validGroup(x.group) && (!g || x.group !== g.id) ? groupName(S.meta, x.group) : "";
        return `<label class="chk"><input type="checkbox" name="m" value="${x.code}" ${g && x.group === g.id ? "checked" : ""}>
          <span class="txt">${esc(x.name)}${other ? `<small>Ora in ${esc(other)}: se lo scegli, cambia gruppo</small>` : ""}</span></label>`; }).join("")}
    </fieldset>` : ""}
    ${sheetBtns("Salva")}
    ${g ? delBtn("Elimina gruppo") : ""}`,
  onSubmit: async (fd, sub) => {
    if (sub && sub.name === "del") {
      if (!(await ask(`Eliminare il gruppo “${g.name}”? Gli alunni restano, senza gruppo. Gli allenamenti solo per questo gruppo vengono eliminati.`))) return false;
      const extra = Object.fromEntries(S.students.filter((x) => x.group === g.id).map((x) => [x.code, { group: "" }]));
      await saveMeta({ ...S.meta, groups: S.meta.groups.filter((x) => x.id !== g.id), trainings: S.meta.trainings.filter((t) => t.group !== g.id) }, extra);
      return gone("Gruppo eliminato");
    }
    const name = fd.get("name").trim();
    if (!name) return bad("name", "Scrivi il nome del gruppo.");
    if (S.meta.groups.some((x) => x.id !== (g && g.id) && norm(x.name) === norm(name))) return bad("name", "Esiste già un gruppo con questo nome.");
    const id = g ? g.id : newId(), picked = new Set(fd.getAll("m"));
    const groups = g ? S.meta.groups.map((x) => (x.id === id ? { ...x, name } : x)) : [...S.meta.groups, { id, name }];
    // chi entra prende questo gruppo, chi esce resta senza gruppo; tutto in un'unica scrittura
    const extra = {};
    for (const x of S.students) {
      if (picked.has(x.code) && x.group !== id) extra[x.code] = { group: id };
      else if (!picked.has(x.code) && x.group === id) extra[x.code] = { group: "" };
    }
    await saveMeta({ ...S.meta, groups }, extra);
    const n = Object.keys(extra).length;
    ok(`${g ? "Gruppo salvato" : "Gruppo creato"}${n ? ` · ${plural(n, "alunno spostato", "alunni spostati")}` : ""}`);
  } });
}

function groupSheet(g) {
  if (g !== undefined) groupSheet2(g);
}

// scrittura dell'alunno sulle lezioni private, con un messaggio chiaro se le regole del database non sono aggiornate
async function reqWrite(code, id, val) {
  try { await be.setReq(code, id, val); }
  catch (e) {
    console.warn(e);
    oops(e && e.code === "permission-denied" ? "Non riesco a inviarla: l'allenatrice deve aggiornare le regole del database" : "Connessione non riuscita. Riprova.");
  }
}

// orari per le lezioni private: uno o ripetuto ogni settimana; si può anche assegnare direttamente a un alunno
function slotSheet(t) {
  if (t === undefined) return;
  const B = beta() && t;
  // nuova versione: si può prenotare per qualunque alunno; in cima chi l'ha chiesto, da confermare con un tocco
  const privs = B ? S.students : S.students.filter((x) => x.priv || (t && x.code === t.who));
  const asks = B ? inbox().filter((x) => x.t.id === t.id) : [];
  openSheet({ title: t ? (B && !t.who ? "Orario libero" : "Lezione privata") : "Nuovi orari liberi", body: `
    ${asks.length ? `<h3 class="cat">${asks[0].kind === "cancel" ? "Disdetta" : asks.length === 1 ? "Chi l'ha chiesto" : `L'hanno chiesto in ${asks.length}`}</h3>
      <ul class="trs reqs">${asks.map(inboxRow).join("")}</ul>` : ""}
    <div class="two"><label>Data<input type="date" name="date" required value="${esc(t ? t.date : addDays(1))}"></label>
      <label>Ora<input type="time" name="time" required value="${esc(t ? t.time : "16:00")}"></label></div>
    <div class="two"><label>Durata<select name="dur">${[30, 45, 60, 90].map((m) => `<option value="${m}" ${(t ? t.dur : 30) === m ? "selected" : ""}>${m} minuti</option>`).join("")}</select></label>
      ${t ? "" : `<label>Ripeti<select name="rep"><option value="1">Solo questa volta</option>${[2, 4, 8].map((n) => `<option value="${n}">Per ${n} settimane</option>`).join("")}</select></label>`}</div>
    <label>Prenotata da<select name="who"><option value="">Nessuno: orario libero</option>
      ${privs.map((x) => `<option value="${x.code}" ${t && t.who === x.code ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
    <label>Luogo (facoltativo)<input name="place" maxlength="60" value="${esc(t ? t.place : "Palaghiaccio")}"></label>
    <label>Note (facoltative)<input name="note" maxlength="120" value="${esc(t && t.note)}" placeholder="Es. Portare la musica"></label>
    <p class="muted small">${privs.length ? "Gli orari liberi li vedono solo gli alunni con le lezioni private attive (si attivano nel loro Profilo)."
      : "Nessun alunno ha ancora le lezioni private: attivale nel Profilo di chi le fa."}</p>
    ${sheetBtns("Salva")}
    ${t ? delBtn("Elimina orario") : ""}`,
  onSubmit: async (fd, sub) => {
    const all = S.meta.slots;
    if (sub && sub.name === "del") {
      if (!(await ask(t.who ? `Eliminare la lezione di ${nameOf(t.who)}? Sparirà anche dalla sua app.` : "Eliminare questo orario?"))) return false;
      await saveMeta({ ...S.meta, slots: all.filter((x) => x.id !== t.id) });
      return gone("Orario eliminato");
    }
    const date = fd.get("date"), d0 = parseDate(date);
    if (!d0) return bad("date", "Scegli la data.");
    const base = { time: fd.get("time") || "", dur: Number(fd.get("dur")) || 30, place: fd.get("place").trim(), note: fd.get("note").trim(),
      who: S.students.some((x) => x.code === fd.get("who")) ? fd.get("who") : "" };
    if (t) {
      if (B && !(await clashOk([{ ...base, date }], t.id))) return false;
      await saveMeta({ ...S.meta, slots: all.map((x) => (x.id === t.id ? { ...x, ...base, date } : x)) });
      return ok("Orario aggiornato");
    }
    const n = Number(fd.get("rep")) || 1;
    const add = Array.from({ length: n }, (_, k) => ({ id: newId(), date: localDate(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 7 * k)),
      ...base, who: k === 0 ? base.who : "" }));
    await saveMeta({ ...S.meta, slots: [...all, ...add] });
    ok(n === 1 ? "Orario aggiunto" : `${n} orari aggiunti`);
  } });
}

// nuova versione: aggiungi elementi. Una ricerca che serve anche per scriverne uno nuovo, il livello come schede,
// gli elementi come pulsanti da toccare. I filtri nascondono soltanto: quelli già scelti restano scelti.
// (Eccezione voluta a focus "input": la tastiera coprirebbe il catalogo, che è la parte principale.)
function progPicker() {
  const s = cur(), lv = lvlOf(s) || "base", have = new Set((s.progress || []).map(itemKey)), cat = catNow();
  const f = openSheet({ title: "Aggiungi elementi", body: `
    <div class="search" data-nodirty><label for="pq" class="sr">Cerca o scrivi un elemento nuovo</label>${icon("search")}
      <input id="pq" type="search" placeholder="Cerca o scrivi" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done"></div>
    <fieldset class="seg" id="pLv" data-nodirty><legend>Livello</legend><div class="seg-opts">
      ${LEVELS.map(([k, l]) => `<label class="seg-opt lv"><input type="radio" name="plv" value="${k}" ${k === lv ? "checked" : ""}><span>${l}</span></label>`).join("")}</div></fieldset>
    <label class="chk new" id="newOpt" hidden><input type="checkbox" name="custom" checked>
      <span class="txt"><b>Nuovo: <span id="newName"></span></b><small>Non è nel catalogo: lo aggiungo in “Altro”, nel livello scelto.</small></span></label>
    <p class="muted small pick-hint">Tocca gli elementi da aggiungere. Quelli grigi con la spunta li ha già.</p>
    <div class="picks">${LEVELS.map(([L]) => Object.entries(cat[L]).map(([c, names]) => `<div class="pick-c" data-lv="${L}"><h3 class="cat">${c}</h3><div class="chips">
      ${names.map((n) => have.has(itemKey({ name: n }))
        ? `<span class="chip pick dis" data-n="${esc(norm(n))}">${icon("check")}<span>${esc(n)}</span><span class="sr">, già presente</span></span>`
        : `<label class="chip pick" data-n="${esc(norm(n))}"><input type="checkbox" name="pick" value="${esc(`${L}|${c}|${n}`)}">${icon("check")}<span>${esc(n)}</span></label>`).join("")}
      </div></div>`).join("")).join("")}</div>
    <p class="muted" id="noPick" hidden>Nessun elemento del catalogo con questo nome.</p>
    <button type="button" class="linkbtn cat-edit" data-act="c-cat">${icon("edit")} Cambia l'elenco degli elementi</button>
    ${sheetBtns("Aggiungi")}`,
  onSubmit: async (fd) => {
    const add = fd.getAll("pick").map((k) => { const [level, cat, name] = k.split("|"); return { level, cat, name }; });
    const cn = f.querySelector("#pq").value.trim();
    if (cn && !f.querySelector("#newOpt").hidden && fd.get("custom")) add.push({ level: normLevel(fd.get("plv")) || lv, cat: "Altro", name: cn });
    if (!add.length) { oops("Tocca almeno un elemento, oppure scrivine uno nuovo nella ricerca"); return false; }
    const s2 = cur();
    await be.updateStudent(s2.code, {
      progress: [...(s2.progress || []), ...add.map((a) => ({ id: newId(), ...a, status: "todo", date: "", note: "" }))],
    });
    ok(add.length === 1 ? `${add[0].name} aggiunto` : `${add.length} elementi aggiunti`);
  } });
  const q = f.querySelector("#pq"), btn = f.querySelector("[type=submit]"), all = new Set(Object.values(cat).flatMap((c) => Object.values(c).flat()).map(norm));
  const upd = () => {
    const t = norm(q.value), L = f.elements.plv.value;
    f.querySelector("#pLv").hidden = !!t; // cercando, si cerca in tutti i livelli
    let any = 0;
    f.querySelectorAll(".pick-c").forEach((c) => {
      let vis = 0;
      c.querySelectorAll(".pick").forEach((p) => { const on = t ? p.dataset.n.includes(t) : true; p.hidden = !on; vis += on; });
      c.hidden = !vis || (!t && c.dataset.lv !== L);
      if (!c.hidden) any++;
    });
    const isNew = !!t && !all.has(t) && !have.has(itemKey({ name: q.value.trim() }));
    f.querySelector("#newOpt").hidden = !isNew;
    f.querySelector("#newName").textContent = q.value.trim();
    f.querySelector("#noPick").hidden = !!any || isNew || !t;
    const n = f.querySelectorAll("[name=pick]:checked").length + (isNew && f.elements.custom.checked ? 1 : 0);
    btn.textContent = n ? `Aggiungi (${n})` : "Aggiungi";
  };
  q.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); q.blur(); } });
  f.addEventListener("input", upd); f.addEventListener("change", upd);
  upd();
}

// ---------------------------------------------------------- elementi del pattinaggio (nuova versione)
// L'allenatrice cambia l'elenco proposto in "Aggiungi elementi". Salvato in meta.elements solo dalla prima modifica.
const elements = () => (beta() && S.meta.elements ? S.meta.elements : defaultElements());
const catNow = () => (beta() && S.meta.elements ? catalogFrom(S.meta.elements) : CATALOG);
const lvSeg = (name, cur, legend = "Livello") => `<fieldset class="seg"><legend>${legend}</legend><div class="seg-opts">
  ${LEVELS.map(([k, l]) => `<label class="seg-opt lv"><input type="radio" name="${name}" value="${k}" ${k === cur ? "checked" : ""}><span>${l}</span></label>`).join("")}</div></fieldset>`;

function catSheet() {
  const L0 = S.catLv || "base", list = elements();
  const f = openSheet({ title: "Elementi del pattinaggio", live: true, body: `
    <p class="muted small">Sono gli elementi che proponi in «Aggiungi elementi». Tocca un elemento per cambiarlo o toglierlo: chi lo ha già nei progressi non perde niente.</p>
    ${lvSeg("clv", L0)}
    ${LEVELS.map(([L]) => `<div class="cat-lv" data-lv="${L}" ${L === L0 ? "" : "hidden"}>${CATEGORIES.map((c) => {
      const xs = list.filter((e) => e.level === L && e.cat === c);
      return xs.length ? `<h3 class="cat">${c}</h3><ul class="menu cat-l">${xs.map((e) => `<li><button type="button" class="mi" data-act="c-cat-ed" data-id="${esc(e.id)}"><span>${esc(e.name)}</span>${icon("chevron", "chev")}</button></li>`).join("")}</ul>` : "";
    }).join("") || `<p class="muted">Nessun elemento in questo livello.</p>`}</div>`).join("")}
    <button type="button" class="btn wide" data-act="c-cat-new">${icon("plus")} Nuovo elemento</button>
    ${S.meta.elements ? `<button type="button" class="linkbtn cat-edit" data-act="c-cat-reset">${icon("refresh")} Ripristina l'elenco iniziale</button>` : ""}
    <div class="sheet-btns"><button type="button" class="btn ghost wide" data-act="close">Fatto</button></div>` });
  f.addEventListener("change", (e) => {
    if (e.target.name !== "clv") return;
    S.catLv = e.target.value; f.dataset.dirty = "";
    f.querySelectorAll(".cat-lv").forEach((d) => { d.hidden = d.dataset.lv !== S.catLv; });
  });
}

function elementSheet(x) {
  const L = x ? x.level : S.catLv || "base";
  const users = (name) => S.students.filter((s) => (s.progress || []).some((p) => itemKey(p) === nameKey(name)));
  openSheet({ title: x ? "Modifica elemento" : "Nuovo elemento", focus: x ? "title" : "input", body: `
    <label>Nome<input name="name" required maxlength="60" value="${esc(x && x.name)}" placeholder="Es. Tre indietro esterno" autocomplete="off"></label>
    ${lvSeg("level", L)}
    <label>Categoria<select name="cat">${CATEGORIES.map((c) => `<option ${c === (x ? x.cat : "Altro") ? "selected" : ""}>${c}</option>`).join("")}</select></label>
    ${x && users(x.name).length ? `<p class="muted small">Ce l'hanno nei progressi ${users(x.name).length === 1 ? "1 alunno" : `${users(x.name).length} alunni`}: se cambi il nome, cambia anche da loro.</p>` : ""}
    <div class="sheet-btns"><button type="button" class="btn ghost" data-act="c-cat-back">Indietro</button><button class="btn" type="submit">${x ? "Salva" : "Aggiungi"}</button></div>
    ${x ? delBtn("Togli dall'elenco") : ""}`,
  onSubmit: async (fd, sub) => {
    const list = elements().map((e) => ({ ...e }));
    if (sub && sub.name === "del") {
      if (!(await ask(`Togliere “${x.name}” dall'elenco? Chi lo ha già nei progressi lo tiene.`))) return false;
      await saveMeta({ ...S.meta, elements: list.filter((e) => e.id !== x.id) });
      gone(`${x.name} tolto dall'elenco`); catSheet(); return false;
    }
    const name = fd.get("name").trim().replace(/\s+/g, " ");
    if (!name) return bad("name", "Scrivi il nome dell'elemento.");
    if (list.some((e) => e.id !== (x && x.id) && nameKey(e.name) === nameKey(name))) return bad("name", "C'è già un elemento con questo nome.");
    const item = { id: x ? x.id : newId(), name, level: normLevel(fd.get("level")) || "base", cat: CATEGORIES.includes(fd.get("cat")) ? fd.get("cat") : "Altro" };
    // nome cambiato: si aggiorna anche negli alunni che hanno già l'elemento (stessa scrittura)
    const extra = {};
    if (x && x.name !== name) {
      for (const s of users(x.name)) extra[s.code] = { progress: s.progress.map((p) => (itemKey(p) === nameKey(x.name) ? { ...p, name } : p)) };
    }
    S.catLv = item.level;
    await saveMeta({ ...S.meta, elements: x ? list.map((e) => (e.id === x.id ? item : e)) : [...list, item] }, extra);
    const n = Object.keys(extra).length;
    ok(x ? (n ? `Elemento salvato, anche in ${n === 1 ? "1 alunno" : `${n} alunni`}` : "Elemento salvato") : `${name} aggiunto all'elenco`);
    catSheet(); return false;
  } });
}

function exerciseSheet(x) {
  openSheet({ title: x ? "Modifica esercizio" : "Nuovo esercizio", focus: x ? "title" : "input", body: `
    <label>Esercizio<input name="title" required maxlength="80" list="ideas" value="${esc(x && x.title)}" placeholder="Es. Incrociati avanti in cerchio"></label>
    <datalist id="ideas">${EXERCISE_IDEAS.map((i) => `<option value="${esc(i)}">`).join("")}</datalist>
    <label>Dettagli<input name="detail" maxlength="120" value="${esc(x && x.detail)}" placeholder="Es. 5 giri per lato"></label>
    ${sheetBtns("Salva")}
    ${x ? delBtn("Elimina esercizio") : ""}`,
  onSubmit: async (fd, sub) => {
    const s = cur(), plan = [...(s.plan || [])];
    if (sub && sub.name === "del") {
      if (!(await ask(`Eliminare “${x.title}” dalla scheda?`))) return false;
      await be.updateStudent(s.code, { plan: plan.filter((p) => p.id !== x.id) });
      return gone("Esercizio eliminato");
    }
    if (!fd.get("title").trim()) return bad("title", "Scrivi il nome dell'esercizio.");
    const item = { id: x ? x.id : newId(), title: fd.get("title").trim(), detail: fd.get("detail").trim() };
    await be.updateStudent(s.code, { plan: x ? plan.map((p) => (p.id === x.id ? item : p)) : [...plan, item] });
    ok(x ? "Esercizio salvato" : `${item.title} aggiunto alla scheda`);
  } });
}

main();

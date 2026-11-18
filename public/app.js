import { CONFIG } from "./config.js";
import { createBackend, normCode, fmtCode, newId, CODE_LEN } from "./backend.js";
import { CATALOG, CATEGORIES, EXERCISE_IDEAS } from "./catalog.js";
import { renderDesign, applyDevVars } from "./design.js";
import { icon } from "./icons.js";
import { loadA11y, saveA11y, applyA11y, A11Y_OPTIONS } from "./a11y.js";

applyA11y(); // prima di tutto, così la prima schermata ha già testo e contrasto giusti

const $root = document.getElementById("app");
const $sheet = document.getElementById("sheet");
const LS_CODE = "pg_my_code";
const STATUS = { todo: "Da iniziare", doing: "In corso", done: "Completato" };
const NEXT = { todo: "doing", doing: "done", done: "todo" };
const AV = ["--yellow", "--pink", "--lilac", "--sage", "--sky"];

let be;
let unsub = [];
const S = { coach: null, students: [], student: null, reorder: false };

// ---------------------------------------------------------- utilità
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => (d ? d.split("-").reverse().join("/") : "");
function fmtWhen(ts) {
  if (!ts) return "";
  const d = new Date(ts), n = new Date();
  const hm = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === n.toDateString()) return `oggi ${hm}`;
  const y = new Date(n); y.setDate(n.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `ieri ${hm}`;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.setAttribute("aria-live", "polite");
  document.body.appendChild(t);
  // il testo va inserito dopo l'inserimento nel DOM, altrimenti i lettori di schermo non lo annunciano
  setTimeout(() => { t.textContent = msg; }, 50);
  setTimeout(() => t.remove(), 3500);
}
function fail(e) {
  console.error(e);
  const m = e && e.code === "permission-denied" ? "Permesso negato." : "Operazione non riuscita. Controlla la connessione.";
  toast(m);
}
const clearSubs = () => { unsub.forEach((f) => f && f()); unsub = []; };
const go = (h) => { location.hash = h; };
const pct = (s) => {
  const p = s.progress || [];
  return p.length ? Math.round((p.filter((x) => x.status === "done").length / p.length) * 100) : 0;
};
const checksDone = (s) => (s.plan || []).filter((x) => s.checks && s.checks[x.id]).length;
const findStudent = (code) => S.students.find((s) => s.code === code);
const inviteLink = (code) => `${location.origin}${location.pathname}?c=${code}`;
const avatarColor = (name) => AV[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
const LS_DEV = "pg_dev";
const demoBanner = () => {
  if (!be || !be.demo) return "";
  if (be.dev) return `<div class="demo dev"><b>Modalità sviluppo</b>: dati di esempio, solo in questo browser.
    <a href="#/design">Design system</a> · <a href="#" data-act="dev-exit">Esci</a></div>`;
  return `<div class="demo">Modalità demo: i dati restano solo su questo dispositivo.</div>`;
};
const logo = (sm) => `<div class="logo${sm ? " sm" : ""}" aria-hidden="true">${icon("skate")}</div>`;

// Ridisegna la schermata. Se il pulsante appena toccato è stato ricreato, gli ridà il focus
// (altrimenti VoiceOver e la tastiera ripartirebbero dall'inizio della pagina).
let pendingFocus = null;
function paint(html) {
  $root.innerHTML = html;
  if (!pendingFocus) return;
  const sel = pendingFocus; pendingFocus = null;
  if (document.activeElement && document.activeElement !== document.body) return;
  let el = $root.querySelector(sel);
  if (el && el.disabled) el = $root.querySelector(`${sel.replace(/\[data-d="-?\d+"\]/, "")}:not([disabled])`);
  if (el) el.focus({ preventScroll: true });
}

// ---------------------------------------------------------- avvio
async function main() {
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
  route();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

let lastCode = null;
function route() {
  clearSubs();
  closeSheet();
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[1] !== lastCode) { S.reorder = false; lastCode = parts[1]; }
  if (parts[0] === "design" && be.dev) return renderDesign($root);
  if (parts[0] === "coach") routeCoach(parts[1], parts[2] || "progressi");
  else routeStudent();
}
const loading = () => { $root.innerHTML = `<div class="center" role="status" aria-label="Caricamento"><div class="spinner"></div></div>`; };

// ======================================================== ALUNNO
function routeStudent() {
  const code = localStorage.getItem(LS_CODE);
  if (!code) return renderCodeEntry();
  loading();
  unsub.push(be.watchStudent(code, (s, meta) => {
    if (!s) {
      if (meta && meta.fromCache) return; // offline: aspetta il server
      localStorage.removeItem(LS_CODE);
      return renderCodeEntry("Codice non valido o non più attivo. Chiedi un nuovo invito alla tua allenatrice.");
    }
    S.student = s;
    renderStudent();
  }, (e) => {
    if (e && e.code === "permission-denied") localStorage.removeItem(LS_CODE);
    renderCodeEntry("Codice non valido. Controllalo e riprova.");
  }));
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
      placeholder="XXXX-XXXX-XXXX" maxlength="20" inputmode="text" ${msg ? 'aria-invalid="true" aria-describedby="codeErr"' : ""}>
    ${msg ? `<p class="err" id="codeErr" role="alert">${esc(msg)}</p>` : ""}
    <button class="btn wide" type="submit">Apri la mia scheda</button>
  </form>
  ${be.dev ? `<div class="card"><h2 class="h3">Entra come alunno di esempio</h2><div class="chips">
      ${be.sampleCodes().map((x) => `<button class="chip" data-act="dev-as" data-code="${x.code}">${esc(x.name)}</button>`).join("")}
    </div></div>`
    : be.demo ? `<p class="hint">Demo: prova il codice <b>DEMO-ALUN-NO23</b></p>` : ""}
  <p class="foot"><a href="#/coach">Sei l'allenatrice?</a></p>
  <p class="foot"><button class="linkbtn" data-act="a11y">${icon("a11y")} Accessibilità</button></p>`);
  document.getElementById("codeForm").onsubmit = (e) => {
    e.preventDefault();
    const c = normCode(document.getElementById("codeIn").value);
    if (c.length !== CODE_LEN) return renderCodeEntry("Il codice ha 12 caratteri.");
    localStorage.setItem(LS_CODE, c);
    route();
  };
}

function renderStudent() {
  const s = S.student;
  const plan = s.plan || [];
  const done = checksDone(s);
  paint(`${demoBanner()}
  <header class="top"><div class="grow"><small>Ciao</small><h1>${esc(s.name)}</h1></div>
    <button class="icon" data-act="s-settings" aria-label="Impostazioni">${icon("settings")}</button></header>

  <section class="card" aria-labelledby="hScheda">
    <div class="sec-h"><h2 id="hScheda">La mia scheda</h2><span class="pill" aria-label="${done} su ${plan.length} fatti">${done}/${plan.length}</span></div>
    ${plan.length ? `<ul class="checks">${plan.map((x) => checkRow(x, s.checks && s.checks[x.id], "student")).join("")}</ul>`
      : `<p class="muted">La tua allenatrice non ha ancora preparato la scheda.</p>`}
    ${done ? `<button class="btn ghost wide" data-act="s-reset">${icon("refresh")} Nuova sessione (togli le spunte)</button>` : ""}
  </section>

  <section class="card" aria-labelledby="hProg">
    <div class="sec-h"><h2 id="hProg">I miei progressi</h2><span class="pill" aria-label="${pct(s)} per cento completato">${pct(s)}%</span></div>
    ${progressBar(s)}
    ${progressList(s.progress || [], false)}
  </section>`);
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
    return `<li><button class="check coach ${on ? "on" : ""}" data-act="c-edit-ex" data-id="${x.id}">${inner}
      <span class="sr">${on ? "Spuntato dall'alunno." : "Non ancora spuntato."} Tocca per modificare.</span>${icon("chevron", "chev")}</button></li>`;
  }
  return `<div class="check ro ${on ? "on" : ""}">${inner}<span class="sr">${on ? "Spuntato." : ""}</span></div>`;
}

function progressBar(s) {
  return `<div class="bar" aria-hidden="true"><span style="width:${pct(s)}%"></span></div>`;
}

const stPill = (st) => `${icon(st)}<span>${STATUS[st]}</span>`;

function progressList(items, coach) {
  if (!items.length) return `<p class="muted">${coach ? "Nessun elemento. Aggiungine uno." : "Ancora nessun elemento."}</p>`;
  return CATEGORIES.filter((c) => items.some((i) => (i.cat || "Altro") === c)).map((c) => `
    <h3 class="cat">${esc(c)}</h3>
    <ul class="prog">${items.filter((i) => (i.cat || "Altro") === c).map((i) => {
      const meta = `${i.status === "done" && i.date ? `<small>Completato il ${fmtDate(i.date)}</small>` : ""}
          ${i.note ? `<small class="note">${esc(i.note)}</small>` : ""}`;
      return coach ? `<li>
        <button class="st ${i.status}" data-act="c-cycle" data-id="${i.id}"
          aria-label="${esc(i.name)}: ${STATUS[i.status]}. Tocca per passare a ${STATUS[NEXT[i.status]]}">${stPill(i.status)}</button>
        <button class="rowbtn" data-act="c-edit-prog" data-id="${i.id}"><span class="txt"><b>${esc(i.name)}</b>${meta}</span>
          <span class="sr">Modifica stato, data e note</span>${icon("chevron", "chev")}</button>
      </li>` : `<li><span class="st ${i.status}">${stPill(i.status)}</span>
        <div class="txt"><b>${esc(i.name)}</b>${meta}</div></li>`;
    }).join("")}</ul>`).join("");
}

// ======================================================== ALLENATRICE
function routeCoach(code, tab) {
  let stu = null;
  loading();
  unsub.push(() => stu && stu());
  unsub.push(be.onCoachAuth((u) => {
    S.coach = u;
    if (stu) { stu(); stu = null; }
    if (!u || !u.isCoach) return renderCoachLogin(u);
    loading();
    stu = be.watchStudents((list) => {
      S.students = list.sort((a, b) => a.name.localeCompare(b.name, "it"));
      code ? renderCoachStudent(code, tab) : renderCoachList();
    }, (e) => {
      console.error(e);
      $root.innerHTML = `<div class="center"><p>Accesso negato o errore di rete.</p>
        <button class="btn" onclick="location.reload()">Riprova</button></div>`;
    });
  }));
}

function renderCoachLogin(u) {
  const uid = u && u.uid;
  paint(`${demoBanner()}
  <div class="hero">${logo()}<h1>Area allenatrice</h1>
    <p>Questo telefono non è ancora abilitato. Non servono email né password.</p></div>
  ${be.demo ? `<div class="card"><button class="btn wide" data-act="c-demo">Entra (demo)</button></div>` : ""}
  <form class="card" id="trForm">
    <h2 class="h3">Hai già l'app su un altro telefono?</h2>
    <p class="muted small" id="trHelp">Sul vecchio telefono apri Impostazioni → “Aggiungi un dispositivo” e scrivi qui il codice (vale 15 minuti).</p>
    <label for="trIn" class="sr">Codice di trasferimento</label>
    <input id="trIn" class="code-in" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX" maxlength="20" aria-describedby="trHelp">
    <button class="btn wide" type="submit">Abilita questo telefono</button>
  </form>
  ${uid ? `<div class="card">
    <h2 class="h3">Prima configurazione</h2>
    <p class="muted small">Solo la prima volta: chi ha creato il progetto Firebase aggiunge questo ID nella raccolta <b>coaches</b> (vedi guida).</p>
    <div class="bigcode small-code">${esc(uid)}</div>
    <button class="btn ghost wide" data-act="c-copy-id" data-id="${esc(uid)}">${icon("link")} Copia ID</button>
  </div>` : `<p class="err">${u && u.error ? "Connessione non riuscita. Riprova." : ""}</p>`}
  <p class="foot"><a href="#">${icon("back")} Torna alla schermata alunno</a></p>`);
  document.getElementById("trForm").onsubmit = async (e) => {
    e.preventDefault();
    const t = normCode(document.getElementById("trIn").value);
    if (t.length !== CODE_LEN) return toast("Il codice ha 12 caratteri");
    try { await be.redeemTransfer(t); route(); }
    catch (err) { console.error(err); toast("Codice non valido o scaduto"); }
  };
}

function renderCoachList() {
  const list = S.students;
  paint(`${demoBanner()}
  <header class="top"><div class="grow"><small>Allenatrice</small><h1>I miei alunni</h1></div>
    <button class="icon" data-act="c-settings" aria-label="Impostazioni">${icon("settings")}</button></header>
  ${list.length ? `<ul class="students">${list.map((s) => {
      const done = checksDone(s), tot = (s.plan || []).length;
      return `<li><a href="#/coach/${s.code}" class="card stu">
        <span class="av" style="background:var(${avatarColor(s.name)})" aria-hidden="true">${esc([...s.name][0] || "?").toUpperCase()}</span>
        <span class="stu-main"><span class="row"><b>${esc(s.name)}</b><span class="pill">${pct(s)}%</span></span>
        ${progressBar(s)}
        <small class="muted">Scheda: ${done}/${tot} spuntati${s.checksAt && done ? ` · ${fmtWhen(s.checksAt)}` : ""}</small></span>
      </a></li>`;
    }).join("")}</ul>`
    : `<div class="card"><p class="muted">Nessun alunno. Tocca “Nuovo alunno” per crearne uno e mandargli l'invito.</p></div>`}
  <button class="fab" data-act="c-new">${icon("plus")} Nuovo alunno</button>`);
}

function renderCoachStudent(code, tab) {
  const s = findStudent(code);
  if (!s) { go("#/coach"); return; }
  const tabs = [["progressi", "Progressi"], ["scheda", "Scheda"], ["invito", "Invito"]];
  let body = "";
  if (tab === "progressi") {
    body = `<section class="card" aria-labelledby="hTab"><h2 class="sr" id="hTab">Elementi tecnici</h2>
      <div class="sec-h"><p class="muted small">Tocca lo stato per cambiarlo al volo, oppure l'elemento per data e note.</p>
        <span class="pill" aria-label="${pct(s)} per cento completato">${pct(s)}%</span></div>
      ${progressBar(s)}${progressList(s.progress || [], true)}
      <button class="btn wide" data-act="c-add-prog">${icon("plus")} Aggiungi elementi</button></section>`;
  } else if (tab === "scheda") {
    const plan = s.plan || [];
    const ro = S.reorder && plan.length > 1;
    body = `<section class="card" aria-labelledby="hTab"><h2 class="sr" id="hTab">Esercizi della scheda</h2>
      <div class="sec-h"><p class="muted small">${ro ? "Usa le frecce per cambiare l'ordine." : "Esercizi da fare durante il pattinaggio libero. L'alunno li spunta dal suo telefono."}</p>
        ${plan.length > 1 ? `<button class="btn ghost sm" data-act="c-reorder" aria-pressed="${ro}">${icon(ro ? "check" : "reorder")} ${ro ? "Fine" : "Riordina"}</button>` : ""}</div>
      ${plan.length ? `<ul class="plan ${ro ? "reo" : ""}">${plan.map((x, i) => ro ? `<li>
          ${checkRow(x, s.checks && s.checks[x.id], "reorder")}
          <div class="ops">
            <button class="icon sm" data-act="c-move" data-id="${x.id}" data-d="-1" aria-label="Sposta su: ${esc(x.title)}" ${i ? "" : "disabled"}>${icon("up")}</button>
            <button class="icon sm" data-act="c-move" data-id="${x.id}" data-d="1" aria-label="Sposta giù: ${esc(x.title)}" ${i < plan.length - 1 ? "" : "disabled"}>${icon("down")}</button>
          </div></li>` : checkRow(x, s.checks && s.checks[x.id], "coach")).join("")}</ul>` : `<p class="muted">Scheda vuota.</p>`}
      ${ro ? "" : `<button class="btn wide" data-act="c-add-ex">${icon("plus")} Aggiungi esercizio</button>
      ${checksDone(s) ? `<button class="btn ghost wide" data-act="c-reset" data-code="${s.code}">${icon("refresh")} Togli tutte le spunte</button>` : ""}`}
    </section>`;
  } else {
    body = `<section class="card invite" aria-labelledby="hTab"><h2 class="sr" id="hTab">Invito</h2>
      <p>Manda questo invito a <b>${esc(s.name)}</b>. Chi ha il link o il codice vede solo questa scheda.</p>
      <div class="bigcode" aria-label="Codice: ${[...fmtCode(s.code)].join(" ")}">${fmtCode(s.code)}</div>
      <div class="grid2">
        <button class="btn" data-act="c-wa">${icon("chat")} WhatsApp</button>
        <button class="btn" data-act="c-mail">${icon("mail")} Email</button>
        <button class="btn ghost" data-act="c-copy">${icon("link")} Copia link</button>
        ${navigator.share ? `<button class="btn ghost" data-act="c-share">${icon("share")} Condividi…</button>` : ""}
      </div>
    </section>
    <section class="card" aria-labelledby="hGest">
      <h2 class="h3" id="hGest">Gestione</h2>
      <ul class="menu">
        <li><button class="mi" data-act="c-rename">${icon("edit")}<span>Rinomina alunno</span>${icon("chevron", "chev")}</button></li>
        <li><button class="mi" data-act="c-regen" aria-describedby="regenHelp">${icon("refresh")}<span>Genera un nuovo codice</span>${icon("chevron", "chev")}</button>
          <small id="regenHelp" class="mi-help">Il vecchio codice smette di funzionare: utile se è finito in mani sbagliate.</small></li>
      </ul>
      <button class="btn danger wide" data-act="c-del">${icon("trash")} Elimina alunno</button>
    </section>`;
  }
  paint(`${demoBanner()}
  <header class="top"><a href="#/coach" class="icon" aria-label="Torna all'elenco alunni">${icon("back")}</a>
    <div class="grow"><small>Alunno</small><h1>${esc(s.name)}</h1></div></header>
  <nav class="tabs" aria-label="Sezioni alunno">${tabs.map(([k, l]) => `<a href="#/coach/${code}/${k}" class="${k === tab ? "on" : ""}"${k === tab ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
  ${body}`);
  $root.dataset.code = code;
}

// ---------------------------------------------------------- pannello (modale)
// focus: "title" per pannelli di modifica/informazione (niente tastiera o selettore data che si aprono da soli),
//        "input" per i moduli di creazione, dove si scrive subito.
let sheetOpener = null;
function openSheet({ title, body, onSubmit = () => {}, focus = "title" }) {
  // se si apre un pannello da un altro pannello, il focus tornerà comunque al pulsante originale
  if (!$sheet.contains(document.activeElement)) sheetOpener = document.activeElement;
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
    if (!(sub && sub.hasAttribute("formnovalidate")) && !f.reportValidity()) return;
    const btns = f.querySelectorAll("[type=submit]");
    btns.forEach((b) => { b.disabled = true; });
    try { if ((await onSubmit(new FormData(f), sub)) !== false) closeSheet(); }
    catch (err) { fail(err); }
    btns.forEach((b) => { b.disabled = false; });
  };
  const target = focus === "input" ? f.querySelector("input:not([type=checkbox]):not([type=radio]):not([type=file]),textarea") : null;
  setTimeout(() => (target || f.querySelector("#sheetTitle")).focus(), 50);
  return f;
}
function closeSheet() {
  const wasOpen = !$sheet.hidden;
  $sheet.hidden = true; $sheet.innerHTML = "";
  $root.removeAttribute("aria-hidden"); $root.inert = false;
  if (wasOpen && sheetOpener && document.contains(sheetOpener)) sheetOpener.focus();
  sheetOpener = null;
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$sheet.hidden) closeSheet(); });

const sheetBtns = (ok, cancel = "Annulla") => `<div class="sheet-btns">
  <button type="button" class="btn ghost" data-act="close">${cancel}</button><button class="btn" type="submit">${ok}</button></div>`;
const delBtn = (label) => `<button type="submit" name="del" value="1" class="btn danger wide del" formnovalidate>${icon("trash")} ${label}</button>`;

function a11ySheet() {
  const p = loadA11y();
  const f = openSheet({ title: "Accessibilità", body: `
    <p class="muted small">Si sommano alle impostazioni del telefono (Impostazioni → Accessibilità) e valgono solo su questo dispositivo.</p>
    <ul class="menu">${A11Y_OPTIONS.map(([k, ic, label, help]) => `<li>
      <label class="mi sw-row">${icon(ic)}<span class="txt"><b>${label}</b><small>${help}</small></span>
        <input type="checkbox" role="switch" class="switch" data-a11y="${k}" ${p[k] ? "checked" : ""}></label></li>`).join("")}
    </ul>
    <div class="sheet-btns"><button type="button" class="btn" data-act="close">Fatto</button></div>` });
  f.addEventListener("change", (e) => {
    const k = e.target.dataset.a11y;
    if (!k) return;
    const cur = loadA11y(); cur[k] = e.target.checked; saveA11y(cur);
  });
}

// ---------------------------------------------------------- azioni
const curCode = () => location.hash.split("/")[2];
const cur = () => findStudent(curCode());
const KEEP_FOCUS = new Set(["s-check", "c-cycle", "c-move", "c-reorder"]);

async function onClick(e) {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (el.tagName === "A" && act) e.preventDefault();
  if (KEEP_FOCUS.has(act)) {
    pendingFocus = `[data-act="${act}"]${el.dataset.id ? `[data-id="${el.dataset.id}"]` : ""}${el.dataset.d ? `[data-d="${el.dataset.d}"]` : ""}`;
  }
  const fn = ACTIONS[act];
  if (fn) { try { await fn(el); } catch (err) { fail(err); } }
}

const ACTIONS = {
  close: closeSheet,
  a11y: a11ySheet,

  // alunno
  async "s-check"(el) {
    const s = S.student, id = el.dataset.id;
    await be.setCheck(s.code, id, s.checks && s.checks[id] ? null : Date.now());
  },
  async "s-reset"() {
    if (confirm("Togliere tutte le spunte per iniziare una nuova sessione?")) await be.resetChecks(S.student.code);
  },
  "s-settings"() {
    openSheet({ title: "Impostazioni", body: `<ul class="menu">
        <li><button type="button" class="mi" data-act="a11y">${icon("a11y")}<span>Accessibilità</span>${icon("chevron", "chev")}</button></li>
      </ul>
      <button type="button" class="btn danger wide del" data-act="s-logout">${icon("logout")} Scollega questo telefono</button>
      <p class="muted small">Ti servirà di nuovo il codice dell'invito per rientrare.</p>` });
  },
  "s-logout"() {
    if (!confirm("Scollegare questo telefono? Ti servirà di nuovo il codice per rientrare.")) return;
    localStorage.removeItem(LS_CODE);
    route();
  },

  // allenatrice
  async "c-demo"() { await be.demoEnable(); },
  "dev-as"(el) { localStorage.setItem(LS_CODE, el.dataset.code); route(); },
  async "dev-reseed"() {
    if (!confirm("Sostituire tutti i dati di sviluppo con gli alunni di esempio?")) return;
    await be.reseed(); closeSheet(); toast("Alunni di esempio rigenerati");
  },
  "dev-exit"() {
    localStorage.removeItem(LS_DEV);
    localStorage.removeItem(LS_CODE);
    location.href = location.pathname;
  },
  async "c-copy-id"(el) {
    try { await navigator.clipboard.writeText(el.dataset.id); toast("ID copiato"); }
    catch { prompt("Copia l'ID:", el.dataset.id); }
  },
  "c-settings"() {
    const mi = (act, ic, label, help) => `<li><button type="button" class="mi" data-act="${act}"${help ? ` aria-describedby="h-${act}"` : ""}>${icon(ic)}<span>${label}</span>${icon("chevron", "chev")}</button>
      ${help ? `<small class="mi-help" id="h-${act}">${help}</small>` : ""}</li>`;
    openSheet({ title: "Impostazioni", body: `<div class="scroll">
      <h3 class="cat">Generale</h3>
      <ul class="menu">${mi("a11y", "a11y", "Accessibilità")}
        ${mi("c-transfer", "phone", "Aggiungi un dispositivo", "Per usare l'app su un altro telefono o dopo averlo cambiato.")}</ul>
      <h3 class="cat">Backup</h3>
      <ul class="menu">${mi("c-export", "download", "Esporta backup")}
        ${mi("c-import", "upload", "Ripristina da backup", "Il backup è un file sul tuo telefono: tienine una copia ogni tanto.")}</ul>
      <input type="file" accept=".json,application/json" id="impIn" hidden tabindex="-1">
      ${be.dev ? `<h3 class="cat">Sviluppo</h3><ul class="menu">${mi("dev-reseed", "refresh", "Rigenera alunni di esempio")}</ul>` : ""}
      <button type="button" class="btn danger wide del" data-act="c-remove-dev">${icon("logout")} Disabilita questo telefono</button>
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
    const data = { app: "pattinaggio", version: 1, exportedAt: new Date().toISOString(),
      students: S.students.map(({ code, ...rest }) => ({ code, ...rest })) };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
    a.download = `pattinaggio-backup-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    toast("Backup scaricato");
  },
  async "c-remove-dev"() {
    if (!confirm("Disabilitare questo telefono? Per riabilitarlo servirà un codice da un altro dispositivo abilitato.")) return;
    await be.removeDevice();
    route();
  },

  "c-new"() {
    openSheet({ title: "Nuovo alunno", focus: "input", body: `
      <label>Soprannome<input name="name" required maxlength="40" placeholder="Es. Giulia B." aria-describedby="nameHelp"></label>
      <p class="muted small" id="nameHelp">Usa solo un nome o un soprannome: niente cognome, email o telefono.
      L'invito lo mandi tu da WhatsApp o email, l'app non salva contatti.</p>
      ${sheetBtns("Crea")}`,
    onSubmit: async (fd) => {
      const code = await be.createStudent(fd.get("name").trim());
      go(`#/coach/${code}/invito`);
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
    if (msg) toast(msg);
  },

  "c-edit-prog"(el) {
    const s = cur(), p = (s.progress || []).find((x) => x.id === el.dataset.id);
    if (!p) return;
    openSheet({ title: esc(p.name), body: `
      <fieldset class="seg"><legend>Stato</legend><div class="seg-opts">
        ${Object.keys(STATUS).map((k) => `<label class="seg-opt ${k}"><input type="radio" name="status" value="${k}" ${k === p.status ? "checked" : ""}>${stPill(k)}</label>`).join("")}
      </div></fieldset>
      <label>Data completamento<input type="date" name="date" value="${esc(p.date)}"></label>
      <label>Note<textarea name="note" rows="3" maxlength="500" placeholder="Cosa migliorare, consigli…">${esc(p.note)}</textarea></label>
      ${sheetBtns("Salva")}
      ${delBtn("Elimina elemento")}`,
    onSubmit: async (fd, sub) => {
      const s2 = cur();
      if (sub && sub.name === "del") {
        if (!confirm(`Eliminare “${p.name}” dai progressi?`)) return false;
        return be.updateStudent(s2.code, { progress: s2.progress.filter((x) => x.id !== p.id) });
      }
      const status = fd.get("status");
      let date = fd.get("date") || "";
      if (status === "done" && !date) date = today();
      await be.updateStudent(s2.code, {
        progress: s2.progress.map((x) => x.id === p.id ? { ...x, status, date, note: fd.get("note").trim() } : x),
      });
    } });
  },

  "c-add-prog"() {
    const s = cur();
    const have = new Set((s.progress || []).map((p) => `${p.cat}|${p.name}`));
    const f = openSheet({ title: "Aggiungi elementi", body: `
      <div class="scroll">${CATEGORIES.filter((c) => CATALOG[c].length).map((c) => `
        <fieldset class="grp"><legend class="cat">${c}</legend>
        ${CATALOG[c].map((n) => {
          const k = `${c}|${n}`;
          return have.has(k)
            ? `<div class="chk dis">${icon("check")}<span>${esc(n)}</span><small>già presente</small></div>`
            : `<label class="chk"><input type="checkbox" name="pick" value="${esc(k)}"> ${esc(n)}</label>`;
        }).join("")}</fieldset>`).join("")}
      <fieldset class="grp"><legend class="cat">Personalizzato</legend>
      <div class="row2"><label class="sr" for="ccat">Categoria</label><select name="ccat" id="ccat">${CATEGORIES.map((c) => `<option ${c === "Altro" ? "selected" : ""}>${c}</option>`).join("")}</select>
      <label class="sr" for="cname">Nome elemento</label><input name="cname" id="cname" maxlength="60" placeholder="Nome elemento"></div></fieldset></div>
      ${sheetBtns("Aggiungi")}`,
    onSubmit: async (fd) => {
      const add = fd.getAll("pick").map((k) => { const [cat, name] = k.split("|"); return { cat, name }; });
      const cn = (fd.get("cname") || "").trim();
      if (cn) add.push({ cat: fd.get("ccat"), name: cn });
      if (!add.length) { toast("Seleziona almeno un elemento"); return false; }
      const s2 = cur();
      await be.updateStudent(s2.code, {
        progress: [...(s2.progress || []), ...add.map((a) => ({ id: newId(), ...a, status: "todo", date: "", note: "" }))],
      });
      toast(add.length === 1 ? "1 elemento aggiunto" : `${add.length} elementi aggiunti`);
    } });
    const btn = f.querySelector("[type=submit]");
    const upd = () => {
      const n = f.querySelectorAll("[name=pick]:checked").length + (f.cname.value.trim() ? 1 : 0);
      btn.textContent = n ? `Aggiungi (${n})` : "Aggiungi";
    };
    f.addEventListener("change", upd); f.addEventListener("input", upd);
  },

  "c-add-ex"() { exerciseSheet(null); },
  "c-edit-ex"(el) { exerciseSheet((cur().plan || []).find((x) => x.id === el.dataset.id)); },
  "c-reorder"() { S.reorder = !S.reorder; renderCoachStudent(curCode(), "scheda"); },

  async "c-move"(el) {
    const s = cur(), plan = [...(s.plan || [])];
    const i = plan.findIndex((x) => x.id === el.dataset.id), j = i + Number(el.dataset.d);
    if (i < 0 || j < 0 || j >= plan.length) return;
    [plan[i], plan[j]] = [plan[j], plan[i]];
    await be.updateStudent(s.code, { plan });
    toast(`${plan[j].title}: posizione ${j + 1} di ${plan.length}`);
  },
  async "c-reset"(el) {
    if (confirm("Togliere tutte le spunte dalla scheda?")) await be.resetChecks(el.dataset.code);
  },

  "c-wa"() {
    const s = cur();
    window.open(`https://wa.me/?text=${encodeURIComponent(inviteMsg(s))}`, "_blank");
  },
  "c-mail"() {
    const s = cur();
    location.href = `mailto:?subject=${encodeURIComponent("La tua scheda di pattinaggio")}&body=${encodeURIComponent(inviteMsg(s))}`;
  },
  async "c-copy"() {
    try { await navigator.clipboard.writeText(inviteLink(cur().code)); toast("Link copiato"); }
    catch { prompt("Copia il link:", inviteLink(cur().code)); }
  },
  async "c-share"() {
    const s = cur();
    try { await navigator.share({ title: "Scheda pattinaggio", text: inviteMsg(s) }); } catch {}
  },
  "c-rename"() {
    const s = cur();
    openSheet({ title: "Rinomina", focus: "input",
      body: `<label>Soprannome<input name="name" required maxlength="40" value="${esc(s.name)}"></label>${sheetBtns("Salva")}`,
      onSubmit: (fd) => be.updateStudent(s.code, { name: fd.get("name").trim() }) });
  },
  async "c-regen"() {
    const s = cur();
    if (!confirm(`Generare un nuovo codice per ${s.name}? Dovrai mandargli di nuovo l'invito.`)) return;
    const code = await be.regenerateCode(s.code);
    go(`#/coach/${code}/invito`);
    toast("Nuovo codice creato");
  },
  async "c-del"() {
    const s = cur();
    if (!confirm(`Eliminare ${s.name} e tutti i suoi dati? Non si può annullare.`)) return;
    await be.deleteStudent(s.code);
    go("#/coach");
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
    if (!confirm(`Nel backup ci sono ${data.students.length} alunni, ${toAdd.length} non presenti ora. Ripristinarli?`)) return;
    for (const { code, ...rest } of toAdd) await be.restoreStudent(code, rest);
    closeSheet();
    toast(toAdd.length === 1 ? "1 alunno ripristinato" : `${toAdd.length} alunni ripristinati`);
  } catch (err) {
    console.error(err);
    toast("File di backup non valido");
  }
}

function inviteMsg(s) {
  return `Ciao ${s.name}! ⛸️ Ecco la tua scheda di pattinaggio:\n${inviteLink(s.code)}\n\n` +
    `Se ti chiede un codice: ${fmtCode(s.code)}\n` +
    `Consiglio: aprila e aggiungila alla schermata Home del telefono.`;
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
      if (!confirm(`Eliminare “${x.title}” dalla scheda?`)) return false;
      return be.updateStudent(s.code, { plan: plan.filter((p) => p.id !== x.id) });
    }
    const item = { id: x ? x.id : newId(), title: fd.get("title").trim(), detail: fd.get("detail").trim() };
    await be.updateStudent(s.code, { plan: x ? plan.map((p) => (p.id === x.id ? item : p)) : [...plan, item] });
  } });
}

main();

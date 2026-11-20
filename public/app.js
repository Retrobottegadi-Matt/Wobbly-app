import { CONFIG } from "./config.js";
import { createBackend, normCode, fmtCode, newId, CODE_LEN } from "./backend.js";
import { CATALOG, CATEGORIES, EXERCISE_IDEAS, LEVELS, LEVEL_LABEL, normItem, normLevel, itemKey } from "./catalog.js";
import { renderDesign, applyDevVars } from "./design.js";
import { icon } from "./icons.js";
import { initDrag, isDragging } from "./drag.js";
import { loadA11y, saveA11y, applyA11y, A11Y_OPTIONS, THEMES } from "./a11y.js";
import { localDate, addDays, parseDate, emptyMeta, normMeta, sortTrainings, groupName, schedFor, sameSched } from "./sched.js";

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
const S = { coach: null, students: [], student: null, reorder: false, q: "", gf: "", meta: emptyMeta(), metaErr: false };

// ---------------------------------------------------------- utilità
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => localDate();
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
function toast(msg) {
  const t = ensureToast();
  clearTimeout(toastTimer); clearTimeout(toastSet);
  t.textContent = ""; // svuota prima: così anche un messaggio uguale al precedente viene riletto
  toastSet = setTimeout(() => { t.textContent = msg; t.classList.remove("idle"); }, 50);
  toastTimer = setTimeout(() => { t.classList.add("idle"); t.textContent = ""; }, 3500);
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
// Entrata animata solo quando si cambia schermata (route), non a ogni aggiornamento dei dati;
// il riscontro animato (.just) va solo sull'elemento appena toccato.
let pendingFocus = null, flashSel = null, animateNext = false;
function paint(html) {
  // se arriva un secondo ridisegno di fila (es. alunni e allenamenti aggiornati insieme) il focus resta dov'era
  const prev = !pendingFocus && $root.contains(document.activeElement) ? selOf(document.activeElement) : null;
  if (prev) pendingFocus = prev;
  $root.innerHTML = html;
  delete $root.dataset.view;
  $root.classList.remove("enter");
  if (animateNext) { animateNext = false; void $root.offsetWidth; $root.classList.add("enter"); }
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
  closeSheet();
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const code = parts[0] === "coach" && isCode(parts[1]) ? parts[1] : null;
  if (code !== lastCode) { S.reorder = false; lastCode = code; }
  if (parts[0] !== "coach") { S.q = ""; S.gf = ""; }
  animateNext = true;
  if (parts[0] === "design" && be.dev) return renderDesign($root);
  if (parts[0] === "coach") routeCoach(parts[1] || "home", parts[2] || "progressi");
  else routeStudent(["progressi", "profilo"].includes(parts[0]) ? parts[0] : "oggi");
}
const loading = () => { $root.innerHTML = `<div class="center" role="status" aria-label="Caricamento"><div class="spinner"></div></div>`; };

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

// ---------------------------------------------------------- parti comuni (stile iOS: titolo grande, sezioni, barra flottante)
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const longToday = () => cap(new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }));
// titolo grande con riga sopra (data o contesto) e un pulsante a destra
const head = (title, eyebrow = "", right = "") => `<header class="top"><div class="grow">${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ""}<h1>${title}</h1></div>${right}</header>`;
// sezione con titolo fuori dalla carta (come le liste raggruppate di iOS)
const sect = (id, title, body, right = "", cls = "card") => `<section class="sect" aria-labelledby="${id}">
  <div class="sec-h out"><h2 id="${id}">${title}</h2>${right}</div><div class="${cls}">${body}</div></section>`;
// barra flottante in basso; action = pulsante tondo accanto (azione principale della schermata)
const tabbar = (items, on, action = "") => `<div class="dock"><nav class="bnav" aria-label="Sezioni">${items
  .map(([href, ic, l, k]) => `<a href="${href}" class="${k === on ? "on" : ""}"${k === on ? ' aria-current="page"' : ""}>${icon(ic)}<span>${l}</span></a>`).join("")}</nav>${action}</div>`;
const STUDENT_TABS = [["#/", "home", "Oggi", "oggi"], ["#/progressi", "chart", "Progressi", "progressi"], ["#/profilo", "user", "Profilo", "profilo"]];

function renderStudent(view = "oggi") {
  const s = S.student;
  let body = "";
  if (view === "progressi") {
    const items = (s.progress || []).length, dn = (s.progress || []).filter((x) => x.status === "done").length;
    body = `${head("Progressi", `Livello ${LEVEL_LABEL[lvlOf(s) || "base"].toLowerCase()}`)}
    <div class="card sum-card"><div class="big-pct"><b>${pct(s)}%</b><span>${items ? `${dn} di ${items} elementi completati` : "Ancora nessun elemento"}</span></div>${progressBar(s)}</div>
    ${items ? `<div class="card" aria-label="Elementi">${progressList(s.progress, "student")}</div>` : ""}`;
  } else if (view === "profilo") {
    body = `${head("Profilo")}
    <div class="card profile"><div class="prof-h"><span class="av lg" style="background:var(${avatarColor(s.name)})" aria-hidden="true">${esc([...s.name][0] || "?").toUpperCase()}</span>
      <div class="grow"><h2>${esc(s.name)}</h2><small>Livello ${LEVEL_LABEL[lvlOf(s) || "base"].toLowerCase()}</small></div></div>
      ${s.bio ? `<p class="bio">${esc(s.bio)}</p>` : ""}</div>
    ${sect("hSet", "Impostazioni", `<ul class="menu">
      <li><button type="button" class="mi" data-act="a11y">${icon("a11y")}<span>Accessibilità</span>${icon("chevron", "chev")}</button></li>
      <li><button type="button" class="mi danger-row" data-act="s-logout" aria-describedby="logoutHelp">${icon("logout")}<span>Scollega questo telefono</span></button>
        <small class="mi-help" id="logoutHelp">Per rientrare ti servirà di nuovo il codice dell'invito.</small></li></ul>`, "", "plain")}`;
  } else {
    const plan = s.plan || [], done = checksDone(s);
    const next = (s.sched || []).filter((t) => t.date >= today()).slice(0, 3);
    body = `${head(`Ciao, ${esc(s.name)}`, longToday())}
    ${next.length ? sect("hNext", next.length === 1 ? "Prossimo allenamento" : "Prossimi allenamenti",
      `<ul class="trs">${next.map((t) => trRow(t, t.gname || "Tutti")).join("")}</ul>`) : ""}
    ${sect("hScheda", "La tua scheda", plan.length
      ? `<ul class="checks">${plan.map((x) => checkRow(x, s.checks && s.checks[x.id], "student")).join("")}</ul>
        ${done ? `<button class="btn ghost wide" data-act="s-reset">${icon("refresh")} Ricomincia la scheda</button>` : ""}`
      : `<p class="muted">La tua allenatrice non ha ancora preparato la scheda.</p>`,
      plan.length ? `<span class="pill" aria-label="${done} su ${plan.length} fatti">${done} di ${plan.length}</span>` : "")}`;
  }
  paint(`${demoBanner()}${body}${tabbar(STUDENT_TABS, view)}`);
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
  const meta = `${i.status === "done" && i.date ? `<small>Completato il ${fmtDate(i.date)}</small>` : ""}
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
    const draw = () => { if (gotS && gotM) renderCoach(view, tab); };
    stu = be.watchStudents((list) => {
      S.students = list.sort((a, b) => a.name.localeCompare(b.name, "it"));
      gotS = true; draw();
    }, (e) => {
      console.error(e);
      $root.innerHTML = `<div class="center"><p>Accesso negato o errore di rete.</p>
        <button class="btn" onclick="location.reload()">Riprova</button></div>`;
    });
    // gruppi e allenamenti: se la regola del database non è ancora aggiornata, il resto funziona lo stesso
    met = be.watchMeta((m) => { S.meta = normMeta(m); S.metaErr = false; gotM = true; draw(); },
      (e) => { console.warn(e); S.meta = emptyMeta(); S.metaErr = true; gotM = true; draw(); });
  }));
}
function renderCoach(view, tab) {
  if (isCode(view)) return renderCoachStudent(view, tab);
  if (view === "alunni") return renderCoachList();
  if (view === "calendario") return renderCoachCal();
  return renderCoachHome();
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
    if (t.length !== CODE_LEN) return toast("Il codice ha 12 caratteri");
    try { await be.redeemTransfer(t); route(); }
    catch (err) { console.error(err); toast("Codice non valido o scaduto"); }
  };
}

// ---------------------------------------------------------- parti comuni dell'area allenatrice
const coachTop = (title, eyebrow) => head(title, eyebrow, `<button class="icon" data-act="c-settings" aria-label="Impostazioni">${icon("settings")}</button>`);
// barra flottante: Oggi / Alunni / Calendario (+ azione principale della schermata)
const COACH_TABS = [["#/coach", "home", "Oggi", ""], ["#/coach/alunni", "users", "Alunni", "alunni"], ["#/coach/calendario", "calendar", "Calendario", "calendario"]];
const bnav = (on, action = "") => tabbar(COACH_TABS, on, action);
const fab = (act, label) => `<button class="fab" data-act="${act}" aria-label="${label}">${icon("plus")}</button>`;
const metaWarn = () => S.metaErr ? `<div class="card warn" role="note"><b>Gruppi e allenamenti non disponibili.</b>
  <p class="small">Va aggiornata la regola di sicurezza del database (Firestore → Regole): vedi la guida.</p></div>` : "";
const upcoming = () => sortTrainings(S.meta.trainings.filter((t) => t.date >= today()));
const whoOf = (t) => (t.group ? groupName(S.meta, t.group) || "Gruppo eliminato" : "Tutti");
const inGroup = (id) => S.students.filter((s) => (s.group || "") === id).length;
const nAlunni = (n) => (n === 1 ? "1 alunno" : `${n} alunni`);

// riga di un allenamento; con act diventa un pulsante che apre la modifica
function trRow(t, who, act) {
  const inner = `<span class="date" aria-hidden="true"><b>${dayNum(t.date)}</b><small>${monShort(t.date)}</small></span>
    <span class="txt"><b>${fmtDay(t.date)}${t.time ? ` · ${esc(t.time)}` : ""}</b>
      <small>${esc(who)}${t.place ? ` · ${esc(t.place)}` : ""}</small>${t.note ? `<small class="note">${esc(t.note)}</small>` : ""}</span>`;
  return act ? `<li><button class="tr" data-act="${act}" data-id="${t.id}">${inner}<span class="sr">Tocca per modificare</span>${icon("chevron", "chev")}</button></li>`
    : `<li><div class="tr">${inner}</div></li>`;
}

// ---------------------------------------------------------- Home (dashboard)
function renderCoachHome() {
  const list = S.students, n = list.length;
  const avg = n ? Math.round(list.reduce((a, s) => a + pct(s), 0) / n) : 0;
  const since = Date.now() - 7 * 86400000;
  const active = list.filter((s) => (s.checksAt || 0) >= since && checksDone(s) > 0).length;
  const next = upcoming().slice(0, 3);
  const g = S.meta.groups, none = inGroup("");
  paint(`${demoBanner()}
  ${coachTop("Oggi", longToday())}
  ${metaWarn()}
  <section aria-labelledby="hNum"><h2 class="sr" id="hNum">In sintesi</h2>
    <ul class="stats">
      <li class="stat"><span>Alunni</span><b>${n}</b></li>
      <li class="stat"><span>Media progressi</span><b>${n ? `${avg}%` : "–"}</b></li>
      <li class="stat"><span>Attivi in 7 giorni</span><b>${active}<small> su ${n}</small></b></li>
    </ul></section>
  ${sect("hNext", "Prossimi allenamenti",
    `${next.length ? `<ul class="trs">${next.map((t) => trRow(t, whoOf(t), "c-edit-tr")).join("")}</ul>` : `<p class="muted">Nessun allenamento in programma.</p>`}
    ${S.metaErr ? "" : `<button class="btn ghost wide" data-act="c-new-tr">${icon("plus")} Nuovo allenamento</button>`}`,
    next.length ? `<a class="more" href="#/coach/calendario">Vedi tutti</a>` : "")}
  ${sect("hGr", "Gruppi", g.length
    ? `<ul class="menu">${g.map((x) => `<li><button class="mi" data-act="c-open-group" data-id="${x.id}">${icon("group")}<span>${esc(x.name)}</span><small class="cnt">${nAlunni(inGroup(x.id))}</small>${icon("chevron", "chev")}</button></li>`).join("")}
      ${none ? `<li><button class="mi" data-act="c-open-group" data-id="none">${icon("user")}<span>Senza gruppo</span><small class="cnt">${nAlunni(none)}</small>${icon("chevron", "chev")}</button></li>` : ""}</ul>`
    : `<p class="muted">Raggruppa gli alunni per trovarli prima e programmare allenamenti solo per loro.</p>
      ${S.metaErr ? "" : `<button class="btn ghost wide" data-act="c-new-group">${icon("plus")} Nuovo gruppo</button>`}`, "", g.length ? "plain" : "card")}
  ${bnav("")}`);
}

// ---------------------------------------------------------- Alunni (elenco con gruppi e ricerca)
const norm = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const SEARCH_MIN = 6; // la ricerca compare da 6 alunni in su
const byGroup = (s) => !S.gf || (S.gf === "none" ? !s.group : s.group === S.gf);
const shownStudents = () => { const q = norm(S.q); return S.students.filter((s) => byGroup(s) && (!q || norm(s.name).includes(q))); };

function gfChips() {
  if (!S.meta.groups.length) return "";
  const opts = [["", "Tutti"], ...S.meta.groups.map((g) => [g.id, g.name]), ...(inGroup("") ? [["none", "Senza gruppo"]] : [])];
  return opts.map(([k, l]) => `<button class="chip f" data-act="c-gf" data-id="${k || "all"}" aria-pressed="${S.gf === k}">${esc(l)}</button>`).join("");
}

function studentRows() {
  if (!S.students.length) return `<div class="card empty"><p><b>Ancora nessun alunno</b></p><p class="muted">Tocca + in basso per aggiungerne uno e mandargli l'invito.</p></div>`;
  const shown = shownStudents();
  if (!shown.length) return `<div class="card"><p class="muted">${S.q ? `Nessun alunno corrisponde a “${esc(S.q)}”.` : "Nessun alunno in questo gruppo."}</p></div>`;
  return `<ul class="students">${shown.map((s) => {
      const done = checksDone(s), tot = (s.plan || []).length, gn = groupName(S.meta, s.group);
      return `<li><a href="#/coach/${s.code}" class="card stu">
        <span class="av" style="background:var(${avatarColor(s.name)})" aria-hidden="true">${esc([...s.name][0] || "?").toUpperCase()}</span>
        <span class="stu-main"><span class="row"><b>${esc(s.name)}</b><span class="pill">${pct(s)}%</span></span>
        ${progressBar(s)}
        <small class="muted">${[lvlOf(s) ? LEVEL_LABEL[lvlOf(s)] : "", gn ? esc(gn) : ""].filter(Boolean).join(" · ")}</small>
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
  if (document.getElementById("stuList") && $root.dataset.view === "list" && !animateNext) return refreshList();
  paint(`${demoBanner()}
  ${coachTop("Alunni", `<span id="stuTot">${nAlunni(S.students.length)}</span>`)}
  ${S.meta.groups.length ? `<div class="chips gf" id="gfBox" role="group" aria-label="Filtra per gruppo">${gfChips()}</div>` : ""}
  ${S.students.length >= SEARCH_MIN ? `<div class="search" role="search">
    <label for="stuSearch" class="sr">Cerca alunno</label>${icon("search")}
    <input id="stuSearch" type="search" placeholder="Cerca alunno" autocomplete="off" autocorrect="off" spellcheck="false"
      enterkeyhint="search" value="${esc(S.q)}" aria-describedby="stuCount"></div>` : ""}
  <p id="stuCount" class="sr" aria-live="polite"></p>
  <div id="stuList">${studentRows()}</div>
  ${bnav("alunni", fab("c-new", "Nuovo alunno"))}`);
  $root.dataset.view = "list";
  const inp = document.getElementById("stuSearch");
  if (inp) {
    inp.oninput = () => { S.q = inp.value; refreshList(); announceCount(); };
    inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); inp.blur(); } };
  }
}

// ---------------------------------------------------------- Calendario (allenamenti e gruppi)
function renderCoachCal() {
  const up = upcoming(), past = sortTrainings(S.meta.trainings.filter((t) => t.date < today())).reverse().slice(0, 20);
  const g = S.meta.groups;
  paint(`${demoBanner()}
  ${coachTop("Calendario")}
  ${metaWarn()}
  ${sect("hUp", "Prossimi allenamenti",
    `${up.length ? `<ul class="trs">${up.map((t) => trRow(t, whoOf(t), "c-edit-tr")).join("")}</ul>`
      : `<p><b>Nessun allenamento in programma</b></p><p class="muted small">Tocca + per aggiungerne uno. Ogni alunno vede quelli per tutti e quelli del suo gruppo.</p>`}
    ${past.length ? `<details class="past"><summary>Passati (${past.length})</summary>
      <ul class="trs">${past.map((t) => trRow(t, whoOf(t), "c-edit-tr")).join("")}</ul></details>` : ""}`)}
  ${sect("hGroups", "Gruppi",
    `${g.length ? `<ul class="menu">${g.map((x) => `<li><button class="mi" data-act="c-edit-group" data-id="${x.id}">${icon("group")}<span>${esc(x.name)}</span><small class="cnt">${nAlunni(inGroup(x.id))}</small>${icon("chevron", "chev")}</button></li>`).join("")}</ul>`
      : `<p class="muted small">Dividi gli alunni in gruppi per trovarli prima e programmare allenamenti solo per loro.</p>`}
    ${S.metaErr ? "" : `<button class="btn ghost wide" data-act="c-new-group">${icon("plus")} Nuovo gruppo</button>`}`, "", g.length ? "plain" : "card")}
  ${bnav("calendario", S.metaErr ? "" : fab("c-new-tr", "Nuovo allenamento"))}`);
}

function renderCoachStudent(code, tab) {
  // niente ridisegno a metà trascinamento: si fa appena l'elemento viene lasciato
  if (isDragging()) { S.pendingRender = () => renderCoachStudent(code, tab); return; }
  const s = findStudent(code);
  if (!s) { go("#/coach/alunni"); return; }
  const tabs = [["profilo", "Profilo"], ["progressi", "Progressi"], ["scheda", "Scheda"], ["invito", "Invito"]];
  let body = "";
  if (tab === "profilo") {
    const gn = groupName(S.meta, s.group), next = schedFor(S.meta, s).slice(0, 3);
    body = `<section class="card profile" aria-labelledby="hTab">
      <div class="prof-h"><span class="av lg" style="background:var(${avatarColor(s.name)})" aria-hidden="true">${esc([...s.name][0] || "?").toUpperCase()}</span>
        <div class="grow"><h2 id="hTab">${esc(s.name)}</h2>
        <small>${LEVEL_LABEL[lvlOf(s) || "base"]} · ${gn ? esc(gn) : "Nessun gruppo"}</small></div></div>
      ${s.bio ? `<p class="bio">${esc(s.bio)}</p>` : `<p class="muted">Nessuna descrizione.</p>`}
      <button class="btn wide" data-act="c-profile">${icon("edit")} Modifica profilo</button>
    </section>
    <section class="card" aria-labelledby="hSn"><h2 class="h3" id="hSn">Prossimi allenamenti</h2>
      ${next.length ? `<ul class="trs">${next.map((t) => trRow(t, t.gname || "Tutti")).join("")}</ul>`
        : `<p class="muted">Nessun allenamento in programma${gn ? " per il suo gruppo" : ""}.</p>`}</section>`;
  } else if (tab === "progressi") {
    const n = (s.progress || []).length, ro = S.reorder === "progressi" && n > 1;
    body = `<section class="card" aria-labelledby="hTab"><h2 class="sr" id="hTab">Elementi tecnici</h2>
      <div class="sec-h"><p class="muted small">${ro ? "Usa le frecce per cambiare l'ordine dentro ogni gruppo."
        : "Tocca il cerchio a destra per cambiare lo stato, l'elemento per modificarlo. Tieni premuto per spostarlo."}</p>
        ${n > 1 ? reorderBtn("progressi", ro) : ""}</div>
      <div class="sum"><span class="pill" aria-label="${pct(s)} per cento completato">${pct(s)}%</span>${progressBar(s)}</div>
      ${progressList(s.progress, ro ? "reorder" : "coach")}
      ${ro ? "" : `<button class="btn wide" data-act="c-add-prog">${icon("plus")} Aggiungi elementi</button>`}</section>`;
  } else if (tab === "scheda") {
    const plan = s.plan || [];
    const ro = S.reorder === "scheda" && plan.length > 1;
    body = `<section class="card" aria-labelledby="hTab"><h2 class="sr" id="hTab">Esercizi della scheda</h2>
      <div class="sec-h"><p class="muted small">${ro ? "Usa le frecce per cambiare l'ordine."
        : `Esercizi da fare durante il pattinaggio libero. L'alunno li spunta dal suo telefono.${plan.length > 1 ? " Tieni premuto un esercizio per spostarlo." : ""}`}</p>
        ${plan.length > 1 ? reorderBtn("scheda", ro) : ""}</div>
      ${plan.length ? `<ul class="plan ${ro ? "reo" : ""}" data-drag="plan">${plan.map((x, i) => ro ? `<li data-id="${x.id}">
          ${checkRow(x, s.checks && s.checks[x.id], "reorder")}
          <div class="ops" data-nodrag>${arrows("plan", x.id, x.title, i, plan.length)}</div></li>` : checkRow(x, s.checks && s.checks[x.id], "coach")).join("")}</ul>` : `<p class="muted">Scheda vuota.</p>`}
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
        <li><button class="mi" data-act="c-regen" aria-describedby="regenHelp">${icon("refresh")}<span>Genera un nuovo codice</span>${icon("chevron", "chev")}</button>
          <small id="regenHelp" class="mi-help">Il vecchio codice smette di funzionare: utile se è finito in mani sbagliate.</small></li>
      </ul>
      <button class="btn danger wide" data-act="c-del">${icon("trash")} Elimina alunno</button>
    </section>`;
  }
  paint(`${demoBanner()}
  <header class="top"><a href="#/coach/alunni" class="icon" aria-label="Torna all'elenco alunni">${icon("back")}</a>
    <div class="grow"><small>Alunno${lvlOf(s) ? ` · ${LEVEL_LABEL[lvlOf(s)]}` : ""}</small><h1>${esc(s.name)}</h1></div></header>
  <nav class="tabs" aria-label="Sezioni alunno">${tabs.map(([k, l]) => `<a href="#/coach/${code}/${k}" class="${k === tab ? "on" : ""}"${k === tab ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
  ${body}`);
  $root.dataset.code = code;
}

// ---------------------------------------------------------- pannello (modale)
// focus: "title" per pannelli di modifica/informazione (niente tastiera o selettore data che si aprono da soli),
//        "input" per i moduli di creazione, dove si scrive subito.
let sheetOpener = null, sheetOpenerSel = null;
const selOf = (el) => el && el.dataset && el.dataset.act
  ? `[data-act="${el.dataset.act}"]${el.dataset.id ? `[data-id="${el.dataset.id}"]` : ""}` : null;
function openSheet({ title, body, onSubmit = () => {}, focus = "title" }) {
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
    if (!(sub && sub.hasAttribute("formnovalidate")) && !f.reportValidity()) return;
    const btns = f.querySelectorAll("[type=submit]");
    btns.forEach((b) => { b.disabled = true; });
    try { if ((await onSubmit(new FormData(f), sub)) !== false) closeSheet(); }
    catch (err) { fail(err); }
    btns.forEach((b) => { b.disabled = false; });
  };
  const target = focus === "input" ? f.querySelector("input:not([type=checkbox]):not([type=radio]):not([type=file]),textarea") : null;
  setTimeout(() => (target ? target.focus() : restoreFocus(f.querySelector("#sheetTitle"))), 50);
  return f;
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
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$sheet.hidden) closeSheet(); });

const levelSeg = (cur) => `<fieldset class="seg"><legend>Livello</legend><div class="seg-opts">
  ${LEVELS.map(([k, l]) => `<label class="seg-opt lv"><input type="radio" name="level" value="${k}" ${k === cur ? "checked" : ""}><span>${l}</span></label>`).join("")}
  </div></fieldset>`;
const sheetBtns = (ok, cancel = "Annulla") => `<div class="sheet-btns">
  <button type="button" class="btn ghost" data-act="close">${cancel}</button><button class="btn" type="submit">${ok}</button></div>`;
const delBtn = (label) => `<button type="submit" name="del" value="1" class="btn danger wide del" formnovalidate>${icon("trash")} ${label}</button>`;

function a11ySheet() {
  const p = loadA11y();
  const f = openSheet({ title: "Accessibilità", body: `
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
const KEEP_FOCUS = new Set(["s-check", "c-cycle", "c-move", "c-reorder"]);

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
  close: closeSheet,
  a11y: a11ySheet,

  // alunno
  async "s-check"(el) {
    const s = S.student, id = el.dataset.id;
    await be.setCheck(s.code, id, s.checks && s.checks[id] ? null : Date.now());
  },
  async "s-reset"() {
    if (confirm("Vuoi togliere tutte le spunte e ricominciare la scheda?")) await be.resetChecks(S.student.code);
  },
  "s-logout"() {
    if (!confirm("Scollegare questo telefono? Ti servirà di nuovo il codice per rientrare.")) return;
    localStorage.removeItem(LS_CODE);
    location.hash = "";
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
      ${window.__vgapInfo ? `<p class="muted small diag">Schermo: ${esc(window.__vgapInfo)}</p>` : ""}
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
    toast("Backup scaricato");
  },
  async "c-remove-dev"() {
    if (!confirm("Disabilitare questo telefono? Per riabilitarlo servirà un codice da un altro dispositivo abilitato.")) return;
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
      const group = validGroup(fd.get("group"));
      const code = await be.createStudent(fd.get("name").trim(), normLevel(fd.get("level")) || "base",
        { group, bio: "", sched: schedFor(S.meta, { group }) });
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
    const s = cur(), raw = (s.progress || []).find((x) => x.id === el.dataset.id);
    if (!raw) return;
    const p = normItem(raw);
    openSheet({ title: esc(p.name), body: `
      <fieldset class="seg"><legend>Stato</legend><div class="seg-opts">
        ${Object.keys(STATUS).map((k) => `<label class="seg-opt ${k}"><input type="radio" name="status" value="${k}" ${k === p.status ? "checked" : ""}>${stPill(k)}</label>`).join("")}
      </div></fieldset>
      ${levelSeg(p.level)}
      <label>Categoria<select name="cat">${CATEGORIES.map((c) => `<option ${c === p.cat ? "selected" : ""}>${c}</option>`).join("")}</select></label>
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
        progress: s2.progress.map((x) => x.id === p.id ? { ...normItem(x), status, date, note: fd.get("note").trim(),
          level: normLevel(fd.get("level")) || p.level, cat: CATEGORIES.includes(fd.get("cat")) ? fd.get("cat") : p.cat } : x),
      });
    } });
  },

  "c-add-prog"() {
    const s = cur();
    const lv = lvlOf(s) || "base";
    const order = [lv, ...LEVELS.map(([k]) => k).filter((k) => k !== lv)];
    const have = new Set((s.progress || []).map(itemKey));
    const f = openSheet({ title: "Aggiungi elementi", body: `
      <div class="scroll">${order.map((L) => `<h3 class="lvl">${LEVEL_LABEL[L]}</h3>${L === lv && lvlOf(s) ? `<small class="lvl-note">Livello di ${esc(s.name)}</small>` : ""}
        ${Object.entries(CATALOG[L]).map(([c, names]) => `<fieldset class="grp"><legend class="cat">${c}</legend>
        ${names.map((n) => have.has(itemKey({ name: n }))
          ? `<div class="chk dis">${icon("check")}<span>${esc(n)}</span><small>già presente</small></div>`
          : `<label class="chk"><input type="checkbox" name="pick" value="${esc(`${L}|${c}|${n}`)}"> ${esc(n)}</label>`).join("")}</fieldset>`).join("")}`).join("")}
      <fieldset class="grp"><legend class="cat">Personalizzato</legend>
      <div class="row2"><label class="sr" for="clevel">Livello</label><select name="clevel" id="clevel">${LEVELS.map(([k, l]) => `<option value="${k}" ${k === lv ? "selected" : ""}>${l}</option>`).join("")}</select>
      <label class="sr" for="ccat">Categoria</label><select name="ccat" id="ccat">${CATEGORIES.map((c) => `<option ${c === "Altro" ? "selected" : ""}>${c}</option>`).join("")}</select>
      <label class="sr" for="cname">Nome elemento</label><input name="cname" id="cname" maxlength="60" placeholder="Nome elemento"></div></fieldset></div>
      ${sheetBtns("Aggiungi")}`,
    onSubmit: async (fd) => {
      const add = fd.getAll("pick").map((k) => { const [level, cat, name] = k.split("|"); return { level, cat, name }; });
      const cn = (fd.get("cname") || "").trim();
      if (cn) add.push({ level: normLevel(fd.get("clevel")) || lv, cat: fd.get("ccat"), name: cn });
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
  // filtro per gruppo nell'elenco: aggiorna solo filtri e righe, il focus resta sul filtro toccato
  "c-gf"(el) {
    const id = el.dataset.id;
    S.gf = id === "all" ? "" : id;
    refreshList(); announceCount();
    const b = $root.querySelector(`[data-act="c-gf"][data-id="${id}"]`);
    if (b) restoreFocus(b);
  },
  "c-open-group"(el) { S.gf = el.dataset.id; S.q = ""; go("#/coach/alunni"); },
  "c-new-tr"() { trainingSheet(null); },
  "c-edit-tr"(el) { trainingSheet(S.meta.trainings.find((t) => t.id === el.dataset.id)); },
  "c-new-group"() { groupSheet(null); },
  "c-edit-group"(el) { groupSheet(S.meta.groups.find((g) => g.id === el.dataset.id)); },
  "c-profile"() {
    const s = cur();
    openSheet({ title: "Profilo", body: `
      <label>Soprannome<input name="name" required maxlength="40" value="${esc(s.name)}"></label>
      ${levelSeg(lvlOf(s) || "base")}
      ${groupSelect(s.group || "")}
      <label>Descrizione (facoltativa)<textarea name="bio" rows="3" maxlength="200" aria-describedby="bioHelp"
        placeholder="Es. Punta al test di livello a primavera">${esc(s.bio)}</textarea></label>
      <p class="muted small" id="bioHelp">La vede anche l'alunno. Niente cognomi, contatti o informazioni sulla salute.</p>
      ${sheetBtns("Salva")}`,
    onSubmit: async (fd) => {
      const s2 = cur(), group = validGroup(fd.get("group"));
      const patch = { name: fd.get("name").trim(), level: normLevel(fd.get("level")) || "base", group, bio: fd.get("bio").trim() };
      const sched = schedFor(S.meta, { ...s2, group });
      if (!sameSched(sched, s2.sched)) patch.sched = sched;
      await be.updateStudent(s2.code, patch);
      toast("Profilo salvato");
    } });
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
    const bm = normMeta(data.meta), useMeta = !S.metaErr && (bm.groups.length || bm.trainings.length) && !S.meta.groups.length && !S.meta.trainings.length;
    if (!confirm(`Nel backup ci sono ${data.students.length} alunni, ${toAdd.length} non presenti ora.${useMeta ? " Ci sono anche gruppi e allenamenti." : ""} Ripristinarli?`)) return;
    const meta = useMeta ? bm : S.meta;
    if (useMeta) { await be.saveMeta(meta); S.meta = meta; }
    const okGroup = (g) => (meta.groups.some((x) => x.id === g) ? g : "");
    for (const { code, ...rest } of toAdd) {
      const st = { ...rest, group: okGroup(rest.group) };
      await be.restoreStudent(code, { ...st, sched: schedFor(meta, st) });
    }
    if (useMeta) await syncSched(meta); // alunni già presenti che erano nei gruppi del backup
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

// ---------------------------------------------------------- gruppi e allenamenti
const validGroup = (g) => (S.meta.groups.some((x) => x.id === g) ? g : "");
const groupSelect = (curG) => S.meta.groups.length ? `<label>Gruppo<select name="group">
  <option value="">Nessun gruppo</option>${S.meta.groups.map((g) => `<option value="${g.id}" ${g.id === curG ? "selected" : ""}>${esc(g.name)}</option>`).join("")}
  </select></label>` : "";

// aggiorna la copia degli allenamenti nel documento di ogni alunno (solo dove cambia, in un'unica scrittura).
// extra: modifiche da applicare insieme, { codice: { group: "" } }.
// Si chiama solo dopo un'azione dell'allenatrice, mai da un aggiornamento dei dati (niente cicli).
async function syncSched(meta, extra = {}) {
  const list = [];
  for (const s of S.students) {
    const patch = { ...(extra[s.code] || {}) };
    const sched = schedFor(meta, { ...s, ...patch });
    if (!sameSched(sched, s.sched)) patch.sched = sched;
    if (Object.keys(patch).length) list.push([s.code, patch]);
  }
  if (list.length) await be.updateMany(list);
  return list.length;
}
async function saveMeta(meta, extra) {
  await be.saveMeta(meta);
  S.meta = meta;
  return syncSched(meta, extra);
}
// gli allenamenti passati da più di 60 giorni si tolgono, così il documento resta piccolo
const pruneOld = (list) => list.filter((t) => t.date >= addDays(-60));

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
      if (!confirm("Eliminare questo allenamento?")) return false;
      await saveMeta({ ...S.meta, trainings: all.filter((x) => x.id !== t.id) });
      return toast("Allenamento eliminato");
    }
    const date = fd.get("date");
    if (!parseDate(date)) { toast("Scegli una data"); return false; }
    const item = { id: t ? t.id : newId(), date, time: fd.get("time") || "", group: validGroup(fd.get("group")),
      place: fd.get("place").trim(), note: fd.get("note").trim() };
    await saveMeta({ ...S.meta, trainings: pruneOld(t ? all.map((x) => (x.id === t.id ? item : x)) : [...all, item]) });
    toast(t ? "Allenamento aggiornato" : "Allenamento aggiunto");
  } });
}

function groupSheet(g) {
  if (g === undefined) return;
  const n = g ? inGroup(g.id) : 0;
  openSheet({ title: g ? "Modifica gruppo" : "Nuovo gruppo", focus: g ? "title" : "input", body: `
    <label>Nome del gruppo<input name="name" required maxlength="30" value="${esc(g && g.name)}" placeholder="Es. Sabato mattina"></label>
    ${g ? `<p class="muted small">${nAlunni(n)} in questo gruppo. Il gruppo di un alunno si sceglie nel suo Profilo.</p>`
      : `<p class="muted small">Dopo, scegli il gruppo nel Profilo di ogni alunno.</p>`}
    ${sheetBtns("Salva")}
    ${g ? delBtn("Elimina gruppo") : ""}`,
  onSubmit: async (fd, sub) => {
    if (sub && sub.name === "del") {
      if (!confirm(`Eliminare il gruppo “${g.name}”? Gli alunni restano, senza gruppo. Gli allenamenti solo per questo gruppo vengono eliminati.`)) return false;
      const extra = Object.fromEntries(S.students.filter((s) => s.group === g.id).map((s) => [s.code, { group: "" }]));
      if (S.gf === g.id) S.gf = "";
      await saveMeta({ groups: S.meta.groups.filter((x) => x.id !== g.id), trainings: S.meta.trainings.filter((t) => t.group !== g.id) }, extra);
      return toast("Gruppo eliminato");
    }
    const name = fd.get("name").trim();
    if (S.meta.groups.some((x) => x.id !== (g && g.id) && norm(x.name) === norm(name))) { toast("Esiste già un gruppo con questo nome"); return false; }
    const groups = g ? S.meta.groups.map((x) => (x.id === g.id ? { ...x, name } : x)) : [...S.meta.groups, { id: newId(), name }];
    await saveMeta({ ...S.meta, groups });
    toast(g ? "Gruppo rinominato" : "Gruppo creato");
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
      if (!confirm(`Eliminare “${x.title}” dalla scheda?`)) return false;
      return be.updateStudent(s.code, { plan: plan.filter((p) => p.id !== x.id) });
    }
    const item = { id: x ? x.id : newId(), title: fd.get("title").trim(), detail: fd.get("detail").trim() };
    await be.updateStudent(s.code, { plan: x ? plan.map((p) => (p.id === x.id ? item : p)) : [...plan, item] });
  } });
}

main();

import { CONFIG } from "./config.js";
import { createBackend, normCode, fmtCode, newId, CODE_LEN } from "./backend.js";
import { CATALOG, CATEGORIES, EXERCISE_IDEAS } from "./catalog.js";

const $root = document.getElementById("app");
const $sheet = document.getElementById("sheet");
const LS_CODE = "pg_my_code";
const STATUS = { todo: "Da iniziare", doing: "In corso", done: "Completato" };
const NEXT = { todo: "doing", doing: "done", done: "todo" };

let be;
let unsub = [];
const S = { coach: null, students: [], student: null };

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
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
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
const LS_DEV = "pg_dev";
const demoBanner = () => {
  if (!be || !be.demo) return "";
  if (be.dev) return `<div class="demo dev"><b>Modalità sviluppo</b>: dati di esempio, solo in questo browser.
    <a href="#" data-act="dev-exit">Esci</a></div>`;
  return `<div class="demo">Modalità demo: i dati restano solo su questo dispositivo.</div>`;
};

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
  window.addEventListener("hashchange", route);
  document.addEventListener("click", onClick);
  route();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

function route() {
  clearSubs();
  closeSheet();
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "coach") routeCoach(parts[1], parts[2] || "progressi");
  else routeStudent();
}
const loading = () => { $root.innerHTML = `<div class="center"><div class="spinner"></div></div>`; };

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
  $root.innerHTML = `${demoBanner()}
  <div class="hero">
    <div class="logo">⛸️</div>
    <h1>${esc(CONFIG.appName)}</h1>
    <p>Inserisci il codice che ti ha mandato la tua allenatrice.</p>
  </div>
  <form class="card" id="codeForm">
    <input id="codeIn" class="code-in" autocomplete="off" autocapitalize="characters"
      placeholder="XXXX-XXXX-XXXX" maxlength="20" inputmode="text">
    ${msg ? `<p class="err">${esc(msg)}</p>` : ""}
    <button class="btn wide" type="submit">Apri la mia scheda</button>
  </form>
  ${be.dev ? `<div class="card"><h3>Entra come alunno di esempio</h3><div class="chips">
      ${be.sampleCodes().map((x) => `<button class="chip" data-act="dev-as" data-code="${x.code}">${esc(x.name)}</button>`).join("")}
    </div></div>`
    : be.demo ? `<p class="hint">Demo: prova il codice <b>DEMO-ALUN-NO23</b></p>` : ""}
  <p class="foot"><a href="#/coach">Sei l'allenatrice?</a></p>`;
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
  $root.innerHTML = `${demoBanner()}
  <header class="top"><div><small>Ciao</small><h1>${esc(s.name)}</h1></div><div class="logo sm">⛸️</div></header>

  <section class="card">
    <div class="sec-h"><h2>La mia scheda</h2><span class="pill">${done}/${plan.length}</span></div>
    ${plan.length ? `<ul class="checks">${plan.map((x) => checkRow(x, s.checks && s.checks[x.id], true)).join("")}</ul>`
      : `<p class="muted">La tua allenatrice non ha ancora preparato la scheda.</p>`}
    ${done ? `<button class="btn ghost wide" data-act="s-reset">Nuova sessione (togli le spunte)</button>` : ""}
  </section>

  <section class="card">
    <div class="sec-h"><h2>I miei progressi</h2><span class="pill">${pct(s)}%</span></div>
    ${progressBar(s)}
    ${progressList(s.progress || [], false)}
  </section>

  <p class="foot"><a href="#" data-act="s-logout">Scollega questo telefono</a></p>`;
}

function checkRow(x, val, interactive) {
  const on = !!val;
  const inner = `<span class="box">${on ? "✓" : ""}</span>
    <span class="txt"><b>${esc(x.title)}</b>${x.detail ? `<small>${esc(x.detail)}</small>` : ""}
    ${on && typeof val === "number" ? `<small class="when">Fatto ${fmtWhen(val)}</small>` : ""}</span>`;
  return `<li>${interactive
    ? `<button class="check ${on ? "on" : ""}" data-act="s-check" data-id="${x.id}" aria-pressed="${on}">${inner}</button>`
    : `<div class="check ${on ? "on" : ""} ro">${inner}</div>`}</li>`;
}

function progressBar(s) {
  return `<div class="bar"><span style="width:${pct(s)}%"></span></div>`;
}

function progressList(items, coach) {
  if (!items.length) return `<p class="muted">${coach ? "Nessun elemento. Aggiungine uno." : "Ancora nessun elemento."}</p>`;
  return CATEGORIES.filter((c) => items.some((i) => (i.cat || "Altro") === c)).map((c) => `
    <h3 class="cat">${esc(c)}</h3>
    <ul class="prog">${items.filter((i) => (i.cat || "Altro") === c).map((i) => `
      <li ${coach ? `data-act="c-edit-prog" data-id="${i.id}" class="tap"` : ""}>
        ${coach ? `<button class="st ${i.status}" data-act="c-cycle" data-id="${i.id}">${STATUS[i.status]}</button>`
                : `<span class="st ${i.status}">${STATUS[i.status]}</span>`}
        <div class="txt"><b>${esc(i.name)}</b>
          ${i.status === "done" && i.date ? `<small>Completato il ${fmtDate(i.date)}</small>` : ""}
          ${i.note ? `<small class="note">${esc(i.note)}</small>` : ""}
        </div>
      </li>`).join("")}</ul>`).join("");
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
  $root.innerHTML = `${demoBanner()}
  <div class="hero"><div class="logo">⛸️</div><h1>Area allenatrice</h1>
    <p>Questo telefono non è ancora abilitato. Non servono email né password.</p></div>
  ${be.demo ? `<div class="card"><button class="btn wide" data-act="c-demo">Entra (demo)</button></div>` : ""}
  <form class="card" id="trForm">
    <h3>Hai già l'app su un altro telefono?</h3>
    <p class="muted small">Sul vecchio telefono apri Impostazioni → “Aggiungi un dispositivo” e scrivi qui il codice (vale 15 minuti).</p>
    <input id="trIn" class="code-in" autocomplete="off" autocapitalize="characters" placeholder="XXXX-XXXX-XXXX" maxlength="20">
    <button class="btn wide" type="submit">Abilita questo telefono</button>
  </form>
  ${uid ? `<div class="card">
    <h3>Prima configurazione</h3>
    <p class="muted small">Solo la prima volta: chi ha creato il progetto Firebase aggiunge questo ID nella raccolta <b>coaches</b> (vedi guida).</p>
    <div class="bigcode small-code">${esc(uid)}</div>
    <button class="btn ghost wide" data-act="c-copy-id" data-id="${esc(uid)}">Copia ID</button>
  </div>` : `<p class="err">${u && u.error ? "Connessione non riuscita. Riprova." : ""}</p>`}
  <p class="foot"><a href="#">← Torna alla schermata alunno</a></p>`;
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
  $root.innerHTML = `${demoBanner()}
  <header class="top"><div><small>Allenatrice</small><h1>I miei alunni</h1></div>
    <button class="icon" data-act="c-settings" title="Impostazioni">⚙</button></header>
  ${list.length ? `<ul class="students">${list.map((s) => {
      const done = checksDone(s), tot = (s.plan || []).length;
      return `<li><a href="#/coach/${s.code}" class="card stu">
        <div class="row"><b>${esc(s.name)}</b><span class="pill">${pct(s)}%</span></div>
        ${progressBar(s)}
        <small class="muted">Scheda: ${done}/${tot} spuntati${s.checksAt && done ? ` · ${fmtWhen(s.checksAt)}` : ""}</small>
      </a></li>`;
    }).join("")}</ul>`
    : `<div class="card"><p class="muted">Nessun alunno. Tocca “+ Alunno” per crearne uno e mandargli l'invito.</p></div>`}
  <button class="fab" data-act="c-new">+ Alunno</button>`;
}

function renderCoachStudent(code, tab) {
  const s = findStudent(code);
  if (!s) { go("#/coach"); return; }
  const tabs = [["progressi", "Progressi"], ["scheda", "Scheda"], ["invito", "Invito"]];
  let body = "";
  if (tab === "progressi") {
    body = `<section class="card">${progressBar(s)}${progressList(s.progress || [], true)}
      <button class="btn wide" data-act="c-add-prog">+ Aggiungi elementi</button></section>`;
  } else if (tab === "scheda") {
    const plan = s.plan || [];
    body = `<section class="card">
      <p class="muted small">Esercizi da fare durante il pattinaggio libero. L'alunno li spunta dal suo telefono.</p>
      ${plan.length ? `<ul class="plan">${plan.map((x, i) => `<li>
          ${checkRow(x, s.checks && s.checks[x.id], false).replace(/^<li>|<\/li>$/g, "")}
          <div class="ops">
            <button class="icon sm" data-act="c-move" data-id="${x.id}" data-d="-1" ${i ? "" : "disabled"}>↑</button>
            <button class="icon sm" data-act="c-move" data-id="${x.id}" data-d="1" ${i < plan.length - 1 ? "" : "disabled"}>↓</button>
            <button class="icon sm" data-act="c-edit-ex" data-id="${x.id}">✎</button>
          </div></li>`).join("")}</ul>` : `<p class="muted">Scheda vuota.</p>`}
      <button class="btn wide" data-act="c-add-ex">+ Aggiungi esercizio</button>
      ${checksDone(s) ? `<button class="btn ghost wide" data-act="c-reset" data-code="${s.code}">Togli tutte le spunte</button>` : ""}
    </section>`;
  } else {
    body = `<section class="card invite">
      <p>Manda questo invito a <b>${esc(s.name)}</b>. Chi ha il link o il codice vede solo questa scheda.</p>
      <div class="bigcode">${fmtCode(s.code)}</div>
      <div class="grid2">
        <button class="btn" data-act="c-wa">WhatsApp</button>
        <button class="btn" data-act="c-mail">Email</button>
        <button class="btn ghost" data-act="c-copy">Copia link</button>
        ${navigator.share ? `<button class="btn ghost" data-act="c-share">Condividi…</button>` : ""}
      </div>
    </section>
    <section class="card">
      <h3>Gestione</h3>
      <button class="btn ghost wide" data-act="c-rename">Rinomina alunno</button>
      <button class="btn ghost wide" data-act="c-regen">Genera un nuovo codice</button>
      <p class="muted small">Il vecchio codice smette di funzionare: utile se è finito in mani sbagliate.</p>
      <button class="btn danger wide" data-act="c-del">Elimina alunno</button>
    </section>`;
  }
  $root.innerHTML = `${demoBanner()}
  <header class="top"><a href="#/coach" class="icon">←</a><div class="grow"><small>Alunno</small><h1>${esc(s.name)}</h1></div></header>
  <nav class="tabs">${tabs.map(([k, l]) => `<a href="#/coach/${code}/${k}" class="${k === tab ? "on" : ""}">${l}</a>`).join("")}</nav>
  ${body}`;
  $root.dataset.code = code;
}

// ---------------------------------------------------------- sheet (modale)
function openSheet(html, onSubmit) {
  $sheet.innerHTML = `<div class="sheet-bg" data-act="close"></div>
    <form class="sheet-panel">${html}</form>`;
  $sheet.hidden = false;
  const f = $sheet.querySelector("form");
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector("[type=submit]");
    if (btn) btn.disabled = true;
    try { if ((await onSubmit(new FormData(f), e.submitter)) !== false) closeSheet(); }
    catch (err) { fail(err); }
    if (btn) btn.disabled = false;
  };
  const first = f.querySelector("input:not([type=checkbox]),textarea");
  if (first) setTimeout(() => first.focus(), 50);
}
function closeSheet() { $sheet.hidden = true; $sheet.innerHTML = ""; }

// ---------------------------------------------------------- azioni
const curCode = () => location.hash.split("/")[2];
const cur = () => findStudent(curCode());

async function onClick(e) {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (el.tagName === "A" && act) e.preventDefault();
  if (act === "c-cycle") e.stopPropagation();
  const fn = ACTIONS[act];
  if (fn) { try { await fn(el); } catch (err) { fail(err); } }
}

const ACTIONS = {
  close: closeSheet,

  // alunno
  async "s-check"(el) {
    const s = S.student, id = el.dataset.id;
    await be.setCheck(s.code, id, s.checks && s.checks[id] ? null : Date.now());
  },
  async "s-reset"() {
    if (confirm("Togliere tutte le spunte per iniziare una nuova sessione?")) await be.resetChecks(S.student.code);
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
    openSheet(`<h2>Impostazioni</h2>
      <button type="button" class="btn ghost wide" data-act="c-transfer">Aggiungi un dispositivo</button>
      <p class="muted small">Per usare l'app su un altro telefono o dopo averlo cambiato.</p>
      <button type="button" class="btn ghost wide" data-act="c-export">Esporta backup</button>
      <label class="btn ghost wide filebtn">Ripristina da backup<input type="file" accept=".json,application/json" id="impIn" hidden></label>
      <p class="muted small">Il backup è un file sul tuo telefono: tienine una copia ogni tanto.</p>
      ${be.dev ? `<button type="button" class="btn ghost wide" data-act="dev-reseed">Rigenera alunni di esempio</button>` : ""}
      <button type="button" class="btn danger wide" data-act="c-remove-dev">Disabilita questo telefono</button>
      <div class="sheet-btns"><button type="button" class="btn" data-act="close">Chiudi</button></div>`, () => {});
    document.getElementById("impIn").onchange = importBackup;
  },
  async "c-transfer"() {
    const t = await be.createTransfer();
    openSheet(`<h2>Aggiungi un dispositivo</h2>
      <p>Sul nuovo telefono apri <b>${esc(location.origin + location.pathname)}#/coach</b> e inserisci:</p>
      <div class="bigcode">${fmtCode(t)}</div>
      <p class="muted small">Vale 15 minuti e una volta sola. Non mandarlo agli alunni.</p>
      <div class="sheet-btns"><button type="button" class="btn" data-act="close">Fatto</button></div>`, () => {});
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
    openSheet(`<h2>Nuovo alunno</h2>
      <label>Soprannome<input name="name" required maxlength="40" placeholder="Es. Giulia B."></label>
      <p class="muted small">Usa solo un nome o un soprannome: niente cognome, email o telefono.
      L'invito lo mandi tu da WhatsApp o email, l'app non salva contatti.</p>
      <div class="sheet-btns"><button type="button" class="btn ghost" data-act="close">Annulla</button>
      <button class="btn" type="submit">Crea</button></div>`,
    async (fd) => {
      const code = await be.createStudent(fd.get("name").trim());
      go(`#/coach/${code}/invito`);
    });
  },

  async "c-cycle"(el) {
    const s = cur();
    const progress = (s.progress || []).map((p) => {
      if (p.id !== el.dataset.id) return p;
      const status = NEXT[p.status];
      return { ...p, status, date: status === "done" ? (p.date || today()) : p.date };
    });
    await be.updateStudent(s.code, { progress });
  },

  "c-edit-prog"(el) {
    const s = cur(), p = (s.progress || []).find((x) => x.id === el.dataset.id);
    if (!p) return;
    openSheet(`<h2>${esc(p.name)}</h2>
      <label>Stato<select name="status">${Object.entries(STATUS).map(([k, l]) =>
        `<option value="${k}" ${k === p.status ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label>Data completamento<input type="date" name="date" value="${esc(p.date)}"></label>
      <label>Note<textarea name="note" rows="3" maxlength="500" placeholder="Cosa migliorare, consigli…">${esc(p.note)}</textarea></label>
      <div class="sheet-btns"><button type="submit" name="del" value="1" class="btn danger" formnovalidate>Elimina</button>
      <button class="btn" type="submit">Salva</button></div>`,
    async (fd, sub) => {
      const s2 = cur();
      if (sub && sub.name === "del") {
        if (!confirm("Eliminare questo elemento?")) return false;
        return be.updateStudent(s2.code, { progress: s2.progress.filter((x) => x.id !== p.id) });
      }
      const status = fd.get("status");
      let date = fd.get("date") || "";
      if (status === "done" && !date) date = today();
      await be.updateStudent(s2.code, {
        progress: s2.progress.map((x) => x.id === p.id ? { ...x, status, date, note: fd.get("note").trim() } : x),
      });
    });
  },

  "c-add-prog"() {
    const s = cur();
    const have = new Set((s.progress || []).map((p) => `${p.cat}|${p.name}`));
    openSheet(`<h2>Aggiungi elementi</h2>
      <div class="scroll">${CATEGORIES.filter((c) => CATALOG[c].length).map((c) => `
        <h3 class="cat">${c}</h3>
        ${CATALOG[c].map((n) => {
          const k = `${c}|${n}`, dis = have.has(k);
          return `<label class="chk ${dis ? "dis" : ""}"><input type="checkbox" name="pick" value="${esc(k)}" ${dis ? "disabled checked" : ""}> ${esc(n)}</label>`;
        }).join("")}`).join("")}
      <h3 class="cat">Personalizzato</h3>
      <div class="row2"><select name="ccat">${CATEGORIES.map((c) => `<option ${c === "Altro" ? "selected" : ""}>${c}</option>`).join("")}</select>
      <input name="cname" maxlength="60" placeholder="Nome elemento"></div></div>
      <div class="sheet-btns"><button type="button" class="btn ghost" data-act="close">Annulla</button>
      <button class="btn" type="submit">Aggiungi</button></div>`,
    async (fd) => {
      const add = fd.getAll("pick").map((k) => { const [cat, name] = k.split("|"); return { cat, name }; });
      const cn = (fd.get("cname") || "").trim();
      if (cn) add.push({ cat: fd.get("ccat"), name: cn });
      if (!add.length) { toast("Seleziona almeno un elemento"); return false; }
      const s2 = cur();
      await be.updateStudent(s2.code, {
        progress: [...(s2.progress || []), ...add.map((a) => ({ id: newId(), ...a, status: "todo", date: "", note: "" }))],
      });
    });
  },

  "c-add-ex"() { exerciseSheet(null); },
  "c-edit-ex"(el) { exerciseSheet((cur().plan || []).find((x) => x.id === el.dataset.id)); },

  async "c-move"(el) {
    const s = cur(), plan = [...(s.plan || [])];
    const i = plan.findIndex((x) => x.id === el.dataset.id), j = i + Number(el.dataset.d);
    if (i < 0 || j < 0 || j >= plan.length) return;
    [plan[i], plan[j]] = [plan[j], plan[i]];
    await be.updateStudent(s.code, { plan });
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
    openSheet(`<h2>Rinomina</h2><label>Soprannome<input name="name" required maxlength="40" value="${esc(s.name)}"></label>
      <div class="sheet-btns"><button type="button" class="btn ghost" data-act="close">Annulla</button>
      <button class="btn" type="submit">Salva</button></div>`,
    (fd) => be.updateStudent(s.code, { name: fd.get("name").trim() }));
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
  openSheet(`<h2>${x ? "Modifica esercizio" : "Nuovo esercizio"}</h2>
    <label>Esercizio<input name="title" required maxlength="80" list="ideas" value="${esc(x && x.title)}" placeholder="Es. Incrociati avanti in cerchio"></label>
    <datalist id="ideas">${EXERCISE_IDEAS.map((i) => `<option value="${esc(i)}">`).join("")}</datalist>
    <label>Dettagli<input name="detail" maxlength="120" value="${esc(x && x.detail)}" placeholder="Es. 5 giri per lato"></label>
    <div class="sheet-btns">${x ? `<button type="submit" name="del" value="1" class="btn danger" formnovalidate>Elimina</button>`
      : `<button type="button" class="btn ghost" data-act="close">Annulla</button>`}
    <button class="btn" type="submit">Salva</button></div>`,
  async (fd, sub) => {
    const s = cur(), plan = [...(s.plan || [])];
    if (sub && sub.name === "del") {
      if (!confirm("Eliminare questo esercizio?")) return false;
      return be.updateStudent(s.code, { plan: plan.filter((p) => p.id !== x.id) });
    }
    const item = { id: x ? x.id : newId(), title: fd.get("title").trim(), detail: fd.get("detail").trim() };
    await be.updateStudent(s.code, { plan: x ? plan.map((p) => (p.id === x.id ? item : p)) : [...plan, item] });
  });
}

main();

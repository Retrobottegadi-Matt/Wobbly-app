// Pagina di riferimento del design system — raggiungibile solo in modalità sviluppo: ?dev → #/design
// Ogni elemento riporta il nome reale del token o della classe, così si può chiedere "cambia --pink" o ".btn.ghost".

const LS_PREFS = "pg_ds_prefs";
const COLORS = ["--bg", "--surface", "--surface-2", "--ink", "--muted", "--line", "--line-strong",
  "--yellow", "--pink", "--lilac", "--sage", "--sky", "--danger-bg", "--danger-ink", "--focus"];

// coppie (testo, sfondo, soglia WCAG): 4.5 per testo normale, 3 per elementi UI / testo grande
const PAIRS = [
  ["--ink", "--bg", 4.5, "Testo su sfondo"], ["--ink", "--surface", 4.5, "Testo su carta"],
  ["--ink", "--yellow", 4.5, "Testo su giallo"], ["--ink", "--pink", 4.5, "Testo su rosa"],
  ["--ink", "--lilac", 4.5, "Testo su lilla"], ["--ink", "--sage", 4.5, "Testo su salvia"],
  ["--ink", "--sky", 4.5, "Testo su azzurro"], ["--muted", "--bg", 4.5, "Testo secondario su sfondo"],
  ["--muted", "--surface", 4.5, "Testo secondario su carta"], ["--ink-on", "--ink", 4.5, "Bottone primario"],
  ["--danger-ink", "--danger-bg", 4.5, "Bottone elimina"], ["--line-strong", "--bg", 3, "Bordo dei campi"],
  ["--focus", "--bg", 3, "Anello di focus"], ["--ink", "--surface-2", 4.5, "Testo su riquadro"],
];

const rgbOf = (cssVar) => {
  const t = document.createElement("span");
  t.style.color = `var(${cssVar})`;
  document.body.appendChild(t);
  const m = getComputedStyle(t).color.match(/[\d.]+/g).map(Number);
  t.remove();
  return m;
};
const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(rgbOf(a)), lum(rgbOf(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const toHex = (v) => {
  const [r, g, b] = rgbOf(v);
  return "#" + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");
};
const cssVal = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function loadPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(LS_PREFS) || "{}"); } catch { /* ignora */ }
  applyPrefs(p);
  return p;
}
function applyPrefs(p) {
  const r = document.documentElement;
  p.text ? r.setAttribute("data-text", "large") : r.removeAttribute("data-text");
  p.contrast ? r.setAttribute("data-contrast", "more") : r.removeAttribute("data-contrast");
  p.motion ? r.setAttribute("data-motion", "reduce") : r.removeAttribute("data-motion");
  Object.entries(p.vars || {}).forEach(([k, v]) => r.style.setProperty(k, v));
}
function savePrefs(p) { try { localStorage.setItem(LS_PREFS, JSON.stringify(p)); } catch { /* ignora */ } }

export function renderDesign($root) {
  const prefs = loadPrefs();
  prefs.vars = prefs.vars || {};

  const contrastRows = () => PAIRS.map(([fg, bg, min, label]) => {
    const r = ratio(fg, bg), ok = r >= min;
    return `<tr><td>${esc(label)}<br><code>${fg}</code> su <code>${bg}</code></td>
      <td style="background:var(${bg});color:var(${fg});padding:.4rem .6rem;font-weight:700">Aa</td>
      <td class="${ok ? "ok" : "ko"}">${r.toFixed(2)}:1 ${ok ? "✓" : "✗"} <small>min ${min}</small></td></tr>`;
  }).join("");

  const tokenRows = COLORS.map((v) => `<div class="tok"><span class="sw" style="background:var(${v})" aria-hidden="true"></span>
    <div class="ed"><div><code>${v}</code><small data-hex="${v}">${toHex(v)}</small></div>
      <input type="color" data-var="${v}" value="${toHex(v)}" aria-label="Modifica ${v}"></div></div>`).join("");

  $root.innerHTML = `<div class="ds">
  <header class="top"><a href="#/coach" class="icon" aria-label="Esci dalla pagina design"><span aria-hidden="true">←</span></a>
    <div class="grow"><small>Solo modalità sviluppo</small><h1>Design system</h1></div></header>
  <p class="muted">Ogni voce mostra il nome reale del token o della classe. Per una modifica precisa scrivi, ad esempio:
    “<code>--pink</code> più caldo” o “<code>.btn.ghost</code> con bordo più sottile”.</p>

  <section class="card"><h2>Accessibilità (anteprima)</h2>
    <p class="muted small">Riferimento: WCAG 2.2 AA e linee guida Apple (testo dinamico, contrasto, riduzione movimento, VoiceOver, target ≥ 44 pt).
    Su iPhone queste impostazioni arrivano già da Impostazioni → Accessibilità.</p>
    <div class="toggles">
      <label><input type="checkbox" data-pref="text" ${prefs.text ? "checked" : ""}> Testo grande <code>[data-text=large]</code></label>
      <label><input type="checkbox" data-pref="contrast" ${prefs.contrast ? "checked" : ""}> Contrasto elevato <code>[data-contrast=more]</code></label>
      <label><input type="checkbox" data-pref="motion" ${prefs.motion ? "checked" : ""}> Riduci movimento <code>[data-motion=reduce]</code></label>
    </div></section>

  <h2>Colori (modificabili dal vivo)</h2>
  <section class="card">${tokenRows}
    <div class="row"><button class="btn ghost" data-ds="copy">Copia CSS modificato</button>
      <button class="btn ghost" data-ds="reset">Ripristina</button></div></section>

  <h2>Contrasto calcolato</h2>
  <section class="card"><table id="dsContrast" style="width:100%;border-collapse:collapse">${contrastRows()}</table></section>

  <h2>Tipografia</h2>
  <section class="card">
    <div class="spec"><code>--fs-display</code><div style="font-size:var(--fs-display);font-weight:800;line-height:1.1">Pattinaggio</div></div>
    <div class="spec"><code>h1 · --fs-h1</code><h1>I miei alunni</h1></div>
    <div class="spec"><code>h2 · --fs-h2</code><h2>La mia scheda</h2></div>
    <div class="spec"><code>body · --fs-body</code><p style="margin:0">Esercizi da fare durante il pattinaggio libero.</p></div>
    <div class="spec"><code>small · --fs-small</code><small>Fatto oggi 18:30</small></div>
    <div class="spec"><code>.cat</code><h3 class="cat" style="margin:0">Salti</h3></div></section>

  <h2>Forme</h2>
  <section class="card">
    <div class="ed"><label for="rR">Raggio carte <code>--r</code></label><input id="rR" type="range" min="8" max="40" value="${parseInt(cssVal("--r"))}" data-range="--r"></div>
    <div class="ed"><label for="rL">Raggio pannelli <code>--r-lg</code></label><input id="rL" type="range" min="8" max="48" value="${parseInt(cssVal("--r-lg"))}" data-range="--r-lg"></div>
    <p class="muted small">Pill: <code>--r-pill</code> · target minimo: <code>--target</code> (2.75rem = 44px)</p></section>

  <h2>Bottoni</h2>
  <section class="card">
    <div class="spec"><code>.btn</code><br><button class="btn" type="button">Salva</button></div>
    <div class="spec"><code>.btn.ghost</code><br><button class="btn ghost" type="button">Annulla</button></div>
    <div class="spec"><code>.btn.danger</code><br><button class="btn danger" type="button">Elimina alunno</button></div>
    <div class="spec"><code>.btn:disabled</code><br><button class="btn" type="button" disabled>Non disponibile</button></div>
    <div class="spec"><code>.icon</code> · <code>.icon.sm</code> · <code>:disabled</code><div class="row">
      <button class="icon" type="button" aria-label="Impostazioni"><span aria-hidden="true">⚙</span></button>
      <button class="icon sm" type="button" aria-label="Modifica"><span aria-hidden="true">✎</span></button>
      <button class="icon sm" type="button" aria-label="Su" disabled><span aria-hidden="true">↑</span></button></div></div>
    <div class="spec"><code>.fab</code> (fisso in basso nelle schermate reali)<br>
      <button class="btn" type="button" style="border-radius:999px;font-weight:800">+ Alunno</button></div>
    <div class="spec"><code>.chip</code><div class="chips"><button class="chip" type="button">Giulia</button><button class="chip" type="button">Marco</button>
      <button class="chip" type="button">Sofia</button><button class="chip" type="button">Luca</button></div></div></section>

  <h2>Carte</h2>
  <div class="card"><code>.card</code><p class="muted" style="margin:.3rem 0 0">Carta bianca standard.</p></div>
  <div class="card yellow"><code>.card.yellow</code></div>
  <div class="card pink"><code>.card.pink</code></div>
  <div class="card lilac"><code>.card.lilac</code></div>
  <div class="card sage"><code>.card.sage</code></div>
  <div class="card sky"><code>.card.sky</code></div>
  <div class="card"><div class="sec-h"><h2>Titolo sezione <code>.sec-h</code></h2><span class="pill">3/5</span></div>
    <code>.pill</code><div class="bar" role="progressbar" aria-valuenow="60" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso 60%"><span style="width:60%"></span></div><code>.bar</code></div>

  <h2>Scheda: riga con spunta</h2>
  <section class="card"><ul class="checks">
    <li><div class="check ro"><span class="box"></span><span class="txt"><b>Spirale</b><small>Da fare</small></span></div></li>
    <li><div class="check on ro"><span class="box" aria-hidden="true">✓</span><span class="txt"><b>Mohawk</b><small class="when">Fatto oggi 18:30</small></span></div></li></ul>
    <code>.check</code> · <code>.check.on</code></section>

  <h2>Stati dei progressi</h2>
  <section class="card"><div class="row">
    <span class="st todo">Da iniziare</span><span class="st doing">In corso</span><span class="st done">Completato</span></div>
    <code>.st.todo</code> · <code>.st.doing</code> · <code>.st.done</code>
    <p class="muted small">Lo stato non è mai solo un colore: c'è sempre l'etichetta di testo e il bordo.</p></section>

  <h2>Navigazione</h2>
  <section class="card"><nav class="tabs" aria-label="Esempio tab"><a href="#/design" class="on" aria-current="page">Progressi</a><a href="#/design">Scheda</a><a href="#/design">Invito</a></nav>
    <code>.tabs a</code> · <code>.tabs a.on</code></section>

  <h2>Campi</h2>
  <section class="card"><label for="dsIn" class="muted small">Codice invito <code>.code-in</code></label>
    <input id="dsIn" class="code-in" value="ABCD-EFGH-JKMN" aria-describedby="dsInH"><small id="dsInH">12 caratteri.</small>
    <div class="bigcode">ABCD-EFGH-JKMN</div><code>.bigcode</code></section>

  <h2>Pannello e avviso</h2>
  <section class="card"><div class="row"><button class="btn" data-ds="sheet" type="button">Apri pannello <code style="color:#14110f">.sheet-panel</code></button>
    <button class="btn ghost" data-ds="toast" type="button">Mostra avviso <code>.toast</code></button></div>
    <div class="demo" style="margin-top:.75rem"><code>.demo</code> banner demo</div>
    <div class="demo dev"><code>.demo.dev</code> banner sviluppo</div></section>
  </div>`;

  const refresh = () => {
    document.getElementById("dsContrast").innerHTML = contrastRows();
    $root.querySelectorAll("[data-hex]").forEach((e) => { e.textContent = toHex(e.dataset.hex); });
    $root.querySelectorAll(".tok .sw").forEach((e, i) => { e.style.background = `var(${COLORS[i]})`; });
  };

  $root.onchange = $root.oninput = (e) => {
    const t = e.target;
    if (t.dataset.pref) { prefs[t.dataset.pref] = t.checked; applyPrefs(prefs); savePrefs(prefs); refresh(); }
    if (t.dataset.var) { prefs.vars[t.dataset.var] = t.value; document.documentElement.style.setProperty(t.dataset.var, t.value); savePrefs(prefs); refresh(); }
    if (t.dataset.range) { const v = t.value + "px"; prefs.vars[t.dataset.range] = v; document.documentElement.style.setProperty(t.dataset.range, v); savePrefs(prefs); }
  };
  $root.onclick = async (e) => {
    const a = e.target.closest("[data-ds]");
    if (!a) return;
    if (a.dataset.ds === "reset") {
      Object.keys(prefs.vars).forEach((k) => document.documentElement.style.removeProperty(k));
      prefs.vars = {}; savePrefs(prefs); renderDesign($root);
    }
    if (a.dataset.ds === "copy") {
      const css = ":root {\n" + Object.entries(prefs.vars).map(([k, v]) => `  ${k}: ${v};`).join("\n") + "\n}";
      try { await navigator.clipboard.writeText(css); window.dispatchEvent(new CustomEvent("ds-toast", { detail: "CSS copiato" })); }
      catch { window.dispatchEvent(new CustomEvent("ds-toast", { detail: css })); }
    }
    if (a.dataset.ds === "toast") window.dispatchEvent(new CustomEvent("ds-toast", { detail: "Salvato" }));
    if (a.dataset.ds === "sheet") window.dispatchEvent(new CustomEvent("ds-sheet"));
  };
}

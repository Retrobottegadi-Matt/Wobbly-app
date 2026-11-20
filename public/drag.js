// Riordino "tieni premuto e trascina", come le app su iPhone e iPad.
// Liste: <ul data-drag="tipo" data-group="..."> con <li data-id="...">.
// Gli elementi con [data-nodrag] (es. il cerchio dello stato, le frecce) non avviano il trascinamento.
// Alternativa senza trascinamento (WCAG 2.5.7, VoiceOver): modalità "Riordina" con le frecce.
const HOLD = 420;  // ms di pressione prima di "sollevare" l'elemento
const SLOP = 10;   // px di movimento consentiti durante la pressione (oltre: è uno scorrimento)
const EDGE = 70;   // px dal bordo dello schermo in cui la pagina scorre da sola

let press = null, drag = null, suppressUntil = 0, raf = 0;
export const isDragging = () => !!drag;

export function initDrag(root, { onDrop, onEnd }) {
  root.addEventListener("pointerdown", (e) => {
    if (e.button > 0 || drag || e.target.closest("[data-nodrag]")) return;
    const li = e.target.closest("[data-drag] > li");
    if (!li || !root.contains(li) || li.parentElement.children.length < 2) return;
    press = { li, x: e.clientX, y: e.clientY, pid: e.pointerId, timer: setTimeout(start, HOLD) };
  });
  document.addEventListener("pointermove", (e) => {
    if (drag && e.pointerId === drag.pid) {
      drag.lastY = e.clientY;
      if (Math.abs(e.clientY - drag.liftY) > SLOP) drag.moved = true;
      update(); return;
    }
    if (press && e.pointerId === press.pid && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) cancelPress();
  });
  document.addEventListener("pointerup", (e) => {
    if (drag && e.pointerId === drag.pid) finish(true);
    else cancelPress();
  });
  document.addEventListener("pointercancel", () => { if (drag) finish(false); cancelPress(); });
  // durante il trascinamento la pagina non deve scorrere sotto il dito (iOS: serve un listener non passivo)
  document.addEventListener("touchmove", (e) => { if (drag && e.cancelable) e.preventDefault(); }, { passive: false });
  document.addEventListener("contextmenu", (e) => { if (press || drag) e.preventDefault(); });
  // dopo un trascinamento (o una pressione lunga senza movimento) il tocco non deve aprire la modifica
  document.addEventListener("click", (e) => {
    if (drag || Date.now() < suppressUntil) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  function cancelPress() { if (press) { clearTimeout(press.timer); press = null; } }

  function start() {
    const { li, y, pid } = press;
    press = null;
    const ul = li.parentElement, items = [...ul.children];
    const sy = window.scrollY;
    const rects = items.map((el) => { const r = el.getBoundingClientRect(); return { top: r.top + sy, h: r.height }; });
    const from = items.indexOf(li);
    const gap = items.length > 1 ? Math.max(0, rects[1].top - (rects[0].top + rects[0].h)) : 0;
    drag = { li, ul, items, rects, from, to: from, pid, startY: y + sy, liftY: y, lastY: y, moved: false, shift: rects[from].h + gap };
    ul.classList.add("sorting");
    li.classList.add("dragging");
    if (navigator.vibrate) navigator.vibrate(12);
    tick();
  }

  // posizione dell'elemento sollevato e spostamento degli altri per fargli spazio
  function update() {
    const { li, items, rects, from, startY, lastY, shift } = drag;
    const y = lastY + window.scrollY;
    li.style.transform = `translateY(${y - startY}px)`;
    const center = rects[from].top + rects[from].h / 2 + (y - startY);
    const to = items.filter((_, i) => i !== from && rects[i].top + rects[i].h / 2 < center).length;
    drag.to = to;
    items.forEach((el, i) => {
      if (i === from) return;
      const dy = i < from ? (i >= to ? shift : 0) : (i - 1 < to ? -shift : 0);
      el.style.transform = dy ? `translateY(${dy}px)` : "";
    });
  }

  // scorrimento automatico vicino ai bordi dello schermo, solo dopo che il dito si è mosso
  // (altrimenti tenere premuto fermo vicino al bordo farebbe scorrere e riordinare da solo)
  function tick() {
    if (!drag) return;
    if (!drag.moved) { raf = requestAnimationFrame(tick); return; }
    const dock = document.querySelector(".dock"); // il bordo basso utile è sopra la barra in basso
    const y = drag.lastY, h = dock ? dock.getBoundingClientRect().top : window.innerHeight;
    const v = y < EDGE ? -Math.ceil((EDGE - y) / 6) : y > h - EDGE ? Math.ceil((y - (h - EDGE)) / 6) : 0;
    if (v) { window.scrollBy(0, v); update(); }
    raf = requestAnimationFrame(tick);
  }

  function finish(commit) {
    const { li, ul, items, from, to } = drag;
    cancelAnimationFrame(raf);
    drag = null;
    items.forEach((el) => { el.style.transform = ""; });
    ul.classList.remove("sorting");
    li.classList.remove("dragging");
    suppressUntil = Date.now() + 400;
    if (commit && to !== from) {
      const others = items.filter((el) => el !== li);
      ul.insertBefore(li, others[to] || null); // subito al suo posto, prima che arrivino i dati salvati
      const ids = [...ul.children].map((el) => el.dataset.id);
      onDrop(ul.dataset.drag, ul.dataset.group || "", ids, li.dataset.id, to);
    }
    if (onEnd) onEnd();
  }
}

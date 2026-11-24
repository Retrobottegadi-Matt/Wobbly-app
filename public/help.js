// Aiuto "?": per ogni pagina, cosa sono gli elementi, a cosa servono e come si usano.
// Ogni voce è [chiave data-help, icona, titolo, testo]. Il pannello mostra tutte le voci (percorso accessibile principale);
// "Mostrami sulla pagina" fa una visita guidata che evidenzia uno per uno gli elementi presenti.
import { icon } from "./icons.js";

const NAV_C = ["nav", "home", "Barra in basso", "Porta alle tre pagine: la casetta è Oggi, le due persone sono gli Alunni, il foglio con gli anelli è il Calendario. Il numero sopra la casetta dice quante richieste aspettano una tua risposta."];
const HELP_B = ["help", "help", "Pulsante ?", "Apre questa guida. C'è in ogni pagina e spiega quello che vedi."];
const SET_C = ["settings", "settings", "Impostazioni", "Testo più grande e colori, backup dei dati, aggiungere un altro telefono."];

export const HELP = {
  "c-home": [
    ["stats", "chart", "In sintesi", "Quanti alunni hai, la media dei loro progressi e quanti hanno usato la scheda negli ultimi 7 giorni. «Tutte le statistiche» apre la pagina con tutti i numeri."],
    ["inbox", "user", "Da confermare", "Le richieste di lezione privata e le disdette degli alunni. Tocca Conferma o Rifiuta: l'alunno vede la risposta nella sua app."],
    ["feat", "calendar", "Prossimo appuntamento", "Il primo allenamento o lezione in programma. Toccalo per cambiarlo o eliminarlo."],
    ["next", "clock", "Poi in calendario", "Gli appuntamenti successivi. «Vedi tutti» apre il calendario."],
    ["fab", "plus", "Pulsante +", "Aggiunge un allenamento di gruppo o una lezione privata."],
    NAV_C, SET_C, HELP_B,
  ],
  "c-stats": [
    ["back", "back", "Freccia indietro", "Torna alla pagina Oggi."],
    ["stats", "chart", "In sintesi", "Alunni, media dei progressi, elementi completati nell'ultimo mese e chi ha usato la scheda in settimana."],
    ["liv", "chart", "Progressi per livello", "La media dei progressi degli alunni di ogni livello."],
    ["top", "done", "Più elementi completati", "Chi è andato più avanti negli ultimi 30 giorni."],
    ["doing", "doing", "Elementi in corso", "Gli elementi che più alunni stanno imparando adesso: utile per preparare gli allenamenti."],
    ["idle", "clock", "Da seguire", "Chi ha una scheda ma non la usa da due settimane. Tocca per aprire il suo profilo."],
    ["privs", "calendar", "Lezioni private", "Quante lezioni sono prenotate, quanti orari sono liberi e le ore di lezione nelle prossime settimane."],
    HELP_B,
  ],
  "c-alunni": [
    ["filters", "user", "Lezioni private", "Mostra solo chi fa lezioni private. «Tutti» li mostra di nuovo tutti."],
    ["search", "search", "Cerca", "Scrivi una parte del nome. Non servono accenti né maiuscole."],
    ["list", "users", "Alunni divisi per gruppo", "Tocca un alunno per vedere profilo, progressi, scheda e invito. Il numero a destra è quanto ha completato. «Modifica» accanto a un gruppo cambia il nome e chi ne fa parte."],
    ["groups", "group", "Nuovo gruppo", "Scegli il nome e spunta gli alunni che ne fanno parte, tutto nello stesso pannello."],
    ["fab", "plus", "Pulsante +", "Aggiunge un alunno. Subito dopo puoi mandargli l'invito su WhatsApp."],
    NAV_C, SET_C, HELP_B,
  ],
  "c-cal": [
    ["inbox", "user", "Da confermare", "Richieste di lezione e disdette: rispondi con un tocco."],
    ["view", "calendar", "Mese o Elenco", "«Mese» mostra il calendario, «Elenco» tutti gli appuntamenti in fila, giorno per giorno."],
    ["month", "calendar", "Calendario del mese", "Tocca un giorno per vedere cosa c'è. Le frecce cambiano mese. Oggi ha il bordo, il giorno scelto è scuro."],
    ["legend", "todo", "Simboli", "Quadrato: allenamento di gruppo. Cerchio pieno: lezione prenotata. Cerchio vuoto: orario libero. Puntino in alto: c'è una richiesta."],
    ["day", "clock", "Il giorno scelto", "Gli appuntamenti di quel giorno. Toccane uno per cambiarlo; su un orario con richieste puoi confermare chi preferisci."],
    ["fab", "plus", "Pulsante +", "Aggiunge un appuntamento nel giorno scelto: un allenamento oppure una o più lezioni private, anche ogni settimana."],
    NAV_C, SET_C, HELP_B,
  ],
  "c-stu-profilo": [
    ["back", "back", "Freccia indietro", "Torna all'elenco degli alunni."],
    ["tabs", "user", "Sezioni dell'alunno", "Profilo, Progressi, Scheda e Invito. Tocca per passare da una all'altra."],
    ["profile", "user", "Profilo", "Nome, livello, gruppo e descrizione. Si cambiano con il pulsante a matita in basso."],
    ["lessons", "calendar", "Lezioni private", "Le sue lezioni prenotate e le richieste. «Prenota una lezione» la fissa subito, senza aspettare una sua richiesta."],
    ["agenda", "clock", "Prossimi allenamenti", "Gli allenamenti del suo gruppo e quelli per tutti."],
    ["fab", "edit", "Pulsante matita", "Modifica nome, livello, gruppo, lezioni private e descrizione."],
    HELP_B,
  ],
  "c-stu-progressi": [
    ["tabs", "user", "Sezioni dell'alunno", "Profilo, Progressi, Scheda e Invito."],
    ["sum", "chart", "Riepilogo", "Quanti elementi ha completato sul totale."],
    ["list", "doing", "Elementi tecnici", "Tocca il cerchio a destra per cambiare lo stato: da iniziare, in corso, completato. Tocca il nome per note e data. Tieni premuto per spostarlo."],
    ["fab", "plus", "Pulsante +", "Aggiunge elementi dal catalogo del suo livello, o uno scritto da te."],
    HELP_B,
  ],
  "c-stu-scheda": [
    ["tabs", "user", "Sezioni dell'alunno", "Profilo, Progressi, Scheda e Invito."],
    ["list", "check", "Esercizi", "Gli esercizi da fare durante il pattinaggio libero. L'alunno li spunta dal suo telefono e tu vedi quando. Tocca un esercizio per cambiarlo."],
    ["fab", "plus", "Pulsante +", "Aggiunge un esercizio alla scheda."],
    HELP_B,
  ],
  "c-stu-invito": [
    ["tabs", "user", "Sezioni dell'alunno", "Profilo, Progressi, Scheda e Invito."],
    ["invite", "chat", "Invito", "Manda il link su WhatsApp o per email. L'alunno lo apre e vede solo la sua scheda. L'app non salva numeri né indirizzi."],
    ["manage", "refresh", "Gestione", "Un nuovo codice blocca quello vecchio. «Elimina alunno» cancella tutti i suoi dati."],
    ["fab", "link", "Pulsante link", "Copia il link dell'invito, da incollare dove vuoi."],
    HELP_B,
  ],
  "s-oggi": [
    ["feat", "calendar", "Prossimo appuntamento", "Il tuo prossimo allenamento o lezione privata, con ora e luogo."],
    ["next", "clock", "Poi in calendario", "Gli appuntamenti successivi. Tocca una lezione privata per vederla o disdirla."],
    ["priv", "user", "Lezioni private", "«Chiedi una lezione» mostra gli orari liberi: scegline uno e aspetta la conferma. Puoi disdire fino a 24 ore prima."],
    ["plan", "check", "La tua scheda", "Gli esercizi da fare durante il pattinaggio libero. Toccane uno per spuntarlo quando l'hai fatto."],
    ["nav", "home", "Barra in basso", "La casetta è Oggi, il grafico sono i Progressi, la persona è il tuo Profilo. Tocca per cambiare pagina."],
    HELP_B,
  ],
  "s-progressi": [
    ["sum", "chart", "Riepilogo", "Quanti elementi hai completato sul totale."],
    ["list", "doing", "Elementi tecnici", "Il simbolo a destra dice a che punto sei: cerchio tratteggiato da iniziare, mezzo pieno in corso, con la spunta completato."],
    ["nav", "home", "Barra in basso", "La casetta è Oggi, il grafico sono i Progressi, la persona è il tuo Profilo."],
    HELP_B,
  ],
  "s-profilo": [
    ["profile", "user", "I tuoi dati", "Nome e livello li sceglie la tua allenatrice."],
    ["settings", "a11y", "Impostazioni", "Testo più grande, colori e tema. «Scollega» toglie la scheda da questo telefono."],
    ["nav", "home", "Barra in basso", "La casetta è Oggi, il grafico sono i Progressi, la persona è il tuo Profilo."],
    HELP_B,
  ],
};

// ---------------------------------------------------------- visita guidata
// Una sagoma evidenzia l'elemento e un fumetto lo spiega. Gli elementi si cercano di nuovo a ogni passo
// e dopo ogni ridisegno (i dati possono arrivare mentre la guida è aperta).
let T = null;
export const tourOn = () => !!T;

export function startTour(root, steps, opener) {
  endTour(false);
  const box = document.createElement("div");
  box.id = "tour";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", "tourT");
  box.innerHTML = `<div class="tour-hole" aria-hidden="true"></div><div class="tour-tip"></div>`;
  document.body.appendChild(box);
  root.inert = true;
  T = { root, steps, i: 0, box, opener };
  addEventListener("resize", tourPlace);
  addEventListener("scroll", tourPlace, { passive: true });
  show();
}

function target() {
  return T && T.root.querySelector(`[data-help="${T.steps[T.i][0]}"]`);
}

function show() {
  const [, ic, title, text] = T.steps[T.i], n = T.steps.length, last = T.i === n - 1;
  T.box.querySelector(".tour-tip").innerHTML = `
    <div class="tour-top"><span class="help-ic" aria-hidden="true">${icon(ic)}</span><p class="tour-n">${T.i + 1} di ${n}</p>
      <button type="button" class="icon" data-act="tour-end" aria-label="Chiudi la guida">${icon("close")}</button></div>
    <h2 id="tourT" tabindex="-1">${title}</h2><p>${text}</p>
    <div class="sheet-btns">${T.i ? `<button type="button" class="btn ghost" data-act="tour-prev">Indietro</button>` : `<span></span>`}
      <button type="button" class="btn" data-act="tour-next">${last ? "Fine" : "Avanti"}</button></div>`;
  const el = target();
  if (el && el.closest(".dock") === null) el.scrollIntoView({ block: "center" });
  tourPlace();
  T.box.querySelector("#tourT").focus({ preventScroll: true });
}

export function tourPlace() {
  if (!T) return;
  const el = target(), hole = T.box.querySelector(".tour-hole"), tip = T.box.querySelector(".tour-tip");
  if (!el) { hole.style.cssText = "opacity:0"; tip.style.top = ""; tip.style.bottom = "1rem"; return; }
  const r = el.getBoundingClientRect(), pad = 6;
  hole.style.cssText = `top:${r.top - pad}px;left:${r.left - pad}px;width:${r.width + 2 * pad}px;height:${r.height + 2 * pad}px`;
  const th = tip.offsetHeight, vh = innerHeight, below = r.bottom + pad + 12;
  // sotto l'elemento se c'è posto, altrimenti sopra; sempre dentro lo schermo
  let top = below + th <= vh - 8 ? below : r.top - pad - 12 - th;
  top = Math.max(8, Math.min(top, vh - th - 8));
  tip.style.bottom = ""; tip.style.top = `${top}px`;
}

export function tourStep(d) {
  if (!T) return;
  const i = T.i + d;
  if (i >= T.steps.length) return endTour();
  if (i < 0) return;
  T.i = i; show();
}

export function endTour(focusBack = true) {
  if (!T) return;
  const { box, root, opener } = T;
  T = null;
  box.remove();
  root.inert = false;
  removeEventListener("resize", tourPlace);
  removeEventListener("scroll", tourPlace);
  if (focusBack) {
    const el = opener && document.contains(opener) ? opener : root.querySelector('[data-act="help"]');
    if (el) el.focus({ preventScroll: true });
  }
}

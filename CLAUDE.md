# Pattinaggio – app progressi e schede alunni (handoff)

Web app (PWA) per telefono, pensata per un'allenatrice di pattinaggio sul ghiaccio e i suoi alunni (circa 30).
Lingua dell'interfaccia e dei testi: **italiano**. L'utente (Matt) è un alunno e sviluppa l'app per la sua allenatrice.

## Requisiti dell'utente (vincolanti)
- **Costo zero**, deve girare su telefono (Android e iPhone). Niente store: si installa con "Aggiungi a schermata Home".
- **Privacy e nessuna risorsa da gestire**: l'utente ha rifiutato un server in casa (costo e manutenzione).
- **Nessuna email e nessuna password salvate**, né per gli alunni né per l'allenatrice.
- L'**allenatrice vede tutti** gli alunni; ogni **alunno vede solo la propria scheda**.
- **Invito via WhatsApp o email**, ma i contatti **non** devono comparire né essere salvati nell'app. Si usa un codice invito.
- Progressi: elementi tecnici con **stato + note + data**. Scheda: **esercizi da fare durante il pattinaggio libero**, che **l'alunno spunta**.
- L'utente ha detto che "l'applicazione iniziale va bene" e che voleva solo ridurre la dipendenza da servizi esterni.
- Novembre 2026: l'utente vuole un'app "semplice e intuitiva, con le informazioni di OS27" (linee guida Apple attuali) e testi curati: brevi, diretti, in italiano naturale.
- 20 novembre 2026: l'utente ha mandato tre immagini di riferimento (illustrazione a grana blu/giallo/pesca, poster "Wild Flower" blu cobalto e crema, app didattica con carte colorate, numeri grossi e barra nera a capsula). Lo stile v10 le traduce senza illustrazioni né font esterni; sostituisce i "pastelli rifiniti".
- 22 novembre 2026: lezioni private con prenotazione. Scelte dell'utente: **richiesta + conferma** (l'allenatrice pubblica orari liberi, l'alunno chiede, lei conferma o rifiuta), **tutti gli alunni possono fare privati** (interruttore nel Profilo, anche se sono in un gruppo), **disdetta dell'alunno fino a 24 ore prima**, **niente pacchetti/conteggio lezioni** per ora.
- 24 novembre 2026: l'app deve essere facile anche per chi non è pratico di tecnologia. Richieste: meno passaggi, un pulsante "?" che spiega gli elementi di ogni pagina, lezioni private più complete (appuntamenti passati cancellati da soli, vista a calendario), area allenatrice completa. **Prima solo in modalità sviluppo**: l'utente conferma, poi si passa all'app per tutti.
- 26 novembre 2026: nuove immagini (app con pervinca, carte bianche e pulsanti neri a pillola; agenda con giorni colorati e data grande; icona con sfumatura arancio-rosa-azzurro e scintilla bianca) → stile v11 nella nuova versione. Richiesta: sticker di incoraggiamento (stellina, ok, continua così…) mandati dall'allenatrice e animati nell'app dell'alunno.
- Novembre 2026: l'utente ha chiesto UX e UI migliori. Ha scelto lo stile "pastelli rifiniti" (toni tenui, bordi sottili, un accento per volta), una Home per l'allenatrice (prossimi allenamenti + numeri riassuntivi), gruppi di alunni (per filtrare l'elenco e collegare gli allenamenti), date degli allenamenti per gruppo e un profilo alunno (nome, livello, gruppo, descrizione facoltativa) compilato dall'allenatrice.

## Decisioni prese (e perché)
- **Firebase (piano Spark) solo come database Firestore** e **GitHub Pages per pubblicare l'app**.
  - Supabase e Appwrite sono stati scartati: sul piano gratuito i progetti **vanno in pausa dopo 7 giorni di inattività** (problema con le pause natalizie ed estive). Appwrite cancella i progetti in pausa dopo 90 giorni.
  - Spark non richiede carta di credito e non può generare costi: al superamento della quota si blocca e basta.
  - Firebase Hosting non viene usato, per non dipendere da prodotti che potrebbero richiedere il piano Blaze.
- **Nessun login per gli alunni**: il codice di 12 caratteri (alfabeto senza 0/O/1/I/L, circa 59 bit) è l'ID del documento `students/{code}`. Il link d'invito è `?c=CODE`.
- **Allenatrice senza email e password**: usa **Firebase Anonymous Auth**. Il suo dispositivo è abilitato se esiste `coaches/{uid}`.
  - Il primo dispositivo si abilita a mano dalla console Firestore, usando l'ID mostrato dall'app.
  - I dispositivi successivi si abilitano con un **codice di trasferimento** (`transfers/{code}`, valido 15 minuti) generato da un dispositivo già abilitato.
- **Solo soprannomi** nel campo nome (c'è un avviso nel modulo). Database in regione `eur3`.
- **Backup**: export e import JSON lato client (⚙ → Esporta / Ripristina).
- Le alternative già discusse e scartate dall'utente: server su Raspberry Pi o Mac mini, Trello (limite di 10 collaboratori per workspace sul piano gratuito), GitHub come database (servono account e token esposti), modalità tutta locale con sincronizzazione via WhatsApp (proposta, non scelta).

## Struttura
```
public/            ← cartella da pubblicare (GitHub Pages)
  index.html       shell, carica app.js come ES module
  app.js           UI: routing via hash, render con innerHTML, azioni delegate con data-act
  backend.js       livello dati: firebaseBackend (SDK 10.12.2 da gstatic) | demoBackend (localStorage)
  icons.js         icone SVG inline (icon("nome")), sempre aria-hidden: il nome accessibile va sul pulsante
  a11y.js          preferenze di accessibilità degli utenti (chiave pg_a11y): testo più grande, contrasto, animazioni
  design.js        pagina #/design (solo ?dev): token, contrasti calcolati, componenti, modifica colori dal vivo
  samples.js       10 alunni di esempio deterministici (seed fisso) per la modalità dev
  stickers.js      sticker di incoraggiamento: disegni SVG (colori dai token, bordo bianco), elenco, visti (localStorage pg_seen_stk)
  help.js          aiuto "?": contenuti per pagina e visita guidata (nuova versione)
  sched.js         gruppi e allenamenti: date locali (mai toISOString), schedFor() = allenamenti futuri di un alunno, sameSched()
  catalog.js       catalogo per livello (base/intermedio/avanzato) → categoria; normItem() rende validi anche i dati vecchi (indicativo, da adattare)
  drag.js          tieni premuto e trascina per riordinare (Scheda e Progressi), con scorrimento bloccato e automatico ai bordi
  config.js        firebaseConfig; se apiKey inizia con "INSERISCI" → modalità demo
  style.css        design system a token CSS (:root), v10: crema caldo, blu cobalto (--blue, carta in evidenza .feat con grana --grain e "sole" giallo), pastelli caldi (giallo/pesca in --pink/pervinca in --lilac/salvia/azzurro/arancio), barra in basso scura (--nav-*); tema chiaro e scuro "notte blu"; animazioni in fondo al file
  sw.js            service worker network-first; ad ogni rilascio aumentare la versione (ora pattinaggio-v29)
  manifest.json, icons/
firestore.rules    regole di sicurezza (vanno incollate nella console Firestore)
GUIDA.md           guida per l'utente finale (messa online dal browser, senza CLI)
esempio-alunni.json  10 alunni finti per provare sul DB vero (NON va messo in public/)
tools/e2e.py       test Playwright in modalità dev
tools/genera-esempi.mjs  rigenera esempio-alunni.json
```

## Rotte
- `/` → alunno, scheda **Oggi** (prossimi allenamenti + scheda da spuntare) · `#/progressi` · `#/profilo` (dati, descrizione, Accessibilità, Scollega). Codice in `localStorage.pg_my_code`; `?c=CODE` lo imposta.
- Telefono dell'allenatrice ricordato: `localStorage.pg_role = "coach"` (messo quando il dispositivo risulta abilitato, tolto con "Disabilita questo telefono" o se non è più abilitato). Se non c'è un codice alunno, `/` porta subito a `#/coach` (l'icona sulla Home apre sempre `start_url`).
- `#/coach` → Home (numeri riassuntivi, prossimi allenamenti, gruppi) · `#/coach/alunni` → elenco con filtro per gruppo e ricerca · `#/coach/calendario` → allenamenti e gestione gruppi. Sezioni allenatrice: **Oggi / Alunni / Calendario**.
- Navigazione in stile iOS (Liquid Glass): barra flottante a capsula in basso (`tabbar()` → `.dock > .bnav`) per alunno e allenatrice, con l'azione principale come pulsante tondo accanto (`fab()`, con `aria-label`). Titoli grandi (`head()`, 34px) con riga sopra (data o contesto), sezioni con titolo fuori dalla carta (`sect()`). Carattere di sistema (SF Pro), niente ui-rounded. Le etichette della barra non crescono oltre 13px (come iOS).
- `#/coach/{code}/{profilo|progressi|scheda|invito}` → dettaglio alunno (predefinita: progressi). Un codice è riconosciuto da `isCode()` (12 caratteri maiuscoli/cifre).
- `?dev` → **modalità sviluppo**: backend locale `pg_dev_v1`, anche con Firebase configurato. Contiene 10 alunni di esempio, allenatrice già abilitata e pulsanti per entrare come alunno. Il flag è in `localStorage.pg_dev`; si esce con il tasto "Esci" nel banner viola.

- `#/design` → design system di riferimento (funziona solo con `?dev`; link nel banner viola).

## Accessibilità (vincolante, verificata da tools/e2e.py)
- Riferimento: WCAG 2.2 AA + linee guida Apple ("OS27" interpretato così). Contrasto 4.5:1 testo / 3:1 UI, target >= 44px (`--target`), rem ovunque (Dynamic Type), `prefers-reduced-motion`, `prefers-contrast`, `:focus-visible`.
- Pulsanti con sola icona: sempre `aria-label`. Pannelli: `role=dialog`, Esc, ritorno del focus. Mai solo colore per gli stati.
- Niente font esterni (privacy): stack di sistema. Niente emoji come icone: solo `icons.js`.
- Impostazioni → Accessibilità (alunno e allenatrice): "Testo più grande" moltiplica la dimensione di sistema (Dynamic Type) ×1.3 con stile inline su `<html>`, quindi non rimpicciolisce mai. Gli override di colore della pagina `#/design` (chiave `pg_ds_prefs`) valgono solo in modalità dev.
- Pannelli: `openSheet({ title, body, onSubmit, focus })`. `focus: "title"` per modifica/informazione (niente tastiera o selettore data che si aprono da soli), `"input"` per i moduli di creazione. Ogni pannello ha la X "Chiudi"; "Elimina" sta sempre su una riga separata sotto Salva.
- Dopo un ridisegno, `paint()` riporta il focus sul pulsante appena toccato (spunte, stato, riordino).
- Tema: Automatico (segue il telefono) / Chiaro / Scuro, in Impostazioni → Accessibilità (`pg_a11y.theme`, attributo `data-theme`). I due blocchi di token scuri in `style.css` (`[data-theme=dark]` e `prefers-color-scheme: dark`) devono restare identici.
- Sui pastelli il testo usa sempre `--on-pastel` (scuro fisso), mai `--ink`, che nel tema scuro diventa chiaro. Sul blu `--on-blue`; nella carta `.feat` il testo resta sul blu (sole e alone nell'angolo, coperti da `padding-right`), con contrasto elevato la grana sparisce.
- Schermata Oggi (alunno e allenatrice): il primo allenamento futuro è la carta blu `.feat` (`feature()` in app.js), gli altri sotto in "Poi in calendario". Niente colori esadecimali fuori dai blocchi di token.
- Contrasto elevato: ogni tema definisce `--muted-n/-hc`, `--line-n/-hc`, `--line-strong-n/-hc`; le regole di contrasto scelgono solo la variante `-hc`.
- Animazioni: entrate solo al cambio di schermata (`.enter`, messa da `paint()` dopo `route()`), riscontro solo sull'elemento toccato (`.just`), durata ≤ 250 ms, niente transform su `main` (romperebbe `.fab`). Con riduzione movimento durata e ritardi vanno a 0.
- Ricerca nell'elenco alunni (da 6 alunni in su): senza accenti né maiuscole; quando arrivano dati nuovi si aggiorna solo `#stuList`, così il campo non perde testo e focus.
- Gestione elementi: nei Progressi lo stato è un cerchio con icona a destra della riga (tocco = stato successivo, annunciato con un avviso; legenda sempre visibile; nome dello stato letto da VoiceOver). Toccando la riga si modifica (livello, categoria, stato, data, note). Nella Scheda la riga apre la modifica.
- Riordino: tieni premuto e trascina (`drag.js`, come su iPhone) in Scheda e Progressi (nei Progressi solo dentro lo stesso livello + categoria). Alternativa obbligatoria (WCAG 2.5.7, VoiceOver): modalità "Riordina" con frecce in entrambe le schede. `[data-nodrag]` esclude cerchio di stato e frecce. Durante il trascinamento `renderCoachStudent` rimanda il ridisegno.
- Livelli: ogni elemento ha `level`, ogni alunno ha `level` (scelto alla creazione e in "Nome e livello"). La vecchia categoria "Base" si chiama ora "Fondamentali": passare sempre da `normItem()` prima di raggruppare o confrontare elementi.
- Avvisi (`toast()`): un'unica regione `role=status` sempre presente, in alto sotto la barra di stato, larga quanto il testo (max 2 righe), `pointer-events: none`; ogni avviso sostituisce il precedente.
- Focus riportato dopo un tocco (`restoreFocus`): niente anello visibile (`data-quiet`); dopo un tasto l'anello resta.
- iPhone, app aperta dall'icona sulla Home (iOS 26, WebKit bug 301108): finché la pagina è più corta dello schermo, l'area visibile resta più corta di quanto è alta la zona dell'orologio e WebKit **non disegna** ciò che sta sotto (barra in basso tagliata). Correzione in `style.css`: `@media (display-mode: standalone) { html { min-height: min(100lvh, calc(100% + env(safe-area-inset-top, 0px))) } }` (stessa di frappe-ui #1289). La vecchia correzione `--vgap` (spostare la barra in giù) è stata tolta: con l'area intera la spingeva fuori dallo schermo. La barra sta a `max(.75rem, safe-area-bottom − .6rem)` dal fondo e non partecipa all'animazione d'entrata. In Impostazioni allenatrice, solo dalla Home, c'è la riga di diagnosi "Schermo: …".
- Schema unico delle pagine (verificato in e2e): `head()` ha sempre la riga sopra il titolo (data, conteggio o contesto), quindi il titolo sta alla stessa altezza ovunque; tutte le pagine dell'allenatrice (anche il dettaglio alunno, con la freccia indietro a sinistra) hanno la stessa barra con il pulsante + (azione principale: Oggi e Calendario = nuovo allenamento, Alunni = nuovo alunno, dettaglio = modifica profilo / aggiungi elementi / aggiungi esercizio / copia link); le pagine dell'alunno hanno la barra senza pulsante. Gli stati vuoti usano solo `empty(icona, titolo, testo, pulsante)`.
- Il telefono dell'allenatrice è riconosciuto anche senza `pg_role`: se `/` non ha un codice alunno, `isCoachDevice()` guarda la sessione anonima già salvata (senza crearne di nuove) e, se è abilitata, apre `#/coach`.
- Schermi diversi (verificato in e2e a 320×568, 360×740, 768×1024 e 844×390 in orizzontale): niente scorrimento di lato; margini con `env(safe-area-inset-left/right)` (iPhone in orizzontale); i pannelli (`.sheet-panel`) scorrono, così Salva è sempre raggiungibile; i numeri riassuntivi stanno su tre colonne e, con poco spazio (container query sotto 19rem: telefono piccolo o testo grande), diventano righe; le sezioni del dettaglio alunno restano su una riga; la barra in basso ha misure massime in px come su iPhone (a 320 px con testo molto grande "Calendario" viene accorciato).
- Campi di testo ≥ 16px (sotto, iPhone ingrandisce la pagina al tocco). Non usare `maximum-scale`/`user-scalable=no`: bloccano lo zoom su Android.

## Nuova versione (per ora solo in modalità sviluppo)
- `beta()` in app.js: vera solo con `?dev` e `localStorage.pg_beta !== "0"`. Nel banner viola "Prova la nuova / Vedi l'attuale" la accende e la spegne, per confrontarle sugli stessi dati. Fuori da dev non cambia nulla.
- Quando l'utente la approva: `beta()` sempre vera, poi togliere il codice della versione attuale (`renderCoachCal`, gruppi nella Home, `c-new-tr` come pulsante +, potatura a 60 giorni) e in e2e il blocco con `BETA0`.
- Cosa cambia:
  - Calendario (`renderCoachMonth`): Mese / Elenco. Mese = griglia di 7 colonne (giorni passati disattivati), segni con forme diverse (quadrato allenamento, cerchio pieno prenotata, cerchio vuoto libero, puntino richiesta) + legenda + `aria-label` per giorno; sotto, gli appuntamenti del giorno scelto. Esce di .75rem dai margini per stare ≥ 42px a 320px.
  - Pulsante + (`c-new-appt` → `apptSheet`): un solo pannello "Allenamento di gruppo / Lezione privata", già sul giorno scelto. I campi dell'altro tipo sono `hidden` + `disabled` (fieldset `.kf`). Lezioni: con chi (qualunque alunno, o libero), durata, quante di fila (1–6), ripeti ogni settimana (2/4/8). Massimo `MAX_SLOTS` (60) orari futuri. Avviso se si sovrappone a un altro appuntamento (`clashOk`, allenamento = 60 min).
  - Pannello di un orario: in cima chi l'ha chiesto, con Conferma/Rifiuta (chiudono il pannello). Profilo alunno: sezione "Lezioni private" con "Prenota una lezione" (`c-book`).
  - Elenco Alunni (`groupedRows`, dentro `#stuList` così `refreshList` lo aggiorna): righe semplici (`srow`: nome, livello, lezioni private, %), divise in sezioni per gruppo con "Modifica" + "Senza gruppo" + "Nuovo gruppo"; con ricerca o filtro elenco unico. Unico filtro: "Lezioni private". Niente gruppi nella Home né nel Calendario.
  - Gruppo (`groupSheet2`): nome + "Chi ne fa parte" (spunte; chi è in un altro gruppo viene spostato, la riga lo dice) salvati insieme con un solo `saveMeta(meta, extra)`.
  - Aggiungi elementi (`progPicker`): ricerca che serve anche a scrivere un elemento nuovo (va in "Altro", livello scelto), livello come schede, elementi come pulsanti da toccare (`.chip.pick`); i filtri nascondono soltanto, le scelte restano. Eccezione voluta: `focus: "title"` (la tastiera coprirebbe il catalogo).
  - Modifica elemento: la data si vede solo con stato Completato (nascosta resta inviata: non si perde); livello e categoria in "Sposta in un altro livello o categoria" (`details.more`).
  - Nuovo appuntamento: in vista solo tipo, data, ora, per chi / con chi; durata, quante di fila, ripeti, luogo e note in "Altre opzioni"; frase riassuntiva `#apptSum` (non aria-live). Righe con il tipo scritto ("Allenamento · …", "Lezione privata · …", "Orario libero").
  - Barra in basso solo icone (`.bnav.ico`, il nome resta in `.sr` per VoiceOver; l'aiuto "?" spiega le icone).
  - Statistiche (`#/coach/statistiche`, `renderCoachStats`, link "Tutte le statistiche" sotto i numeri della Home): 4 numeri, progressi per livello, più elementi completati in 30 giorni, elementi in corso, "Da seguire" (scheda non usata da 14 giorni), lezioni private (prenotate, libere, da confermare, ore per settimana), alunni per gruppo. Barre `hbars()` di un solo colore con etichetta e valore scritti (la barra è solo un aiuto).
  - Movimento a tema pattinaggio (classe `.beta` su `<html>`, messa da `route()`): caricamento con pattino che scivola e lascia la traccia; cambio pagina che "scivola" dal lato giusto (`pageRank()` → `data-dir` r/l su `#app`, animati solo i figli, mai `#app`); barre che si riempiono; numeri che salgono (`[data-count]`, `countUp()`, niente con riduzione movimento); riflesso sull'elemento toccato; spunta "incisa"; pattino che entra negli avvisi. Entrate ≤ 300 ms, barre e numeri ≤ 600 ms.
  - Stile v11 (solo con `.beta`): token sovrascritti in `:root.beta` + due blocchi scuri `.beta` identici (contrasti verificati nella pagina #/design con la nuova versione accesa: 0 errori in chiaro e scuro). Carta in evidenza pervinca con sfumature arancio/rosa nell'angolo, testo `--on-pastel`, scintilla bianca (`icon("spark")`); pulsante + e voce attiva della barra neri; barra bianca.
  - Settimana dell'alunno (`weekStrip`, Oggi): 7 giorni, oggi scuro, pattino nei giorni con un appuntamento.
  - Calendario "Elenco": un giorno = carta colorata per giorno della settimana (`DAYC`) con la data grande e gli appuntamenti come pulsanti.
  - Sticker: campo `stickers: [{id, k, msg, at}]` (ultimi 30) nel documento dell'alunno, scritto solo dall'allenatrice (nessuna regola nuova). Allenatrice: profilo dell'alunno → "Manda uno sticker" (`c-stk`: 8 sticker, messaggio che segue lo sticker finché non lo si cambia a mano), tocco su uno sticker = toglierlo (`c-stk-del`). Alunno: quelli non ancora visti arrivano a tutto schermo uno alla volta (`showStickers`, dialog con focus, Esc, coriandoli, rimbalzo e fluttuazione; eccezione voluta al limite di 300 ms), poi restano in Progressi → "I tuoi sticker" (tocco = rivederlo). Visti ricordati in `localStorage.pg_seen_stk`. A tutto il gruppo: regalo accanto a "Modifica" nell'elenco Alunni, oppure "A chi: Tutto il gruppo" nel pannello dal profilo (`stickerSheet`, un id diverso per alunno, una sola `updateMany`).
  - Controlli UX/UI (26/11): ore in italiano (`fmtMins`), barre a zero vuote, Elenco calendario con orario sopra (niente parole spezzate a 320px), "Mostrami sulla pagina" in cima all'aiuto, freccia sui `details.more`, scelte a pillola selezionate sempre nere, tre scelte sempre su una riga, data completamento in parole (`fmtLong`), legenda nel pannello Aggiungi elementi.
  - Calendario del mese v2 (27/11): allineato alle altre carte (esce dai margini solo sotto 360px), "Novembre 2026" a sinistra con "Oggi" (`c-cal-today`) e frecce a destra, giorni in cerchi, settimane intere con i giorni degli altri mesi chiari (`.cal-o`, non toccabili), sabato e domenica con il cerchio colorato, giorni con appuntamenti in grassetto; il mese nuovo scivola dal lato giusto (`S.calSlide` → `data-slide`).
  - Simbolo nella carta in evidenza: pattino per gli allenamenti, persona per le lezioni (prima c'era una "scintilla" che sembrava una rotella di caricamento). `icon("spark")` è ora una stella a quattro punte; lo sticker "Wow" ha la stella e la scritta WOW.
  - Movimento v2: pillola nera della barra che scivola tra le voci (`navGlide()`, elemento `.bnav-pill`, `data-who` per non scivolare tra alunno e allenatrice), carte e righe che entrano in fila, numeri riassuntivi con un saltello, pulsanti a molla, pannelli che salgono con rimbalzo e sfondo che sfuma, schizzi di ghiaccio sulla spunta, piroetta del cerchio di stato, sfumature della carta in evidenza che si muovono piano (unica animazione continua), scheda completata = pattino che attraversa lo schermo con scia e fiocchi (`celebrate()`). Con "Riduci animazioni" niente di tutto questo.
  - Numero sull'icona Oggi della barra = richieste da confermare. "Da confermare" anche nel Calendario.
  - Pulizia: allenamenti e orari dei giorni passati si cancellano (`pruneOld` = da oggi; `cleanPast()` una volta per sessione all'apertura, mai con dati dalla cache: `watchMeta` passa `fromCache`).
  - Aiuto: pulsante "?" (`helpBtn`, `data-act=help`) in ogni pagina, alunno e allenatrice. Contenuti in `help.js` (`HELP[S.page]`, voci `[data-help, icona, titolo, testo]`): il pannello elenca le voci presenti nella pagina, "Mostrami" avvia la visita guidata (sagoma + fumetto, Avanti/Indietro, Esc chiude e il focus torna al "?"; si riposiziona dopo ogni ridisegno; si chiude al cambio pagina). `sect()` mette `data-help` = id senza "h" in minuscolo. Ogni nuovo elemento importante va aggiunto a `HELP`.

## Modello dati (Firestore)
- `students/{code}`:
  - `{ name, level: base|intermedio|avanzato, createdAt, progress: [{id, level, cat, name, status: todo|doing|done, date: "YYYY-MM-DD", note}], plan: [{id, title, detail}], checks: {exerciseId: timestampMs}, checksAt }`
  - `level` può mancare nei dati creati prima dei livelli: `normItem()` lo ricava dal catalogo (altrimenti "base").
  - L'allenatrice aggiorna gli array interi (`progress`, `plan`); l'alunno scrive solo `checks.{id}` e `checksAt`.
  - `group` (id del gruppo o ""), `bio` (descrizione facoltativa, la vede anche l'alunno), `sched` (copia degli allenamenti futuri che lo riguardano: `[{id, date, time, place, note, gname}]`).
- `meta/coach` (solo allenatrice): `{ groups: [{id, name}], trainings: [{id, date: "YYYY-MM-DD", time, group: id|"" (tutti), place, note}], slots: [{id, date, time, dur (min), place, note, who: codice alunno | "" (libero)}] }`.
- Lezioni private (in `students/{code}`): `priv` (bool, lo mette l'allenatrice), `open` (copia degli orari liberi futuri, solo se `priv`), `lessons` (copia delle sue lezioni prenotate), `reqs` (mappa scritta dall'alunno: `{idOrario: {at, slot:{date,time,dur,place}}}` = richiesta, `{cancel: ms}` = disdetta; l'allenatrice risponde con `st: "no"`). I codici degli alunni stanno solo in `meta.slots` (mai in documenti leggibili da altri alunni).
  - `diffPatch()` (app.js) calcola per ogni alunno copie cambiate e richieste da chiudere: orario sparito/passato → tolta; prenotato da lui → tolta; preso da un altro → `st: "no"`; disdetta gestita → tolta. `saveMeta()` scrive meta e alunni nella stessa `writeBatch` (`updateMany(list, meta)`; nelle chiavi con il punto `null` = deleteField).
  - Conferma (`c-lr-ok`) = mettere `who` sull'orario; tutto il resto lo fa `diffPatch`. La regola delle 24 ore è nell'app (`canCancel` in sched.js), non nel database.
  - Home allenatrice: sezione "Da confermare" (richieste e disdette); la carta in evidenza e "Poi in calendario" includono le lezioni prenotate. Calendario: sezione "Lezioni private" + "Aggiungi orari liberi" (ripetibili per 2/4/8 settimane). Alunno: lezioni nella sua agenda e sezione "Lezioni private" in Oggi (prenotate, richieste, "Chiedi una lezione"). Elenco alunni: filtro "Lezioni private".
  - Dopo ogni modifica di gruppi/allenamenti o del gruppo di un alunno, `syncSched()` riscrive `sched` solo negli alunni dove cambia, con `updateMany` (writeBatch). Si chiama solo dopo un'azione dell'allenatrice, mai da uno snapshot.
  - Se la lettura di `meta` è negata (regole vecchie), l'area allenatrice funziona lo stesso e mostra un avviso.
  - Gli allenamenti passati da più di 60 giorni vengono tolti al salvataggio successivo.
  - Backup versione 2: contiene anche `meta`; il ripristino accetta anche la versione 1.
- `coaches/{uid}`: `{ via: transferCode, at }`
- `transfers/{code}`: `{ by: uid, at: serverTimestamp }`

## Regole di sicurezza (riassunto di firestore.rules)
- `students`: per `list`, `create` e `delete` serve `isCoach()`. Il `get` è permesso all'allenatrice e a chiunque abbia un ID di 12 caratteri. Nell'`update` l'alunno può modificare solo `checks`, `checksAt` e `reqs` (`checks` map ≤ 100 voci; `reqs` map ≤ 20 voci e solo se il documento ha `priv == true`).
- `coaches/{uid}`: lettura e cancellazione solo dal proprio uid. La creazione richiede un `transfers/{via}` esistente e creato da meno di 15 minuti.
- `transfers`: la creazione è riservata all'allenatrice e richiede `at == request.time`.
- `meta/{d}`: lettura e scrittura solo con `isCoach()`.
- Tutto il resto è negato.

## Stato
- ✅ Testato in modalità demo e dev (Playwright, viewport 390×844): creazione alunno, progressi, scheda, spunte, invito, rigenera codice, backup e ripristino, trasferimento (in demo), modalità dev.
- `config.js` è collegato al progetto Firebase `wobbly-app-101` (app su `retrobottegadi-matt.github.io`).
- Verificato via REST sul progetto vero: accesso anonimo attivo, `list` di `students` negato, `get` con codice permesso. L'abilitazione del primo telefono funziona (attenzione: raccolta `coaches` minuscola).
- ⚠️ Ancora da verificare sul progetto reale:
  1. Le regole con l'emulatore Firestore o con il Rules Playground: soprattutto `duration.value(15, 'm')` sul transfer e `request.resource.data.at == request.time` con `serverTimestamp()`.
  2. L'accesso anonimo sul dominio github.io (aggiungere il dominio agli "Authorized domains").
  3. `persistentLocalCache` e il comportamento offline: snapshot `fromCache` con documento inesistente → l'app non cancella il codice salvato.
  4. iOS in modalità standalone: la persistenza della sessione anonima.
- ⚠️ `redeemTransfer` cancella il transfer con un secondo write separato. Se fallisce, il codice resta valido fino alla scadenza dei 15 minuti: accettabile, ma si può migliorare.
- ⚠️ La creazione di `students` è protetta, ma chi ha la config web potrebbe tentare `get` a forza bruta (non realistico con 59 bit). Opzionale: limitare la Browser API key al referrer `TUONOME.github.io/*` oppure aggiungere App Check (gratuito, con reCAPTCHA).

## Possibili prossimi passi
- Verificare le regole con `firebase emulators:start --only firestore,auth` e test delle regole (`@firebase/rules-unit-testing`).
- Adattare `catalog.js` al programma reale dell'allenatrice: la divisione Base/Intermedio/Avanzato attuale è indicativa.
- Idee non ancora richieste, da proporre solo se utili: storico delle sessioni di spunte, riepilogo "chi ha completato l'elemento X", ordinamento dell'elenco alunni, filtro per livello.

## Come lavorare su questo progetto
- Niente build: è JS vanilla con ES modules. Per servirlo in locale: `cd public && python3 -m http.server 8765`, poi aprire `http://localhost:8765/?dev`.
- Test: `python3 tools/e2e.py` (deve stampare `OK`). Se Playwright non trova il suo browser: `PW_CHROME=/opt/pw-browsers/chromium python3 tools/e2e.py`.
- Dopo ogni modifica ai file in `public/`, aumentare la versione della cache in `sw.js`.
- Mantenere i testi della UI in italiano, mobile-first, senza dipendenze esterne a parte l'SDK Firebase.
- Non introdurre servizi a pagamento, login con email/password o raccolta di contatti.

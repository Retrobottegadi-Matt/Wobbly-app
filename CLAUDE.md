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
  sched.js         gruppi e allenamenti: date locali (mai toISOString), schedFor() = allenamenti futuri di un alunno, sameSched()
  catalog.js       catalogo per livello (base/intermedio/avanzato) → categoria; normItem() rende validi anche i dati vecchi (indicativo, da adattare)
  drag.js          tieni premuto e trascina per riordinare (Scheda e Progressi), con scorrimento bloccato e automatico ai bordi
  config.js        firebaseConfig; se apiKey inizia con "INSERISCI" → modalità demo
  style.css        design system a token CSS (:root): crema, pastelli (giallo/rosa/lilla/salvia/azzurro), bottone primario a pillola; tema chiaro e scuro; animazioni in fondo al file
  sw.js            service worker network-first; ad ogni rilascio aumentare la versione (ora pattinaggio-v14)
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
- Sui pastelli il testo usa sempre `--on-pastel` (scuro fisso), mai `--ink`, che nel tema scuro diventa chiaro. Niente colori esadecimali fuori dai blocchi di token.
- Contrasto elevato: ogni tema definisce `--muted-n/-hc`, `--line-n/-hc`, `--line-strong-n/-hc`; le regole di contrasto scelgono solo la variante `-hc`.
- Animazioni: entrate solo al cambio di schermata (`.enter`, messa da `paint()` dopo `route()`), riscontro solo sull'elemento toccato (`.just`), durata ≤ 250 ms, niente transform su `main` (romperebbe `.fab`). Con riduzione movimento durata e ritardi vanno a 0.
- Ricerca nell'elenco alunni (da 6 alunni in su): senza accenti né maiuscole; quando arrivano dati nuovi si aggiorna solo `#stuList`, così il campo non perde testo e focus.
- Gestione elementi: nei Progressi lo stato è un cerchio con icona a destra della riga (tocco = stato successivo, annunciato con un avviso; legenda sempre visibile; nome dello stato letto da VoiceOver). Toccando la riga si modifica (livello, categoria, stato, data, note). Nella Scheda la riga apre la modifica.
- Riordino: tieni premuto e trascina (`drag.js`, come su iPhone) in Scheda e Progressi (nei Progressi solo dentro lo stesso livello + categoria). Alternativa obbligatoria (WCAG 2.5.7, VoiceOver): modalità "Riordina" con frecce in entrambe le schede. `[data-nodrag]` esclude cerchio di stato e frecce. Durante il trascinamento `renderCoachStudent` rimanda il ridisegno.
- Livelli: ogni elemento ha `level`, ogni alunno ha `level` (scelto alla creazione e in "Nome e livello"). La vecchia categoria "Base" si chiama ora "Fondamentali": passare sempre da `normItem()` prima di raggruppare o confrontare elementi.
- Avvisi (`toast()`): un'unica regione `role=status` sempre presente, in alto sotto la barra di stato, larga quanto il testo (max 2 righe), `pointer-events: none`; ogni avviso sostituisce il precedente.
- Focus riportato dopo un tocco (`restoreFocus`): niente anello visibile (`data-quiet`); dopo un tasto l'anello resta.
- Campi di testo ≥ 16px (sotto, iPhone ingrandisce la pagina al tocco). Non usare `maximum-scale`/`user-scalable=no`: bloccano lo zoom su Android.

## Modello dati (Firestore)
- `students/{code}`:
  - `{ name, level: base|intermedio|avanzato, createdAt, progress: [{id, level, cat, name, status: todo|doing|done, date: "YYYY-MM-DD", note}], plan: [{id, title, detail}], checks: {exerciseId: timestampMs}, checksAt }`
  - `level` può mancare nei dati creati prima dei livelli: `normItem()` lo ricava dal catalogo (altrimenti "base").
  - L'allenatrice aggiorna gli array interi (`progress`, `plan`); l'alunno scrive solo `checks.{id}` e `checksAt`.
  - `group` (id del gruppo o ""), `bio` (descrizione facoltativa, la vede anche l'alunno), `sched` (copia degli allenamenti futuri che lo riguardano: `[{id, date, time, place, note, gname}]`).
- `meta/coach` (solo allenatrice): `{ groups: [{id, name}], trainings: [{id, date: "YYYY-MM-DD", time, group: id|"" (tutti), place, note}] }`.
  - Dopo ogni modifica di gruppi/allenamenti o del gruppo di un alunno, `syncSched()` riscrive `sched` solo negli alunni dove cambia, con `updateMany` (writeBatch). Si chiama solo dopo un'azione dell'allenatrice, mai da uno snapshot.
  - Se la lettura di `meta` è negata (regole vecchie), l'area allenatrice funziona lo stesso e mostra un avviso.
  - Gli allenamenti passati da più di 60 giorni vengono tolti al salvataggio successivo.
  - Backup versione 2: contiene anche `meta`; il ripristino accetta anche la versione 1.
- `coaches/{uid}`: `{ via: transferCode, at }`
- `transfers/{code}`: `{ by: uid, at: serverTimestamp }`

## Regole di sicurezza (riassunto di firestore.rules)
- `students`: per `list`, `create` e `delete` serve `isCoach()`. Il `get` è permesso all'allenatrice e a chiunque abbia un ID di 12 caratteri. Nell'`update` l'alunno può modificare solo `checks` e `checksAt`, con `checks` di tipo map e al massimo 100 voci.
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
- Test: `python3 tools/e2e.py` (deve stampare `OK`).
- Dopo ogni modifica ai file in `public/`, aumentare la versione della cache in `sw.js`.
- Mantenere i testi della UI in italiano, mobile-first, senza dipendenze esterne a parte l'SDK Firebase.
- Non introdurre servizi a pagamento, login con email/password o raccolta di contatti.

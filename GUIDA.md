# Pattinaggio – scheda e progressi alunni

Web app per il telefono (Android e iPhone). Si installa dal browser con "Aggiungi a schermata Home", senza store.
**Costo zero, nessuna email e nessuna password salvate.**

## Come funziona
- **Allenatrice**: apre `https://TUO-SITO/#/coach` dal suo telefono. Il telefono va abilitato una sola volta (vedi sotto), poi lei vede tutti gli alunni. Per ognuno gestisce:
  - **Progressi**: elementi per categoria (Base, Passi e giri, Salti, Trottole, Altro), ognuno con stato *Da iniziare / In corso / Completato*, data e note.
  - **Scheda**: esercizi per il pattinaggio libero. Vede in tempo reale cosa ha spuntato l'alunno.
  - **Invito**: codice personale e pulsanti WhatsApp / Email / Copia link.
  - **Profilo**: soprannome, livello, gruppo e una breve descrizione facoltativa (la vede anche l'alunno).
- La **Home** dell'allenatrice mostra quanti alunni ci sono, la media dei progressi, quanti hanno spuntato la scheda negli ultimi 7 giorni e i prossimi allenamenti.
- Nel **Calendario** si creano i **gruppi** (es. "Sabato mattina") e gli **allenamenti** (data, ora, luogo, note), per tutti o per un gruppo. Nell'elenco **Alunni** si filtra per gruppo.
- **Lezioni private**: nel Profilo di un alunno l'allenatrice attiva "Lezioni private" (vale anche per chi è in un gruppo). Nel **Calendario** → *Aggiungi orari liberi* pubblica gli orari (anche ripetuti ogni settimana). Gli alunni con le lezioni private li vedono in **Oggi** e toccano *Chiedi una lezione*. Le richieste arrivano nella Home dell'allenatrice in **Da confermare**: *Conferma* o *Rifiuta*. Se due alunni chiedono lo stesso orario, confermandone uno l'altro vede "Non confermata". L'alunno può disdire fino a 24 ore prima; la disdetta compare in *Da confermare* e l'allenatrice tocca *Libera l'orario*. Non ci sono notifiche: le novità si vedono quando si apre l'app.
- **Alunno**: apre il link ricevuto, oppure inserisce il codice. Vede solo la sua scheda, i suoi prossimi allenamenti (e lezioni private) e spunta gli esercizi.

## Cosa viene salvato (e cosa no)
- Su Firebase (database in Europa) finiscono solo **soprannomi**, esercizi, progressi, note e spunte.
- Nessuna email, telefono o password, né degli alunni né dell'allenatrice. Gli inviti partono da WhatsApp o dalla mail del telefono, fuori dall'app.
- I dispositivi dell'allenatrice sono identificati da un ID anonimo casuale.
- **Impostazioni (⚙) → Esporta backup** salva tutto in un file sul telefono. **Ripristina da backup** lo ricarica.

## Prova veloce (modalità demo)
Finché `public/config.js` non è compilato, l'app gira in demo e salva i dati solo nel browser:
```
cd public && python3 -m http.server 8000
```
Poi apri http://localhost:8000. Il codice demo è `DEMO-ALUN-NO23`; l'area allenatrice è su `#/coach` (tasto "Entra (demo)").

## Modalità sviluppo (alunni di esempio)
Apri l'app aggiungendo `?dev` all'indirizzo, per esempio `https://TUONOME.github.io/pattinaggio/?dev`.
- Vengono caricati **10 alunni di esempio** con progressi, schede e spunte, salvati **solo in quel browser**. Il database vero non viene mai toccato, anche quando Firebase è già collegato.
- L'area allenatrice (`#/coach`) è già abilitata. Nella schermata alunno ci sono i pulsanti per entrare come uno qualsiasi degli esempi.
- ⚙ → *Rigenera alunni di esempio* riporta tutto allo stato iniziale.
- Il banner viola in alto ricorda che sei in sviluppo; con **Esci** torni all'app normale.

Per provare con il **database vero**, in ⚙ → *Ripristina da backup* carica `esempio-alunni.json`: crea 10 alunni finti con codici casuali. Ricordati di eliminarli prima di invitare gli alunni veri. Non caricare questo file su GitHub: tienilo fuori dalla cartella `public`.

---

## Messa online (tutto dal browser, nessun programma da installare)

### 1. Firebase: il database
Il piano gratuito Spark non chiede carta di credito e non può generare costi.

1. Apri https://console.firebase.google.com → **Aggiungi progetto** (Google Analytics non serve).
2. **Build → Firestore Database → Crea database**: località `eur3 (europe-west)`, modalità *produzione*.
3. Sempre in Firestore, scheda **Regole**: cancella tutto, incolla il contenuto di `firestore.rules` e premi **Pubblica**.
4. **Build → Authentication → Inizia → Metodo di accesso → Anonimo → Abilita**. È l'unico metodo da attivare.
5. **⚙ Impostazioni progetto → Le tue app → icona Web `</>`**: registra l'app senza spuntare Hosting, poi copia i valori di `firebaseConfig` dentro `public/config.js`.

### 2. GitHub Pages: la pubblicazione dell'app
1. Su https://github.com crea un repository **pubblico**, ad esempio `pattinaggio`. Pubblica il codice, non i dati: i dati stanno su Firebase, protetti dalle regole.
2. **Add file → Upload files**: trascina **il contenuto** della cartella `public` (index.html, app.js, … e la cartella icons) → **Commit changes**.
3. **Settings → Pages → Branch: `main` / `(root)` → Save**. Dopo un minuto l'app è su `https://TUONOME.github.io/pattinaggio/`.
4. Torna su Firebase: **Authentication → Impostazioni → Domini autorizzati → Aggiungi dominio** e inserisci `TUONOME.github.io`.

### 3. Abilitare il telefono dell'allenatrice (una volta sola)
1. L'allenatrice apre `https://TUONOME.github.io/pattinaggio/#/coach` sul suo telefono e lo **aggiunge alla schermata Home**.
2. Dall'icona sulla Home apre l'app: tocca **Primo telefono (solo la prima volta)**: compare un **ID**. Premi *Copia ID* e mandalo a chi gestisce Firebase.
3. Su Firebase, in **Firestore → Dati → + Avvia raccolta**: ID raccolta `coaches`. Come ID documento incolla l'ID copiato; aggiungi un campo qualsiasi, per esempio `nome` = `allenatrice`. Salva.
4. Sul telefono di lei ricarica l'app: ora vede la lista degli alunni.

**Nuovo telefono o secondo dispositivo**: sul telefono già abilitato vai su ⚙ → *Aggiungi un dispositivo*. Esce un codice valido 15 minuti, da inserire sul nuovo telefono.
**Telefono perso o resettato**: ripeti il punto 3 con il nuovo ID e cancella il documento del vecchio ID dalla raccolta `coaches`.

### Aggiornamenti
Per aggiornare l'app ricarica i file modificati su GitHub e aumenta il numero di versione in `sw.js` (es. `pattinaggio-v3`).
Se cambia `firestore.rules`, incolla di nuovo tutto il file in **Firestore → Regole** e premi **Pubblica** (prima di pubblicare la nuova versione dell'app). Gruppi e allenamenti, per esempio, hanno bisogno della regola `meta`. Le lezioni private hanno bisogno della regola aggiornata su `students` (campo `reqs`): senza, l'alunno vede "Non riesco a inviarla".

## Note
- **iPhone**: l'allenatrice deve usare l'app dall'icona sulla Home. Safari, se un sito non viene aperto per giorni, può cancellare i dati salvati, e il telefono andrebbe riabilitato. Le app aggiunte alla Home non hanno questo problema.
- **Sicurezza opzionale**: in Google Cloud Console → *API e servizi → Credenziali* puoi limitare la "Browser key" al sito `TUONOME.github.io/*`.
- **Fine stagione**: elimina gli alunni che non ci sono più (scheda Invito → Elimina alunno), dopo aver fatto un backup.

"""Test end-to-end in modalità demo/dev (nessun Firebase necessario).
Uso:  cd public && python3 -m http.server 8765   (in un altro terminale)
      python3 tools/e2e.py
Richiede: pip install playwright && playwright install chromium
"""
import asyncio, os, sys
from playwright.async_api import async_playwright

B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
# le conferme sono una finestra dell'app (#ask): nei test si accetta da sola, salvo dove
# window.__autoAsk = false (test della finestra stessa). I testi finiscono in window.__asks.
ASK = """
  window.__asks = []; window.__autoAsk = true;
  new MutationObserver(() => { const a = document.getElementById('ask');
    if (a && !a.dataset.seen) { a.dataset.seen = 1; window.__asks.push(a.querySelector('h2').textContent);
      if (window.__autoAsk) setTimeout(() => a.querySelector('[data-ask=yes]').click(), 20); } })
    .observe(document, { childList: true, subtree: true });"""
# presentazione del primo avvio già vista (si prova a parte, in un contesto pulito)
INTRO0 = """try { if (localStorage.getItem('pg_intro') === null) localStorage.setItem('pg_intro', '{"s":1,"c":1}'); } catch (e) {}"""
# appunti finti: copiare e incollare senza permessi del browser
CLIP = "Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__clip = t; return Promise.resolve(); }, readText: () => Promise.resolve(window.__clip || '') } });"

async def main():
    async with async_playwright() as p:
        # PW_CHROME: percorso di un Chromium già installato, se la versione di Playwright non ha il suo
        b = await p.chromium.launch(**({"executable_path": os.environ["PW_CHROME"]} if os.environ.get("PW_CHROME") else {}))
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, accept_downloads=True)
        await ctx.add_init_script(ASK); await ctx.add_init_script(INTRO0)
        pg = await ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
        pg.on("dialog", lambda d: asyncio.ensure_future(d.accept()))

        # campi di testo >= 16px: sotto, iPhone ingrandisce la pagina quando li tocchi
        FONT16 = """() => [...document.querySelectorAll('#sheet input:not([type=checkbox]):not([type=radio]):not([type=file]), #sheet select, #sheet textarea, main input:not([type=checkbox]):not([type=radio])')]
            .filter(e => e.offsetParent !== null && parseFloat(getComputedStyle(e).fontSize) < 16).map(e => (e.name || e.id) + ' ' + getComputedStyle(e).fontSize)"""
        async def font16(label):
            bad = await pg.evaluate(FONT16); assert not bad, (label, bad)

        # dev: 10 alunni di esempio, allenatrice già abilitata
        await pg.goto(B + "?dev#/coach"); await pg.wait_for_timeout(600)
        # il service worker deve prendere il controllo (un errore nel suo fetch romperebbe l'app installata)
        await pg.reload(); await pg.wait_for_timeout(700)
        assert await pg.evaluate("!!navigator.serviceWorker.controller"), "service worker non attivo"
        # Home (dashboard): numeri riassuntivi e prossimi allenamenti
        await pg.goto(B + "#/coach"); await pg.wait_for_timeout(500)
        assert await pg.locator(".stat b >> nth=0").inner_text() == "10", "numero di alunni nella Home"
        assert await pg.locator("#hNext + * .trs li, section:has(#hNext) .trs li").count() == 3, "tre prossimi allenamenti"
        assert await pg.locator("nav.bnav a[aria-current=page]").get_attribute("href") == "#/coach"
        # barra in basso attaccata al fondo (in stile iOS: 12-30px sopra il bordo)
        gapb = await pg.evaluate("innerHeight - document.querySelector('.dock').getBoundingClientRect().bottom")
        assert 8 <= gapb <= 30, ("barra in basso staccata dal fondo", gapb)
        await pg.click("nav.bnav a[href='#/coach/alunni']"); await pg.wait_for_timeout(400)
        assert pg.url.endswith("#/coach/alunni")
        await font16("elenco")
        assert await pg.locator("#stuList .srow").count() == 10, "attesi 10 alunni di esempio"
        assert await pg.locator("#app.enter").count() == 1, "entrata animata al cambio di schermata"

        # ricerca: senza accenti né maiuscole, il campo non perde il focus, conteggio annunciato
        await pg.fill("#stuSearch", "ALÌ"); await pg.wait_for_timeout(100)
        assert await pg.locator("#stuList .srow").count() == 1
        assert await pg.evaluate("document.activeElement.id") == "stuSearch"
        assert await pg.evaluate("getComputedStyle(document.querySelector('#stuList .srow')).animationName") == "none", "la ricerca non rifà l'entrata"
        await pg.wait_for_timeout(500)
        assert await pg.locator("#stuCount").inner_text() == "1 alunno trovato"
        await pg.fill("#stuSearch", "zzz"); await pg.wait_for_timeout(100)
        assert "Nessun alunno corrisponde" in await pg.locator("#stuList").inner_text()
        await pg.fill("#stuSearch", ""); await pg.wait_for_timeout(100)
        assert await pg.locator("#stuList .srow").count() == 10

        # gruppi: l'elenco è diviso per gruppo
        dev = lambda: pg.evaluate("JSON.parse(localStorage.getItem('pg_dev_v1'))")
        d = await dev(); gid = {g["name"]: g["id"] for g in d["meta"]["groups"]}
        n_ag = sum(1 for st in d["students"].values() if st.get("group") == gid["Agonisti"])
        assert await pg.locator(f"section:has(#hG{gid['Agonisti']}) .srow").count() == n_ag and n_ag > 0

        # allenamenti: uno per un gruppo, uno per tutti; ogni alunno vede solo i suoi
        await pg.click("nav.bnav a[href='#/coach/calendario']"); await pg.wait_for_timeout(300)
        for note, grp in [("PROVA-PR", "Principianti"), ("PROVA-TUTTI", None)]:
            await pg.click(".fab[data-act=c-new-appt]"); await pg.wait_for_timeout(250); await font16("allenamento")
            await pg.fill("#sheet input[name=time]", "16:15")
            if grp: await pg.select_option("#sheet select[name=group]", label=grp)
            await pg.click("#sheet details.more > summary"); await font16("altre opzioni")
            await pg.fill("#sheet input[name=note]", note); await pg.click("#sheet [type=submit]"); await pg.wait_for_timeout(300)
        d = await dev()
        pr = next(c for c, st in d["students"].items() if st.get("group") == gid["Principianti"])
        ag = next(c for c, st in d["students"].items() if st.get("group") == gid["Agonisti"])
        assert any(t["note"] == "PROVA-PR" for t in d["students"][pr]["sched"])
        assert not any(t["note"] == "PROVA-PR" for t in d["students"][ag]["sched"])
        assert all(any(t["note"] == "PROVA-TUTTI" for t in st["sched"]) for st in d["students"].values()), "allenamento per tutti"
        # profilo: descrizione e gruppo scelti dall'allenatrice
        await pg.goto(B + f"#/coach/{ag}/profilo"); await pg.wait_for_timeout(300)
        await pg.click("[data-act=c-profile]"); await pg.wait_for_timeout(150); await font16("profilo")
        await pg.fill("textarea[name=bio]", "Descrizione di prova")
        await pg.select_option("select[name=group]", label="Principianti"); await pg.click("text=Salva"); await pg.wait_for_timeout(250)
        assert "Principianti" in await pg.locator(".profile").inner_text()
        await pg.evaluate(f"localStorage.setItem('pg_my_code','{ag}')")
        await pg.goto(B); await pg.wait_for_timeout(400)
        txt = await pg.locator("main").inner_text()
        assert "PROVA-PR" in txt and "PROVA-TUTTI" in txt, "l'alunno vede gli allenamenti del nuovo gruppo"
        await pg.click("nav.bnav a[href='#/profilo']"); await pg.wait_for_timeout(300)
        assert "Descrizione di prova" in await pg.locator("main").inner_text(), "l'alunno vede la descrizione nel Profilo"
        # eliminare un gruppo: gli alunni restano senza gruppo e i suoi allenamenti spariscono anche dalle loro schede
        await pg.goto(B + "#/coach/alunni"); await pg.wait_for_timeout(300)
        await pg.click(f"[data-act=c-edit-group][data-id='{gid['Principianti']}']"); await pg.wait_for_timeout(250)
        await pg.click("#sheet >> text=Elimina gruppo"); await pg.wait_for_timeout(400)
        d = await dev()
        assert not any(st.get("group") == gid["Principianti"] for st in d["students"].values())
        assert not any(t["note"] == "PROVA-PR" for st in d["students"].values() for t in st["sched"])
        await pg.goto(B + "#/coach/alunni"); await pg.wait_for_timeout(300)

        # lezioni private: l'allenatrice pubblica un orario, due alunni lo chiedono, lei ne conferma uno; disdetta e orario di nuovo libero
        await pg.goto(B + "#/coach/calendario"); await pg.wait_for_timeout(300)
        await pg.click("[data-act=c-new-appt]"); await pg.wait_for_timeout(250)
        await pg.check("#sheet input[name=kind][value=les]"); await font16("orario")
        await pg.click("#sheet details.more > summary")
        await pg.fill("#sheet input[name=date]", (await pg.evaluate("(() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })()")))
        await pg.fill("#sheet input[name=time]", "18:45"); await pg.fill("#sheet input[name=note]", "PROVA-SLOT")
        await pg.select_option("#sheet select[name=rep]", "2"); await pg.click("#sheet [type=submit]"); await pg.wait_for_timeout(400)
        d = await dev()
        mine = [t for t in d["meta"]["slots"] if t["note"] == "PROVA-SLOT"]
        assert len(mine) == 2 and all(not t["who"] for t in mine), "orario ripetuto per 2 settimane"
        sid = sorted(mine, key=lambda t: t["date"])[0]["id"]
        privs = [c for c, st in d["students"].items() if st.get("priv")]
        nopriv = next(c for c, st in d["students"].items() if not st.get("priv"))
        assert len(privs) >= 2 and all(any(o["id"] == sid for o in d["students"][c]["open"]) for c in privs), "gli alunni privati vedono l'orario"
        assert not d["students"][nopriv].get("open"), "chi non fa lezioni private non vede gli orari"
        pa, pb = privs[0], privs[1]
        for c in (pa, pb):
            await pg.evaluate(f"localStorage.setItem('pg_my_code','{c}')"); await pg.goto(B + "#/"); await pg.reload(); await pg.wait_for_timeout(400)
            await pg.click("[data-act=s-ask]"); await pg.wait_for_timeout(150)
            await pg.click(f"[data-act=s-req][data-id='{sid}']"); await pg.wait_for_timeout(250)
            assert "In attesa di conferma" in await pg.locator("#hPriv + *, section:has(#hPriv)").inner_text()
        await pg.evaluate(f"localStorage.setItem('pg_my_code','{nopriv}')"); await pg.goto(B + "#/"); await pg.reload(); await pg.wait_for_timeout(400)
        assert await pg.locator("#hPriv").count() == 0, "niente lezioni private per chi non le ha"
        await pg.goto(B + "#/coach"); await pg.wait_for_timeout(400)
        assert await pg.locator(f"[data-act=c-lr-ok][data-id='{sid}']").count() == 2, "due richieste per lo stesso orario"
        await pg.click(f"[data-act=c-lr-ok][data-id='{sid}'][data-code='{pa}']"); await pg.wait_for_timeout(300)
        d = await dev()
        assert next(t for t in d["meta"]["slots"] if t["id"] == sid)["who"] == pa
        assert any(t["id"] == sid for t in d["students"][pa]["lessons"]) and sid not in d["students"][pa].get("reqs", {})
        assert d["students"][pb]["reqs"][sid]["st"] == "no", "l'altra richiesta diventa non confermata"
        assert not any(o["id"] == sid for o in d["students"][pb]["open"])
        await pg.evaluate(f"localStorage.setItem('pg_my_code','{pb}')"); await pg.goto(B + "#/"); await pg.reload(); await pg.wait_for_timeout(400)
        assert "Non confermata" in await pg.locator("main").inner_text()
        await pg.evaluate(f"localStorage.setItem('pg_my_code','{pa}')"); await pg.goto(B + "#/"); await pg.reload(); await pg.wait_for_timeout(400)
        await pg.click(f"[data-act=s-lesson][data-id='{sid}']"); await pg.wait_for_timeout(200)
        await pg.click("text=Disdici la lezione"); await pg.wait_for_timeout(300)
        d = await dev(); assert d["students"][pa]["reqs"][sid].get("cancel"), "disdetta inviata"
        await pg.goto(B + "#/coach"); await pg.wait_for_timeout(400)
        await pg.click(f"[data-act=c-lr-free][data-id='{sid}']"); await pg.wait_for_timeout(300)
        d = await dev()
        assert not next(t for t in d["meta"]["slots"] if t["id"] == sid)["who"], "orario di nuovo libero"
        assert all(t["id"] != sid for t in d["students"][pa]["lessons"]), "la lezione sparisce dall'app dell'alunno"
        assert sid not in d["students"][pa].get("reqs", {}), "disdetta gestita"
        await pg.evaluate(f"localStorage.setItem('pg_my_code','{ag}')")
        await pg.goto(B + "#/coach/alunni"); await pg.wait_for_timeout(300)

        # crea alunno, aggiungi elementi e esercizi
        await pg.click("[data-act=c-new]"); await pg.wait_for_timeout(100); await font16("nuovo alunno")
        await pg.fill("input[name=name]", "Test"); await pg.click("label.seg-opt.lv:has-text('Intermedio')"); await pg.click("button[type=submit]")
        await pg.wait_for_timeout(300)
        await pg.click("text=Progressi"); await pg.click("[data-act=c-add-prog]"); await pg.wait_for_timeout(150)
        assert await pg.evaluate("document.querySelector('#sheet .sheet-panel').scrollTop") == 0, "il catalogo deve aprirsi dall'inizio"
        await pg.click("#sheet .chip.pick:has-text('Toe loop')")
        assert await pg.locator("#sheet button[type=submit]").inner_text() == "Aggiungi (1)"
        await pg.click("button[type=submit]"); await pg.wait_for_timeout(200)
        assert "Intermedio" in await pg.locator("header .eyebrow").inner_text(), "livello dell'alunno nella testata"
        await pg.click("button.st-ic >> nth=0"); await pg.wait_for_timeout(200)
        st = pg.locator("button.st-ic >> nth=0")
        assert "doing" in await st.get_attribute("class") and "In corso" in await st.get_attribute("aria-label")
        assert await pg.locator(".prog li").count() == 1 and await pg.locator("h3.lvl").inner_text() == "Intermedio", "Toe loop è di livello intermedio"
        assert await pg.evaluate("document.activeElement.dataset.act") == "c-cycle", "il focus resta sullo stato appena cambiato"
        assert await pg.evaluate("getComputedStyle(document.activeElement).outlineStyle") == "none", "niente anello dopo un tocco"
        # due avvisi di fila: uno solo, con il testo più recente
        await pg.click("button.st-ic >> nth=0"); await pg.click("button.st-ic >> nth=0"); await pg.wait_for_timeout(150)
        assert await pg.locator(".toast").count() == 1
        assert (await pg.locator(".toast").inner_text()).endswith("Da iniziare")
        # da tastiera l'anello di focus resta visibile
        await pg.focus("button.st-ic >> nth=0"); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(200)
        assert await pg.evaluate("document.activeElement.dataset.act") == "c-cycle"
        assert await pg.evaluate("getComputedStyle(document.activeElement).outlineStyle") != "none", "anello visibile per la tastiera"
        # la modifica dell'elemento è un vero pulsante (raggiungibile con tastiera e VoiceOver)
        assert await pg.evaluate("document.querySelector('.prog li [data-act=c-edit-prog]').tagName") == "BUTTON"
        await pg.click("[data-act=c-edit-prog] >> nth=0"); await pg.wait_for_timeout(150)
        assert await pg.evaluate("document.activeElement.id") == "sheetTitle", "i pannelli di modifica mettono il focus sul titolo"
        await font16("modifica elemento")
        pid = await pg.evaluate("document.querySelector('[data-act=c-edit-prog]').dataset.id")
        await pg.click("label.seg-opt.done"); await pg.click("text=Salva"); await pg.wait_for_timeout(200)
        st = pg.locator("button.st-ic >> nth=0")
        assert "done" in await st.get_attribute("class") and "Completato" in await st.get_attribute("aria-label")
        assert await pg.evaluate(f"document.activeElement.matches('[data-act=c-edit-prog][data-id=\"{pid}\"]')"), "dopo il salvataggio il focus torna sulla riga modificata"
        await pg.click("text=Scheda")
        for t in ["Spirale", "Incrociati"]:
            await pg.click("[data-act=c-add-ex]"); await pg.wait_for_timeout(100)
            assert await pg.evaluate("document.activeElement.name") == "title", "i moduli di creazione mettono il focus sul campo"
            await font16("esercizio"); await pg.fill("input[name=title]", t); await pg.click("text=Salva"); await pg.wait_for_timeout(200)
        # riordino: modalità dedicata con frecce, il focus segue l'elemento spostato
        await pg.click("[data-act=c-reorder]"); await pg.wait_for_timeout(150)
        await pg.click("[data-act=c-move][data-d='1']"); await pg.wait_for_timeout(200)
        assert (await pg.locator(".plan li b").all_inner_texts()) == ["Incrociati", "Spirale"]
        assert await pg.evaluate("document.activeElement.dataset.act") == "c-move"
        await pg.click("[data-act=c-reorder]"); await pg.wait_for_timeout(150)
        assert await pg.locator(".plan [data-act=c-edit-ex]").count() == 2
        # tieni premuto e trascina (mouse): il primo esercizio va sotto il secondo, senza aprire la modifica
        a = await pg.locator(".plan > li >> nth=0").bounding_box(); c = await pg.locator(".plan > li >> nth=1").bounding_box()
        x, y0, y1 = a["x"] + a["width"] / 2, a["y"] + a["height"] / 2, c["y"] + c["height"] / 2 + 15
        await pg.mouse.move(x, y0); await pg.mouse.down(); await pg.wait_for_timeout(600)
        for k in range(1, 11):
            await pg.mouse.move(x, y0 + (y1 - y0) * k / 10); await pg.wait_for_timeout(16)
        await pg.mouse.up(); await pg.wait_for_timeout(300)
        assert (await pg.locator(".plan li b").all_inner_texts()) == ["Spirale", "Incrociati"], "ordine dopo il trascinamento"
        assert await pg.locator("#sheet").is_hidden(), "il trascinamento non apre la modifica"
        assert await pg.evaluate("getComputedStyle(document.activeElement).outlineStyle") == "none", "niente anello dopo il trascinamento"
        await pg.wait_for_timeout(450)
        await pg.click(".plan [data-act=c-edit-ex] >> nth=0"); await pg.wait_for_timeout(150)
        assert await pg.locator("#sheet").is_visible(), "un tocco normale apre ancora la modifica"
        await pg.keyboard.press("Escape")
        code = pg.url.split("/")[-2]

        # vista alunno: spunta
        await pg.evaluate(f"localStorage.setItem('pg_my_code','{code}')")
        await pg.goto(B); await pg.wait_for_timeout(400)
        await pg.click("[data-act=s-check] >> nth=0"); await pg.wait_for_timeout(200)
        assert await pg.locator(".check.on").count() == 1
        assert await pg.locator(".check.just").count() == 1, "riscontro animato sulla spunta toccata"
        assert await pg.locator("#app.enter").count() == 0, "niente entrata animata a ogni aggiornamento"

        # backup / ripristino
        await pg.goto(B + "#/coach/alunni"); await pg.wait_for_timeout(300)
        await pg.click("[data-act=c-settings]")
        async with pg.expect_download() as dl:
            await pg.click("text=Esporta backup")
        path = "/tmp/pattinaggio-backup-test.json"; await (await dl.value).save_as(path)
        await pg.click(".sheet-h [data-act=close]")
        await pg.click("text=Test"); await pg.click("text=Invito"); await pg.click("text=Elimina alunno"); await pg.wait_for_timeout(300)
        assert await pg.locator("#stuList .srow").count() == 10
        await pg.click("[data-act=c-settings]"); await pg.set_input_files("#impIn", path); await pg.wait_for_timeout(500)
        assert await pg.locator("#stuList .srow").count() == 11

        # backup "vecchio" (categoria Base, nessun livello, categoria sconosciuta): nessun elemento deve sparire
        import json
        legacy = {"app": "pattinaggio", "version": 1, "students": [{"code": "VECCHIOCODE2", "name": "Vecchio", "createdAt": 1,
            "progress": [{"id": "a1", "cat": "Base", "name": "Pattinaggio avanti", "status": "done", "date": "2026-01-02", "note": ""},
                         {"id": "a2", "cat": "Boh", "name": "Elemento strano", "status": "todo", "date": "", "note": ""},
                         {"id": "a3", "cat": "Salti", "name": "Axel", "status": "doing", "date": "", "note": ""}],
            "plan": [], "checks": {}}]}
        lpath = "/tmp/pattinaggio-legacy-test.json"; open(lpath, "w").write(json.dumps(legacy))
        await pg.click("[data-act=c-settings]"); await pg.set_input_files("#impIn", lpath); await pg.wait_for_timeout(500)
        await pg.click("text=Vecchio"); await pg.wait_for_timeout(300)
        assert await pg.locator(".prog li").count() == 3, "tutti gli elementi del backup vecchio sono visibili"
        assert await pg.locator("h3.lvl").all_inner_texts() == ["Base", "Avanzato"]
        await pg.click("[data-act=c-add-prog]"); await pg.wait_for_timeout(150)
        assert await pg.locator("#sheet .chip.pick.dis:has-text('Pattinaggio avanti')").count() == 1, "riconosciuto come già presente"
        await pg.keyboard.press("Escape")

        # accessibilità: target >= 44px sulle schermate principali
        MIN = """() => [...document.querySelectorAll('button, a.icon, .tabs a, .chip, .btn, .foot a, .demo a, .check, label.chk, .mi, .seg-opt, input:not([type=hidden]):not([hidden]), select')]
            .filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')
            .map(e => { const t = ((e.type === 'checkbox' || e.type === 'radio') && e.closest('label')) || e; return [e, t.getBoundingClientRect()]; })
            .filter(([e, r]) => r.width > 0 && (r.height < 43.5 || r.width < 43.5))
            .map(([e, r]) => e.className + ' ' + (e.textContent || '').trim().slice(0, 20) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height))"""
        # stesso schema in ogni pagina: titolo alla stessa altezza, barra in basso identica e nello stesso punto
        POS = """() => { const n = document.querySelector('nav.bnav').getBoundingClientRect(), h = document.querySelector('main h1').getBoundingClientRect();
            return [Math.round(n.x), Math.round(n.width), Math.round(innerHeight - n.bottom), Math.round(h.top + scrollY), !!document.querySelector('.dock .fab')]; }"""
        poss = {}
        for view in ["", "/calendario", "/alunni"]:
            await pg.goto(B + "#/coach" + view); await pg.wait_for_timeout(400)
            small = await pg.evaluate(MIN); assert not small, (view, small)
            poss[view] = await pg.evaluate(POS)
        await pg.click("#stuList .srow >> nth=0"); await pg.wait_for_timeout(300)
        for tab in ["Profilo", "Progressi", "Scheda", "Invito"]:
            await pg.click(f"nav.tabs >> text={tab}"); await pg.wait_for_timeout(200)
            small = await pg.evaluate(MIN); assert not small, (tab, small)
            poss[tab] = await pg.evaluate(POS)
        assert len({tuple(v) for v in poss.values()}) == 1, ("pagine dell'allenatrice non allineate", poss)
        assert await pg.locator("nav.tabs a[aria-current=page]").count() == 1
        for el in await pg.locator("button.icon, a.icon").all():
            assert await el.get_attribute("aria-label"), "icona senza aria-label"
            assert await el.locator("svg[aria-hidden=true]").count() == 1, "le icone sono SVG decorativi"
        await pg.goto(B + "#/coach"); await pg.wait_for_timeout(300)
        await pg.click("[data-act=c-settings]"); await pg.wait_for_timeout(200)
        assert await pg.locator("[role=dialog][aria-modal=true]").count() == 1
        assert await pg.locator(".sheet-h [data-act=close][aria-label=Chiudi]").count() == 1, "ogni pannello ha il pulsante Chiudi"
        small = await pg.evaluate(MIN); assert not small, ("pannello", small)
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
        assert await pg.locator("[role=dialog]").count() == 0, "Esc deve chiudere il pannello"
        assert await pg.evaluate("document.activeElement && document.activeElement.dataset.act") == "c-settings", "il focus deve tornare al pulsante"
        poss = {}
        for view in ["", "#/progressi", "#/profilo"]:
            await pg.goto(B + view); await pg.wait_for_timeout(300)
            small = await pg.evaluate(MIN); assert not small, ("alunno " + view, small)
            assert await pg.locator("nav.bnav a[aria-current=page]").count() == 1
            poss[view] = await pg.evaluate(POS)
        assert len({tuple(v) for v in poss.values()}) == 1, ("pagine dell'alunno non allineate", poss)

        # testo grande (200% e data-text=large): niente scroll orizzontale né testo tagliato
        OVER = """() => { const d = document.documentElement;
            const bad = [...document.querySelectorAll('main *, #sheet *')].filter(e => e.offsetParent !== null && e.clientWidth > 0
              && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible'
              && !['inline'].includes(getComputedStyle(e).display)).map(e => e.className + ' ' + (e.textContent||'').trim().slice(0,15));
            return { page: d.scrollWidth > innerWidth, bad }; }"""
        A11Y_ON = "localStorage.setItem('pg_a11y', JSON.stringify({text: true})); document.dispatchEvent(new Event('visibilitychange'))"
        A11Y_OFF = "localStorage.removeItem('pg_a11y'); document.dispatchEvent(new Event('visibilitychange'))"
        async def reflow(label):
            for mode in ("200%", "a11y"):
                if mode == "a11y": await pg.evaluate(A11Y_ON)
                else: await pg.evaluate("document.documentElement.style.fontSize='200%'")
                r = await pg.evaluate(OVER); assert not r["page"] and not r["bad"], (label, mode, r)
            await pg.evaluate(A11Y_OFF)
        for view in ["", "/calendario", "/alunni"]:
            await pg.goto(B + "#/coach" + view); await pg.wait_for_timeout(300); await reflow(view or "home")
        await pg.click("#stuList .srow >> nth=0"); await pg.wait_for_timeout(300)
        for tab in ["Profilo", "Progressi", "Scheda", "Invito"]:
            await pg.click(f"nav.tabs >> text={tab}"); await pg.wait_for_timeout(200); await reflow(tab)
        await pg.click("nav.tabs >> text=Progressi"); await pg.click("[data-act=c-add-prog]"); await pg.wait_for_timeout(200); await reflow("pannello elementi")
        await pg.keyboard.press("Escape")
        await pg.click("[data-act=c-edit-prog] >> nth=0"); await pg.wait_for_timeout(200); await reflow("pannello modifica")
        await pg.keyboard.press("Escape")
        for view in ["", "#/progressi", "#/profilo"]:
            await pg.goto(B + view); await pg.wait_for_timeout(300); await reflow("alunno " + view)

        # pagina design system (#/design, solo dev)
        await pg.goto(B + "#/design"); await pg.wait_for_timeout(400)
        assert await pg.locator(".ds header h1").inner_text() == "Design system"
        assert await pg.locator("#dsContrast td.ko").count() == 0, "coppie di colori sotto soglia WCAG"
        await pg.check("[data-pref=text]"); await pg.check("[data-pref=contrast]"); await pg.check("[data-pref=motion]")
        assert await pg.evaluate("parseFloat(document.documentElement.style.fontSize)") >= 20, "testo più grande attivo"
        small = await pg.evaluate(MIN); assert not small, ("design", small)
        await pg.uncheck("[data-pref=text]"); await pg.uncheck("[data-pref=contrast]"); await pg.uncheck("[data-pref=motion]")

        # tema scuro: contrasti WCAG anche in scuro, con e senza contrasto elevato, e in automatico
        await pg.click("label.seg-opt:has([name=dsTheme][value=dark])"); await pg.wait_for_timeout(100)
        assert await pg.evaluate("document.documentElement.dataset.theme") == "dark"
        assert await pg.locator("#dsContrast td.ko").count() == 0, ("scuro", await pg.locator("#dsContrast td.ko").all_inner_texts())
        await pg.check("[data-pref=contrast]")
        assert await pg.locator("#dsContrast td.ko").count() == 0, "scuro + contrasto elevato"
        await pg.uncheck("[data-pref=contrast]")
        await pg.click("label.seg-opt:has([name=dsTheme][value=auto])")
        await pg.emulate_media(color_scheme="dark"); await pg.wait_for_timeout(100)
        assert await pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()") == "#0e0f15", "automatico segue il telefono"
        await pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        await pg.click("label.seg-opt:has([name=dsTheme][value=auto])")
        assert await pg.locator("#dsContrast td.ko").count() == 0, "automatico in scuro"
        await pg.emulate_media(color_scheme="light")

        # movimento ridotto: durata ~0 e nessun ritardo (gli elementi non restano invisibili)
        await pg.emulate_media(reduced_motion="reduce")
        await pg.goto(B + "#/coach"); await pg.wait_for_timeout(300)
        d = await pg.evaluate("(() => { const c = getComputedStyle(document.querySelector('#app.enter > :nth-child(3)')); return [parseFloat(c.animationDuration), c.animationDelay]; })()")
        assert d[0] < 0.01 and d[1] == "0s", d
        await pg.emulate_media(reduced_motion="no-preference")

        # rigenera esempi e uscita dalla modalità dev
        await pg.goto(B + "#/coach/alunni"); await pg.wait_for_timeout(300)
        await pg.click("[data-act=c-settings]"); await pg.click("text=Rigenera alunni di esempio"); await pg.wait_for_timeout(300)
        assert await pg.locator("#stuList .srow").count() == 10
        await pg.click("[data-act=c-settings]"); await pg.click(".mi[data-act=a11y]"); await pg.wait_for_timeout(150)
        assert await pg.locator("#sheetTitle").inner_text() == "Accessibilità"
        await pg.click("label.sw-row:has([data-a11y=text])"); await pg.wait_for_timeout(100)
        base = 16
        assert await pg.evaluate("parseFloat(getComputedStyle(document.documentElement).fontSize)") >= base * 1.3 - .1, "il testo non deve mai rimpicciolire"
        small = await pg.evaluate(MIN); assert not small, ("pannello accessibilità", small)
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(100)
        assert await pg.evaluate("document.activeElement.dataset.act") == "c-settings", "il focus torna all'ingranaggio anche da pannelli annidati"
        # override colore della pagina design: attivo in dev, mai fuori
        await pg.evaluate("localStorage.setItem('pg_ds_prefs', JSON.stringify({vars: {'--pink': '#ff0000'}}))")
        await pg.reload(); await pg.wait_for_timeout(500)
        assert await pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--pink').trim()") == "#ff0000", "override attivo in dev"
        # fuori da dev l'app usa Firebase vero: qui la rete verso gstatic può mancare, quindi lo blocchiamo
        # e ignoriamo solo quegli errori di caricamento (il test riguarda gli stili, non il database)
        n_err = len(errs)
        await pg.route("https://www.gstatic.com/**", lambda r: r.abort())
        await pg.click("[data-act=dev-exit]"); await pg.wait_for_timeout(500)
        assert await pg.evaluate("parseFloat(getComputedStyle(document.documentElement).fontSize)") >= base * 1.3 - .1, "la preferenza resta fuori dalla modalità dev"
        assert await pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--pink').trim()") == "#eda9f3", "gli override colore dev non arrivano agli utenti"

        errs[n_err:] = [e for e in errs[n_err:] if "firebasejs" not in e and "net::ERR_FAILED" not in e]
        await pg.unroute("https://www.gstatic.com/**")

        # trascinamento con il dito (eventi touch reali via CDP): la pagina non deve scorrere
        ctx2 = await b.new_context(viewport={"width": 390, "height": 520}, has_touch=True, is_mobile=True)
        await ctx2.add_init_script(ASK); await ctx2.add_init_script(INTRO0)
        p2 = await ctx2.new_page()
        p2.on("pageerror", lambda e: errs.append(str(e)))
        await p2.goto(B + "?dev#/coach/alunni"); await p2.wait_for_timeout(700)
        await p2.tap("#stuList .srow >> nth=0"); await p2.wait_for_timeout(300)
        await p2.tap("nav.tabs >> text=Scheda"); await p2.wait_for_timeout(500)
        await p2.evaluate("document.querySelector('.plan').scrollIntoView({block: 'center'})"); await p2.wait_for_timeout(200)
        before = await p2.locator(".plan li b").all_inner_texts()
        assert await p2.evaluate("document.documentElement.scrollHeight > innerHeight + 50"), "serve una pagina scorrevole per il test"
        a = await p2.locator(".plan > li >> nth=0").bounding_box(); c = await p2.locator(".plan > li >> nth=1").bounding_box()
        x, y0, y1 = a["x"] + a["width"] / 2, a["y"] + a["height"] / 2, c["y"] + c["height"] / 2 + 15
        sy = await p2.evaluate("scrollY")
        cdp = await ctx2.new_cdp_session(p2)
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y0}]})
        await p2.wait_for_timeout(600)
        for k in range(1, 11):
            await cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y0 + (y1 - y0) * k / 10}]})
            await p2.wait_for_timeout(16)
        assert await p2.evaluate("scrollY") == sy, "la pagina non deve scorrere mentre si trascina"
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); await p2.wait_for_timeout(400)
        after = await p2.locator(".plan li b").all_inner_texts()
        assert after == [before[1], before[0]] + before[2:], (before, after)
        assert await p2.locator("#sheet").is_hidden(), "il trascinamento con il dito non apre la modifica"
        # avviso lungo ("…: posizione 2 di 5"): largo quanto serve, al massimo 2 righe, non blocca i tocchi
        await p2.wait_for_timeout(100)
        t = await p2.evaluate("""(() => { const t = document.querySelector('.toast'), r = t.getBoundingClientRect(), c = getComputedStyle(t);
            const lines = (r.height - parseFloat(c.paddingTop) - parseFloat(c.paddingBottom)) / parseFloat(c.lineHeight);
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return { text: t.textContent, lines, blocks: hit === t || t.contains(hit), right: r.right <= innerWidth, top: r.top }; })()""")
        assert "posizione" in t["text"] and t["lines"] <= 2.2 and not t["blocks"] and t["right"] and t["top"] < 80, t
        # uno scorrimento normale (senza pressione lunga) non sposta nulla
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y0 + 60}]})
        for k in range(1, 8):
            await cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y0 + 60 - 12 * k}]})
            await p2.wait_for_timeout(16)
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); await p2.wait_for_timeout(300)
        assert await p2.locator(".plan li b").all_inner_texts() == after, "scorrere non deve riordinare"
        # pressione lunga ferma vicino al bordo basso: niente scorrimento automatico né riordino
        await p2.tap("nav.tabs >> text=Progressi"); await p2.wait_for_timeout(500)
        ul = p2.locator("ul.prog:has(li + li) >> nth=0")
        row = ul.locator("li >> nth=0")
        await row.evaluate("e => { const r = e.getBoundingClientRect(); const d = document.querySelector('.dock'); const edge = d ? d.getBoundingClientRect().top : innerHeight; window.scrollBy(0, r.top + r.height / 2 - (edge - 30)); }")
        await p2.wait_for_timeout(200)
        names, sy = await ul.locator("li b").all_inner_texts(), await p2.evaluate("scrollY")
        r = await row.bounding_box()
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": r["x"] + r["width"] / 3, "y": r["y"] + r["height"] / 2}]})
        await p2.wait_for_timeout(1100)
        assert await p2.evaluate("scrollY") == sy, "tenere premuto fermo non deve far scorrere la pagina"
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); await p2.wait_for_timeout(300)
        assert await ul.locator("li b").all_inner_texts() == names, "tenere premuto fermo non deve riordinare"
        assert await p2.locator("#sheet").is_hidden()
        await ctx2.close()

        # schermi diversi: telefono piccolo, Android medio, tablet, orizzontale; niente scorrimento di lato,
        # numeri riassuntivi senza buchi, pannello che scorre fino a Salva anche su uno schermo basso
        for (w, h) in [(320, 568), (360, 740), (768, 1024), (844, 390)]:
            p3 = await b.new_page(viewport={"width": w, "height": h})
            await p3.add_init_script(ASK); await p3.add_init_script(INTRO0)
            await p3.goto(B + "?dev#/coach"); await p3.wait_for_timeout(500)
            for view in ["#/coach", "#/coach/alunni", "#/coach/calendario"]:
                await p3.goto(B + view); await p3.wait_for_timeout(300)
                assert await p3.evaluate("document.documentElement.scrollWidth <= innerWidth"), ("scorrimento di lato", w, view)
            await p3.goto(B + "#/coach"); await p3.wait_for_timeout(300)
            tops = await p3.evaluate("[...document.querySelectorAll('.stat')].map(e => Math.round(e.getBoundingClientRect().top))")
            assert len(set(tops)) in (1, 3), ("numeri riassuntivi: o in fila o uno per riga", w, tops)
            await p3.goto(B + "#/coach/calendario"); await p3.wait_for_timeout(300)
            await p3.click("[data-act=c-new-appt]"); await p3.wait_for_timeout(400)
            await p3.locator(".sheet-btns .btn[type=submit]").scroll_into_view_if_needed()
            bb = await p3.locator(".sheet-btns .btn[type=submit]").bounding_box()
            assert bb and bb["y"] >= 0 and bb["y"] + bb["height"] <= h, ("Salva fuori dallo schermo", w, h, bb)
            await p3.close()

        # ===== calendario del mese, pannello unico, aiuto, pulizia
        ctx4 = await b.new_context(viewport={"width": 390, "height": 844})
        await ctx4.add_init_script(ASK)
        await ctx4.add_init_script(INTRO0); await ctx4.add_init_script(CLIP)
        p4 = await ctx4.new_page()
        p4.on("pageerror", lambda e: errs.append(str(e)))
        p4.on("console", lambda m: m.type == "error" and errs.append(m.text))
        msgs = []
        p4.on("dialog", lambda d: (msgs.append(d.message), asyncio.ensure_future(d.accept())))
        dev4 = lambda: p4.evaluate("JSON.parse(localStorage.getItem('pg_dev_v1'))")
        today = await p4.evaluate("(() => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })()")
        await p4.goto(B + "?dev#/coach"); await p4.wait_for_timeout(800)
        d = await dev4()
        assert all(t["date"] >= today for t in d["meta"]["trainings"] + d["meta"]["slots"]), "appuntamenti passati cancellati all'apertura"
        assert await p4.locator("#hGr").count() == 0, "gruppi non più nella Home"
        assert await p4.locator("nav.bnav .badge").inner_text() == "1", "richiesta da confermare sulla barra"
        # calendario del mese: un pulsante per giorno, giorni passati disattivati, 44px
        await p4.goto(B + "#/coach/calendario"); await p4.wait_for_timeout(400)
        n = await p4.evaluate("new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()")
        assert await p4.locator(".cal-d").count() == n
        assert await p4.locator(f".cal-d[data-id='{today}']").get_attribute("aria-pressed") == "true"
        assert await p4.locator(".cal-d:disabled").count() == int(today[-2:]) - 1
        small = await p4.evaluate(MIN); assert not small, ("calendario", small)
        assert await p4.locator("#hGroups").count() == 0 and "Passati" not in await p4.locator("main").inner_text()
        # giorno con un orario libero: si sceglie e si vede la riga
        free = sorted([t for t in d["meta"]["slots"] if not t["who"]], key=lambda t: t["date"] + t["time"])
        day = free[-1]["date"]
        if day[:7] != today[:7]:
            await p4.click("[data-act=c-cal-m][data-d='1']"); await p4.wait_for_timeout(200)
        await p4.click(f".cal-d[data-id='{day}']"); await p4.wait_for_timeout(200)
        assert "Orario libero" in await p4.locator("section:has(#hDay)").inner_text()
        assert await p4.evaluate("document.activeElement.dataset.id") == day, "il focus resta sul giorno"
        # pannello unico: 3 lezioni di fila, il giorno scelto è già impostato
        nb = len(d["meta"]["slots"])
        await p4.click("[data-act=c-new-appt]"); await p4.wait_for_timeout(300)
        assert await p4.input_value("#sheet [name=date]") == day
        assert await p4.locator("#sheet [name=group]").is_visible()
        await p4.check("#sheet input[name=kind][value=les]"); await p4.wait_for_timeout(100)
        assert not await p4.locator("#sheet [name=group]").is_visible() and await p4.locator("#sheet [name=group]").is_disabled()
        assert "Un orario libero da 30 minuti" in await p4.locator("#apptSum").inner_text()
        await p4.click("#sheet details.more > summary")
        await p4.fill("#sheet [name=time]", "07:00"); await p4.select_option("#sheet [name=many]", "3")
        assert "3 orari liberi" in await p4.locator("#apptSum").inner_text()
        await p4.click("#sheet [type=submit]"); await p4.wait_for_timeout(400)
        d = await dev4(); new = [t for t in d["meta"]["slots"] if t["date"] == day and t["time"] in ("07:00", "07:30", "08:00")]
        assert len(d["meta"]["slots"]) == nb + 3 and len(new) == 3, "tre orari di fila"
        # sovrapposizione: chiede conferma
        await p4.click("[data-act=c-new-appt]"); await p4.wait_for_timeout(300)
        await p4.check("#sheet input[name=kind][value=les]"); await p4.fill("#sheet [name=time]", "07:15")
        await p4.click("#sheet [type=submit]"); await p4.wait_for_timeout(400)
        asks = await p4.evaluate("window.__asks")
        assert any("c'è già" in m for m in msgs + asks), (msgs, asks)
        # orario con richiesta: chi l'ha chiesto si conferma dal pannello dell'orario
        d = await dev4()
        req = [(c, sid) for c, st in d["students"].items() for sid, r in (st.get("reqs") or {}).items() if r and not r.get("st") and not r.get("cancel")]
        code, sid = req[0]
        await p4.click("[data-act=c-cal-view][data-id=elenco]"); await p4.wait_for_timeout(200)
        await p4.click(f"[data-act=c-edit-slot][data-id='{sid}']"); await p4.wait_for_timeout(300)
        await p4.click(f"#sheet [data-act=c-lr-ok][data-code='{code}']"); await p4.wait_for_timeout(400)
        d = await dev4()
        assert next(t for t in d["meta"]["slots"] if t["id"] == sid)["who"] == code, "confermata dal pannello"
        assert await p4.locator("#sheet").is_hidden()
        assert await p4.locator("nav.bnav .badge").count() == 0
        # prenota una lezione dal profilo dell'alunno (anche senza lezioni private attive), ogni settimana
        nopriv = next(c for c, st in d["students"].items() if not st.get("priv"))
        await p4.goto(B + f"#/coach/{nopriv}/profilo"); await p4.wait_for_timeout(300)
        await p4.click("[data-act=c-book]"); await p4.wait_for_timeout(300)
        assert await p4.input_value("#sheet [name=who]") == nopriv
        await p4.click("#sheet details.more > summary")
        await p4.fill("#sheet [name=time]", "06:00"); await p4.select_option("#sheet [name=rep]", "2")
        await p4.click("#sheet [type=submit]"); await p4.wait_for_timeout(400)
        d = await dev4()
        assert len([t for t in d["meta"]["slots"] if t["who"] == nopriv]) == 2
        assert len(d["students"][nopriv]["lessons"]) == 2, "le lezioni arrivano all'alunno"
        assert await p4.locator("section:has(#hLessons) .trs li").count() == 2
        # elenco alunni diviso per gruppo; un gruppo nuovo si crea scegliendo subito chi ne fa parte
        await p4.goto(B + "#/coach/alunni"); await p4.wait_for_timeout(300)
        assert await p4.locator("#stuList [data-act=c-edit-group]").count() == 3
        assert await p4.locator("#stuList .srow").count() == 10, "ogni alunno una volta sola"
        small = await p4.evaluate(MIN); assert not small, ("alunni", small)
        await p4.click("[data-act=c-gf][data-id=priv]"); await p4.wait_for_timeout(150)
        npriv = len([1 for st in d["students"].values() if st.get("priv")])
        assert await p4.locator("#stuList .srow").count() == npriv, "filtro lezioni private"
        await p4.click("[data-act=c-gf][data-id=all]"); await p4.wait_for_timeout(150)
        await p4.click("[data-act=c-new-group]"); await p4.wait_for_timeout(250)
        await p4.fill("#sheet [name=name]", "Gara di Natale")
        two = list(d["students"].keys())[:2]
        for c in two: await p4.check(f"#sheet [name=m][value='{c}']")
        await p4.click("#sheet [type=submit]"); await p4.wait_for_timeout(400)
        d = await dev4(); gid2 = next(g["id"] for g in d["meta"]["groups"] if g["name"] == "Gara di Natale")
        assert all(d["students"][c]["group"] == gid2 for c in two), "componenti scelti nel pannello del gruppo"
        assert await p4.locator(f"section:has(#hG{gid2}) .srow").count() == 2
        # togliere uno dal gruppo lo lascia senza gruppo
        await p4.click(f"[data-act=c-edit-group][data-id='{gid2}']"); await p4.wait_for_timeout(250)
        await p4.uncheck(f"#sheet [name=m][value='{two[0]}']"); await p4.click("#sheet [type=submit]"); await p4.wait_for_timeout(400)
        d = await dev4(); assert d["students"][two[0]]["group"] == "" and d["students"][two[1]]["group"] == gid2
        # aggiungi elementi: ricerca, scelta con un tocco, elemento nuovo scritto nella ricerca
        await p4.goto(B + f"#/coach/{nopriv}/progressi"); await p4.wait_for_timeout(300)
        n0 = len(d["students"][nopriv]["progress"])
        await p4.click("[data-act=c-add-prog]"); await p4.wait_for_timeout(300)
        small = await p4.evaluate(MIN.replace(".chip,", ".chip, .chip.pick,")); assert not small, ("elementi", small)
        await p4.locator("#sheet .chip.pick:not(.dis):visible >> nth=0").click()
        await p4.fill("#pq", "Salto inventato"); await p4.wait_for_timeout(100)
        assert await p4.locator("#newOpt").is_visible()
        assert await p4.locator("#sheet [type=submit]").inner_text() == "Aggiungi (2)", "contati anche quelli nascosti dal filtro"
        await p4.click("#sheet [type=submit]"); await p4.wait_for_timeout(400)
        d = await dev4(); pr = d["students"][nopriv]["progress"]
        assert len(pr) == n0 + 2 and pr[-1]["name"] == "Salto inventato" and pr[-1]["cat"] == "Altro"
        # modifica elemento: data visibile solo se completato, e non si perde cambiando le note
        done = next((x for x in pr if x["status"] == "done" and x.get("date")), None)
        if done:
            await p4.click(f"[data-act=c-edit-prog][data-id='{done['id']}']"); await p4.wait_for_timeout(250)
            assert await p4.locator("#doneDate").is_visible()
            await p4.check("#sheet input[name=status][value=doing]"); assert not await p4.locator("#doneDate").is_visible()
            await p4.fill("#sheet [name=note]", "ok"); await p4.click("#sheet [type=submit]"); await p4.wait_for_timeout(300)
            d = await dev4(); it = next(x for x in d["students"][nopriv]["progress"] if x["id"] == done["id"])
            assert it["date"] == done["date"] and it["status"] == "doing", it
        # aiuto: pannello con le voci della pagina, poi visita guidata
        for view in ["#/coach", "#/coach/alunni", "#/coach/calendario", f"#/coach/{nopriv}/profilo", f"#/coach/{nopriv}/invito"]:
            await p4.goto(B + view); await p4.wait_for_timeout(300)
            await p4.click("[data-act=help]"); await p4.wait_for_timeout(250)
            assert await p4.locator(".help-l li").count() >= 3, view
            small = await p4.evaluate(MIN); assert not small, ("aiuto", view, small)
            await p4.click("[data-act=help-tour]"); await p4.wait_for_timeout(250)
            steps = int((await p4.locator(".tour-n").inner_text()).split(" di ")[1])
            for k in range(steps):
                hole = await p4.evaluate("(() => { const r = document.querySelector('.tour-hole').getBoundingClientRect(); const t = document.querySelector('.tour-tip').getBoundingClientRect(); return [r.width > 0, t.top >= 0 && t.bottom <= innerHeight]; })()")
                assert hole == [True, True], (view, k, hole)
                assert await p4.evaluate("document.activeElement.id") == "tourT"
                await p4.click("[data-act=tour-next]"); await p4.wait_for_timeout(150)
            assert await p4.locator("#tour").count() == 0
            assert await p4.evaluate("document.activeElement.dataset.act") == "help", "focus torna al ?"
        await p4.click("[data-act=help]"); await p4.click("[data-act=help-tour]"); await p4.wait_for_timeout(200)
        await p4.keyboard.press("Escape"); await p4.wait_for_timeout(150)
        assert await p4.locator("#tour").count() == 0 and not await p4.evaluate("document.getElementById('app').inert")
        # stesso schema: titolo e barra allineati anche nella nuova versione
        poss = {}
        for view in ["#/coach", "#/coach/alunni", "#/coach/calendario", f"#/coach/{nopriv}/profilo"]:
            await p4.goto(B + view); await p4.wait_for_timeout(300); poss[view] = await p4.evaluate(POS)
        assert len({tuple(v) for v in poss.values()}) == 1, poss
        # alunno: pulsante ? e nessun errore
        await p4.evaluate(f"localStorage.setItem('pg_my_code','{nopriv}')"); await p4.goto(B + "#/"); await p4.wait_for_timeout(400)
        await p4.click("[data-act=help]"); await p4.wait_for_timeout(200)
        assert await p4.locator(".help-l li").count() >= 3
        await p4.keyboard.press("Escape")
        # telefono piccolo: il calendario sta nello schermo
        await p4.set_viewport_size({"width": 320, "height": 568})
        await p4.goto(B + "#/coach/calendario"); await p4.wait_for_timeout(300)
        await p4.click("[data-act=c-cal-view][data-id=mese]"); await p4.wait_for_timeout(200)
        assert await p4.evaluate("document.documentElement.scrollWidth <= innerWidth")
        w = await p4.evaluate("document.querySelector('.cal-d').getBoundingClientRect().width")
        assert w >= 42, ("giorni troppo stretti", w)
        # barra in basso solo icone, con il nome per VoiceOver
        await p4.goto(B + "#/coach"); await p4.wait_for_timeout(400)
        assert await p4.locator("nav.bnav.ico a > span.sr").count() == 3
        assert await p4.evaluate("[...document.querySelectorAll('nav.bnav a')].map(a => a.textContent.trim())") == ["Oggi", "Alunni", "Calendario"]
        # statistiche: dalla Home, numeri che corrispondono ai dati
        await p4.click("text=Tutte le statistiche"); await p4.wait_for_timeout(900)
        assert p4.url.endswith("#/coach/statistiche")
        d = await dev4()
        assert await p4.locator(".stat [data-count] >> nth=0").inner_text() == str(len(d["students"])), "conteggio finito"
        for h in ["hLiv", "hTop", "hDoing", "hIdle", "hPrivs"]:
            assert await p4.locator(f"#{h}").count() == 1, h
        booked = len([t for t in d["meta"]["slots"] if t["who"] and t["date"] >= today])
        assert await p4.locator("section:has(#hPrivs) .mini b >> nth=0").inner_text() == str(booked)
        small = await p4.evaluate(MIN); assert not small, ("statistiche", small)
        r = await p4.evaluate(OVER); assert not r["page"] and not r["bad"], ("statistiche", r)
        await p4.click("[data-help=back]"); await p4.wait_for_timeout(200)
        assert await p4.locator("#app").get_attribute("data-dir") == "l", "tornando indietro la pagina entra da sinistra"
        await p4.click("nav.bnav a[href='#/coach/calendario']"); await p4.wait_for_timeout(100)
        assert await p4.locator("#app").get_attribute("data-dir") == "r"
        # sticker: l'allenatrice ne manda due, l'alunno li vede arrivare una volta, poi restano nei Progressi
        d = await dev4(); sc = next(c for c in d["students"] if c != nopriv)
        await p4.goto(B + f"#/coach/{sc}/profilo"); await p4.wait_for_timeout(300)
        await p4.click("[data-act=c-stk]"); await p4.wait_for_timeout(250)
        small = await p4.evaluate(MIN.replace(".chip,", ".chip, .stk-opt,")); assert not small, ("sticker", small)
        await p4.click("#sheet .stk-opt:has(input[value=keep])"); await p4.wait_for_timeout(100)
        assert await p4.input_value("#sheet [name=msg]") == "Continua così!", "il messaggio segue lo sticker"
        await p4.click("#sheet [type=submit]"); await p4.wait_for_timeout(300)
        await p4.click("[data-act=c-stk]"); await p4.wait_for_timeout(200)
        await p4.fill("#sheet [name=msg]", "Bravissima oggi"); await p4.click("#sheet .stk-opt:has(input[value=heart])")
        assert await p4.input_value("#sheet [name=msg]") == "Bravissima oggi", "il messaggio scritto a mano resta"
        await p4.click("#sheet [type=submit]"); await p4.wait_for_timeout(300)
        d = await dev4(); assert [x["k"] for x in d["students"][sc]["stickers"]] == ["keep", "heart"]
        assert await p4.locator("section:has(#hStickers) .stk-b").count() == 2
        await p4.evaluate(f"localStorage.setItem('pg_my_code','{sc}'); localStorage.removeItem('pg_seen_stk')")
        await p4.goto(B + "#/"); await p4.wait_for_timeout(900)
        assert await p4.locator(".week li").count() == 7
        assert await p4.locator(".stk-show[role=dialog]").count() == 1, "sticker nuovi a tutto schermo"
        assert await p4.evaluate("document.activeElement.id") == "stkT"
        assert "1 di 2" in await p4.locator(".stk-from").inner_text()
        await p4.click("[data-stk=next]"); await p4.wait_for_timeout(150)
        assert await p4.locator("#stkT").inner_text() == "Bravissima oggi"
        await p4.click("[data-stk=next]"); await p4.wait_for_timeout(200)
        assert await p4.locator(".stk-show").count() == 0 and not await p4.evaluate("document.getElementById('app').inert")
        await p4.reload(); await p4.wait_for_timeout(900)
        assert await p4.locator(".stk-show").count() == 0, "una volta visti non tornano"
        await p4.goto(B + "#/progressi"); await p4.wait_for_timeout(400)
        assert await p4.locator(".stk-wall .stk-b").count() == 2
        await p4.click(".stk-wall .stk-b >> nth=0"); await p4.wait_for_timeout(200)
        assert await p4.locator(".stk-show").count() == 1, "si possono rivedere"
        await p4.keyboard.press("Escape"); await p4.wait_for_timeout(150)
        assert await p4.locator(".stk-show").count() == 0
        # l'allenatrice toglie uno sticker
        await p4.evaluate("localStorage.removeItem('pg_my_code')")
        await p4.goto(B + f"#/coach/{sc}/profilo"); await p4.wait_for_timeout(300)
        await p4.click("section:has(#hStickers) .stk-b >> nth=0"); await p4.wait_for_timeout(300)
        d = await dev4(); assert len(d["students"][sc]["stickers"]) == 1
        # sticker a tutto il gruppo: dall'elenco Alunni (regalo accanto a Modifica) e dal profilo ("Tutto il gruppo")
        await p4.goto(B + "#/coach/alunni"); await p4.wait_for_timeout(400)
        gb = p4.locator("[data-act=c-stk][data-group] >> nth=0"); gid = await gb.get_attribute("data-group")
        d = await dev4(); mem = [c for c, x in d["students"].items() if x.get("group") == gid]
        before = {c: len(d["students"][c].get("stickers", [])) for c in mem}
        await gb.click(); await p4.wait_for_timeout(250)
        assert f"{len(mem)} alunni" in await p4.locator("#sheet").inner_text()
        await p4.click("#sheet .stk-opt:has(input[value=medal])"); await p4.click("#sheet [type=submit]"); await p4.wait_for_timeout(300)
        d = await dev4()
        assert all(len(d["students"][c]["stickers"]) == before[c] + 1 and d["students"][c]["stickers"][-1]["k"] == "medal" for c in mem), "tutto il gruppo"
        assert len({d["students"][c]["stickers"][-1]["id"] for c in mem}) == len(mem), "id diversi per alunno"
        assert all(len(x.get("stickers", [])) == 0 or x["stickers"][-1]["k"] != "medal" for c, x in d["students"].items() if c not in mem)
        await p4.goto(B + f"#/coach/{mem[0]}/profilo"); await p4.wait_for_timeout(300)
        await p4.click("[data-act=c-stk]"); await p4.wait_for_timeout(250)
        await p4.click("#sheet .seg-opt:has(input[value=grp])"); await p4.click("#sheet [type=submit]"); await p4.wait_for_timeout(300)
        d = await dev4(); assert all(len(d["students"][c]["stickers"]) == before[c] + 2 for c in mem)
        # controlli: errore sotto il campo, doppioni, modifiche non salvate, finestra di conferma, avvisi con il tipo, offline
        await p4.set_viewport_size({"width": 390, "height": 844})
        await p4.goto(B + "#/coach/alunni"); await p4.wait_for_timeout(300)
        await p4.click(".fab"); await p4.wait_for_timeout(250)
        await p4.click("#sheet [type=submit]"); await p4.wait_for_timeout(200)
        assert await p4.locator("#sheet .f-err").count() == 1, "errore sotto il campo"
        assert await p4.get_attribute("#sheet [name=name]", "aria-invalid") == "true"
        assert await p4.evaluate("document.activeElement.name") == "name", "il focus va sul campo sbagliato"
        assert "err-name" in await p4.get_attribute("#sheet [name=name]", "aria-describedby")
        await p4.wait_for_timeout(100); assert await p4.get_attribute(".toast", "data-kind") == "err"
        await p4.type("#sheet [name=name]", "Q"); await p4.wait_for_timeout(50)
        assert await p4.locator("#sheet .f-err").count() == 0, "l'errore sparisce scrivendo"
        d = await dev4(); other = next(iter(d["students"].values()))["name"]
        await p4.fill("#sheet [name=name]", other.upper()); await p4.click("#sheet [type=submit]"); await p4.wait_for_timeout(200)
        assert "C'è già" in await p4.locator("#sheet .f-err").inner_text(), "soprannome doppio"
        assert len((await dev4())["students"]) == len(d["students"]), "nessun alunno creato"
        # chiudere con modifiche: chiede, "Indietro" lascia il pannello aperto, Esc chiude solo la domanda
        await p4.evaluate("window.__autoAsk = false")
        await p4.click("#sheet .sheet-h [data-act=close]"); await p4.wait_for_timeout(150)
        assert await p4.locator("#ask[role=alertdialog]").count() == 1 and "senza salvare" in await p4.locator("#askT").inner_text()
        assert await p4.evaluate("document.activeElement.dataset.ask") == "no", "per un'azione pericolosa il focus parte da Indietro"
        small = await p4.evaluate(MIN.replace(".chip,", ".chip, #ask .btn,")); assert not small, ("conferma", small)
        await p4.click("#ask .btn[data-ask=no]"); await p4.wait_for_timeout(100)
        assert await p4.locator("#ask").count() == 0 and await p4.locator("#sheet form").count() == 1, "Indietro: il pannello resta"
        await p4.keyboard.press("Escape"); await p4.wait_for_timeout(100)
        assert await p4.locator("#ask").count() == 1
        await p4.keyboard.press("Escape"); await p4.wait_for_timeout(100)
        assert await p4.locator("#ask").count() == 0 and await p4.locator("#sheet form").count() == 1, "Esc chiude solo la domanda"
        await p4.click("#sheet .sheet-h [data-act=close]"); await p4.wait_for_timeout(100); await p4.click("#ask [data-ask=yes]"); await p4.wait_for_timeout(150)
        assert await p4.locator("#sheet form").count() == 0, "uscita senza salvare"
        await p4.evaluate("window.__autoAsk = true")
        # pannello non toccato: si chiude subito, senza domande
        await p4.click(".fab"); await p4.wait_for_timeout(200); await p4.keyboard.press("Escape"); await p4.wait_for_timeout(150)
        assert await p4.locator("#sheet form").count() == 0 and await p4.locator("#ask").count() == 0
        # creato: avviso verde
        await p4.click(".fab"); await p4.wait_for_timeout(200); await p4.fill("#sheet [name=name]", "Zoe T."); await p4.click("#sheet [type=submit]"); await p4.wait_for_timeout(400)
        assert await p4.get_attribute(".toast", "data-kind") == "ok" and "Zoe T." in await p4.locator(".toast").inner_text()
        # senza connessione: striscia gialla, poi "Di nuovo online"
        await ctx4.set_offline(True); await p4.evaluate("dispatchEvent(new Event('offline'))"); await p4.wait_for_timeout(100)
        assert await p4.locator("#offline[role=status]").is_visible()
        await ctx4.set_offline(False); await p4.evaluate("dispatchEvent(new Event('online'))"); await p4.wait_for_timeout(150)
        assert await p4.locator("#offline").count() == 0 and "online" in await p4.locator(".toast").inner_text()
        # pannelli che applicano subito (Accessibilità): chiudendo non si chiede "Uscire senza salvare?"
        await p4.goto(B + "#/coach"); await p4.wait_for_timeout(300)
        await p4.click("[data-act=c-settings]"); await p4.wait_for_timeout(200); await p4.click("#sheet [data-act=a11y]"); await p4.wait_for_timeout(200)
        n_ask = await p4.evaluate("window.__asks.length")
        await p4.click("#sheet .sw-row >> nth=2"); await p4.wait_for_timeout(100)
        await p4.click("#sheet .sheet-btns [data-act=close]"); await p4.wait_for_timeout(200)
        assert await p4.evaluate("window.__asks.length") == n_ask and await p4.locator("#sheet").is_hidden(), "Accessibilità: niente domanda alla chiusura"
        await p4.evaluate("localStorage.removeItem('pg_a11y'); document.dispatchEvent(new Event('visibilitychange'))")
        # iPhone SE (375×667) con testo grande: nei pannelli le parti non si sovrappongono, anche con "Altre opzioni" aperto
        await p4.set_viewport_size({"width": 375, "height": 667})
        await p4.evaluate("document.documentElement.style.fontSize = '20.8px'")
        OVERLAP = """() => { const out = [];
          // parti del pannello schiacciate: il contenuto esce dal proprio riquadro e finisce sopra la parte successiva
          for (const e of document.querySelectorAll('#sheet .sheet-panel > *')) if (e.offsetParent !== null && e.scrollHeight > e.clientHeight + 2)
            out.push('schiacciata: ' + e.tagName + '.' + e.className);
          // dentro "Altre opzioni" i campi stanno uno sotto l'altro a tutta larghezza
          for (const d of document.querySelectorAll('#sheet details[open]')) { const w = d.getBoundingClientRect().width;
            for (const e of d.querySelectorAll(':scope > label, :scope > fieldset:not([hidden])')) if (e.getBoundingClientRect().width < w * .9)
              out.push('stretta: ' + (e.textContent || '').trim().slice(0, 20)); }
          return out; }"""
        await p4.goto(B + "#/coach/calendario"); await p4.wait_for_timeout(300)
        await p4.click(".fab"); await p4.wait_for_timeout(300); await p4.click("#sheet details.more summary"); await p4.wait_for_timeout(150)
        for kind in ["Allenamento", "Lezione"]:
            await p4.click(f"#sheet .seg-opt:has-text('{kind}')"); await p4.wait_for_timeout(150)
            bad = await p4.evaluate(OVERLAP); assert not bad, ("parti sovrapposte nel pannello", kind, bad)
        await p4.keyboard.press("Escape"); await p4.wait_for_timeout(200)
        await p4.evaluate("document.documentElement.style.fontSize = ''")
        await p4.set_viewport_size({"width": 390, "height": 844})
        # elementi del pattinaggio: nomi italiani, l'allenatrice li cambia, ne aggiunge e li toglie
        _st = (await dev4())["students"]; _st = [dict(v, code=k) for k, v in _st.items()] if isinstance(_st, dict) else _st
        lim = [x for x in _st if any(p_["name"] == "Limoni avanti" for p_ in x.get("progress", []))]
        assert lim, "esempi con nomi italiani"
        await p4.goto(B + f"#/coach/{lim[0]['code']}/progressi"); await p4.wait_for_timeout(400)
        await p4.click(".fab"); await p4.wait_for_timeout(300)
        allnames = await p4.locator("#sheet .pick").all_inner_texts()
        assert not any(w in " ".join(allnames) for w in ["Swizzle", "upright", "(sit)", "camel", "waltz"]), allnames
        await p4.click("#sheet [data-act=c-cat]"); await p4.wait_for_timeout(250)
        assert await p4.locator("#sheetTitle").inner_text() == "Elementi del pattinaggio"
        await p4.click("#sheet [data-act=c-cat-new]"); await p4.wait_for_timeout(250)
        await p4.fill("#sheet [name=name]", "limoni AVANTI"); await p4.click("#sheet [type=submit]"); await p4.wait_for_timeout(250)
        assert "C'è già" in await p4.locator("#sheet .f-err").inner_text(), "nome doppio"
        await p4.fill("#sheet [name=name]", "Tre indietro esterno")
        await p4.click("#sheet .seg-opt:has-text('Intermedio')"); await p4.select_option("#sheet [name=cat]", "Passi e giri")
        await p4.click("#sheet [type=submit]"); await p4.wait_for_timeout(400)
        assert await p4.locator("#sheetTitle").inner_text() == "Elementi del pattinaggio" and await p4.get_attribute(".toast", "data-kind") == "ok"
        assert await p4.locator("#sheet .cat-lv[data-lv=intermedio]:not([hidden]) .mi:has-text('Tre indietro esterno')").count() == 1
        els = (await dev4())["meta"]["elements"]
        assert any(e["name"] == "Tre indietro esterno" and e["level"] == "intermedio" and e["cat"] == "Passi e giri" for e in els)
        # rinominare cambia anche negli alunni che lo hanno
        await p4.click("#sheet .seg-opt:has-text('Base')"); await p4.wait_for_timeout(100)
        await p4.click("#sheet .mi:has-text('Limoni avanti')"); await p4.wait_for_timeout(250)
        assert "progressi" in await p4.locator("#sheet").inner_text()
        await p4.fill("#sheet [name=name]", "Limoni in avanti"); await p4.click("#sheet [type=submit]"); await p4.wait_for_timeout(400)
        assert "alunn" in await p4.locator(".toast").inner_text()
        d = await dev4(); _s2 = d["students"]; _s2 = list(_s2.values()) if isinstance(_s2, dict) else _s2
        names_all = [p_["name"] for x in _s2 for p_ in x.get("progress", [])]
        assert "Limoni avanti" not in names_all and names_all.count("Limoni in avanti") >= len(lim)
        # togliere: sparisce dall'elenco, non dagli alunni
        await p4.click("#sheet .mi:has-text('Limoni in avanti')"); await p4.wait_for_timeout(250)
        await p4.click("#sheet [name=del]"); await p4.wait_for_timeout(400)
        assert not any(e["name"] == "Limoni in avanti" for e in (await dev4())["meta"]["elements"])
        _s2 = (await dev4())["students"]; _s2 = list(_s2.values()) if isinstance(_s2, dict) else _s2
        assert any(p_["name"] == "Limoni in avanti" for x in _s2 for p_ in x.get("progress", []))
        # l'elenco nuovo vale in "Aggiungi elementi"
        await p4.click("#sheet .sheet-h [data-act=close]"); await p4.wait_for_timeout(200)
        await p4.click(".fab"); await p4.wait_for_timeout(300)
        allnames = " ".join(await p4.locator("#sheet .pick").all_inner_texts())
        assert "Tre indietro esterno" in allnames and "Limoni in avanti" not in allnames
        # ripristino dell'elenco iniziale
        await p4.click("#sheet [data-act=c-cat]"); await p4.wait_for_timeout(250)
        await p4.click("#sheet [data-act=c-cat-reset]"); await p4.wait_for_timeout(400)
        assert "elements" not in (await dev4())["meta"]
        await p4.click("#sheet .sheet-h [data-act=close]"); await p4.wait_for_timeout(200)
        # invito: "Solo il codice" manda un messaggio senza link; toccare il codice lo copia (solo il codice)
        _st = (await dev4())["students"]; _st = [dict(v, code=k) for k, v in _st.items()] if isinstance(_st, dict) else _st
        stu = sorted(_st, key=lambda x: x["name"])[0]
        fc = "-".join(stu["code"][i:i + 4] for i in (0, 4, 8))
        await p4.goto(B + f"#/coach/{stu['code']}/invito"); await p4.wait_for_timeout(400)
        await p4.evaluate("window.open = (u) => { window.__opened = u; }")
        await p4.click("[data-act=c-wa]"); await p4.wait_for_timeout(100)
        txt = await p4.evaluate("decodeURIComponent(window.__opened.split('text=')[1])")
        assert "http" in txt and fc in txt, txt
        await p4.click(".inv-what label:has-text('Solo il codice')"); await p4.wait_for_timeout(100)
        assert "solo il codice" in (await p4.locator("#invWhy").inner_text()).lower()
        await p4.click("[data-act=c-wa]"); await p4.wait_for_timeout(100)
        txt = await p4.evaluate("decodeURIComponent(window.__opened.split('text=')[1])")
        assert "http" not in txt and fc in txt and stu["name"] in txt, txt
        await p4.click(".bigcode[data-act=c-copy-code]"); await p4.wait_for_timeout(150)
        assert await p4.evaluate("window.__clip") == fc and await p4.get_attribute(".toast", "data-kind") == "ok"
        # la scelta resta dopo un ridisegno (altra sezione e ritorno)
        await p4.click(".tabs a:has-text('Scheda')"); await p4.wait_for_timeout(200); await p4.click(".tabs a:has-text('Invito')"); await p4.wait_for_timeout(200)
        assert await p4.locator(".inv-what input[value=code]").is_checked()
        # ingresso: si può incollare tutto il messaggio (o il link) e il codice si trova da solo
        async def entry():
            await p4.evaluate("localStorage.removeItem('pg_my_code')"); await p4.goto(B + "#/coach"); await p4.wait_for_timeout(300)
            await p4.click("[data-act=dev-student]"); await p4.wait_for_timeout(400)
        await entry()
        await p4.fill("#codeIn", txt); await p4.click("#codeForm [type=submit]"); await p4.wait_for_timeout(500)
        assert await p4.evaluate("localStorage.getItem('pg_my_code')") == stu["code"] and await p4.locator("#codeForm").count() == 0
        await entry()
        await p4.fill("#codeIn", f"Apri {B}?c={stu['code']} grazie"); await p4.click("#codeForm [type=submit]"); await p4.wait_for_timeout(500)
        assert await p4.evaluate("localStorage.getItem('pg_my_code')") == stu["code"]
        await entry()
        await p4.evaluate("window.__clip = 'il tuo codice: ' + " + repr(fc))
        await p4.click("[data-act=code-paste]"); await p4.wait_for_timeout(150)
        assert await p4.input_value("#codeIn") == fc
        await p4.click("#codeForm [type=submit]"); await p4.wait_for_timeout(500)
        assert await p4.evaluate("localStorage.getItem('pg_my_code')") == stu["code"]
        await p4.goto(B + "#/coach"); await p4.wait_for_timeout(400)
        # dal banner si passa tra allenatrice e alunno
        await p4.set_viewport_size({"width": 390, "height": 844})
        await p4.click("[data-act=dev-student]"); await p4.wait_for_timeout(400)
        assert await p4.locator("h1").first.inner_text() != "Calendario" and not p4.url.endswith("calendario")
        await p4.click("[data-act=dev-coach]"); await p4.wait_for_timeout(400)
        assert await p4.locator("nav.bnav a[aria-current=page]").inner_text() == "Oggi"
        await p4.evaluate("localStorage.removeItem('pg_my_code')"); await p4.goto(B + "#/"); await p4.wait_for_timeout(400)
        await p4.click("text=Area allenatrice"); await p4.wait_for_timeout(400)
        assert "#/coach" in p4.url and await p4.locator("nav.bnav").count() == 1
        await ctx4.close()

        # ===== presentazione al primo avvio (nuova versione): una volta per ruolo, si rivede, porta alla visita guidata
        ctx5 = await b.new_context(viewport={"width": 390, "height": 844})
        p5 = await ctx5.new_page()
        p5.on("pageerror", lambda e: errs.append(str(e)))
        p5.on("console", lambda m: m.type == "error" and errs.append(m.text))
        await p5.goto(B + "?dev#/coach"); await p5.wait_for_timeout(1000)
        intro = p5.locator("#intro[role=dialog][aria-modal=true]")
        assert await intro.is_visible(), "presentazione dell'allenatrice al primo avvio"
        assert await p5.evaluate("document.activeElement.id") == "introT"
        assert await p5.evaluate("document.getElementById('app').inert")
        n = int((await p5.locator(".intro-n").inner_text()).split(" di ")[1])
        assert n >= 5
        t1 = await p5.locator("#introT").inner_text()
        await p5.click("[data-in=next]"); await p5.wait_for_timeout(100)
        assert await p5.locator(".intro-n").inner_text() == f"2 di {n}" and await p5.locator("#introT").inner_text() != t1
        await p5.click("[data-in=prev]"); await p5.wait_for_timeout(100)
        assert await p5.locator("#introT").inner_text() == t1
        await p5.keyboard.press("ArrowRight"); await p5.wait_for_timeout(100)
        assert await p5.locator(".intro-n").inner_text() == f"2 di {n}"
        for b_ in await p5.locator("#intro button").all():
            bb = await b_.bounding_box(); assert bb["height"] >= 43.5, ("pulsante piccolo nella presentazione", bb)
        await p5.keyboard.press("Escape"); await p5.wait_for_timeout(150)
        assert await intro.count() == 0 and not await p5.evaluate("document.getElementById('app').inert")
        assert await p5.evaluate("document.activeElement.dataset.act") == "help", "il focus torna sul ?"
        await p5.reload(); await p5.wait_for_timeout(1000)
        assert await intro.count() == 0, "la presentazione si vede una volta sola"
        # si rivede dalle Impostazioni; l'ultima schermata porta alla visita guidata della pagina
        await p5.click("[data-act=c-settings]"); await p5.wait_for_timeout(200)
        await p5.click("#sheet [data-act=intro]"); await p5.wait_for_timeout(200)
        assert await intro.is_visible() and await p5.locator("#sheet").is_hidden()
        for _ in range(n - 1): await p5.click("[data-in=next]"); await p5.wait_for_timeout(60)
        assert await p5.locator("[data-in=next]").inner_text() == "Inizia" and await p5.locator("[data-in=skip]").count() == 0
        await p5.click("[data-in=show]"); await p5.wait_for_timeout(250)
        assert await intro.count() == 0 and await p5.locator("#tour").is_visible()
        await p5.keyboard.press("Escape"); await p5.wait_for_timeout(100)
        # alunno: presentazione sua (anche se quella dell'allenatrice è già vista), poi gli sticker nuovi
        await p5.click("[data-act=dev-student]"); await p5.wait_for_timeout(400)
        codes = await p5.evaluate("[...document.querySelectorAll('[data-act=dev-as]')].map(b => b.dataset.code)")
        await p5.evaluate("(c) => { const d = JSON.parse(localStorage.getItem('pg_dev_v1')); const s = Array.isArray(d.students) ? d.students.find(x => x.code === c) : d.students[c]; s.stickers = [{id: 'zz1', k: 'star', msg: 'Brava!', at: Date.now()}]; localStorage.setItem('pg_dev_v1', JSON.stringify(d)); localStorage.removeItem('pg_seen_stk'); localStorage.setItem('pg_my_code', c); }", codes[0])
        await p5.reload(); await p5.wait_for_timeout(1000)
        assert await intro.is_visible() and await p5.locator(".stk-show").count() == 0, "prima la presentazione, poi gli sticker"
        assert "scheda" in (await p5.locator("#introT").inner_text()).lower()
        await p5.click("[data-in=skip]"); await p5.wait_for_timeout(600)
        assert await p5.locator(".stk-show").is_visible(), "dopo la presentazione arrivano gli sticker"
        await p5.keyboard.press("Escape"); await p5.wait_for_timeout(100)
        await p5.goto(B + "#/profilo"); await p5.wait_for_timeout(400)
        await p5.click("[data-act=intro]"); await p5.wait_for_timeout(150)
        assert await intro.is_visible()
        await p5.keyboard.press("Escape"); await p5.wait_for_timeout(100)
        assert await p5.evaluate("document.activeElement.dataset.act") == "intro"
        await p5.set_viewport_size({"width": 320, "height": 568}); await p5.click("[data-act=intro]"); await p5.wait_for_timeout(150)
        bb = await p5.locator(".intro-card").bounding_box(); assert bb["x"] >= 0 and bb["x"] + bb["width"] <= 320
        await ctx5.close()

        await b.close()
        assert not errs, errs
        print("OK")

asyncio.run(main())

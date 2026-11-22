"""Test end-to-end in modalità demo/dev (nessun Firebase necessario).
Uso:  cd public && python3 -m http.server 8765   (in un altro terminale)
      python3 tools/e2e.py
Richiede: pip install playwright && playwright install chromium
"""
import asyncio, sys
from playwright.async_api import async_playwright

B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, accept_downloads=True)
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
        assert await pg.locator("nav.bnav a[aria-current=page]").inner_text() == "Oggi"
        # barra in basso attaccata al fondo (in stile iOS: 12-30px sopra il bordo)
        gapb = await pg.evaluate("innerHeight - document.querySelector('.dock').getBoundingClientRect().bottom")
        assert 8 <= gapb <= 30, ("barra in basso staccata dal fondo", gapb)
        await pg.click("nav.bnav >> text=Alunni"); await pg.wait_for_timeout(400)
        assert pg.url.endswith("#/coach/alunni")
        await font16("elenco")
        assert await pg.locator(".students li").count() == 10, "attesi 10 alunni di esempio"
        assert await pg.locator("#app.enter").count() == 1, "entrata animata al cambio di schermata"

        # ricerca: senza accenti né maiuscole, il campo non perde il focus, conteggio annunciato
        await pg.fill("#stuSearch", "ALÌ"); await pg.wait_for_timeout(100)
        assert await pg.locator(".students li").count() == 1
        assert await pg.evaluate("document.activeElement.id") == "stuSearch"
        assert await pg.evaluate("getComputedStyle(document.querySelector('.students li')).animationName") == "none", "la ricerca non rifà l'entrata"
        await pg.wait_for_timeout(500)
        assert await pg.locator("#stuCount").inner_text() == "1 alunno trovato"
        await pg.fill("#stuSearch", "zzz"); await pg.wait_for_timeout(100)
        assert "Nessun alunno corrisponde" in await pg.locator("#stuList").inner_text()
        await pg.fill("#stuSearch", ""); await pg.wait_for_timeout(100)
        assert await pg.locator(".students li").count() == 10

        # gruppi: filtro dell'elenco (il focus resta sul filtro), combinato con la ricerca
        dev = lambda: pg.evaluate("JSON.parse(localStorage.getItem('pg_dev_v1'))")
        d = await dev(); gid = {g["name"]: g["id"] for g in d["meta"]["groups"]}
        n_ag = sum(1 for st in d["students"].values() if st.get("group") == gid["Agonisti"])
        await pg.click("[data-act=c-gf]:has-text('Agonisti')"); await pg.wait_for_timeout(150)
        assert await pg.locator(".students li").count() == n_ag and n_ag > 0
        assert await pg.evaluate("document.activeElement.textContent") == "Agonisti", "il focus resta sul filtro"
        assert await pg.locator("[data-act=c-gf][aria-pressed=true]").inner_text() == "Agonisti"
        await pg.click("[data-act=c-gf]:has-text('Tutti')"); await pg.wait_for_timeout(150)
        assert await pg.locator(".students li").count() == 10

        # allenamenti: uno per un gruppo, uno per tutti; ogni alunno vede solo i suoi
        await pg.click("nav.bnav >> text=Calendario"); await pg.wait_for_timeout(300)
        for note, grp in [("PROVA-PR", "Principianti"), ("PROVA-TUTTI", None)]:
            await pg.click(".fab[data-act=c-new-tr]"); await pg.wait_for_timeout(150); await font16("allenamento")
            await pg.fill("input[name=time]", "16:15")
            if grp: await pg.select_option("select[name=group]", label=grp)
            await pg.fill("input[name=note]", note); await pg.click("text=Salva"); await pg.wait_for_timeout(250)
        assert await pg.locator(".trs li:has-text('PROVA-PR')").count() == 1
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
        await pg.click("nav.bnav >> text=Profilo"); await pg.wait_for_timeout(300)
        assert "Descrizione di prova" in await pg.locator("main").inner_text(), "l'alunno vede la descrizione nel Profilo"
        # eliminare un gruppo: gli alunni restano senza gruppo e i suoi allenamenti spariscono anche dalle loro schede
        await pg.goto(B + "#/coach/calendario"); await pg.wait_for_timeout(300)
        await pg.click("[data-act=c-edit-group]:has-text('Principianti')"); await pg.wait_for_timeout(150)
        await pg.click("text=Elimina gruppo"); await pg.wait_for_timeout(300)
        d = await dev()
        assert not any(st.get("group") == gid["Principianti"] for st in d["students"].values())
        assert not any(t["note"] == "PROVA-PR" for st in d["students"].values() for t in st["sched"])
        assert await pg.locator(".trs li:has-text('PROVA-PR')").count() == 0
        await pg.goto(B + "#/coach/alunni"); await pg.wait_for_timeout(300)

        # lezioni private: l'allenatrice pubblica un orario, due alunni lo chiedono, lei ne conferma uno; disdetta e orario di nuovo libero
        await pg.goto(B + "#/coach/calendario"); await pg.wait_for_timeout(300)
        await pg.click("[data-act=c-new-slot]"); await pg.wait_for_timeout(150); await font16("orario")
        await pg.fill("input[name=date]", (await pg.evaluate("(() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })()")))
        await pg.fill("input[name=time]", "18:45"); await pg.fill("input[name=note]", "PROVA-SLOT")
        await pg.select_option("select[name=rep]", "2"); await pg.click("text=Salva"); await pg.wait_for_timeout(300)
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
        assert await pg.evaluate("document.querySelector('#sheet .scroll').scrollTop") == 0, "il catalogo deve aprirsi dall'inizio"
        await pg.click("label.chk:has-text('Toe loop')")
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
        assert await pg.locator(".students li").count() == 10
        await pg.click("[data-act=c-settings]"); await pg.set_input_files("#impIn", path); await pg.wait_for_timeout(500)
        assert await pg.locator(".students li").count() == 11

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
        assert await pg.locator(".chk.dis:has-text('Pattinaggio avanti')").count() == 1, "riconosciuto come già presente"
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
        await pg.click(".students li a >> nth=0"); await pg.wait_for_timeout(300)
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
        await pg.click(".students li a >> nth=0"); await pg.wait_for_timeout(300)
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
        assert await pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()") == "#12132b", "automatico segue il telefono"
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
        assert await pg.locator(".students li").count() == 10
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
        assert await pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--pink').trim()") == "#f9b48c", "gli override colore dev non arrivano agli utenti"

        errs[n_err:] = [e for e in errs[n_err:] if "firebasejs" not in e and "net::ERR_FAILED" not in e]
        await pg.unroute("https://www.gstatic.com/**")

        # trascinamento con il dito (eventi touch reali via CDP): la pagina non deve scorrere
        ctx2 = await b.new_context(viewport={"width": 390, "height": 520}, has_touch=True, is_mobile=True)
        p2 = await ctx2.new_page()
        p2.on("pageerror", lambda e: errs.append(str(e)))
        await p2.goto(B + "?dev#/coach/alunni"); await p2.wait_for_timeout(700)
        await p2.tap(".students li a >> nth=0"); await p2.wait_for_timeout(300)
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

        await b.close()
        assert not errs, errs
        print("OK")

asyncio.run(main())

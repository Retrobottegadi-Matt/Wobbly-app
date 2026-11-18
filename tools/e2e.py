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

        # dev: 10 alunni di esempio, allenatrice già abilitata
        await pg.goto(B + "?dev#/coach"); await pg.wait_for_timeout(600)
        assert await pg.locator(".students li").count() == 10, "attesi 10 alunni di esempio"

        # crea alunno, aggiungi elementi e esercizi
        await pg.click("[data-act=c-new]"); await pg.fill("input[name=name]", "Test"); await pg.click("button[type=submit]")
        await pg.wait_for_timeout(300)
        await pg.click("text=Progressi"); await pg.click("[data-act=c-add-prog]"); await pg.wait_for_timeout(150)
        assert await pg.evaluate("document.querySelector('#sheet .scroll').scrollTop") == 0, "il catalogo deve aprirsi dall'inizio"
        await pg.click("label.chk:has-text('Toe loop')")
        assert await pg.locator("#sheet button[type=submit]").inner_text() == "Aggiungi (1)"
        await pg.click("button[type=submit]"); await pg.wait_for_timeout(200)
        await pg.click("button.st >> nth=0"); await pg.wait_for_timeout(200)
        assert "In corso" in await pg.locator("button.st >> nth=0").inner_text()
        assert await pg.evaluate("document.activeElement.dataset.act") == "c-cycle", "il focus resta sullo stato appena cambiato"
        # la modifica dell'elemento è un vero pulsante (raggiungibile con tastiera e VoiceOver)
        assert await pg.evaluate("document.querySelector('.prog li [data-act=c-edit-prog]').tagName") == "BUTTON"
        await pg.click("[data-act=c-edit-prog] >> nth=0"); await pg.wait_for_timeout(150)
        assert await pg.evaluate("document.activeElement.id") == "sheetTitle", "i pannelli di modifica mettono il focus sul titolo"
        await pg.click("label.seg-opt.done"); await pg.click("text=Salva"); await pg.wait_for_timeout(200)
        assert "Completato" in await pg.locator("button.st >> nth=0").inner_text()
        await pg.click("text=Scheda")
        for t in ["Spirale", "Incrociati"]:
            await pg.click("[data-act=c-add-ex]"); await pg.wait_for_timeout(100)
            assert await pg.evaluate("document.activeElement.name") == "title", "i moduli di creazione mettono il focus sul campo"
            await pg.fill("input[name=title]", t); await pg.click("text=Salva"); await pg.wait_for_timeout(200)
        # riordino: modalità dedicata con frecce, il focus segue l'elemento spostato
        await pg.click("[data-act=c-reorder]"); await pg.wait_for_timeout(150)
        await pg.click("[data-act=c-move][data-d='1']"); await pg.wait_for_timeout(200)
        assert (await pg.locator(".plan li b").all_inner_texts()) == ["Incrociati", "Spirale"]
        assert await pg.evaluate("document.activeElement.dataset.act") == "c-move"
        await pg.click("[data-act=c-reorder]"); await pg.wait_for_timeout(150)
        assert await pg.locator(".plan [data-act=c-edit-ex]").count() == 2
        code = pg.url.split("/")[-2]

        # vista alunno: spunta
        await pg.evaluate(f"localStorage.setItem('pg_my_code','{code}')")
        await pg.goto(B); await pg.wait_for_timeout(400)
        await pg.click("[data-act=s-check] >> nth=0"); await pg.wait_for_timeout(200)
        assert await pg.locator(".check.on").count() == 1

        # backup / ripristino
        await pg.goto(B + "#/coach"); await pg.wait_for_timeout(300)
        await pg.click("[data-act=c-settings]")
        async with pg.expect_download() as dl:
            await pg.click("text=Esporta backup")
        path = "/tmp/pattinaggio-backup-test.json"; await (await dl.value).save_as(path)
        await pg.click(".sheet-h [data-act=close]")
        await pg.click("text=Test"); await pg.click("text=Invito"); await pg.click("text=Elimina alunno"); await pg.wait_for_timeout(300)
        assert await pg.locator(".students li").count() == 10
        await pg.click("[data-act=c-settings]"); await pg.set_input_files("#impIn", path); await pg.wait_for_timeout(500)
        assert await pg.locator(".students li").count() == 11

        # accessibilità: target >= 44px sulle schermate principali
        MIN = """() => [...document.querySelectorAll('button, a.icon, .tabs a, .chip, .btn, .foot a, .demo a, .check, label.chk, .mi, .seg-opt, input:not([type=hidden]):not([hidden]), select')]
            .filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')
            .map(e => { const t = ((e.type === 'checkbox' || e.type === 'radio') && e.closest('label')) || e; return [e, t.getBoundingClientRect()]; })
            .filter(([e, r]) => r.width > 0 && (r.height < 43.5 || r.width < 43.5))
            .map(([e, r]) => e.className + ' ' + (e.textContent || '').trim().slice(0, 20) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height))"""
        await pg.goto(B + "#/coach"); await pg.wait_for_timeout(400)
        small = await pg.evaluate(MIN); assert not small, ("elenco", small)
        await pg.click(".students li a >> nth=0"); await pg.wait_for_timeout(300)
        for tab in ["Progressi", "Scheda", "Invito"]:
            await pg.click(f"nav.tabs >> text={tab}"); await pg.wait_for_timeout(200)
            small = await pg.evaluate(MIN); assert not small, (tab, small)
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
        await pg.goto(B); await pg.wait_for_timeout(300)
        small = await pg.evaluate(MIN); assert not small, ("alunno", small)

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
        await pg.goto(B + "#/coach"); await pg.wait_for_timeout(300); await reflow("elenco")
        await pg.click(".students li a >> nth=0"); await pg.wait_for_timeout(300)
        for tab in ["Progressi", "Scheda", "Invito"]:
            await pg.click(f"nav.tabs >> text={tab}"); await pg.wait_for_timeout(200); await reflow(tab)
        await pg.click("nav.tabs >> text=Progressi"); await pg.click("[data-act=c-add-prog]"); await pg.wait_for_timeout(200); await reflow("pannello elementi")
        await pg.keyboard.press("Escape")
        await pg.click("[data-act=c-edit-prog] >> nth=0"); await pg.wait_for_timeout(200); await reflow("pannello modifica")
        await pg.keyboard.press("Escape")
        await pg.goto(B); await pg.wait_for_timeout(300); await reflow("alunno")

        # pagina design system (#/design, solo dev)
        await pg.goto(B + "#/design"); await pg.wait_for_timeout(400)
        assert await pg.locator(".ds header h1").inner_text() == "Design system"
        assert await pg.locator("#dsContrast td.ko").count() == 0, "coppie di colori sotto soglia WCAG"
        await pg.check("[data-pref=text]"); await pg.check("[data-pref=contrast]"); await pg.check("[data-pref=motion]")
        assert await pg.evaluate("parseFloat(document.documentElement.style.fontSize)") >= 20, "testo più grande attivo"
        small = await pg.evaluate(MIN); assert not small, ("design", small)
        await pg.uncheck("[data-pref=text]"); await pg.uncheck("[data-pref=contrast]"); await pg.uncheck("[data-pref=motion]")

        # rigenera esempi e uscita dalla modalità dev
        await pg.goto(B + "#/coach"); await pg.wait_for_timeout(300)
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
        await pg.click("[data-act=dev-exit]"); await pg.wait_for_timeout(500)
        assert await pg.evaluate("parseFloat(getComputedStyle(document.documentElement).fontSize)") >= base * 1.3 - .1, "la preferenza resta fuori dalla modalità dev"
        assert await pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--pink').trim()") == "#f4a6c8", "gli override colore dev non arrivano agli utenti"

        await b.close()
        assert not errs, errs
        print("OK")

asyncio.run(main())

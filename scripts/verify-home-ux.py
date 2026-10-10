"""Home enxuta (outubro/2026) no navegador, só com fixtures.
Confere: ícone de conta com alvo de 44 px; dica das horas só na primeira sessão; chance de chuva só
≥ 20%; ⓘ abre dentro da tela e fecha fora/Escape; radar compacto sem player que abre o diálogo;
"Agora não" no convite de alertas persiste; bolinhas e gesto lateral trocam de cidade; faixa de aviso
INMET laranja vigente (leitura atual) abre o detalhe; buscas recentes; Personalizar a Home (esconder,
reordenar, persistir, restaurar) e duas colunas a partir de 1100 px. Não testa conta, Push ou radar real.
"""
import datetime, json, os, shutil, subprocess, tempfile
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
# WebKit relata como pageerror (sem stack) a consulta do RainViewer cancelada por navegação/recarga;
# o radar compacto da Home inicia cedo no desktop. Só esta mensagem de rede é ignorada; exceções JS falham.
RAINVIEWER_CANCELLED='/api.rainviewer.com/public/weather-maps.json due to access control checks.'

repo = Path(__file__).resolve().parent.parent
preview = os.environ.get('PLUVIA_PREVIEW_URL', 'http://127.0.0.1:4173').rstrip('/')
origin = (urlparse(preview).scheme, urlparse(preview).netloc)
output = Path(os.environ.get('PLUVIA_QA_OUTPUT', str(Path(tempfile.gettempdir()) / 'pluvia-qa'))) / 'home-ux'
output.mkdir(parents=True, exist_ok=True)
base = json.loads(subprocess.check_output(['node', '-e', "process.stdout.write(JSON.stringify(require('./tests/support/forecast.cjs').forecast()))"], cwd=repo, text=True))
engine = os.environ.get('PLUVIA_BROWSER', 'chromium')
fixed = datetime.datetime(2026, 10, 1, 16, 30, tzinfo=datetime.timezone.utc)
ORANGE = {'id': 888888, 'descricao': 'Acumulado de chuva', 'geocodes': '1302603', 'severidade': 'Perigo',
          'inicio': '2026-10-01T00:00:00-04:00', 'fim': '2026-10-02T23:00:00-04:00'}
YELLOW = {'id': 888889, 'descricao': 'Baixa Umidade', 'geocodes': '1302603', 'severidade': 'Perigo Potencial',
          'inicio': '2026-10-01T00:00:00-04:00', 'fim': '2026-10-02T23:00:00-04:00'}
report = []

def no_overflow(page, label):
    width = page.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    assert width[0] <= width[1], (label, 'rolagem lateral', width)

with sync_playwright() as p:
    browser = p.webkit.launch(headless=True) if engine == 'webkit' else p.chromium.launch(
        headless=True, args=['--no-sandbox'], **({'executable_path': shutil.which('chromium')} if shutil.which('chromium') else {}))
    for width, height in [(390, 844), (1366, 900)]:
        mobile = width < 800
        mode = {'alert': False}
        context = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=mobile and engine != 'firefox', has_touch=mobile,
                                      timezone_id='Asia/Tokyo', service_workers='block', reduced_motion='reduce')
        def route(r):
            url = r.request.url; query = parse_qs(urlparse(url).query)
            if 'api.open-meteo.com/v1/forecast' in url:
                data = json.loads(json.dumps(base)); data['timezone'] = query.get('timezone', ['America/Manaus'])[0]
                r.fulfill(json=data); return
            if 'air-quality-api' in url: r.fulfill(json={'current': {'time': base['current']['time'], 'us_aqi': 35}}); return
            if 'inmet.gov.br' in url: r.fulfill(json={'hoje': ([ORANGE, YELLOW] if mode['alert'] == 'both' else [YELLOW if mode['alert'] == 'yellow' else ORANGE]) if mode['alert'] else [], 'amanha': []}); return
            if 'rainviewer.com' in url: r.fulfill(headers={'Access-Control-Allow-Origin': '*'}, json={'host': 'https://radar.test', 'radar': {'past': []}}); return
            if 'functions/v1/met-forecast' in url: r.fulfill(json={'source': 'MET Norway', 'hourly': []}); return
            if '/auth/v1/settings' in url: r.fulfill(json={'external': {'email': True, 'google': False, 'apple': False}}); return
            if (urlparse(url).scheme, urlparse(url).netloc) == origin: r.continue_(); return
            r.abort()
        context.route('**/*', route)
        # Só na primeira abertura: semeia cidade e favoritos; as próximas abas conservam o que o app gravou.
        context.add_init_script("if(!localStorage.getItem('pluvia-qa-seeded')){localStorage.setItem('pluvia-qa-seeded','1');"
                                "localStorage.setItem('pluvia-city',JSON.stringify('1302603'));localStorage.setItem('pluvia-favorites',JSON.stringify(['1501402','3550308']));}"
                                "sessionStorage.setItem('pluvia-intro-seen','1');"
                                "Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,fail){fail({code:1})}}});")
        errors = []
        # Relógio fixo uma vez no contexto: no WebKit, set_fixed_time numa aba nova (about:blank) falha.
        context.clock.set_fixed_time(fixed)
        def open_page(city='Manaus'):
            page = context.new_page()
            page.on('pageerror', lambda error: None if str(error).endswith(RAINVIEWER_CANCELLED) else errors.append(str(error)))
            page.goto(preview + '/', wait_until='domcontentloaded')
            page.wait_for_function("document.getElementById('temperature').textContent.trim()==='30' && !document.documentElement.classList.contains('awaiting-styles')", timeout=20000)
            page.wait_for_function(f"document.getElementById('cityName').textContent.includes({json.dumps(city)})", timeout=10000)
            page.wait_for_timeout(400)
            return page

        page = open_page()
        # Conta deslogada: ícone com alvo de 44 px e nome acessível.
        account = page.evaluate("""() => { const b = document.getElementById('accountButton'), r = b.getBoundingClientRect(), icon = b.querySelector('.account-icon');
          return {w:r.width, h:r.height, icon:Boolean(icon && icon.getBoundingClientRect().width), label:b.textContent.trim() + ' ' + (b.getAttribute('aria-label') || '')}; }""")
        assert account['icon'] and account['w'] >= 44 and account['h'] >= 44 and 'Entrar' in account['label'], account
        # Dica das horas e chance de chuva só quando relevante.
        hint = page.evaluate("""() => { const d = document.getElementById('hourlyDecision'), peek = document.getElementById('hourlyPeek');
          const rains = [...peek.querySelectorAll('.peek-rain')];
          return {hidden:d.hidden, text:d.textContent, state:peek.dataset.rain, shown:rains.filter(r => r.getClientRects().length).length, filled:rains.filter(r => r.textContent.trim()).length,
            labels:[...peek.querySelectorAll('.hourly-peek-item')].every(b => /chance de chuva/.test(b.querySelector('.peek-extra')?.textContent || ''))}; }""")
        assert not hint['hidden'] and 'Toque' in hint['text'] and hint['labels'], hint
        assert hint['state'] in ('some', 'none') and (hint['shown'] == 0 if hint['state'] == 'none' else hint['filled'] >= 1), hint
        # ⓘ: cada um abre dentro da tela, só um por vez; clique fora e Escape fecham.
        tips = page.locator('#weatherView .info-tip > summary')
        assert tips.count() >= 4, tips.count()
        for index in range(tips.count()):
            tip = tips.nth(index)
            tip.scroll_into_view_if_needed(); tip.click(); page.wait_for_timeout(150)  # o evento toggle chega depois do clique
            box = page.evaluate("""() => { const open = [...document.querySelectorAll('.info-tip[open]')], body = document.querySelector('.info-tip-body[data-inline]')?.getBoundingClientRect();
              // O balão precisa estar por cima do conteúdo seguinte (a lista de horas tinha z-index próprio).
              const node = document.querySelector('.info-tip-body[data-inline]'); const bodies = document.querySelectorAll('.info-tip-body[data-inline]').length; let covered = 0;
              node?.scrollIntoView({block:'center', behavior:'instant'}); const seen = node?.getBoundingClientRect() || body;
              for (const fx of [.2, .5, .8]) for (const fy of [.25, .5, .75]) { const hit = document.elementFromPoint(seen.left + seen.width * fx, seen.top + seen.height * fy); if (node?.contains(hit)) covered++; }
              return {open:open.length, left:body?.left, right:body?.right, width:document.documentElement.clientWidth, covered, bodies}; }""")
            assert box['open'] == 1 and box['left'] >= 0 and box['right'] <= box['width'] and box['covered'] == 9 and box['bodies'] == 1, (width, index, box)
        page.keyboard.press('Escape')
        assert page.evaluate("document.querySelectorAll('.info-tip[open]').length") == 0
        tips.nth(0).click(); page.mouse.click(5, 5)
        assert page.evaluate("document.querySelectorAll('.info-tip[open]').length") == 0
        # Radar compacto: sem player/chips na Home; tocar no mapa abre o diálogo com o player.
        page.locator('.weather-map-card').scroll_into_view_if_needed(); page.wait_for_timeout(300)
        assert page.evaluate("[...document.querySelectorAll('.weather-map-card .weather-player > *')].every(e => !e.getClientRects().length)")
        stage = page.evaluate("(() => { const r = document.querySelector('.weather-map-card .weather-map-stage, #weatherMap').getBoundingClientRect(); return r.height; })()")
        assert 150 <= stage <= 260, stage
        page.click('#radarStageOpen', force=True)
        page.wait_for_function("document.getElementById('radarDialog').open", timeout=5000)
        page.keyboard.press('Escape'); page.wait_for_function("!document.getElementById('radarDialog').open", timeout=5000)
        # O convite fixo de alertas saiu da Home (fica só o convite contextual).
        assert page.locator('#notificationPrompt').count() == 0
        # Duas colunas só a partir de 1100 px.
        columns = page.evaluate("""() => { const cols = [...document.querySelectorAll('.home-columns > .home-column')].map(c => c.getBoundingClientRect());
          return {count:cols.length, side:cols.length === 2 && cols[0].right <= cols[1].left && Math.abs(cols[0].top - cols[1].top) < 2}; }""")
        assert columns == ({'count': 2, 'side': True} if width >= 1100 else {'count': 0, 'side': False}), (width, columns)
        no_overflow(page, (width, 'home'))
        page.screenshot(path=str(output / f'{engine}-{width}-home.png'), full_page=True)

        # Nova aba: dica não volta e o convite dispensado continua fora.
        page.close(); page = open_page()
        assert page.evaluate("document.getElementById('hourlyDecision').hidden"), 'dica das horas só na primeira sessão'

        # Bolinhas e gesto lateral.
        dots = page.evaluate("[...document.querySelectorAll('#cityDots .city-dot')].map(d => [d.dataset.cityId, d.getAttribute('aria-current'), d.getAttribute('aria-label'), d.getBoundingClientRect().height])")
        assert [d[0] for d in dots] == ['1302603', '1501402', '3550308'] and dots[0][1] == 'true' and dots[1][2] == 'Belém/PA', dots
        page.click('#cityDots .city-dot[data-city-id="1501402"]')
        page.wait_for_function("document.getElementById('cityName').textContent.includes('Belém') && document.getElementById('temperature').textContent.trim()==='30'", timeout=10000)
        def swipe(dx):
            page.evaluate("""dx => { const area = document.getElementById('agora'), r = area.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + 80;
              const fire = (type, list, x2) => { const e = new Event(type, {bubbles:true}); Object.defineProperty(e, list, {value:[{clientX:x2, clientY:y}]});
                if (list === 'touches') Object.defineProperty(e, 'changedTouches', {value:[{clientX:x2, clientY:y}]}); area.dispatchEvent(e); };
              fire('touchstart', 'touches', x); fire('touchend', 'changedTouches', x + dx); }""", dx)
        swipe(-140)
        page.wait_for_function("document.getElementById('cityName').textContent.includes('São Paulo')", timeout=10000)
        swipe(30)  # curto demais: não troca
        page.wait_for_timeout(300)
        assert 'São Paulo' in page.text_content('#cityName')
        swipe(140)
        page.wait_for_function("document.getElementById('cityName').textContent.includes('Belém')", timeout=10000)

        # Buscas recentes: a cidade aberta pela busca aparece primeiro, identificada.
        page.click('#openCitySearch'); page.wait_for_function("document.getElementById('cityDialog').open")
        page.fill('#citySearch', 'Recife'); page.wait_for_selector('.city-result[data-id="2611606"]', timeout=5000)
        page.click('.city-result[data-id="2611606"]')
        page.wait_for_function("document.getElementById('cityName').textContent.includes('Recife')", timeout=10000)
        # A ativa não aparece como recente: volta a uma favorita (bolinha) antes de reabrir a busca.
        page.click('#cityDots .city-dot[data-city-id="1501402"]')
        page.wait_for_function("document.getElementById('cityName').textContent.includes('Belém') && document.getElementById('temperature').textContent.trim()==='30'", timeout=10000)
        page.click('#openCitySearch'); page.wait_for_function("document.getElementById('cityDialog').open")
        page.fill('#citySearch', ''); page.dispatch_event('#citySearch', 'input')
        recent = page.evaluate("(() => { const b = document.querySelector('.city-result'); return [b?.dataset.id, b?.querySelector('small')?.textContent]; })()")
        assert recent[0] == '2611606' and recent[1].startswith('Recente'), recent
        page.fill('#citySearch', 'Manaus'); page.wait_for_selector('.city-result[data-id="1302603"]', timeout=5000)
        page.click('.city-result[data-id="1302603"]')
        page.wait_for_function("document.getElementById('cityName').textContent.includes('Manaus') && document.getElementById('temperature').textContent.trim()==='30'", timeout=10000)

        # Personalizar a Home: esconder o radar, subir o céu, persistir e restaurar.
        page.click('#openHomeLayout'); page.wait_for_function("document.getElementById('homeLayoutDialog').open", timeout=5000)
        dialog = page.evaluate("""() => { const d = document.getElementById('homeLayoutDialog'), r = d.getBoundingClientRect();
          return {items:document.querySelectorAll('#homeLayoutList li').length, inside:r.left >= 0 && r.right <= innerWidth + 0.5,
            small:[...d.querySelectorAll('#homeLayoutList button,#homeLayoutReset')].filter(b => b.getBoundingClientRect().height < 44).length}; }""")
        assert dialog == {'items': 5, 'inside': True, 'small': 0}, dialog
        page.uncheck('#homeLayoutList input[data-toggle="radar"]')
        page.click('#homeLayoutList [data-move="sky"][data-delta="-1"]')
        state = page.evaluate("""() => ({radar:document.querySelector('section.weather-map-section').getClientRects().length,
          order:JSON.parse(localStorage.getItem('pluvia-home-layout')).order})""")
        assert state['radar'] == 0 and state['order'].index('sky') == 3, state
        page.screenshot(path=str(output / f'{engine}-{width}-layout.png'))
        page.keyboard.press('Escape'); page.wait_for_function("!document.getElementById('homeLayoutDialog').open", timeout=5000)
        page.close(); page = open_page()
        state = page.evaluate("""() => { const sky = document.querySelector('section.sun-section'), week = document.querySelector('section.forecast-section');
          return {radar:document.querySelector('section.weather-map-section').getClientRects().length,
            skyFirst:Boolean(sky.compareDocumentPosition(week) & Node.DOCUMENT_POSITION_FOLLOWING)}; }""")
        assert state['radar'] == 0 and (state['skyFirst'] or width >= 1100), state
        page.click('#openHomeLayout'); page.wait_for_function("document.getElementById('homeLayoutDialog').open", timeout=5000)
        page.click('#homeLayoutReset')
        assert page.evaluate("document.querySelector('section.weather-map-section').getClientRects().length") == 1
        page.keyboard.press('Escape'); page.wait_for_function("!document.getElementById('homeLayoutDialog').open", timeout=5000)

        # Faixa de aviso laranja vigente: aparece no topo e abre o detalhe do aviso.
        mode['alert'] = True
        page.close(); page = open_page()
        page.wait_for_function("!document.getElementById('alertBanner').hidden", timeout=10000)
        banner = page.evaluate("""() => { const b = document.getElementById('alertBanner'), r = b.getBoundingClientRect();
          return {severity:b.dataset.severity, title:b.textContent, h:r.height, inside:r.left >= 0 && r.right <= innerWidth + 0.5}; }""")
        assert banner['severity'] == 'orange' and 'Alerta laranja do INMET' in banner['title'] and banner['h'] >= 44 and banner['inside'], banner
        page.screenshot(path=str(output / f'{engine}-{width}-alert.png'))
        page.click('#alertBanner')
        page.wait_for_function("document.getElementById('alertDetail').open", timeout=5000)
        page.keyboard.press('Escape')
        no_overflow(page, (width, 'alerta'))
        # Amarelo vigente também sobe, numa faixa discreta (mais baixa, sem sombra), com alvo de 44 px.
        mode['alert'] = 'yellow'
        page.close(); page = open_page()
        page.wait_for_function("!document.getElementById('alertBanner').hidden", timeout=10000)
        banner = page.evaluate("""() => { const b = document.getElementById('alertBanner'), r = b.getBoundingClientRect(), cs = getComputedStyle(b);
          return {severity:b.dataset.severity, title:b.textContent, h:r.height, shadow:cs.boxShadow, inside:r.left >= 0 && r.right <= innerWidth + 0.5}; }""")
        assert banner['severity'] == 'yellow' and 'Alerta amarelo do INMET' in banner['title'] and banner['h'] >= 44 and banner['shadow'] == 'none' and banner['inside'], banner
        page.screenshot(path=str(output / f'{engine}-{width}-alert-yellow.png'))
        no_overflow(page, (width, 'alerta amarelo'))
        # Com aviso vigente a faixa substitui o cartão; outros avisos da região ficam no detalhe, um toque cada.
        mode['alert'] = 'both'
        page.close(); page = open_page()
        page.wait_for_function("!document.getElementById('alertBanner').hidden && document.getElementById('alertas').dataset.alertState === 'banner'", timeout=10000)
        state = page.evaluate("[document.getElementById('alertas').getClientRects().length, document.getElementById('alertBannerTime').textContent]")
        assert state[0] == 0 and state[1].endswith('· +1 aviso na região'), state
        page.click('#alertBanner')
        page.wait_for_function("document.getElementById('alertDetail').open", timeout=5000)
        assert page.locator('#alertDetail .inmet-detail-other').count() == 1
        first = page.locator('#alertDetailTitle').text_content()
        page.locator('#alertDetail .inmet-detail-other').click()
        page.wait_for_function("t => document.getElementById('alertDetailTitle').textContent !== t", arg=first, timeout=5000)
        assert page.evaluate("document.getElementById('alertDetail').open")
        page.screenshot(path=str(output / f'{engine}-{width}-alert-detail.png'))
        page.keyboard.press('Escape')
        no_overflow(page, (width, 'dois avisos'))
        mode['alert'] = False
        assert not errors, errors
        report.append(f'{width}px ok')
        context.close()
    browser.close()

print(f'verify-home-ux ({engine}): ' + ', '.join(report))

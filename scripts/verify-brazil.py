"""Brasil agora no navegador, só com fixtures.
Confere que a abertura não consulta as capitais, que o diálogo faz uma única consulta com as 27 capitais e os 28 pontos do interior
coordenadas, agrupa por região, alinha temperatura e máx./mín. entre as linhas sem estourar a largura
(320 a 1366 px), que falha vira mensagem clara, e que tocar numa capital abre a cidade. Não testa a API real.
"""
import datetime, json, os, random, shutil, subprocess, tempfile
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
# WebKit relata como pageerror (sem stack) a consulta do RainViewer cancelada por navegação/recarga;
# o radar compacto da Home inicia cedo no desktop. Só esta mensagem de rede é ignorada; exceções JS falham.
RAINVIEWER_CANCELLED='/api.rainviewer.com/public/weather-maps.json due to access control checks.'

repo = Path(__file__).resolve().parent.parent
preview = os.environ.get('PLUVIA_PREVIEW_URL', 'http://127.0.0.1:4173').rstrip('/')
origin = (urlparse(preview).scheme, urlparse(preview).netloc)
output = Path(os.environ.get('PLUVIA_QA_OUTPUT', str(Path(tempfile.gettempdir()) / 'pluvia-qa'))) / 'brazil'
output.mkdir(parents=True, exist_ok=True)
base = json.loads(subprocess.check_output(['node', '-e', "process.stdout.write(JSON.stringify(require('./tests/support/forecast.cjs').forecast()))"], cwd=repo, text=True))
engine = os.environ.get('PLUVIA_BROWSER', 'chromium')
calls, fail, report = [], {'capitals': False}, []

with sync_playwright() as p:
    browser = p.webkit.launch(headless=True) if engine == 'webkit' else p.chromium.launch(
        headless=True, args=['--no-sandbox'], **({'executable_path': shutil.which('chromium')} if shutil.which('chromium') else {}))
    for width, height in [(320, 640), (390, 844), (1366, 900)]:
        mobile = width < 800
        context = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=mobile and engine != 'firefox', has_touch=mobile,
                                      timezone_id='Asia/Tokyo', service_workers='block', reduced_motion='reduce')
        def route(r):
            url = r.request.url; query = parse_qs(urlparse(url).query)
            if 'api.open-meteo.com/v1/forecast' in url:
                lats = query.get('latitude', [''])[0].split(',')
                if len(lats) > 1:
                    calls.append(len(lats))
                    if fail['capitals']: r.abort(); return
                    random.seed(len(calls))
                    r.fulfill(json=[{'current': {'temperature_2m': round(-3 + random.random() * 38, 1), 'weather_code': random.choice([0, 1, 2, 3, 61, 95]), 'is_day': 1},
                                     'daily': {'temperature_2m_max': [35 if i else 9], 'temperature_2m_min': [-4 if i == 5 else 22]}} for i, _ in enumerate(lats)]); return
                data = json.loads(json.dumps(base)); data['timezone'] = query.get('timezone', ['America/Manaus'])[0]
                r.fulfill(json=data); return
            if 'air-quality-api' in url: r.fulfill(json={'current': {'time': base['current']['time'], 'us_aqi': 35}}); return
            if 'inmet.gov.br' in url: r.fulfill(json={'hoje': [], 'amanha': []}); return
            if 'rainviewer.com' in url: r.fulfill(headers={'Access-Control-Allow-Origin': '*'}, json={'host': 'https://radar.test', 'radar': {'past': []}}); return
            if 'functions/v1/met-forecast' in url: r.fulfill(json={'source': 'MET Norway', 'hourly': []}); return
            if (urlparse(url).scheme, urlparse(url).netloc) == origin: r.continue_(); return
            r.abort()
        context.route('**/*', route)
        context.add_init_script("sessionStorage.setItem('pluvia-intro-seen','1');localStorage.setItem('pluvia-terms-notice',JSON.stringify({version:'2026-10-13'}));localStorage.setItem('pluvia-city',JSON.stringify('1302603'));"
                                "Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,fail){fail({code:1})}}});")
        page = context.new_page(); errors = []
        page.on('pageerror', lambda error: None if str(error).endswith(RAINVIEWER_CANCELLED) else errors.append(str(error)))
        page.clock.set_fixed_time(datetime.datetime(2026, 10, 1, 16, 30, tzinfo=datetime.timezone.utc))
        calls.clear()
        page.goto(preview + '/', wait_until='domcontentloaded')
        page.wait_for_function("document.getElementById('temperature').textContent.trim()==='30' && !document.documentElement.classList.contains('awaiting-styles')", timeout=20000)
        page.wait_for_timeout(500)
        assert not calls, (width, 'a abertura não consulta as capitais')
        # Falha primeiro: mensagem clara e nenhuma linha.
        fail['capitals'] = True
        page.click('#openCitySearch'); page.wait_for_function("document.getElementById('cityDialog').open")
        page.click('#brazilOpen')
        page.wait_for_function("document.getElementById('brazilDialog').open && /Não foi possível consultar as capitais/.test(document.getElementById('brazilStatus').textContent)", timeout=10000)
        assert page.locator('.brazil-row').count() == 0
        page.keyboard.press('Escape'); page.wait_for_function("!document.getElementById('brazilDialog').open", timeout=3000)
        fail['capitals'] = False
        page.click('#openCitySearch'); page.wait_for_function("document.getElementById('cityDialog').open")
        page.click('#brazilOpen')
        page.wait_for_function("document.querySelectorAll('.brazil-row').length===27", timeout=10000)
        assert calls == [55, 55], (width, calls)  # 27 capitais + 28 pontos do interior do campo de cores
        state = page.evaluate("""() => { const dialog = document.getElementById('brazilDialog'), rows = [...document.querySelectorAll('.brazil-row')];
          const edge = selector => [...new Set(rows.map(row => { const node = row.querySelector(selector); return node.getClientRects().length ? Math.round(node.getBoundingClientRect().right) : null; }))];
          return {overflow:dialog.scrollWidth > dialog.clientWidth + 1 || rows.some(row => row.scrollWidth > row.clientWidth + 1),
            regions:[...document.querySelectorAll('.brazil-list h3')].map(h => h.textContent), temps:edge('.brazil-temp'), ranges:edge('.brazil-range'),
            label:rows[0].getAttribute('aria-label'), focus:document.activeElement.id, cityOpen:document.getElementById('cityDialog').open,
            minHeight:Math.min(...rows.map(row => row.getBoundingClientRect().height))}; }""")
        assert state['regions'] == ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'] and not state['overflow'] and not state['cityOpen'], (width, state)
        assert len(state['temps']) == 1 and len(state['ranges']) == 1 and state['minHeight'] >= 44 and state['focus'] == 'brazilClose', (width, state)
        assert state['ranges'] != [None] or width <= 360, (width, state)
        assert state['label'].startswith('Belém/PA:') and 'Abrir cidade' in state['label'], state['label']
        page.screenshot(path=str(output / f'{engine}-{width}.png'))
        # Mapa 3D (1.64.1): cada etiqueta no ponto projetado da sua âncora, dentro do mapa, inclusive depois de girar.
        # Na 1.64 as etiquetas eram 3D e no Safari do iPhone saíam do lugar; a captura do mapa fica para conferência.
        page.wait_for_function("document.querySelector('#brazilMap .brazil-labels[data-ready]')", timeout=5000)
        page.locator('#brazilMap').scroll_into_view_if_needed()
        def labels_ok(tag):
            geo = page.evaluate("""() => { const map = document.getElementById('brazilMap').getBoundingClientRect();
              const anchors = [...document.querySelectorAll('#brazilMap .brazil-anchor')], chips = [...document.querySelectorAll('#brazilMap .brazil-chip')];
              return {count:chips.length, anchors:anchors.length, worst:Math.max(...chips.map((chip, i) => { const c = chip.getBoundingClientRect(), a = anchors[i].getBoundingClientRect();
                return Math.hypot(c.left + c.width / 2 - a.left, c.top + c.height / 2 - a.top); })),
                outside:chips.filter(chip => { const c = chip.getBoundingClientRect(); return c.left < map.left - 24 || c.right > map.right + 24 || c.top < map.top - 24 || c.bottom > map.bottom + 24; }).length}; }""")
            assert geo['count'] == 27 and geo['anchors'] == 27 and geo['worst'] <= 2 and geo['outside'] == 0, (width, tag, geo)
            page.locator('#brazilMap').screenshot(path=str(output / f'{engine}-{width}-map-{tag}.png'))
        labels_ok('tilted')
        if not mobile:
            box = page.locator('#brazilMap').bounding_box()
            page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2); page.mouse.down()
            page.mouse.move(box['x'] + box['width'] / 2 + 60, box['y'] + box['height'] / 2, steps=6); page.mouse.up()
            page.wait_for_timeout(200)
            labels_ok('spun')
        page.locator('.brazil-row[data-city-id="4314902"]').click()
        page.wait_for_function("!document.getElementById('brazilDialog').open && /Porto Alegre/.test(document.getElementById('cityName').textContent)", timeout=10000)
        assert not errors, (width, errors)
        report.append({'width': width, 'capitals': 27})
        context.close()
    browser.close()
print(json.dumps({'browser': engine, 'cases': report}))

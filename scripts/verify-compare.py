"""Comparar cidades no navegador, só com fixtures.
Confere que a abertura não consulta a cidade de comparação, que o diálogo abre a partir de
"Suas cidades" com locais salvos, favoritos e capitais, que as linhas ficam lado a lado sem
estourar a largura (320 a 1366 px), que falhas da previsão ou do ar viram "Indisponível" com
mensagem clara, que Escape fecha e que os atalhos do PWA (?abrir=) abrem o diálogo certo uma vez. Não testa APIs reais nem leitor de tela físico.
"""
import datetime, json, os, shutil, subprocess, tempfile
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

repo = Path(__file__).resolve().parent.parent
preview = os.environ.get('PLUVIA_PREVIEW_URL', 'http://127.0.0.1:4173').rstrip('/')
origin = (urlparse(preview).scheme, urlparse(preview).netloc)
output = Path(os.environ.get('PLUVIA_QA_OUTPUT', str(Path(tempfile.gettempdir()) / 'pluvia-qa'))) / 'compare'
output.mkdir(parents=True, exist_ok=True)
base = json.loads(subprocess.check_output(['node', '-e', "process.stdout.write(JSON.stringify(require('./tests/support/forecast.cjs').forecast()))"], cwd=repo, text=True))
engine = os.environ.get('PLUVIA_BROWSER', 'chromium')
COMPARE_HOURLY = 'precipitation_probability,precipitation,weather_code'
calls, fail, report = [], {'air': False, 'weather': False}, []

def weather(query):
    data = json.loads(json.dumps(base)); data['timezone'] = query.get('timezone', ['America/Manaus'])[0]
    if query.get('latitude', [''])[0].startswith('-1.4'):  # Belém: mais quente, com chuva às 14h
        size = len(data['hourly']['time'])
        data['current'].update(temperature_2m=33, apparent_temperature=39)
        data['hourly']['precipitation'] = [0, 0, 0, 0, 4, 2] + [0] * (size - 6)
        data['hourly']['precipitation_probability'] = [10, 10, 10, 10, 80, 70] + [10] * (size - 6)
    return data

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
                calls.append(query.get('hourly', [''])[0] == COMPARE_HOURLY)
                if fail['weather'] and query.get('latitude', [''])[0].startswith('-8.'): r.abort(); return
                r.fulfill(json=weather(query)); return
            if 'air-quality-api' in url:
                if fail['air']: r.abort(); return
                r.fulfill(json={'current': {'time': base['current']['time'], 'us_aqi': 120 if query.get('latitude', [''])[0].startswith('-1.4') else 35}}); return
            if 'inmet.gov.br' in url: r.fulfill(json={'hoje': [], 'amanha': []}); return
            # Metadados do radar como fixture: o WebKit registra como erro de página um fetch CORS abortado.
            if 'rainviewer.com' in url: r.fulfill(json={'host': 'https://radar.test', 'radar': {'past': []}}); return
            if 'functions/v1/met-forecast' in url: r.fulfill(json={'source': 'MET Norway', 'hourly': []}); return
            if (urlparse(url).scheme, urlparse(url).netloc) == origin: r.continue_(); return
            r.abort()
        context.route('**/*', route)
        context.add_init_script("sessionStorage.setItem('pluvia-intro-seen','1');localStorage.setItem('pluvia-city',JSON.stringify('1302603'));"
                                "localStorage.setItem('pluvia-favorites',JSON.stringify(['1501402','2611606']));"
                                "localStorage.setItem('pluvia-named-places-guest-v1',JSON.stringify([{id:'p1',name:'Faculdade',cityId:'1501402',cityName:'Belém',uf:'PA',updatedAt:1}]));"
                                "Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,fail){fail({code:1})}}});")
        page = context.new_page(); errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.clock.set_fixed_time(datetime.datetime(2026, 10, 1, 16, 30, tzinfo=datetime.timezone.utc))
        calls.clear()
        page.goto(preview + '/', wait_until='domcontentloaded')
        page.wait_for_function("document.getElementById('temperature').textContent.trim()==='30' && !document.documentElement.classList.contains('awaiting-styles')", timeout=20000)
        page.wait_for_timeout(500)
        assert not any(calls), (width, 'a abertura não consulta cidades de comparação', calls)
        page.click('#openCitySearch'); page.wait_for_function("document.getElementById('cityDialog').open")
        page.click('#compareOpen')
        page.wait_for_function("document.getElementById('compareDialog').open && document.querySelectorAll('#compareTable tbody tr').length===5 && !/Consultando/.test(document.getElementById('compareTable').textContent)", timeout=15000)
        state = page.evaluate("""() => { const dialog = document.getElementById('compareDialog'), table = document.getElementById('compareTable');
          const cells = [...table.querySelectorAll('tbody tr')].map(row => [...row.children].map(cell => { const r = cell.getBoundingClientRect(); return {left:r.left, right:r.right, top:r.top}; }));
          return {cityOpen:document.getElementById('cityDialog').open, head:[...table.querySelectorAll('thead th')].map(e => e.firstChild.textContent),
            selected:document.getElementById('compareCity').value, groups:[...document.querySelectorAll('#compareCity optgroup')].map(g => g.label),
            overflow:dialog.scrollWidth > dialog.clientWidth + 1 || table.scrollWidth > table.parentElement.clientWidth + 1,
            sideBySide:cells.every(row => Math.abs(row[1].top - row[2].top) < 2 && row[1].right <= row[2].left + 1),
            roles:[table.getAttribute('role'), table.querySelector('tbody th').getAttribute('role'), table.querySelector('tbody td').getAttribute('role')],
            text:table.innerText, focus:document.activeElement.id}; }""")
        assert not state['cityOpen'] and state['head'] == ['Manaus', 'Belém'] and state['selected'] == '1501402', (width, state)
        assert state['groups'] == ['Meus locais', 'Favoritos', 'Capitais'] and not state['overflow'] and state['sideBySide'], (width, state)
        assert state['roles'] == ['table', 'rowheader', 'cell'] and state['focus'] == 'compareClose', (width, state)
        assert 'Leve guarda-chuva: chuva moderada a partir das 14h.' in state['text'] and 'Ruim para grupos sensíveis' in state['text'], state['text']
        page.screenshot(path=str(output / f'{engine}-{width}.png'))
        fail['weather'] = True; page.select_option('#compareCity', '2611606')
        page.wait_for_function("/Não foi possível consultar/.test(document.getElementById('compareStatus').textContent)", timeout=15000)
        assert 'Indisponível' in page.locator('#compareTable').inner_text(), width
        fail['weather'] = False; fail['air'] = True; page.select_option('#compareCity', '3550308')
        page.wait_for_function("/Qualidade do ar indisponível/.test(document.getElementById('compareStatus').textContent) && /AQI indisponível/.test(document.getElementById('compareTable').textContent)", timeout=15000)
        fail['air'] = False
        page.keyboard.press('Escape'); page.wait_for_function("!document.getElementById('compareDialog').open", timeout=3000)
        assert not errors, (width, errors)
        report.append({'width': width, 'rows': 5})
        context.close()
    # Atalhos do PWA (manifest): abrem o diálogo depois da intro e da previsão, limpam o endereço e não reabrem no reload.
    for action, dialog in [('cidades', 'cityDialog'), ('comparar', 'compareDialog'), ('radar', 'radarDialog')]:
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=engine != 'firefox', has_touch=True,
                                      timezone_id='Asia/Tokyo', service_workers='block', reduced_motion='reduce')
        context.route('**/*', route)
        context.add_init_script("localStorage.setItem('pluvia-city',JSON.stringify('1302603'));localStorage.setItem('pluvia-favorites',JSON.stringify(['1501402']));"
                                "window.__qaGeoCalls=0;Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,fail){window.__qaGeoCalls++;window.__qaGeo ? ok(window.__qaGeo) : fail({code:1})}}});")
        page = context.new_page(); errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.clock.set_fixed_time(datetime.datetime(2026, 10, 1, 16, 30, tzinfo=datetime.timezone.utc))
        page.goto(preview + f'/?abrir={action}&source=pwa', wait_until='domcontentloaded')
        page.wait_for_function(f"document.getElementById('{dialog}').open", timeout=20000)
        state = page.evaluate("() => ({url:location.pathname + location.search, intro:document.getElementById('pluviaIntro').hidden, open:[...document.querySelectorAll('dialog[open]')].map(d => d.id)})")
        assert state == {'url': '/?source=pwa', 'intro': True, 'open': [dialog]}, (action, state)
        if action == 'radar':
            # Recentralizar: abre centralizado no município, arrastar desliga o estado e o botão volta ao ponto.
            page.wait_for_function("!document.getElementById('weatherMapRecenter').hidden && document.getElementById('weatherMapRecenter').dataset.centered==='true'", timeout=15000)
            box = page.locator('#weatherMap').bounding_box(); x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
            page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x - 150, y - 80, steps=8); page.mouse.up()
            page.wait_for_function("document.getElementById('weatherMapRecenter').dataset.centered==='false'", timeout=5000)
            page.click('#weatherMapRecenter')
            page.wait_for_function("document.getElementById('weatherMapRecenter').dataset.centered==='true'", timeout=5000)
            assert page.evaluate("[...document.querySelectorAll('[data-weather-layer]')].filter(b => b.offsetParent).length") == 0, 'sem satélite/raios e sem grupo de camadas com só a Chuva'
            # Abrir o radar não pede localização; o pedido só acontece no toque (aqui negado → município).
            assert page.evaluate("window.__qaGeoCalls") == 1, 'geolocalização só pelo botão'
            assert 'Localização não permitida' in page.locator('#weatherFrameStatus').inner_text()
            # Com permissão: ponto "você está aqui", centralizado nele e sem trocar a cidade.
            page.evaluate("window.__qaGeo={coords:{latitude:-3.05,longitude:-59.9,accuracy:35}}")
            page.click('#weatherMapRecenter')
            page.wait_for_function("document.querySelector('.pluvia-user-dot') && document.getElementById('weatherMapRecenter').dataset.centered==='true' && /sua localização/.test(document.getElementById('weatherFrameStatus').textContent)", timeout=5000)
            assert page.evaluate("JSON.parse(localStorage.getItem('pluvia-city'))") == '1302603'
            assert page.evaluate("Object.keys(localStorage).filter(k => /-3\\.05|59\\.9/.test(localStorage.getItem(k) || '')).length") == 0, 'posição não é salva'
            page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x + 120, y + 60, steps=8); page.mouse.up()
            page.wait_for_function("document.getElementById('weatherMapRecenter').dataset.centered==='false'", timeout=5000)
            page.click('#weatherMapRecenter')
            page.wait_for_function("document.getElementById('weatherMapRecenter').dataset.centered==='true'", timeout=5000)
            report.append({'recenter': True})
        # Recarregar com a consulta da comparação em voo vira erro de página no WebKit (fetch CORS cancelado).
        if action == 'comparar':
            page.wait_for_function("document.querySelectorAll('#compareTable tbody tr').length===5 && !/Consultando/.test(document.getElementById('compareTable').textContent)", timeout=15000)
        page.wait_for_load_state('networkidle')  # radar e outras consultas em voo também virariam erro no WebKit
        page.reload(wait_until='domcontentloaded')
        page.wait_for_function("document.getElementById('temperature').textContent.trim()==='30' && document.getElementById('pluviaIntro').hidden", timeout=20000)
        page.wait_for_timeout(1000)
        assert page.evaluate("document.querySelectorAll('dialog[open]').length") == 0, (action, 'reload não reabre')
        assert not errors, (action, errors)
        report.append({'shortcut': action})
        context.close()
    browser.close()
print(json.dumps({'browser': engine, 'cases': report}))

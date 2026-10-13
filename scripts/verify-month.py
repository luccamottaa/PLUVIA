"""Últimos 30 dias no navegador, só com fixtures.
Confere que a abertura não consulta o mês, que o atalho da Home abre o diálogo com uma única consulta
past_days=30 da cidade aberta, que os números e as barras cabem sem estourar a largura (320 a 1366 px),
que a falha vira mensagem clara e que trocar de cidade fecha o diálogo. Não testa a API real.
"""
import datetime, json, os, shutil, subprocess, tempfile
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
RAINVIEWER_CANCELLED = '/api.rainviewer.com/public/weather-maps.json due to access control checks.'

repo = Path(__file__).resolve().parent.parent
preview = os.environ.get('PLUVIA_PREVIEW_URL', 'http://127.0.0.1:4173').rstrip('/')
origin = (urlparse(preview).scheme, urlparse(preview).netloc)
output = Path(os.environ.get('PLUVIA_QA_OUTPUT', str(Path(tempfile.gettempdir()) / 'pluvia-qa'))) / 'month'
output.mkdir(parents=True, exist_ok=True)
base = json.loads(subprocess.check_output(['node', '-e', "process.stdout.write(JSON.stringify(require('./tests/support/forecast.cjs').forecast()))"], cwd=repo, text=True))
engine = os.environ.get('PLUVIA_BROWSER', 'chromium')
calls, fail = [], {'month': False}

def month_fixture():
    start = datetime.date(2026, 9, 1)
    days = [start + datetime.timedelta(days=i) for i in range(31)]
    return {'daily': {'time': [d.isoformat() for d in days],
                      'temperature_2m_max': [31 + i % 4 for i in range(31)],
                      'temperature_2m_min': [22 + i % 3 for i in range(31)],
                      'precipitation_sum': [[0, 0, 3.2, 0, 18.5, 0.4][i % 6] for i in range(31)]}}

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
                if query.get('past_days', [''])[0] == '30':
                    calls.append(query.get('timezone', [''])[0])
                    if fail['month']: r.abort(); return
                    r.fulfill(json=month_fixture()); return
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
        assert not calls, (width, 'a abertura não consulta o mês')
        # Falha primeiro: mensagem clara e nenhum número.
        fail['month'] = True
        page.locator('#homeMonth').scroll_into_view_if_needed(); page.click('#homeMonth')
        page.wait_for_function("document.getElementById('monthDialog').open && /Não foi possível consultar/.test(document.getElementById('monthStatus').textContent)", timeout=10000)
        assert page.locator('#monthBody dd').count() == 0
        page.keyboard.press('Escape'); page.wait_for_function("!document.getElementById('monthDialog').open", timeout=3000)
        fail['month'] = False
        page.click('#homeMonth')
        page.wait_for_function("document.querySelectorAll('#monthBody dd').length===6", timeout=10000)
        assert calls == ['America/Manaus', 'America/Manaus'], (width, calls)
        state = page.evaluate("""() => { const dialog = document.getElementById('monthDialog'), values = [...document.querySelectorAll('#monthBody dd')];
          const bars = document.querySelectorAll('#monthBody .month-bar').length;
          return {overflow:dialog.scrollWidth > dialog.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1,
            values:values.map(dd => dd.firstChild.textContent), city:document.getElementById('monthCity').textContent,
            lead:document.querySelector('.month-lead')?.textContent || '', bars, focus:document.activeElement.id,
            chart:document.querySelector('.month-chart-bars').getAttribute('aria-hidden')}; }""")
        # 30 dias completos antes de 01/10 (02/09 a 30/09 e 01/09): o dia de hoje fica de fora.
        assert state['city'] == 'Manaus/AM · 01/09 a 30/09', state
        assert state['values'][0].endswith(' mm') and state['values'][1].isdigit() and state['values'][3] == '34°', state
        assert 'dos últimos 30 dias' in state['lead'] and state['bars'] > 0 and state['chart'] == 'true', state
        assert not state['overflow'] and state['focus'] == 'monthClose', (width, state)
        page.screenshot(path=str(output / f'month-{engine}-{width}.png'))
        # Trocar de cidade fecha o diálogo e não deixa a leitura antiga à vista.
        page.evaluate("chooseCity('3550308')")
        page.wait_for_function("!document.getElementById('monthDialog').open", timeout=5000)
        assert not errors, (width, errors)
        context.close()
    browser.close()
print('verify-month: ok')

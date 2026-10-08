"""Páginas das capitais (/clima/<nome>-<uf>/) no navegador, só com fixtures.
Confere que a página abre a própria cidade (inclusive com outra salva), faz uma única
consulta de previsão, não gera 404 nem erro de JS, acompanha a troca de cidade na URL e
expõe os links das capitais no rodapé. Não testa indexação real nem buscadores.
"""
import datetime, json, os, re, shutil, subprocess, tempfile
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

repo = Path(__file__).resolve().parent.parent
preview = os.environ.get('PLUVIA_PREVIEW_URL', 'http://127.0.0.1:4173').rstrip('/')
origin = (urlparse(preview).scheme, urlparse(preview).netloc)
output = Path(os.environ.get('PLUVIA_QA_OUTPUT', str(Path(tempfile.gettempdir()) / 'pluvia-qa'))) / 'city-pages'
output.mkdir(parents=True, exist_ok=True)
base = json.loads(subprocess.check_output(['node', '-e', "process.stdout.write(JSON.stringify(require('./tests/support/forecast.cjs').forecast()))"], cwd=repo, text=True))
engine = os.environ.get('PLUVIA_BROWSER', 'chromium')
report = []

with sync_playwright() as p:
    browser = p.webkit.launch(headless=True) if engine == 'webkit' else p.chromium.launch(
        headless=True, args=['--no-sandbox'], **({'executable_path': shutil.which('chromium')} if shutil.which('chromium') else {}))
    # gps-granted: permissão já concedida responde sem perguntar; a página não pode trocar de cidade.
    for label, saved, gps in [('first-visit', None, False), ('other-city-saved', '1302603', False), ('gps-granted', None, True)]:
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block', reduced_motion='reduce', timezone_id='Asia/Tokyo')
        forecasts, missing = [], []
        def route(r):
            url = r.request.url
            if 'api.open-meteo.com/v1/forecast' in url:
                query = parse_qs(urlparse(url).query); forecasts.append(query.get('latitude', ['?'])[0])
                data = json.loads(json.dumps(base)); data['timezone'] = query.get('timezone', ['America/Belem'])[0]
                r.fulfill(json=data); return
            if 'air-quality-api' in url: r.fulfill(json={'current': {'time': base['current']['time'], 'us_aqi': 35}}); return
            if 'inmet.gov.br' in url: r.fulfill(json={'hoje': [], 'amanha': []}); return
            if 'functions/v1/met-forecast' in url: r.fulfill(json={'source': 'MET Norway', 'hourly': []}); return
            if '/auth/v1/settings' in url: r.fulfill(json={'external': {'email': True, 'google': False, 'apple': False}}); return
            if (urlparse(url).scheme, urlparse(url).netloc) == origin: r.continue_(); return
            r.abort()
        context.route('**/*', route)
        geolocation = "ok({coords:{latitude:-3.119,longitude:-60.022}})" if gps else "fail({code:1})"
        context.add_init_script("sessionStorage.setItem('pluvia-intro-seen','1');window.__gpsCalls=0;Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,fail){window.__gpsCalls++;" + geolocation + ";}}});"
                                + (f"localStorage.setItem('pluvia-city',JSON.stringify('{saved}'));" if saved else ''))
        page = context.new_page(); errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: missing.append((response.status, response.url)) if response.status >= 400 and (urlparse(response.url).scheme, urlparse(response.url).netloc) == origin else None)
        page.clock.set_fixed_time(datetime.datetime(2026, 10, 1, 16, tzinfo=datetime.timezone.utc))
        page.goto(preview + '/clima/belem-pa', wait_until='domcontentloaded')  # sem barra: o servidor redireciona, como o Pages
        page.wait_for_function("document.getElementById('temperature').textContent.trim()!=='' && !document.getElementById('weatherView').classList.contains('initial-loading')", timeout=20000)
        state = page.evaluate("""() => ({city:document.getElementById('cityName').textContent, path:location.pathname, notice:document.getElementById('locationNotice').hidden,
          canonical:document.querySelector('link[rel=canonical]').href, links:document.querySelectorAll('.capital-links a').length,
          current:document.querySelector('.capital-links [aria-current=page]')?.textContent, note:document.querySelector('.capital-page-note')?.textContent})""")
        assert state['city'] == 'Belém' and state['path'] == '/clima/belem-pa/', (label, state)
        assert state['notice'], (label, 'o aviso de localização não aparece numa página de cidade')
        assert state['canonical'] == 'https://pluviaweather.com.br/clima/belem-pa/', state
        assert state['links'] == 27 and state['current'] == 'Belém' and 'capital do Pará' in state['note'], state
        page.wait_for_timeout(1500)
        assert page.evaluate("window.__gpsCalls") == 0, (label, 'a página de cidade não pede localização sozinha')
        assert page.evaluate("location.pathname") == '/clima/belem-pa/' and page.evaluate("document.getElementById('cityName').textContent") == 'Belém', label
        assert forecasts == ['-1.456'], (label, 'uma consulta, só de Belém', forecasts)
        page.evaluate("chooseCity('2611606')"); page.wait_for_function("location.pathname==='/clima/recife-pe/'")
        assert page.evaluate("document.querySelector('.capital-links [aria-current=page]')?.textContent") == 'Recife'
        page.evaluate("chooseCity('1501402')"); page.wait_for_function("location.pathname==='/clima/belem-pa/' && document.getElementById('cityName').textContent==='Belém'")
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'), label
        page.evaluate("document.querySelector('.capital-links details').open=true")
        page.locator('footer').screenshot(path=str(output / f'{engine}-{label}-footer.png'))
        assert not missing, (label, missing)
        assert not errors, (label, errors)
        report.append({'case': label, **state, 'forecastRequests': len(forecasts)})
        context.close()
    browser.close()
print(json.dumps({'browser': engine, 'cases': report}, ensure_ascii=False))

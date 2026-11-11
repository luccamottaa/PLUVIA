"""Brasil agora no navegador, só com fixtures.
Confere que a abertura não consulta as capitais, que o diálogo faz uma única consulta com as 27 capitais e os 28 pontos do interior,
agrupa por região, alinha temperatura e máx./mín. entre as linhas sem estourar a largura (320 a 1366 px), que falha vira mensagem
clara com as 27 capitais em "—" (mapa e lista), que capital sem leitura fica "—" nos dois, e o mapa plano: cada ponto na
coordenada projetada da capital, etiquetas sem sobreposição dentro do mapa, linha de chamada quando a etiqueta sai do ponto,
área de toque de 44 px e etiqueta que abre a cidade por toque e por teclado. Não testa a API real.
"""
import datetime, json, os, random, shutil, subprocess, tempfile
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
# WebKit relata como pageerror (sem stack) a consulta do RainViewer cancelada por navegação/recarga;
# o radar compacto da Home inicia cedo no desktop. Só esta mensagem de rede é ignorada; exceções JS falham.
RAINVIEWER_CANCELLED='/api.rainviewer.com/public/weather-maps.json due to access control checks.'
MISSING_INDEX = 3  # Boa Vista na ordem de CAPITALS: chega sem temperatura no fixture
MISSING_ID = '1400100'

repo = Path(__file__).resolve().parent.parent
preview = os.environ.get('PLUVIA_PREVIEW_URL', 'http://127.0.0.1:4173').rstrip('/')
origin = (urlparse(preview).scheme, urlparse(preview).netloc)
output = Path(os.environ.get('PLUVIA_QA_OUTPUT', str(Path(tempfile.gettempdir()) / 'pluvia-qa'))) / 'brazil'
output.mkdir(parents=True, exist_ok=True)
base = json.loads(subprocess.check_output(['node', '-e', "process.stdout.write(JSON.stringify(require('./tests/support/forecast.cjs').forecast()))"], cwd=repo, text=True))
engine = os.environ.get('PLUVIA_BROWSER', 'chromium')
calls, fail, report = [], {'capitals': False}, []

# Geometria do mapa medida na tela: pontos contra a projeção, etiquetas entre si e contra o quadro, linhas de chamada.
MAP_GEOMETRY = """() => {
  const map = document.getElementById('brazilMap'), box = map.getBoundingClientRect();
  const P = PLUVIA.brazilMap.createProjection(PLUVIA.brazilOutline.rings), scale = box.width / P.width;
  const chips = [...map.querySelectorAll('.brazil-chip')], dots = [...map.querySelectorAll('.brazil-dot')];
  const leaders = [...map.querySelectorAll('.brazil-leader')].map(line => [+line.getAttribute('x1'), +line.getAttribute('y1')]);
  const byId = new Map(CAPITALS.map(city => [city.id, city]));
  let worstDot = 0, overlaps = [], outside = [], missingLeader = [];
  const rects = chips.map(chip => chip.getBoundingClientRect());
  chips.forEach((chip, i) => {
    const city = byId.get(chip.dataset.cityId), [x, y] = P.project(city.lat, city.lon);
    const d = dots[i].getBoundingClientRect(), dx = d.left + d.width / 2, dy = d.top + d.height / 2;
    worstDot = Math.max(worstDot, Math.hypot(dx - (box.left + x * scale), dy - (box.top + y * scale)));
    const r = rects[i];
    if (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1) outside.push(city.uf);
    for (let j = i + 1; j < chips.length; j++) {
      const o = rects[j];
      if (r.left < o.right - .5 && o.left < r.right - .5 && r.top < o.bottom - .5 && o.top < r.bottom - .5) overlaps.push(city.uf + '×' + byId.get(chips[j].dataset.cityId).uf);
    }
    const onDot = dx >= r.left - 2 && dx <= r.right + 2 && dy >= r.top - 2 && dy <= r.bottom + 2;
    if (!onDot && !leaders.some(([lx, ly]) => Math.abs(lx - x) < .2 && Math.abs(ly - y) < .2)) missingLeader.push(city.uf);
  });
  const hit = chips.map(chip => { const s = getComputedStyle(chip, '::before'); return Math.min(parseFloat(s.width), parseFloat(s.height)); });
  return {chips:chips.length, dots:dots.length, worstDot, overlaps, outside, missingLeader, minHit:Math.min(...hit),
    buttons:chips.every(chip => chip.tagName === 'BUTTON' && /: (-?\\d+ graus|temperatura indisponível)\\. Abrir cidade$/.test(chip.getAttribute('aria-label'))),
    role:map.getAttribute('role'), hidden:map.getAttribute('aria-hidden'), legend:!document.getElementById('brazilLegend').hidden};
}"""

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
                    r.fulfill(json=[{'current': {'temperature_2m': None if i == MISSING_INDEX else round(-3 + random.random() * 38, 1),
                                                 'weather_code': random.choice([0, 1, 2, 3, 61, 95]), 'is_day': 1},
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
        context.add_init_script("sessionStorage.setItem('pluvia-intro-seen','1');localStorage.setItem('pluvia-terms-notice',JSON.stringify({version:'2026-10-13'}));localStorage.setItem('pluvia-home-more','1');localStorage.setItem('pluvia-city',JSON.stringify('1302603'));"
                                "Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,fail){fail({code:1})}}});")
        page = context.new_page(); errors = []
        page.on('pageerror', lambda error: None if str(error).endswith(RAINVIEWER_CANCELLED) else errors.append(str(error)))
        page.clock.set_fixed_time(datetime.datetime(2026, 10, 1, 16, 30, tzinfo=datetime.timezone.utc))
        calls.clear()
        page.goto(preview + '/', wait_until='domcontentloaded')
        page.wait_for_function("document.getElementById('temperature').textContent.trim()==='30' && !document.documentElement.classList.contains('awaiting-styles')", timeout=20000)
        page.wait_for_timeout(500)
        assert not calls, (width, 'a abertura não consulta as capitais')
        assert page.evaluate("!window.PLUVIA.brazilMap && !window.PLUVIA.brazilOutline"), (width, 'contorno e mapa só baixam ao abrir o diálogo')
        # Falha primeiro: mensagem clara; mapa e lista com as 27 capitais em "—" (nada pulado, nada inventado).
        fail['capitals'] = True
        page.click('#openCitySearch'); page.wait_for_function("document.getElementById('cityDialog').open")
        page.click('#brazilOpen')
        page.wait_for_function("document.getElementById('brazilDialog').open && /Não foi possível consultar as capitais/.test(document.getElementById('brazilStatus').textContent)", timeout=10000)
        page.wait_for_function("document.querySelector('#brazilMap[data-ready]') && document.querySelectorAll('#brazilMap .brazil-chip').length===27", timeout=10000)
        failed = page.evaluate("""() => ({rows:[...document.querySelectorAll('.brazil-row .brazil-temp')].map(n => n.textContent),
          chips:[...document.querySelectorAll('#brazilMap .brazil-chip')].map(n => [n.textContent, n.hasAttribute('data-missing')]),
          legend:!document.getElementById('brazilLegend').hidden})""")
        assert len(failed['rows']) == 27 and set(failed['rows']) == {'—'}, (width, failed)
        assert len(failed['chips']) == 27 and all(text == '—' and missing for text, missing in failed['chips']) and not failed['legend'], (width, failed)
        page.keyboard.press('Escape'); page.wait_for_function("!document.getElementById('brazilDialog').open", timeout=3000)
        fail['capitals'] = False
        page.click('#openCitySearch'); page.wait_for_function("document.getElementById('cityDialog').open")
        page.click('#brazilOpen')
        page.wait_for_function("document.querySelectorAll('.brazil-row').length===27 && /horário de Brasília/.test(document.getElementById('brazilStatus').textContent)", timeout=10000)
        assert calls == [55, 55], (width, calls)  # 27 capitais + 28 pontos do interior do campo de cores
        state = page.evaluate("""() => { const dialog = document.getElementById('brazilDialog'), rows = [...document.querySelectorAll('.brazil-row')];
          const edge = selector => [...new Set(rows.map(row => { const node = row.querySelector(selector); return node.getClientRects().length ? Math.round(node.getBoundingClientRect().right) : null; }))];
          return {overflow:dialog.scrollWidth > dialog.clientWidth + 1 || rows.some(row => row.scrollWidth > row.clientWidth + 1),
            regions:[...document.querySelectorAll('.brazil-list h3')].map(h => h.textContent), temps:edge('.brazil-temp'), ranges:edge('.brazil-range'),
            label:rows[0].getAttribute('aria-label'), focus:document.activeElement.id, cityOpen:document.getElementById('cityDialog').open,
            minHeight:Math.min(...rows.map(row => row.getBoundingClientRect().height)), status:document.getElementById('brazilStatus').textContent}; }""")
        assert state['regions'] == ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'] and not state['overflow'] and not state['cityOpen'], (width, state)
        assert len(state['temps']) == 1 and len(state['ranges']) == 1 and state['minHeight'] >= 44 and state['focus'] == 'brazilClose', (width, state)
        assert state['ranges'] != [None] or width <= 360, (width, state)
        assert state['label'].startswith('Belém/PA:') and 'Abrir cidade' in state['label'], state['label']
        assert state['status'].startswith('Atualizado às ') and state['status'].endswith('(horário de Brasília) · Open-Meteo'), state['status']
        # Capital sem leitura: "—" na lista e no mapa, a mesma linha de dados.
        missing = page.evaluate(f"""() => ({{row:document.querySelector('.brazil-row[data-city-id="{MISSING_ID}"] .brazil-temp').textContent,
          chip:document.querySelector('#brazilMap .brazil-chip[data-city-id="{MISSING_ID}"]').textContent,
          flagged:document.querySelector('#brazilMap .brazil-chip[data-city-id="{MISSING_ID}"]').hasAttribute('data-missing')}})""")
        assert missing == {'row': '—', 'chip': '—', 'flagged': True}, (width, missing)
        page.screenshot(path=str(output / f'{engine}-{width}.png'))
        # Mapa plano: ponto na coordenada projetada, etiquetas sem sobreposição dentro do quadro, linha de chamada quando saem do ponto.
        page.wait_for_function("document.querySelector('#brazilMap[data-ready]')", timeout=5000)
        page.locator('#brazilMap').scroll_into_view_if_needed()
        geo = page.evaluate(MAP_GEOMETRY)
        assert geo['chips'] == 27 and geo['dots'] == 27 and geo['worstDot'] <= 1.5, (width, geo)
        assert not geo['overlaps'] and not geo['outside'] and not geo['missingLeader'], (width, geo)
        assert geo['minHit'] >= 44 and geo['buttons'] and geo['role'] == 'group' and geo['hidden'] is None and geo['legend'], (width, geo)
        page.locator('#brazilMap').screenshot(path=str(output / f'{engine}-{width}-map.png'))
        # Abrir Porto Alegre: pela lista (320), tocando na etiqueta do mapa (390) e pelo teclado na etiqueta (1366).
        if width == 320:
            page.locator('.brazil-row[data-city-id="4314902"]').click()
        elif mobile:
            page.locator('#brazilMap .brazil-chip[data-city-id="4314902"]').click()
        else:
            page.locator('#brazilMap .brazil-chip[data-city-id="4314902"]').focus(); page.keyboard.press('Enter')
        page.wait_for_function("!document.getElementById('brazilDialog').open && /Porto Alegre/.test(document.getElementById('cityName').textContent)", timeout=10000)
        assert not errors, (width, errors)
        report.append({'width': width, 'capitals': 27, 'worstDotPx': round(geo['worstDot'], 2)})
        context.close()
    browser.close()
print(json.dumps({'browser': engine, 'cases': report}))

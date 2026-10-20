"""Prévias sociais (Open Graph): a geral (dist/og-pluvia-v3.png, 1731×909, desde a 1.18) e as das 27 capitais
(1200×630 JPEG em dist/og/<slug>-<versão>.jpg).

Arte estática com as camadas do próprio céu do PLUVIA (gradiente noturno, estrelas e as duas texturas
de nuvem), a assinatura da marca (gota clara e nome branco) e o nome da capital. Não mostra temperatura nem condição: a imagem fica em
cache nos apps de mensagem por dias e uma previsão congelada seria enganosa. Rodar depois de mudar a
arte ou a lista de capitais e, em seguida, `node scripts/generate-city-pages.cjs`:

    python scripts/generate-og-cities.py   (precisa de Python Playwright e Pillow)

Gera com nomes novos (OG_VERSION) quando a arte mudar, porque WhatsApp e afins guardam a prévia.
"""
import base64, io, json, os, shutil, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image

OG_VERSION = 'v2'   # v2: marca nova da 1.18 (gota caindo na água)
MAIN_OG = 'og-pluvia-v3.png'
repo = Path(__file__).resolve().parent.parent
dist = repo / 'dist'
out = dist / 'og'
out.mkdir(exist_ok=True)
capitals = json.loads(subprocess.check_output(['node', '-e', """
const fs = require('node:fs'), vm = require('node:vm');
const context = vm.createContext({Intl, localStorage:{getItem:() => null, setItem() {}}}); context.globalThis = context;
vm.runInContext(fs.readFileSync('dist/capitals.js', 'utf8'), context);
const list = vm.runInContext('CAPITALS.map(city => ({id:city.id, name:city.name, uf:city.uf, path:cityPagePath(city)}))', context);
process.stdout.write(JSON.stringify(list));
"""], cwd=repo, text=True))
data = lambda path, kind: f'data:{kind};base64,' + base64.b64encode((dist / path).read_bytes()).decode()

PAGE = """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family:Inter; src:url('%(inter)s') format('woff2'); font-weight:100 900; }
html,body { margin:0; width:1200px; height:630px; overflow:hidden; }
body { position:relative; background:linear-gradient(180deg,#10233f 0%%,#0b1730 55%%,#080f22 100%%); font-family:Inter,sans-serif; color:#f1f7ff; }
.stars { position:absolute; inset:0; background:url('%(stars)s') 0 0/600px auto repeat; opacity:.85; }
.veil { position:absolute; left:-200px; right:-200px; bottom:-120px; height:420px; background:url('%(veil)s') 0 100%%/auto 100%% repeat-x; opacity:.75; filter:brightness(.75) saturate(.85) hue-rotate(-8deg); }
.volume { position:absolute; left:-320px; right:-320px; bottom:-170px; height:400px; background:url('%(volume)s') 180px 100%%/auto 100%% repeat-x; filter:brightness(.62) saturate(.8); }
.content { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:0 80px; }
.logo { height:96px; margin-bottom:42px; }
.kicker { font-size:34px; font-weight:500; color:#b9cbe3; letter-spacing:.01em; }
.city { margin-top:6px; font-size:%(size)spx; font-weight:700; line-height:1.08; letter-spacing:-.02em; text-shadow:0 4px 24px #050b1a; }
.tags { margin-top:22px; font-size:30px; font-weight:500; color:#d6e3f5; }
</style></head><body><div class="stars"></div><div class="veil"></div><div class="volume"></div>
<div class="content"><img class="logo" src="%(logo)s" alt=""><div class="kicker">Previsão do tempo em</div>
<div class="city">%(city)s</div><div class="tags">Chuva hora a hora · avisos do INMET · radar</div></div></body></html>"""

assets = {'inter':data('assets/fonts/inter-latin-v20.woff2', 'font/woff2'), 'stars':data('assets/sky-stars.svg', 'image/svg+xml'),
          'veil':data('assets/sky-cloud-veil.webp', 'image/webp'), 'volume':data('assets/sky-cloud-volume.webp', 'image/webp'),
          'logo':data('logo-pluvia.png', 'image/png')}
chromium = shutil.which('chromium') or ('/opt/pw-browsers/chromium' if Path('/opt/pw-browsers/chromium').exists() else None)
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox'], **({'executable_path':chromium} if chromium else {}))
    page = browser.new_page(viewport={'width':1200, 'height':630}, device_scale_factor=1)
    # Prévia geral do site: mesma arte, com a assinatura grande e o slogan, em 1731×909.
    main = PAGE.replace('<div class="kicker">Previsão do tempo em</div>\n<div class="city">%(city)s</div><div class="tags">Chuva hora a hora · avisos do INMET · radar</div>',
                        '<div class="slogan">O céu de cada cidade</div>').replace('.logo { height:96px; margin-bottom:42px; }', '.logo { height:150px; margin-bottom:34px; } .slogan { font-size:46px; font-weight:500; color:#d6e3f5; }')
    wide = browser.new_page(viewport={'width':1200, 'height':630}, device_scale_factor=1731 / 1200)
    wide.set_content(main % {**assets, 'size':0}, wait_until='load'); wide.evaluate('document.fonts.ready')
    Image.open(io.BytesIO(wide.screenshot(type='png'))).convert('RGB').save(dist / MAIN_OG, 'PNG', optimize=True)
    wide.close()
    for city in capitals:
        label = f"{city['name']}/{city['uf']}"
        size = 104 if len(label) <= 14 else 88 if len(label) <= 20 else 74
        page.set_content(PAGE % {**assets, 'city':label, 'size':size}, wait_until='load')
        page.evaluate('document.fonts.ready')
        png = page.screenshot(type='png')
        slug = city['path'].strip('/').split('/')[-1]
        image = Image.open(io.BytesIO(png)).convert('RGB')
        image.save(out / f'{slug}-{OG_VERSION}.jpg', 'JPEG', quality=82, optimize=True, progressive=True)
    browser.close()
total = sum(f.stat().st_size for f in out.glob(f'*-{OG_VERSION}.jpg'))
print(f'{len(capitals)} prévias em dist/og ({total // 1024} KiB)')

"""Prévias sociais (Open Graph): a geral (dist/og-pluvia-v5.png, 1731×909, céu de pôr do sol desde a 1.18.2, logo nova na 1.26) e as das 27 capitais
(1200×630 JPEG em dist/og/<slug>-<versão>.jpg).

Arte estática com as camadas do próprio céu do PLUVIA (pôr do sol do azul-noite ao laranja, estrelas só no alto e as duas
texturas de nuvem clareadas pela luz do pôr do sol), a assinatura da marca (gota clara e nome branco) e o nome da capital. Não mostra temperatura nem condição: a imagem fica em
cache nos apps de mensagem por dias e uma previsão congelada seria enganosa. Rodar depois de mudar a
arte ou a lista de capitais e, em seguida, `node scripts/generate-city-pages.cjs`:

    python scripts/generate-og-cities.py   (precisa de Python Playwright e Pillow)

Gera com nomes novos (OG_VERSION) quando a arte mudar, porque WhatsApp e afins guardam a prévia.
"""
import base64, io, json, os, shutil, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image

OG_VERSION = 'v4'   # v4: logo nova (1.26); v3: céu de pôr do sol (1.18.2); v2: marca nova da 1.18
MAIN_OG = 'og-pluvia-v5.png'
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
body { position:relative; background:linear-gradient(180deg,#0b1636 0%%,#1d2560 30%%,#4a3c86 55%%,#9a5c8e 75%%,#f09a74 92%%,#ffc08a 100%%); font-family:Inter,sans-serif; color:#f1f7ff; }
.glow { position:absolute; inset:0; background:radial-gradient(ellipse 70%% 45%% at 50%% 105%%,rgba(255,190,130,.55),transparent 70%%); }
.stars { position:absolute; inset:0; background:url('%(stars)s') 0 0/600px auto repeat; opacity:.9; -webkit-mask:linear-gradient(#000 0,#000 25%%,transparent 55%%); mask:linear-gradient(#000 0,#000 25%%,transparent 55%%); }
.veil,.volume { position:absolute; mix-blend-mode:screen; -webkit-mask:linear-gradient(transparent 0,#000 35%%); mask:linear-gradient(transparent 0,#000 35%%); }
.veil { left:-200px; right:-200px; bottom:-150px; height:380px; background:url('%(veil)s') 0 100%%/auto 100%% repeat-x; opacity:.55; filter:grayscale(1) brightness(1.35) sepia(.9) saturate(2.2) hue-rotate(-25deg) blur(1.5px); }
.volume { left:-320px; right:-320px; bottom:-210px; height:360px; background:url('%(volume)s') 520px 100%%/auto 100%% repeat-x; opacity:.6; filter:grayscale(1) brightness(1.5) sepia(1) saturate(2.6) hue-rotate(-18deg) blur(1px); }
.content { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:0 80px; }
.logo { height:96px; margin-bottom:42px; filter:drop-shadow(0 6px 30px rgba(5,10,30,.45)); }
.kicker { font-size:34px; font-weight:500; color:#d4dcf2; text-shadow:0 2px 16px rgba(5,10,30,.5); letter-spacing:.01em; }
.city { margin-top:6px; font-size:%(size)spx; font-weight:700; line-height:1.08; letter-spacing:-.02em; text-shadow:0 4px 24px #050b1a; }
.tags { margin-top:22px; font-size:30px; font-weight:500; color:#eef2fb; text-shadow:0 2px 16px rgba(5,10,30,.55); }
</style></head><body><div class="stars"></div><div class="glow"></div><div class="veil"></div><div class="volume"></div>
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
                        '<div class="slogan">O céu de cada cidade</div>').replace('.logo { height:96px; margin-bottom:42px; filter:drop-shadow(0 6px 30px rgba(5,10,30,.45)); }', '.logo { height:150px; margin-bottom:34px; filter:drop-shadow(0 6px 30px rgba(5,10,30,.45)); } .slogan { font-size:46px; font-weight:500; color:#e6eefb; text-shadow:0 3px 20px rgba(5,10,30,.5); }')
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

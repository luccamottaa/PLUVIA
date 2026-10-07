"""Gera os ícones das notificações (dist/assets/notifications/*.png, 192 px).
Cada um é o desenho de condição do próprio app (assets/weather-icons/conditions) sobre o céu
noturno da marca; avisos oficiais usam um triângulo na cor da severidade do INMET.
Renderiza os SVGs no Chromium (Playwright), porque notificações não exibem SVG.
  python3 scripts/generate-notification-icons.py
"""
import base64, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parent.parent / 'dist'
OUT = DIST / 'assets/notifications'
SKY = 'linear-gradient(#10233f,#080f22)'
# ícone -> desenho de condição (a lista de tipos vive em modules/push-style.js)
CONDITIONS = {'rain': 'light-rain', 'heavy-rain': 'heavy-rain', 'storm': 'thunderstorm', 'wind': 'windy',
              'heat': 'clear-day', 'air': 'haze', 'change': 'partly-cloudy-day', 'daily': 'few-clouds-day'}
# Avisos oficiais: amarelo, laranja e vermelho do INMET (perigo potencial, perigo, grande perigo).
ALERTS = {'alert-2': '#f2c94c', 'alert-3': '#f2994a', 'alert-4': '#eb5757'}

def page_html(inner):
    return f'<html><body style="margin:0"><div style="width:192px;height:192px;background:{SKY};display:grid;place-items:center">{inner}</div></body></html>'

OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    executable = '/opt/pw-browsers/chromium' if Path('/opt/pw-browsers/chromium').exists() else shutil.which('chromium')
    browser = p.chromium.launch(**({'executable_path': executable} if executable else {}), args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 192, 'height': 192})
    for name, condition in CONDITIONS.items():
        svg = (DIST / f'assets/weather-icons/conditions/{condition}.svg').read_bytes()
        img = f'<img src="data:image/svg+xml;base64,{base64.b64encode(svg).decode()}" style="width:128px;height:128px">'
        page.set_content(page_html(img)); page.wait_for_timeout(50)
        page.screenshot(path=str(OUT / f'{name}.png'))
    for name, color in ALERTS.items():
        triangle = (f'<svg width="124" height="124" viewBox="0 0 24 24"><path d="M12 2.8 22.4 20.6H1.6Z" fill="{color}" stroke="{color}" stroke-width="1.6" stroke-linejoin="round"/>'
                    '<path d="M12 9v5.2" stroke="#10233f" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17.4" r="1.4" fill="#10233f"/></svg>')
        page.set_content(page_html(triangle)); page.wait_for_timeout(50)
        page.screenshot(path=str(OUT / f'{name}.png'))
    browser.close()
for file in sorted(OUT.glob('*.png')): print(f'{file.name:14} {file.stat().st_size:>6} B')

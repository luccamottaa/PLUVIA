"""Lente (desfoque, saturação, brilho e deslocamento num filtro só) e mapas de deslocamento da lente dos botões de vidro do topo (1.45).
Para cada pixel da cápsula (raio = metade da altura) calcula a distância até a borda e a direção para dentro;
numa faixa de BAND px junto da borda o deslocamento cresce até a borda (curva quadrática), apontando para o
centro: o feDisplacementMap mostra ali o que está mais para dentro, como a borda grossa de um vidro.
R = x, G = y, 128 = parado. Tudo fica dentro do filtro SVG: no Chromium, url() encadeado com blur()/saturate() no
backdrop-filter deixava um retângulo sem efeito no meio da cápsula. Escreve os <filter> no SVG compartilhado de dist/index.html.
Rode: python3 scripts/generate-glass-lens.py (depois node scripts/generate-city-pages.cjs)."""
import base64, io, math, re
from pathlib import Path
from PIL import Image

BAND, SCALE, K = 11, 20, 2  # faixa da lente (px), deslocamento máximo (px), supersampling do PNG

def lens(w, h):
    r = h / 2
    img = Image.new('RGB', (w * K, h * K))
    px = img.load()
    for j in range(h * K):
        for i in range(w * K):
            x, y = (i + .5) / K, (j + .5) / K
            cx = min(max(x, r), w - r)  # ponto mais próximo no eixo da cápsula
            vx, vy = cx - x, r - y      # para dentro
            dist = math.hypot(vx, vy)
            edge = r - dist
            if dist < 1e-6 or edge >= BAND or edge < 0:
                px[i, j] = (128, 128, 128); continue
            m = (1 - edge / BAND) ** 2
            px[i, j] = (round(128 + 127 * m * vx / dist), round(128 + 127 * m * vy / dist), 128)
    buf = io.BytesIO(); img.save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()

def filt(name, w, h):
    return (f'<filter id="{name}" x="-50%" y="-50%" width="200%" height="200%" '
            f'color-interpolation-filters="sRGB"><feImage href="{lens(w, h)}" x="0" y="0" width="{w}" height="{h}" preserveAspectRatio="none" result="map"/>'
            f'<feGaussianBlur in="SourceGraphic" stdDeviation="2" edgeMode="duplicate" result="soft"/>'
            f'<feColorMatrix in="soft" type="saturate" values="1.8" result="vivid"/>'
            f'<feComponentTransfer in="vivid" result="glass"><feFuncR type="linear" slope="1.08"/><feFuncG type="linear" slope="1.08"/><feFuncB type="linear" slope="1.08"/></feComponentTransfer>'
            f'<feDisplacementMap in="glass" in2="map" scale="{SCALE}" xChannelSelector="R" yChannelSelector="G"/></filter>')


def pill(name, w, h):
    # Pílula do cabeçalho compacto: a largura muda com o nome da cidade, então o filtro usa a caixa do elemento
    # (primitiveUnits="objectBoundingBox"): o mapa estica junto, desfoque e deslocamento são frações da largura/altura
    # (escala 0,06 ≈ 19 px numa pílula de 320; desfoque ≈ 8 px).
    return (f'<filter id="{name}" x="-50%" y="-50%" width="200%" height="200%" primitiveUnits="objectBoundingBox" '
            f'color-interpolation-filters="sRGB"><feImage href="{lens(w, h)}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map"/>'
            f'<feGaussianBlur in="SourceGraphic" stdDeviation="0.025 0.14" edgeMode="duplicate" result="soft"/>'
            f'<feColorMatrix in="soft" type="saturate" values="1.7" result="vivid"/>'
            f'<feDisplacementMap in="vivid" in2="map" scale="0.06" xChannelSelector="R" yChannelSelector="G"/></filter>')

page = Path(__file__).resolve().parent.parent / 'dist' / 'index.html'
text = page.read_text()
for name, w, h in [('pluviaGlassCircle', 44, 44), ('pluviaGlassCapsule', 96, 44)]:
    text, n = re.subn(rf'<filter id="{name}".*?</filter>', lambda _: filt(name, w, h), text, flags=re.S)
    assert n == 1, name
if '<filter id="pluviaGlassPill"' not in text:
    text = text.replace('<filter id="pluviaGlassCapsule"', '<filter id="pluviaGlassPill"></filter>\n        <filter id="pluviaGlassCapsule"', 1)
text, n = re.subn(r'<filter id="pluviaGlassPill".*?</filter>', lambda _: pill('pluviaGlassPill', 320, 58), text, flags=re.S)
assert n == 1
page.write_text(text)

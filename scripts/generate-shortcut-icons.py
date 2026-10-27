"""Gera os ícones de 96 px dos atalhos do PWA (dist/assets/shortcuts/*.png).
Círculo no azul da marca (#2f6bff) com glifo branco em traço, desenhado em 4x e reduzido.
  python3 scripts/generate-shortcut-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'dist/assets/shortcuts'
S, W = 384, 22  # tela em 4x e espessura do traço
BLUE, WHITE = (47, 107, 255, 255), (255, 255, 255, 255)

def base():
    image = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((0, 0, S - 1, S - 1), fill=BLUE)
    return image, draw

def cities(draw):  # lupa
    draw.ellipse((104, 96, 248, 240), outline=WHITE, width=W)
    draw.line((230, 222, 290, 282), fill=WHITE, width=W + 6)

def radar(draw):  # tela de radar: anéis, varredura e um eco
    cx = cy = 192
    for r in (112, 60):
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=WHITE, width=W - 4)
    draw.line((cx, cy, cx + 80, cy - 80), fill=WHITE, width=W)
    draw.ellipse((cx - 14, cy - 14, cx + 14, cy + 14), fill=WHITE)
    draw.ellipse((cx - 70, cy + 20, cx - 38, cy + 52), fill=WHITE)

def rain(draw):  # guarda-chuva: copa, cabo em gancho e duas gotas
    draw.pieslice((72, 92, 312, 300), 180, 360, fill=WHITE)
    draw.line((192, 196, 192, 286), fill=WHITE, width=W)
    draw.arc((192, 256, 252, 316), 0, 180, fill=WHITE, width=W)
    for x, y in ((112, 236), (282, 236)):
        draw.ellipse((x - 13, y, x + 13, y + 26), fill=WHITE)
        draw.polygon(((x - 12, y + 10), (x, y - 16), (x + 12, y + 10)), fill=WHITE)

OUT.mkdir(parents=True, exist_ok=True)
for name, glyph in (('cidades', cities), ('radar', radar), ('chuva', rain)):
    image, draw = base(); glyph(draw)
    image.resize((96, 96), Image.LANCZOS).save(OUT / f'{name}.png', optimize=True)
    print(name, (OUT / f'{name}.png').stat().st_size, 'bytes')

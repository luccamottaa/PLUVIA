"""Desenha a gota da marca (outubro/2026, 1.16): a mesma silhueta inclinada de antes, com uma onda só no lugar
das duas curvas internas, que viravam mancha em tamanho pequeno (pedido do usuário: "faz o que achar melhor").

    python3 scripts/generate-brand-mark.py && python3 scripts/generate-brand-icons.py

Grava dist/logo-mark.png e dist/logo-mark.webp (256 × 256, azul da marca, só o alfa importa como máscara) e troca
a gota da assinatura dist/logo-pluvia.png, mantendo a palavra PLUVIA. Depois, generate-brand-icons.py refaz os
ícones de instalar e os favicons a partir deste alfa. Desenho geométrico, sem arte de terceiros.
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

DIST = Path(__file__).resolve().parent.parent / 'dist'
BLUE = (47, 107, 255)
S = 2048   # desenho em alta e redução com filtro, para bordas lisas

def drop(tilt=12, m=1.25, width=.85, fill=.88):
    """Gota clássica (x = sen t · sen^m(t/2), y = −cos t), inclinada com a ponta para a direita."""
    a, points = math.radians(tilt), []
    for i in range(1200):
        t = 2 * math.pi * i / 1200
        x, y = math.sin(t) * math.sin(t / 2) ** m * width, -math.cos(t)
        points.append((x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)))
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    k = S * fill / max(max(ys) - min(ys), max(xs) - min(xs))
    return [((x - cx) * k + S / 2, (y - cy) * k + S / 2) for x, y in points]

def wave(center=.6, amp=.055, thick=.075, slope=.2, freq=2.2, phase=.1):
    """Faixa de onda que atravessa a gota (subindo para a direita, como as curvas antigas)."""
    top, bottom = [], []
    for i in range(401):
        x = -S * .1 + S * 1.2 * i / 400; u = x / S
        y = S * center - slope * (u - .5) * S + S * amp * math.sin((u - phase) * math.pi * freq)
        top.append((x, y - S * thick / 2)); bottom.append((x, y + S * thick / 2))
    return top + bottom[::-1]

def mark(size):
    big = Image.new('L', (S, S), 0); draw = ImageDraw.Draw(big)
    draw.polygon(drop(), fill=255); draw.polygon(wave(), fill=0)
    return big.resize((size, size), Image.LANCZOS)

def flat(alpha):
    image = Image.new('RGBA', alpha.size, BLUE + (255,)); image.putalpha(alpha); return image

alpha = mark(256)
flat(alpha).save(DIST / 'logo-mark.png', optimize=True)
flat(alpha).save(DIST / 'logo-mark.webp', 'WEBP', lossless=True, quality=100, method=6)

# Assinatura: a gota antiga ocupa as primeiras colunas, antes de um vão vazio; a palavra fica.
signature = Image.open(DIST / 'logo-pluvia.png').getchannel('A')
w, h = signature.size; px = signature.load()
filled = [any(px[x, y] > 16 for y in range(h)) for x in range(w)]
start = filled.index(True); end = start
while end < w and filled[end]: end += 1                  # fim da gota (primeiro vão)
rows = [y for y in range(h) if any(px[x, y] > 16 for x in range(start, end))]
top, bottom = rows[0], rows[-1]
word = signature.crop((end, 0, w, h))
new = Image.new('L', (w, h), 0); new.paste(word, (end, 0))
drop_alpha = mark(1024); box = drop_alpha.getbbox(); drop_alpha = drop_alpha.crop(box)
height = bottom - top + 1; width = round(drop_alpha.size[0] * height / drop_alpha.size[1])
drop_alpha = drop_alpha.resize((width, height), Image.LANCZOS)
new.paste(drop_alpha, (max(0, end - 14 - width), top))
flat(new).save(DIST / 'logo-pluvia.png', optimize=True)
for name in ('logo-mark.png', 'logo-mark.webp', 'logo-pluvia.png'):
    print(f'{name:18} {(DIST / name).stat().st_size:>7} B')

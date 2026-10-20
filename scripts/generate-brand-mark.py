"""Desenha a marca do PLUVIA (outubro/2026, 1.18): gota caindo na água, com duas ondinhas embaixo (opção C, escolhida
pelo usuário entre cinco modelos), na combinação de cor 2: gota clara e nome branco no céu da noite.

    python3 scripts/generate-brand-mark.py && python3 scripts/generate-brand-icons.py

Grava dist/logo-mark.png e dist/logo-mark.webp (256 × 256; no app viram máscara CSS, então só o alfa importa) e
refaz a assinatura dist/logo-pluvia.png (gota + palavra PLUVIA em Nunito 900), usada como máscara e, nas prévias das
capitais, como imagem: por isso ela sai pintada para o céu noturno (gota clara, nome branco). Depois,
generate-brand-icons.py refaz os ícones de instalar e os favicons a partir deste alfa. Desenho geométrico próprio.
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
DROP = (207, 227, 255)   # gota clara (combinação 2)
WORD = (244, 248, 255)   # nome branco no céu da noite
S = 2048                 # desenho em alta e redução com filtro, para bordas lisas

def tear(cx, cy, r, k=2.15):
    """Gota clássica: círculo de raio r em (cx, cy) e ponta a k·r acima, ligada por curvas suaves."""
    a = math.asin(1 / k); start = math.radians(-90 + (90 - math.degrees(a)))
    arc = [(math.cos(start + (2 * math.pi - 2 * (math.pi / 2 - a)) * i / 360) * r,
            math.sin(start + (2 * math.pi - 2 * (math.pi / 2 - a)) * i / 360) * r) for i in range(361)]
    p0, p2, tip = arc[-1], arc[0], (0, -k * r)
    def curve(p, q, ctrl):
        return [((1 - u) ** 2 * p[0] + 2 * (1 - u) * u * ctrl[0] + u * u * q[0],
                 (1 - u) ** 2 * p[1] + 2 * (1 - u) * u * ctrl[1] + u * u * q[1]) for u in (i / 60 for i in range(1, 60))]
    pts = arc + curve(p0, tip, (p0[0] * .35, (p0[1] + tip[1]) * .55)) + [tip] + curve(tip, p2, (p2[0] * .35, (p2[1] + tip[1]) * .55))
    return [(cx + x, cy + y) for x, y in pts]

def drop_alpha(size):
    """Só a gota, sem as ondas: o favicon de 16 px usa este desenho (as ondas viram uma linha nesse tamanho)."""
    big = Image.new('L', (S, S), 0); ImageDraw.Draw(big).polygon(tear(1024, 980, 420), fill=255)
    return big.resize((size, size), Image.LANCZOS)

def mark_alpha(size):
    big = Image.new('L', (S, S), 0); draw = ImageDraw.Draw(big)
    draw.polygon(tear(1024, 980, 420), fill=255)
    draw.arc((380, 1380, 1668, 1760), 200, 340, fill=255, width=110)
    draw.arc((620, 1560, 1428, 1820), 205, 335, fill=255, width=100)
    # Recorta o vazio em volta e centra num quadrado, para a máscara ocupar o espaço como a gota antiga.
    box = big.getbbox(); crop = big.crop(box); side = max(crop.size) + 40
    square = Image.new('L', (side, side), 0); square.paste(crop, ((side - crop.size[0]) // 2, (side - crop.size[1]) // 2))
    return square.resize((size, size), Image.LANCZOS)

def paint(alpha, color):
    image = Image.new('RGBA', alpha.size, color + (255,)); image.putalpha(alpha); return image

if __name__ == '__main__':
    mark = mark_alpha(256)
    paint(mark, DROP).save(DIST / 'logo-mark.png', optimize=True)
    paint(mark, DROP).save(DIST / 'logo-mark.webp', 'WEBP', lossless=True, quality=100, method=6)

    # Assinatura: mesmas medidas da anterior (o CSS e as prévias contam com elas), gota à esquerda e o nome.
    old = Image.open(DIST / 'logo-pluvia.png'); w, h = old.size
    font = ImageFont.truetype(str(DIST / 'assets/fonts/nunito-wordmark-v32.woff2'), round(h * .62))
    word = Image.new('L', (w * 2, h), 0); ImageDraw.Draw(word).text((0, h / 2), 'PLUVIA', font=font, fill=255, anchor='lm')
    word = word.crop(word.getbbox())
    drop = mark_alpha(1024); drop = drop.crop(drop.getbbox())
    dh = round(h * .8); dw = round(drop.size[0] * dh / drop.size[1]); drop = drop.resize((dw, dh), Image.LANCZOS)
    gap = round(h * .14); scale = min(1, (w - dw - gap) / word.size[0])
    if scale < 1: word = word.resize((round(word.size[0] * scale), round(word.size[1] * scale)), Image.LANCZOS)
    x = (w - (dw + gap + word.size[0])) // 2
    signature = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    signature.alpha_composite(paint(drop, DROP), (x, (h - dh) // 2))
    signature.alpha_composite(paint(word, WORD), (x + dw + gap, (h - word.size[1]) // 2))
    signature.save(DIST / 'logo-pluvia.png', optimize=True)
    for name in ('logo-mark.png', 'logo-mark.webp', 'logo-pluvia.png'):
        print(f'{name:18} {(DIST / name).stat().st_size:>7} B')

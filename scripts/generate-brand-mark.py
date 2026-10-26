"""Marca do PLUVIA (1.26, outubro/2026): a logo nova enviada pelo dono (gota com nuvem, sol e onda em azul, ciano e
branco, sobre azul-noite), guardada em design/brand/pluvia-logo-2026-10.jpg (2048 × 2048).

    python3 scripts/generate-brand-mark.py && python3 scripts/generate-brand-icons.py

O fundo da arte (#191e34) é retirado por distância de cor, com borda suave e a cor original recuperada na borda
(sem halo escuro). Grava:
- dist/logo-mark.png (512 px, story e badge das notificações) e .webp (384 px, intro e rodapé): a marca colorida
  com transparência, mostrada como imagem (não mais máscara de cor única);
- dist/logo-pluvia.png: assinatura horizontal (marca + PLUVIA da própria arte), usada nas prévias das capitais.
Depois, generate-brand-icons.py refaz os ícones de instalar e os favicons a partir de logo-mark.png.
"""
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
SOURCE = ROOT / 'design/brand/pluvia-logo-2026-10.jpg'
BACKGROUND = np.array([25, 30, 52], dtype=float)   # #191e34, o azul-noite da arte
# Faixas da arte (linhas): marca, PLUVIA e WEATHER, medidas na imagem de 2048 px.
MARK_ROWS, WORD_ROWS = (440, 1046), (1110, 1392)

def keyed():
    """RGBA da arte sem o fundo: alfa pela distância ao azul-noite, cor original recuperada na borda."""
    rgb = np.asarray(Image.open(SOURCE).convert('RGB')).astype(float)
    distance = np.sqrt(((rgb - BACKGROUND) ** 2).sum(-1))
    alpha = np.clip((distance - 14) / 70, 0, 1)
    safe = np.maximum(alpha, 1e-3)[..., None]
    color = np.clip(BACKGROUND + (rgb - BACKGROUND) / safe, 0, 255)
    out = np.dstack([color, alpha * 255]).round().astype(np.uint8)
    return Image.fromarray(out, 'RGBA')

def crop_band(image, rows):
    band = image.crop((0, rows[0], image.width, rows[1]))
    return band.crop(band.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox())

def square(image, pad=.04):
    side = round(max(image.size) * (1 + 2 * pad))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(image, ((side - image.width) // 2, (side - image.height) // 2))
    return canvas

def mark_image(size):
    """A marca colorida, centrada num quadrado com folga pequena."""
    return square(crop_band(keyed(), MARK_ROWS)).resize((size, size), Image.LANCZOS)

def mark_alpha(size):
    return mark_image(size).getchannel('A')

def drop_alpha(size):
    """Mantido para generate-brand-icons.py: o favicon de 16 px usa a marca inteira desde a 1.26."""
    return mark_alpha(size)

if __name__ == '__main__':
    art = keyed()
    mark = square(crop_band(art, MARK_ROWS))
    small = mark.resize((512, 512), Image.LANCZOS)
    small.save(DIST / 'logo-mark.png', optimize=True)
    # A intro e o rodapé mostram a marca com no máximo ~90 px: 384 px com perda leve bastam (≈ 1/7 do tamanho).
    small.resize((384, 384), Image.LANCZOS).save(DIST / 'logo-mark.webp', 'WEBP', quality=90, alpha_quality=100, method=6)

    # Assinatura horizontal com as medidas da anterior (as prévias contam com a proporção): marca + PLUVIA.
    old = Image.open(DIST / 'logo-pluvia.png'); w, h = old.size
    word = crop_band(art, WORD_ROWS)
    glyph = crop_band(art, MARK_ROWS)
    gh = round(h * .96); glyph = glyph.resize((round(glyph.width * gh / glyph.height), gh), Image.LANCZOS)
    wh = round(h * .56); word = word.resize((round(word.width * wh / word.height), wh), Image.LANCZOS)
    gap = round(h * .16); total = glyph.width + gap + word.width
    if total > w:
        k = w / total
        glyph = glyph.resize((round(glyph.width * k), round(glyph.height * k)), Image.LANCZOS)
        word = word.resize((round(word.width * k), round(word.height * k)), Image.LANCZOS)
        gap = round(gap * k); total = glyph.width + gap + word.width
    signature = Image.new('RGBA', (w, h), (0, 0, 0, 0)); x = (w - total) // 2
    signature.alpha_composite(glyph, (x, (h - glyph.height) // 2))
    signature.alpha_composite(word, (x + glyph.width + gap, (h - word.height) // 2))
    signature.save(DIST / 'logo-pluvia.png', optimize=True)
    for name in ('logo-mark.png', 'logo-mark.webp', 'logo-pluvia.png'):
        print(f'{name:18} {(DIST / name).stat().st_size:>7} B')

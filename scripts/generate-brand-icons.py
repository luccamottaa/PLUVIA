"""Gera os ícones da marca a partir de dist/logo-mark.png (logo nova da 1.26, colorida com transparência).
  python3 scripts/generate-brand-mark.py && python3 scripts/generate-brand-icons.py
- Ícones de instalar/tela inicial e favicons: o azul-noite da própria arte (#191e34) com a marca colorida.
- logo-mark.png e logo-pluvia.png são feitos por generate-brand-mark.py.
"""
from pathlib import Path
from PIL import Image, ImageDraw

DIST = Path(__file__).resolve().parent.parent / 'dist'
NIGHT = (25, 30, 52)   # fundo da arte enviada pelo dono

mark = Image.open(DIST / 'logo-mark.png').convert('RGBA')

def sky(size, radius=0):
    """Fundo cheio no azul-noite da arte; radius>0 arredonda os cantos (favicon)."""
    image = Image.new('RGBA', (size, size), NIGHT + (255,))
    if radius:
        mask = Image.new('L', (size * 4, size * 4), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=radius * 4, fill=255)
        image.putalpha(mask.resize((size, size), Image.LANCZOS))
    return image

def place(canvas, image, scale):
    """Centra a marca (pelo retângulo útil) ocupando `scale` do lado do canvas."""
    crop = image.crop(image.getchannel('A').getbbox())
    side = round(canvas.size[0] * scale); k = side / max(crop.size)
    crop = crop.resize((round(crop.width * k), round(crop.height * k)), Image.LANCZOS)
    canvas.alpha_composite(crop, ((canvas.size[0] - crop.width) // 2, (canvas.size[1] - crop.height) // 2))
    return canvas

def save(image, name, mode='RGB'):
    image = image.convert(mode) if mode != 'RGBA' else image
    image.save(DIST / name, optimize=True)
    print(f'{name:28} {image.size[0]}x{image.size[1]} {(DIST / name).stat().st_size:>7} B')

for name, size, scale in [('icon-192.png', 192, .7), ('icon-512.png', 512, .7), ('apple-touch-icon-180.png', 180, .68),
                          ('icon-splash-192.png', 192, .7), ('icon-splash-512.png', 512, .7), ('pwa-icon-source-1024.png', 1024, .7)]:
    save(place(sky(size), mark, scale), name)
# Maskable: a zona segura é o círculo de 80%; a marca fica dentro dela.
for name, size in [('icon-maskable-192.png', 192), ('icon-maskable-512.png', 512)]:
    save(place(sky(size), mark, .56), name)
save(place(sky(32, radius=7), mark, .86), 'favicon-32.png', 'RGBA')
save(place(sky(16, radius=4), mark, .9), 'favicon-16.png', 'RGBA')
save(place(sky(96, radius=20), mark, .78), 'favicon-96.png', 'RGBA')
# Endereços que o iPhone procura sozinho na raiz quando não consegue o ícone pelo <link> (1.18.2).
import shutil
for name in ('apple-touch-icon.png', 'apple-touch-icon-precomposed.png'):
    shutil.copyfile(DIST / 'apple-touch-icon-180.png', DIST / name)
Image.open(DIST / 'favicon-32.png').save(DIST / 'favicon.ico', sizes=[(16, 16), (32, 32)])

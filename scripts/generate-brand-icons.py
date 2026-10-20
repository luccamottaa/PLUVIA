"""Gera os ícones da marca a partir do alfa de dist/logo-mark.png (gota caindo na água, 1.18).
  python3 scripts/generate-brand-mark.py && python3 scripts/generate-brand-icons.py
- Ícones de instalar/tela inicial: céu noturno do app (#10233f → #080f22) com a marca clara (combinação 2).
- Favicon de 16 px: só a gota (as ondinhas viram uma linha nesse tamanho); 32 e 96 px: a marca completa.
- logo-mark.png e logo-pluvia.png são feitos por generate-brand-mark.py (as cores ficam lá).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

DIST = Path(__file__).resolve().parent.parent / 'dist'
LIGHT = (207, 227, 255)        # marca clara sobre o céu noturno (combinação 2 escolhida pelo usuário)
TOP, BOTTOM = (16, 35, 63), (8, 15, 34)   # theme_color e base do céu noturno

source = Image.open(DIST / 'logo-mark.png').getchannel('A')   # 256x256, só o alfa importa
SIZE = 1024
mark = source.resize((SIZE, SIZE), Image.LANCZOS)

# Favicon de 16 px: só a gota, desenhada pelo mesmo script da marca.
import importlib.util
_spec = importlib.util.spec_from_file_location('brand_mark', Path(__file__).with_name('generate-brand-mark.py'))
_brand = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_brand)
solid = _brand.drop_alpha(SIZE)

def sky(size, radius=0):
    """Gradiente vertical do céu noturno; radius>0 arredonda os cantos (favicon)."""
    image = Image.new('RGB', (1, 256))
    for y in range(256):
        t = y / 255
        image.putpixel((0, y), tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3)))
    image = image.resize((size, size), Image.BICUBIC).convert('RGBA')
    if radius:
        mask = Image.new('L', (size * 4, size * 4), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=radius * 4, fill=255)
        image.putalpha(mask.resize((size, size), Image.LANCZOS))
    return image

def place(canvas, alpha, color, scale):
    """Centra a gota (pelo seu retângulo útil) ocupando `scale` da altura do canvas."""
    box = alpha.getbbox(); crop = alpha.crop(box)
    height = round(canvas.size[1] * scale); width = round(crop.size[0] * height / crop.size[1])
    crop = crop.resize((width, height), Image.LANCZOS)
    layer = Image.new('RGBA', crop.size, color + (255,)); layer.putalpha(crop)
    canvas.alpha_composite(layer, ((canvas.size[0] - width) // 2, (canvas.size[1] - height) // 2))
    return canvas

def save(image, name, mode='RGB'):
    image = image.convert(mode) if mode != 'RGBA' else image
    image.save(DIST / name, optimize=True)
    print(f'{name:28} {image.size[0]}x{image.size[1]} {(DIST / name).stat().st_size:>7} B')

# Instalação e tela inicial: fundo cheio (sem transparência), gota clara.
for name, size, scale in [('icon-192.png', 192, .62), ('icon-512.png', 512, .62), ('apple-touch-icon-180.png', 180, .6),
                          ('icon-splash-192.png', 192, .62), ('icon-splash-512.png', 512, .62), ('pwa-icon-source-1024.png', 1024, .62)]:
    save(place(sky(size), mark, LIGHT, scale), name)
# Maskable: a zona segura é o círculo de 80%; a gota fica dentro dela.
for name, size in [('icon-maskable-192.png', 192), ('icon-maskable-512.png', 512)]:
    save(place(sky(size), mark, LIGHT, .5), name)
# Favicons: fundo noturno arredondado; 32 px usa a silhueta sólida, 96 px a gota completa.
save(place(sky(32, radius=7), mark, LIGHT, .76), 'favicon-32.png', 'RGBA')
save(place(sky(16, radius=4), solid, LIGHT, .8), 'favicon-16.png', 'RGBA')
save(place(sky(96, radius=20), mark, LIGHT, .7), 'favicon-96.png', 'RGBA')

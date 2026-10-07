"""Gera os ícones da marca a partir do contorno da gota (alfa de dist/logo-mark.png).
  python3 scripts/generate-brand-icons.py
- Cor única: azul da marca #2f6bff (a versão colorida azul/verde foi aposentada).
- Ícones de instalar/tela inicial: céu noturno do app (#10233f → #080f22) com a gota.
- Tamanhos pequenos (favicon 16/32): silhueta sólida da gota, sem as curvas, que viram mancha.
- logo-mark.png e logo-pluvia.png passam a ser chapados no azul da marca (mesmo alfa).
O alfa original da gota é a fonte: rode o script de novo só se o desenho da gota mudar.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

DIST = Path(__file__).resolve().parent.parent / 'dist'
BLUE = (47, 107, 255)          # --brand-blue
LIGHT = (122, 165, 255)        # gota sobre o céu noturno: mesmo matiz, mais luz para contraste
TOP, BOTTOM = (16, 35, 63), (8, 15, 34)   # theme_color e base do céu noturno

source = Image.open(DIST / 'logo-mark.png').getchannel('A')   # 256x256, só o alfa importa
SIZE = 1024
mark = source.resize((SIZE, SIZE), Image.LANCZOS)

def convex_hull(points):
    points = sorted(set(points))
    cross = lambda o, a, b: (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    lower, upper = [], []
    for p in points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0: lower.pop()
        lower.append(p)
    for p in reversed(points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0: upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]

# Silhueta sólida: a gota é convexa, então o fecho convexo do contorno preenche as curvas.
pixels = source.load()
edge = [(x * 4 + 2, y * 4 + 2) for y in range(256) for x in range(256) if pixels[x, y] > 128]
solid = Image.new('L', (SIZE * 2, SIZE * 2), 0)
ImageDraw.Draw(solid).polygon([(x * 2, y * 2) for x, y in convex_hull(edge)], fill=255)
solid = solid.filter(ImageFilter.GaussianBlur(3)).resize((SIZE, SIZE), Image.LANCZOS)

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
save(place(sky(32, radius=7), solid, LIGHT, .76), 'favicon-32.png', 'RGBA')
save(place(sky(16, radius=4), solid, LIGHT, .8), 'favicon-16.png', 'RGBA')
save(place(sky(96, radius=20), mark, LIGHT, .7), 'favicon-96.png', 'RGBA')
# Gota e assinatura chapadas no azul da marca (mesmo alfa de antes).
flat = Image.new('RGBA', source.size, BLUE + (255,)); flat.putalpha(source); save(flat, 'logo-mark.png', 'RGBA')
signature = Image.open(DIST / 'logo-pluvia.png').convert('RGBA')
flat = Image.new('RGBA', signature.size, BLUE + (255,)); flat.putalpha(signature.getchannel('A')); save(flat, 'logo-pluvia.png', 'RGBA')

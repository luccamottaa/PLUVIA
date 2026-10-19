"""Textura da Lua em alta definição para o cartão da Lua (outubro/2026, pedido do usuário).

Baixa a mesma renderização de Lua cheia do NASA Scientific Visualization Studio usada em
moon-surface.webp (phase_full.1571.tif, SVS 5587/5048, LRO LOLA + LROC WAC), recorta o disco e grava
dist/assets/moon-surface-hd.webp (512 × 512, alfa fora do disco). A iluminação (fase, terminador e
luz da Terra) é calculada no navegador por moon-view.js; a textura é sempre a Lua cheia, sem sombra.

Uso: python scripts/generate-moon-surface.py [arquivo.tif]
Sem argumento, baixa o original da NASA (o ambiente precisa alcançar svs.gsfc.nasa.gov).
"""
import io, sys, urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

SOURCE = 'https://svs.gsfc.nasa.gov/vis/a000000/a005000/a005048/phase_full.1571.tif'
SIZE = 512
BUDGET = 90_000
OUT = Path(__file__).resolve().parent.parent / 'dist' / 'assets' / 'moon-surface-hd.webp'


def load(data):
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
        return np.asarray(image.convert('RGB'), dtype=np.float64) / 255
    except Exception:
        import tifffile  # TIFF de 16 bits por canal: o Pillow não abre RGB de 16 bits
        array = tifffile.imread(io.BytesIO(data))
        array = array[..., :3].astype(np.float64)
        return array / (65535 if array.max() > 255 else 255)


def main():
    if len(sys.argv) > 1:
        data = Path(sys.argv[1]).read_bytes()
    else:
        request = urllib.request.Request(SOURCE, headers={'User-Agent': 'PLUVIA texture build (https://pluviaweather.com.br)'})
        data = urllib.request.urlopen(request, timeout=300).read()
    rgb = load(data)
    luminance = rgb @ np.array([.2126, .7152, .0722])
    rows = np.where((luminance > .03).sum(axis=1) > 20)[0]
    cols = np.where((luminance > .03).sum(axis=0) > 20)[0]
    top, bottom, left, right = rows[0], rows[-1], cols[0], cols[-1]
    cx, cy = (left + right) / 2, (top + bottom) / 2
    radius = max(right - left, bottom - top) / 2 + 1
    box = tuple(int(round(value)) for value in (cx - radius, cy - radius, cx + radius, cy + radius))
    disc = Image.fromarray(np.clip(rgb * 255 + .5, 0, 255).astype(np.uint8)).crop(box).resize((SIZE, SIZE), Image.LANCZOS)
    # Alfa antisserrilhado: o disco é desenhado 4× maior e reduzido.
    mask = Image.new('L', (SIZE * 4, SIZE * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, SIZE * 4 - 1, SIZE * 4 - 1), fill=255)
    disc.putalpha(mask.resize((SIZE, SIZE), Image.LANCZOS))
    for quality in (86, 80, 74, 68):
        buffer = io.BytesIO()
        disc.save(buffer, 'WEBP', quality=quality, method=6)
        if buffer.tell() <= BUDGET:
            break
    if buffer.tell() > BUDGET:
        raise SystemExit(f'textura acima do orçamento: {buffer.tell()} bytes')
    OUT.write_bytes(buffer.getvalue())
    print(f'{OUT.name}: {SIZE}×{SIZE}, {buffer.tell()} bytes (qualidade {quality}), disco de {2 * radius:.0f} px na origem')


if __name__ == '__main__':
    main()

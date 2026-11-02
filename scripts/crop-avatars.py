"""Fotos de perfil (1.44): recorta os 12 círculos das duas pranchas enviadas pelo dono (design/avatars/) em
WebP de 256 px com fundo transparente fora do círculo, em dist/assets/avatars/<id>.webp.
Cada prancha tem 2 fileiras de 3 círculos sobre branco; o círculo é achado pelos pixels não brancos da célula.
Mudou a arte: rode de novo e suba o ?v=avatars-N em modules/avatars.js."""
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

root = Path(__file__).resolve().parent.parent
SHEETS = {
    'avatares-2026-11-a.jpg': [['menina-capa-roxa', 'cachorro-capa', 'sol-arco-iris'],
                               ['menino-barquinho', 'gato-capa', 'vovo-guarda-chuva']],
    'avatares-2026-11-b.jpg': [['menina-capa-amarela', 'nuvenzinha', 'menino-cachecol'],
                               ['sapo', 'menina-guarda-chuva', 'menino-caneca']],
}
SIZE = 256
out = root / 'dist' / 'assets' / 'avatars'
out.mkdir(parents=True, exist_ok=True)
mask = Image.new('L', (SIZE * 4, SIZE * 4), 0)
ImageDraw.Draw(mask).ellipse((0, 0, SIZE * 4 - 1, SIZE * 4 - 1), fill=255)
mask = mask.resize((SIZE, SIZE), Image.LANCZOS)
for sheet, rows in SHEETS.items():
    image = Image.open(root / 'design' / 'avatars' / sheet).convert('RGB')
    pixels = np.asarray(image).astype(int)
    height, width, _ = pixels.shape
    ink = pixels.min(axis=2) < 235
    for r, names in enumerate(rows):
        for c, name in enumerate(names):
            x0, x1, y0, y1 = c * width // 3, (c + 1) * width // 3, r * height // 2, (r + 1) * height // 2
            ys, xs = np.where(ink[y0:y1, x0:x1])
            cx, cy = (xs.min() + xs.max()) / 2 + x0, (ys.min() + ys.max()) / 2 + y0
            radius = int(min(xs.max() - xs.min(), ys.max() - ys.min()) / 2) - 3  # tira a borda clara do recorte
            face = image.crop((int(cx - radius), int(cy - radius), int(cx + radius), int(cy + radius))).resize((SIZE, SIZE), Image.LANCZOS).convert('RGBA')
            face.putalpha(mask)
            face.save(out / f'{name}.webp', 'WEBP', quality=82, method=6)
            print(name)

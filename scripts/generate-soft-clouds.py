"""Gera as texturas de nuvem do céu do PLUVIA (arte original, estática).

As camadas deslizam continuamente na horizontal (repeat-x), então cada textura
precisa emendar consigo mesma sem costura: tudo é periódico em x.

Cada nuvem é um cúmulo montado como união de esferas (um campo de altura 2,5D):
gomos grandes por dentro, médios e pequenos na superfície (couve-flor), domo
irregular com torres e base plana levemente recortada. Sobre esse relevo:

1. ondulações de baixa frequência deformam a superfície e o ruído fino só
   desfia a borda, perto das nuvens (o céu aberto fica limpo e barato);
2. luz de cima à esquerda pela normal do relevo, absorção da coluna a partir do
   topo (topo branco, base cinza-azulada), oclusão nas dobras e borda fina mais
   clara (luz atravessando);
3. alfa contínuo de 64 níveis, sem perdas, e cor sem pré-multiplicação em WebP.

O volume (frente) traz cúmulos de tamanhos variados com vãos; o véu (fundo) é um
campo de estratocúmulos baixos e macios, quase encostados, que vira céu fechado
com as duas cópias e a névoa do CSS em tempo nublado/chuvoso. As duas nuvens do
perfil "poucas nuvens" (máscara do sky.css) ficam centradas em 39% (véu) e 46%
(volume) de cada meio tile, a 34% da altura.

Desfoques e derivadas usam vizinhança circular em x (FFT/roll), preservando a
emenda. Não há canvas, WebGL ou ruído em tempo de execução: o app só exibe os
arquivos. Uso: python scripts/generate-soft-clouds.py DESTINO_DIR
"""
import os
import sys

import numpy as np
from PIL import Image

WIDTH, HEIGHT = 2100, 700          # 3:1, entregue sem redimensionar (sem quebrar a emenda)
QUALITY = 80
ALPHA_LEVELS = 64
BUDGET_KIB = 360


def spectral_noise(rng, beta, stretch, masses=0.0):
    """Campo periódico com espectro 1/f^beta; stretch > 1 alonga na horizontal.

    masses atenua ondas mais longas que largura/masses: em vez de uma única
    massa por quadro, várias nuvens médias se distribuem ao longo do deslizamento."""
    fy = np.fft.fftfreq(HEIGHT)[:, None]
    fx = np.fft.rfftfreq(WIDTH)[None, :] * stretch
    radius = np.sqrt(fx ** 2 + fy ** 2)
    radius[0, 0] = 1
    amplitude = radius ** (-beta / 2)
    if masses:
        amplitude *= 1 - np.exp(-(radius * WIDTH / masses) ** 4)
    amplitude[0, 0] = 0
    phase = rng.uniform(0, 2 * np.pi, amplitude.shape)
    field = np.fft.irfft2(amplitude * np.exp(1j * phase), s=(HEIGHT, WIDTH))
    return ((field - field.mean()) / field.std()).astype(np.float32)




def blur(field, sigma_x, sigma_y=None):
    """Gaussiana separável: circular em x (FFT), reflexão em y."""
    sigma_y = sigma_x if sigma_y is None else sigma_y
    freq = np.fft.rfftfreq(WIDTH)
    out = np.fft.irfft(np.fft.rfft(field, axis=1) * np.exp(-2 * (np.pi * freq * sigma_x) ** 2), n=WIDTH, axis=1)
    pad = int(3 * sigma_y) + 1
    padded = np.pad(out, ((pad, pad), (0, 0)), mode='reflect')
    freq = np.fft.rfftfreq(padded.shape[0])
    padded = np.fft.irfft(np.fft.rfft(padded, axis=0) * np.exp(-2 * (np.pi * freq * sigma_y) ** 2)[:, None],
                          n=padded.shape[0], axis=0)
    return padded[pad:-pad].astype(np.float32)


def smoothstep(edge0, edge1, value):
    t = np.clip((value - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)






def cluster(rng, cx, cy, width, height, detail=1.0, towers=2):
    """Puffs (x, y, r, base, top) of one cumulus centred on (cx, cy): rounded dome over a flat base."""
    base = cy + height * .5
    phase, freq, skew = rng.uniform(0, 2 * np.pi), rng.uniform(.8, 1.6), rng.uniform(-.35, .35)
    def profile(u):  # u in [-1, 1]; relative height of the dome with irregular towers
        v = (u - skew) / (1 + np.sign(u - skew) * skew)
        dome = np.clip(1 - np.abs(v) ** 1.7, 0, 1) ** .75
        return dome * (1 + .28 * np.sin(np.pi * u * freq * towers + phase))
    out = []
    levels = [(.36, 6, .38), (.22, 16, .72), (.13, 30, .9), (.075, int(55 * detail), .98), (.04, int(70 * detail), 1.02)]
    for rel_r, count, reach in levels:
        for _ in range(count):
            u = rng.uniform(-1, 1) * (1 if reach < .9 else .97)
            top = profile(u) * height
            r = height * rel_r * rng.uniform(.75, 1.25) * (.6 + .4 * profile(u))
            if r < 3: continue
            y = base - top * reach * rng.uniform(.9, 1.02) + r * .55
            x = cx + u * width * .5
            out.append((x, min(y, base - r * .2), r, base, base - height * 1.1))
    # Fill the lower body so the base is solid and flat.
    for u in np.linspace(-.8, .8, 6):
        r = height * .34 * (.6 + .4 * profile(u))
        out.append((cx + u * width * .48, base - r * .6, r, base, base - height * 1.1))
    return out


def render(puffs, noise, *, soften=0.0, fray=.6, edge=10.0, erosion=9.0, base_soft=6.0, alpha_max=1.0, light_dir=(-.35, -.8, .5),
           bright=(255, 254, 250), shadow=(124, 139, 168), absorb=.9, ao=.45, wrap=.35):
    height = np.zeros((HEIGHT, WIDTH), np.float32)
    base_map = np.full((HEIGHT, WIDTH), np.nan, np.float32)
    span_map = np.ones((HEIGHT, WIDTH), np.float32)
    ys = np.arange(HEIGHT, dtype=np.float32)[:, None]
    for x, y, r, base, top in puffs:
        x0, x1 = int(np.floor(x - r)) - 1, int(np.ceil(x + r)) + 2
        y0, y1 = max(0, int(y - r) - 1), min(HEIGHT, int(y + r) + 2)
        if y1 <= y0: continue
        cols = np.arange(x0, x1) % WIDTH
        dx = (np.arange(x0, x1, dtype=np.float32) - x)[None, :]
        dy = ys[y0:y1] - y
        z = np.sqrt(np.clip(r * r - dx * dx - dy * dy, 0, None)) + r * .15 * (r / 40) ** .3
        z = np.where(dx * dx + dy * dy < r * r, z, 0)
        sub = height[y0:y1][:, cols]
        win = z > sub
        sub = np.where(win, z, sub)
        height[y0:y1, cols] = sub
        bsub = base_map[y0:y1][:, cols]; ssub = span_map[y0:y1][:, cols]
        base_map[y0:y1, cols] = np.where(win, base, bsub)
        span_map[y0:y1, cols] = np.where(win, base - top, ssub)
    # Pixels just outside every puff take the base of the nearest cloud, so the flat cut also
    # trims the frayed rim below it (otherwise faint rings outline the lower puffs).
    occ = (height > 0).astype(np.float32)
    known = np.nan_to_num(base_map, nan=0)
    filled = blur(known * occ, 10) / np.maximum(blur(occ, 10), 1e-4)
    base_map = np.where(occ > 0, known, np.where(blur(occ, 10) > 1e-3, filled, HEIGHT)).astype(np.float32)
    known_span = np.where(occ > 0, span_map, 0)
    span_map = np.where(occ > 0, span_map, blur(known_span, 10) / np.maximum(blur(occ, 10), 1e-4)).astype(np.float32)
    # Billows (low-frequency) shape the surface; fine noise only frays the edge. Far from any puff
    # nothing passes the threshold, so the open sky stays clean (and cheap to compress).
    mid, fine = noise
    w = np.clip(blur(height, 4) / 6, 0, 1)          # 0 in open sky: no rings, no specks
    surf = height + erosion * mid * w               # billows shape the surface (and the light)
    cut = smoothstep(base_soft, -base_soft * .4, ys - base_map + 5 * mid)
    alpha = smoothstep(0, edge, surf + edge * fray * fine * w) * cut
    if soften: alpha = np.clip(blur(alpha, soften), 0, 1)
    # Lighting: billow normals + beer-lambert from the top of the column + ambient occlusion.
    hs = blur(surf, 1.4)
    gx = (np.roll(hs, -1, 1) - np.roll(hs, 1, 1)) * .5
    gy = (np.roll(hs, -1, 0) - np.roll(hs, 1, 0)) * .5
    n = np.stack([-gx, -gy, np.ones_like(gx)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    L = np.array(light_dir, np.float32); L /= np.linalg.norm(L)
    diffuse = np.clip(((n @ L) + wrap) / (1 + wrap), 0, 1)
    depth = np.cumsum(alpha, axis=0)
    rel_base = np.clip((base_map - ys) / np.maximum(span_map * .45, 12), 0, 1)
    column = np.exp(-absorb * depth / np.maximum(span_map, 20))
    occl = np.clip((blur(hs, 10) - hs) / 25, 0, 1)
    light = .38 * diffuse + .3 * column + .32 * rel_base ** .7 - ao * occl
    light = np.clip(light + .18 * (1 - alpha), 0, 1)  # thin edges glow
    light = blur(light, .8)
    b, s = np.array(bright, np.float32), np.array(shadow, np.float32)
    rgb = s + (b - s) * light[..., None]
    a = np.clip(alpha * alpha_max, 0, 1)
    rgb[a <= 0] = b
    step = 1 / (ALPHA_LEVELS - 1)
    a = np.round(a / step) * step
    return Image.fromarray(np.dstack([rgb, a * 255]).round().clip(0, 255).astype(np.uint8), 'RGBA')


def fine_noise(rng, beta=1.6, mid_beta=3.0):
    mid = np.tanh(spectral_noise(rng, mid_beta, 1.0) * .8)
    fine = np.tanh(spectral_noise(rng, beta, 1.0) * .9)
    return mid, fine


def volume(seed=29):
    rng = np.random.default_rng(seed)
    puffs = []
    # Two clusters that the "few clouds" mask reveals: 46% of each half tile, 34% of the height.
    few = (.46 * WIDTH / 2, WIDTH / 2 + .46 * WIDTH / 2)
    for cx in few:
        puffs += cluster(rng, cx, .34 * HEIGHT, rng.uniform(300, 360), rng.uniform(150, 180))
    # Cumulus field: varied sizes, two loose rows, gaps between masses.
    for i in range(12):
        cx = (i + rng.uniform(.15, .85)) * WIDTH / 12
        if min(abs(cx - f) for f in few) < 220: continue
        big = rng.random() < .35
        w, h = (rng.uniform(260, 380), rng.uniform(110, 160)) if big else (rng.uniform(120, 230), rng.uniform(50, 95))
        cy = rng.uniform(.36, .6) * HEIGHT if big else rng.uniform(.2, .66) * HEIGHT
        puffs += cluster(rng, cx, cy, w, h)
    return render(puffs, fine_noise(rng), soften=1.0, fray=.35, erosion=10, edge=9, base_soft=9)


def veil(seed=11):
    """Distant stratocumulus deck: rows of flat lumpy clusters that almost touch, so overcast and
    rain (two offset copies plus a haze behind) read as a closed sky, with gaps in partly cloudy."""
    rng = np.random.default_rng(seed)
    puffs = []
    for cx in (.39 * WIDTH / 2, WIDTH / 2 + .39 * WIDTH / 2):
        puffs += cluster(rng, cx, .34 * HEIGHT, rng.uniform(380, 440), rng.uniform(110, 130), detail=.7, towers=3)
    for row, (y, n) in enumerate(((.16, 11), (.27, 13), (.4, 12), (.53, 13), (.66, 11), (.78, 9))):
        offset = rng.uniform(0, 1)
        for i in range(n):
            cx = (i + offset + rng.uniform(-.2, .2)) * WIDTH / n
            cy = (y + rng.uniform(-.035, .035)) * HEIGHT
            if abs(cy - .34 * HEIGHT) < 90 and min(abs(cx - .39 * WIDTH / 2), abs(cx - (WIDTH / 2 + .39 * WIDTH / 2))) < 240: continue
            if rng.random() < .22: continue
            puffs += cluster(rng, cx, cy, rng.uniform(170, 300), rng.uniform(42, 78), detail=.55, towers=3)
    return render(puffs, fine_noise(rng, 1.7, 3.2), soften=3.0, fray=.3, edge=30, erosion=20, base_soft=22,
                  alpha_max=.9, shadow=(166, 178, 202), absorb=.6, ao=.3)


LAYERS = {'sky-cloud-veil': veil, 'sky-cloud-volume': volume}


def main(target_dir):
    os.makedirs(target_dir, exist_ok=True)
    total = 0
    for name, build in LAYERS.items():
        path = os.path.join(target_dir, name + '.webp')
        build().save(path, 'WEBP', quality=QUALITY, method=6, alpha_quality=100)
        size = os.path.getsize(path) / 1024
        total += size
        print(f'{name}: {WIDTH}x{HEIGHT}, {size:.1f} KiB')
    print(f'total: {total:.1f} KiB (orçamento {BUDGET_KIB} KiB)')
    if total >= BUDGET_KIB:
        sys.exit('As texturas excedem o orçamento do precache.')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])

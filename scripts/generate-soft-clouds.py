"""Gera as texturas de nuvem do céu do PLUVIA (arte original, estática).

As camadas deslizam continuamente na horizontal (repeat-x), então cada textura
precisa emendar consigo mesma sem costura. Método, todo periódico em x:

1. síntese espectral (ruído 1/f^beta anisotrópico, alongado na horizontal)
   para as massas grandes, com distorção de domínio para curvas e fiapos;
2. "couve-flor": ruído médio em módulo invertido (billow) soma volume às
   bordas e ao topo de cada massa, em vez de um borrão uniforme;
3. densidade por limiar estreito (borda definida, ainda com transição de
   alguns pixels para não serrilhar ao esticar);
4. luz de cima por marcha óptica vertical (topo claro, base cinza-azulada)
   mais um relevo leve pelo gradiente da densidade;
5. alfa contínuo de 64 níveis e cor sem pré-multiplicação, gravados em WebP.

Desfoques e derivadas usam vizinhança circular em x (FFT), preservando a
emenda; em y usam reflexão, pois o envelope vertical já esvazia as bordas.
Não há canvas, WebGL ou ruído em tempo de execução: o app só exibe os arquivos.
Uso: python scripts/generate-soft-clouds.py DESTINO_DIR
"""
import os
import sys

import numpy as np
from PIL import Image

WIDTH, HEIGHT = 2100, 700          # 3:1, entregue sem redimensionar (sem quebrar a emenda)
S = HEIGHT / 800                   # escala dos raios em pixels
QUALITY = 80
ALPHA_LEVELS = 64
BUDGET_KIB = 360

LAYERS = {
    # Camada distante: faixas largas e alongadas, mais translúcidas.
    # Cobre a maior parte do quadro: com tempo nublado a mesma textura forma o céu fechado.
    'sky-cloud-veil': dict(seed=11, beta=3.0, stretch=2.6, masses=4, warp=46, billow=.16, billow_beta=3.0, low=.46, edge=.24,
                           alpha=.9, envelope=((0.00, .3), (.10, .95), (.62, 1.0), (.88, .5), (1.00, 0.05)),
                           absorb=(.42, 26), shadow=(150, 162, 184)),
    # Camada frontal: massas densas, de topo encaracolado e base acinzentada, com vãos entre elas.
    'sky-cloud-volume': dict(seed=29, beta=3.1, stretch=1.7, masses=6.5, warp=34, billow=.22, billow_beta=3.0, low=.50, edge=.10,
                             alpha=.98, envelope=((0.00, 0.0), (.08, .55), (.30, 1.0), (.85, 1.0), (1.00, .55)),
                             absorb=(.6, 30), shadow=(128, 142, 168)),
}


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


def sample(field, x, y):
    """Amostragem bilinear periódica em x; y é limitado às bordas."""
    x0 = np.floor(x).astype(np.int64)
    y = np.clip(y, 0, HEIGHT - 1.001)
    y0 = np.floor(y).astype(np.int64)
    fx, fy = (x - x0).astype(np.float32), (y - y0).astype(np.float32)
    x0 %= WIDTH
    x1, y1 = (x0 + 1) % WIDTH, y0 + 1
    top = field[y0, x0] * (1 - fx) + field[y0, x1] * fx
    bottom = field[y1, x0] * (1 - fx) + field[y1, x1] * fx
    return top * (1 - fy) + bottom * fy


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


def envelope(points):
    rows = np.linspace(0, 1, HEIGHT)
    return np.interp(rows, [p for p, _ in points], [v for _, v in points])[:, None].astype(np.float32)


def normalize(field):
    return (field - field.min()) / (field.max() - field.min())


def layer(seed, beta, stretch, masses, warp, billow, billow_beta, low, edge, alpha, envelope_points, absorb, shadow):
    rng = np.random.default_rng(seed)
    base = spectral_noise(rng, beta, stretch, masses)
    warp_x = spectral_noise(rng, beta + .3, stretch)
    warp_y = spectral_noise(rng, beta + .3, stretch)
    puffs = spectral_noise(rng, billow_beta, 1.25)
    ys, xs = np.mgrid[0:HEIGHT, 0:WIDTH].astype(np.float32)
    shape = normalize(sample(base, xs + warp * S * warp_x, ys + warp * S * .5 * warp_y))
    shape = shape * envelope(envelope_points)
    # Couve-flor: lóbulos arredondados (billow) dão forma ao contorno e ao relevo interno.
    lumps = 1 - np.abs(np.tanh(puffs * .8))
    value = shape + billow * (lumps - .55)
    density = smoothstep(low, low + edge, value)
    # Sombra própria: a nuvem logo acima (deslocada e suavizada) escurece a base.
    above = blur(density, 14 * S, 10 * S)
    shift = round(absorb[1] * S)
    above = np.vstack([np.zeros((shift, WIDTH), np.float32), above[:-shift]])
    light = 1 - absorb[0] * above
    # Relevo pela altura contínua (não saturada): lóbulos voltados para cima clareiam.
    height = blur(value, 7 * S)
    step_y = max(1, round(4 * S))
    grad_y = np.roll(height, -step_y, axis=0) - np.roll(height, step_y, axis=0)
    light = np.clip(light - grad_y * 2.4, 0, 1)
    light = blur(light, 1.5 * S)
    bright = np.array([253, 253, 255], dtype=np.float32)
    shadow = np.array(shadow, dtype=np.float32)
    rgb = shadow + (bright - shadow) * light[..., None]
    a = np.clip(blur(density, 1.2) * alpha, 0, 1)
    step = 1 / (ALPHA_LEVELS - 1)
    a = np.round(a / step) * step
    return Image.fromarray(np.dstack([rgb, a * 255]).round().clip(0, 255).astype(np.uint8), 'RGBA')


def main(target_dir):
    os.makedirs(target_dir, exist_ok=True)
    total = 0
    for name, options in LAYERS.items():
        options = dict(options)
        options['envelope_points'] = options.pop('envelope')
        path = os.path.join(target_dir, name + '.webp')
        layer(**options).save(path, 'WEBP', quality=QUALITY, method=6, alpha_quality=100)
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

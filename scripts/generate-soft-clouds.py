"""Gera as texturas de nuvem do céu do PLUVIA (arte original, estática).

Estilo pedido pelo usuário a partir do Apple Weather: nuvens macias e esfumadas,
com fiapos longos no sentido do vento e luz suave de cima, sem contorno recortado.
As camadas deslizam continuamente na horizontal (repeat-x), então cada textura
emenda consigo mesma sem costura: tudo é periódico em x.

1. massas: ruído espectral 1/f^beta alongado na horizontal, com distorção de
   domínio para curvas; ondulações médias dão relevo sem granulado;
2. fiapos: ruído mais fino e muito alongado, deformado pelo mesmo campo, soma
   detalhe à densidade e à luz (é o que evita o aspecto "embaçado");
3. densidade por transição larga (borda esfumada) e leve desfoque;
4. luz: a nuvem logo acima (desfocada e deslocada) acinzenta a base; partes
   finas ficam mais claras; os fiapos marcam o sombreado;
5. alfa contínuo de 64 níveis, sem perdas, e cor sem pré-multiplicação em WebP.

O perfil "poucas nuvens" (máscara do sky.css) mostra um banco por meio tile:
cada camada recebe uma massa macia em 39% (véu) e 46% (volume) do meio tile, a
34% da altura. Desfoques e derivadas usam vizinhança circular em x (FFT),
preservando a emenda. Não há canvas, WebGL ou ruído em tempo de execução: o app
só exibe os arquivos. Uso: python scripts/generate-soft-clouds.py DESTINO_DIR
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






def sample(field, x, y):
    x0 = np.floor(x).astype(np.int64); y = np.clip(y, 0, HEIGHT - 1.001); y0 = np.floor(y).astype(np.int64)
    fx, fy = (x - x0).astype(np.float32), (y - y0).astype(np.float32)
    x0 %= WIDTH; x1, y1 = (x0 + 1) % WIDTH, y0 + 1
    top = field[y0, x0] * (1 - fx) + field[y0, x1] * fx
    bot = field[y1, x0] * (1 - fx) + field[y1, x1] * fx
    return top * (1 - fy) + bot * fy


def envelope(points):
    rows = np.linspace(0, 1, HEIGHT)
    return np.interp(rows, [p for p, _ in points], [v for _, v in points])[:, None].astype(np.float32)


def soft_layer(seed, *, few_x=None, beta, stretch, masses, warp, low, high, wisp, wisp_stretch, env, alpha_max,
               bright=(252, 253, 255), shadow=(146, 162, 190), lift=.9, streak=.12):
    rng = np.random.default_rng(seed)
    base = spectral_noise(rng, beta, stretch, masses)
    wx = spectral_noise(rng, beta + .2, stretch)
    wy = spectral_noise(rng, beta + .2, stretch)
    ys, xs = np.mgrid[0:HEIGHT, 0:WIDTH].astype(np.float32)
    shape = sample(base, xs + warp * wx, ys + warp * .35 * wy)
    shape = (shape - shape.mean()) / shape.std()
    # Fine streaks: long, thin fibres stretched along the wind; they modulate density and light.
    fib = spectral_noise(rng, 2.5, wisp_stretch)
    fib = sample(fib, xs + warp * .6 * wx, ys + warp * .25 * wy)
    fib = np.tanh(fib * .7)
    mid = np.tanh(spectral_noise(rng, 2.9, stretch * .8) * .8)
    value = shape * .82 + mid * .35 + fib * wisp
    value = value * 1.0 + 3.2 * (env - 1)
    if few_x is not None:
        # The "few clouds" mask (sky.css) shows one bank per half tile at few_x, 34% of the height:
        # a soft mass there, so the revealed cloud is whole and dense.
        for cx in (few_x * WIDTH / 2, WIDTH / 2 + few_x * WIDTH / 2):
            dx = ((xs - cx + WIDTH / 2) % WIDTH) - WIDTH / 2
            value += 1.6 * np.exp(-(dx / 170) ** 2 - ((ys - .34 * HEIGHT) / 70) ** 2)
    density = np.clip(blur(smoothstep(low, high, value), 2.2), 0, 1)   # wide transition: soft, smoky edges
    # Soft top light: brighter where the cloud is thin above (lit from the sky), greyer underneath.
    above = blur(density, 18, 26)
    shift = 24
    above = np.vstack([np.zeros((shift, WIDTH), np.float32), above[:-shift]])
    light = 1 - lift * .55 * above
    light += streak * fib                           # streak detail in the shading
    light += .22 * (1 - density)                    # thin parts glow
    light = np.clip(blur(light, 2.0), 0, 1)
    b, s = np.array(bright, np.float32), np.array(shadow, np.float32)
    rgb = s + (b - s) * light[..., None]
    a = np.clip(density * alpha_max, 0, 1)
    rgb[a <= 0] = b
    step = 1 / (ALPHA_LEVELS - 1)
    a = np.round(a / step) * step
    return Image.fromarray(np.dstack([rgb, a * 255]).round().clip(0, 255).astype(np.uint8), 'RGBA')


LAYERS = {
    'sky-cloud-veil': dict(seed=11, beta=3.3, stretch=3.2, masses=4, warp=70, low=-.7, high=1.4, wisp=.3, wisp_stretch=6.0,
                           env=((0, .55), (.12, 1), (.7, 1), (.9, .7), (1, .4)), alpha_max=.92, shadow=(158, 172, 198), lift=.8, few_x=.39, streak=.14),
    'sky-cloud-volume': dict(seed=29, beta=3.4, stretch=2.2, masses=5, warp=50, low=-.2, high=1.5, wisp=.25, wisp_stretch=5.0,
                             env=((0, .3), (.12, .85), (.35, 1), (.85, 1), (1, .7)), alpha_max=.97, shadow=(136, 152, 182), lift=1.0, few_x=.46, streak=.12),
}

def main(target_dir):
    os.makedirs(target_dir, exist_ok=True)
    total = 0
    for name, options in LAYERS.items():
        options = dict(options)
        options['env'] = envelope(options['env'])
        path = os.path.join(target_dir, name + '.webp')
        soft_layer(**options).save(path, 'WEBP', quality=QUALITY, method=6, alpha_quality=100)
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

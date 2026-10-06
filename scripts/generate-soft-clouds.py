"""Gera as texturas de nuvem do céu do PLUVIA (arte original, estática).

Nuvens suaves e de baixa frequência, como véus e massas translúcidas: esse
conteúdo pode ser esticado pela camada (cover sobre altura fixa) sem parecer
pixelado, ao contrário de detalhes fotográficos finos. Método:

1. síntese espectral (ruído com espectro 1/f^beta, anisotrópico para alongar
   na horizontal) — periódica nas bordas, então o deslocamento não mostra emenda;
2. distorção de domínio com um segundo campo para formar fiapos e curvas;
3. densidade por limiar suave, envelope vertical da composição de cada camada;
4. sombreamento com luz de cima (topo claro, base levemente acinzentada);
5. alfa contínuo e cor sem pré-multiplicação, gravados em WebP.

Não há canvas, WebGL ou ruído em tempo de execução: o app só exibe os arquivos.
Uso: python scripts/generate-soft-clouds.py DESTINO_DIR
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

WIDTH, HEIGHT = 1600, 800          # resolução de cálculo
OUTPUT_SIZE = (1120, 560)          # entregue: conteúdo suave estica sem pixelar
QUALITY = 74
ALPHA_LEVELS = 64
ALPHA_SOFTEN = 2.5                 # remove detalhe invisível do alfa (compressão sem perda)
BUDGET_KIB = 160

LAYERS = {
    # Camada distante: véus largos e alongados, translúcidos.
    # Cobre a maior parte do quadro: com tempo nublado a mesma textura forma o céu fechado.
    'sky-cloud-veil': dict(seed=11, beta=3.3, stretch=3.0, warp=40, low=.17, high=.70, alpha=.86, detail=.035,
                           envelope=((0.00, .35), (.10, .95), (.62, 1.0), (.88, .5), (1.00, 0.08)), shade=.6,
                           shadow=(166, 176, 194)),
    # Camada frontal: massas mais densas e arredondadas, com vãos entre elas.
    # Base acinzentada dá definição contra o azul claro do dia; começa alto para aparecer no topo.
    'sky-cloud-volume': dict(seed=29, beta=3.4, stretch=1.8, warp=28, low=.43, high=.74, alpha=.97, detail=.045,
                             envelope=((0.00, 0.0), (.08, .55), (.30, 1.0), (.85, 1.0), (1.00, .6)), shade=1.15,
                             shadow=(146, 158, 182)),
}


def spectral_noise(rng, beta, stretch):
    """Campo periódico com espectro 1/f^beta; stretch > 1 alonga na horizontal."""
    fy = np.fft.fftfreq(HEIGHT)[:, None]
    fx = np.fft.rfftfreq(WIDTH)[None, :] * stretch
    radius = np.sqrt(fx ** 2 + fy ** 2)
    radius[0, 0] = 1
    amplitude = radius ** (-beta / 2)
    amplitude[0, 0] = 0
    phase = rng.uniform(0, 2 * np.pi, amplitude.shape)
    field = np.fft.irfft2(amplitude * np.exp(1j * phase), s=(HEIGHT, WIDTH))
    return (field - field.mean()) / field.std()


def sample(field, x, y):
    """Amostragem bilinear periódica (sem emendas nas bordas)."""
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    x0 %= WIDTH; y0 %= HEIGHT
    x1, y1 = (x0 + 1) % WIDTH, (y0 + 1) % HEIGHT
    top = field[y0, x0] * (1 - fx) + field[y0, x1] * fx
    bottom = field[y1, x0] * (1 - fx) + field[y1, x1] * fx
    return top * (1 - fy) + bottom * fy


def smoothstep(edge0, edge1, value):
    t = np.clip((value - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)


def envelope(points):
    rows = np.linspace(0, 1, HEIGHT)
    return np.interp(rows, [p for p, _ in points], [v for _, v in points])[:, None]


def layer(seed, beta, stretch, warp, low, high, alpha, detail, envelope_points, shade, shadow):
    rng = np.random.default_rng(seed)
    base = spectral_noise(rng, beta, stretch)
    warp_x = spectral_noise(rng, beta + .4, stretch)
    warp_y = spectral_noise(rng, beta + .4, stretch)
    fine = spectral_noise(rng, 2.4, stretch * .8)
    ys, xs = np.mgrid[0:HEIGHT, 0:WIDTH].astype(np.float64)
    warped = sample(base, xs + warp * warp_x, ys + warp * .45 * warp_y)
    # Pouco detalhe fino: dá textura sem criar ruído que vira "pixel" ao esticar.
    value = warped * (1 - detail) + fine * detail
    value = (value - value.min()) / (value.max() - value.min())
    density = smoothstep(low, high, value) * envelope(envelope_points)
    # Luz de cima: onde a densidade cresce para baixo, a face fica iluminada.
    below = np.roll(density, 14, axis=0)
    light = np.clip(.62 + (density - below) * 2.2 * shade + (1 - density) * .25, 0, 1)
    bright = np.array([250, 251, 253], dtype=np.float64)
    shadow = np.array(shadow, dtype=np.float64)
    rgb = shadow + (bright - shadow) * light[..., None]
    a = np.clip(density * alpha * 255, 0, 255)
    return Image.fromarray(np.dstack([rgb, a]).round().astype(np.uint8), 'RGBA')


def finish(image):
    """Reduz para o tamanho entregue, suaviza o alfa e quantiza em 64 níveis."""
    image = image.resize(OUTPUT_SIZE, Image.LANCZOS)
    r, g, b, a = image.split()
    a = a.filter(ImageFilter.GaussianBlur(ALPHA_SOFTEN))
    r, g, b = [c.filter(ImageFilter.GaussianBlur(ALPHA_SOFTEN * .6)) for c in (r, g, b)]
    data = np.asarray(Image.merge('RGBA', (r, g, b, a))).copy()
    # 64 níveis de alfa: degrau de 4/255 é invisível em nuvem suave e comprime bem.
    step = 255 / (ALPHA_LEVELS - 1)
    data[..., 3] = np.round(np.round(data[..., 3] / step) * step).astype(np.uint8)
    return Image.fromarray(data, 'RGBA')


def main(target_dir):
    os.makedirs(target_dir, exist_ok=True)
    total = 0
    for name, options in LAYERS.items():
        options = dict(options)
        options['envelope_points'] = options.pop('envelope')
        path = os.path.join(target_dir, name + '.webp')
        finish(layer(**options)).save(path, 'WEBP', quality=QUALITY, method=6, alpha_quality=100)
        size = os.path.getsize(path) / 1024
        total += size
        print(f'{name}: {OUTPUT_SIZE[0]}x{OUTPUT_SIZE[1]}, {size:.1f} KiB')
    print(f'total: {total:.1f} KiB (orçamento {BUDGET_KIB} KiB)')
    if total >= BUDGET_KIB:
        sys.exit('As texturas excedem o orçamento do precache.')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])

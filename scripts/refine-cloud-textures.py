"""Refina as texturas de nuvem existentes sem trocar a arte.

As texturas originais chegaram com transparência quantizada em 16 níveis e
blocos de compressão no degradê, o que deixa bordas em degraus ("pixeladas"),
ampliadas quando o navegador estica a camada. Este script:

1. reconstrói uma transparência contínua: suaviza o alfa e limita cada pixel a
   meio degrau do valor original, preservando o desenho de cada nuvem;
2. remove os blocos do RGB com um desfoque leve em cor pré-multiplicada (sem
   halo escuro nas bordas transparentes);
3. grava as texturas no mesmo tamanho (1120x560), com alfa final de 64 níveis
   (ver OUTPUT_ALPHA_LEVELS), dentro do orçamento de 160KiB do precache.

Uma versão 2x por Lanczos foi avaliada e descartada: sem arte de origem maior,
ela não acrescenta detalhe e custaria cerca de 410KiB a mais.

Uso: python scripts/refine-cloud-textures.py ORIGEM_DIR DESTINO_DIR
A origem deve conter as texturas ORIGINAIS (alfa de 16 níveis); não reprocessar
a saída. Elas estão no histórico: git show 7b6b537:dist/assets/sky-cloud-veil.webp
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

NAMES = ['sky-cloud-veil', 'sky-cloud-volume']
ALPHA_STEP = 255 / 15  # 16 níveis originais
# 64 níveis finais: degrau de 4/255 (~2 tons sobre o céu), invisível numa nuvem
# suave, e compressão sem perda do alfa dentro do orçamento do shell.
OUTPUT_ALPHA_LEVELS = 64
QUALITY = 80


def quantize_alpha(image):
    data = np.asarray(image).copy()
    step = 255 / (OUTPUT_ALPHA_LEVELS - 1)
    data[..., 3] = np.round(np.round(data[..., 3] / step) * step).astype(np.uint8)
    return Image.fromarray(data, 'RGBA')


def blur(channel, radius):
    image = Image.fromarray(np.clip(channel, 0, 255).astype(np.uint8))
    return np.asarray(image.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float64)


def blur_float(channel, radius):
    # Desfoque em ponto flutuante: separa a parte inteira e a fração para não reintroduzir degraus de 8 bits.
    scale = 255 / max(channel.max(), 1e-9)
    return blur(channel * scale, radius) / scale


def refine(source):
    rgba = np.asarray(source.convert('RGBA'), dtype=np.float64)
    rgb, alpha = rgba[..., :3], rgba[..., 3]
    # 1. Alfa contínuo, sem sair de meio degrau do original.
    smooth = blur(alpha, 2.2)
    alpha_out = np.clip(smooth, alpha - ALPHA_STEP / 2, alpha + ALPHA_STEP / 2)
    alpha_out = np.clip(alpha_out, 0, 255)
    alpha_out[alpha == 0] = np.minimum(alpha_out[alpha == 0], ALPHA_STEP / 2)
    # 2. RGB sem blocos, em cor pré-multiplicada pelo alfa original.
    weight = alpha / 255
    premultiplied = [blur_float(rgb[..., c] * weight, 0.8) for c in range(3)]
    coverage = blur_float(weight, 0.8)
    safe = np.where(coverage > 1e-4, coverage, 1)
    rgb_out = np.stack([np.where(coverage > 1e-4, p / safe, rgb[..., c]) for c, p in enumerate(premultiplied)], axis=-1)
    out = np.dstack([np.clip(rgb_out, 0, 255), alpha_out])
    return Image.fromarray(np.round(out).astype(np.uint8), 'RGBA')


def main(source_dir, target_dir):
    os.makedirs(target_dir, exist_ok=True)
    for name in NAMES:
        refined = quantize_alpha(refine(Image.open(os.path.join(source_dir, name + '.webp'))))
        path = os.path.join(target_dir, name + '.webp')
        refined.save(path, 'WEBP', quality=QUALITY, method=6, alpha_quality=100)
        check = Image.open(path)
        levels = len(np.unique(np.asarray(check.getchannel('A'))))
        print(f'{name}: {check.size[0]}x{check.size[1]}, {os.path.getsize(path) / 1024:.1f} KiB, {levels} níveis de alfa')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])

#!/usr/bin/env python3
"""Gotas de chuva num vidro para a intro (novembro/2026, pedido do dono: intro nova, "sem graça" a anterior).

Arte original gerada por código (a tentativa no OpenArt saiu com marca d'água no plano grátis). A imagem tem
transparência: só as gotas aparecem por cima do céu real da intro, de dia e de noite. O centro (onde ficam a
logo e o nome) fica quase vazio. Semente fixa: rodar de novo dá o mesmo arquivo.

Uso: python3 scripts/generate-intro-glass.py  (grava dist/assets/intro-glass.webp)
"""
from pathlib import Path

import numpy as np
from PIL import Image

W, H = 900, 1600          # 9:16; o navegador amplia para a tela (cover)
SS = 2                    # supersample para borda lisa
OUT = Path(__file__).resolve().parent.parent / "dist" / "assets" / "intro-glass.webp"
BUDGET = 150 * 1024
rng = np.random.default_rng(20261109)

w, h = W * SS, H * SS
C = np.zeros((h, w, 3), np.float32)   # cor pré-multiplicada
A = np.zeros((h, w), np.float32)


def over(y0, y1, x0, x1, color, alpha):
    """Compõe uma camada (cor + alfa) por cima do que já existe, só na caixa da gota."""
    a = np.clip(alpha, 0, 1)[..., None]
    C[y0:y1, x0:x1] = np.asarray(color, np.float32) * a + C[y0:y1, x0:x1] * (1 - a)
    A[y0:y1, x0:x1] = a[..., 0] + A[y0:y1, x0:x1] * (1 - a[..., 0])


def smooth(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)


def drop(cx, cy, r, stretch=1.0):
    """Gota como lente: borda escura em cima, crescente clara embaixo (refração do céu) e brilho no alto."""
    cx, cy, r = cx * SS, cy * SS, r * SS
    pad = int(r * stretch * 1.4) + 3
    x0, x1 = max(int(cx - pad), 0), min(int(cx + pad), w)
    y0, y1 = max(int(cy - pad), 0), min(int(cy + pad), h)
    if x0 >= x1 or y0 >= y1:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    dx, dy = (xx - cx) / r, (yy - cy) / (r * stretch)
    d = np.sqrt(dx * dx + dy * dy)
    inside = 1 - smooth(0.96, 1.0, d)                      # borda com antisserrilhado
    over(y0, y1, x0, x1, (0.80, 0.90, 1.0), inside * (0.07 + 0.26 * d ** 4))
    top = np.clip(-dy, 0, 1)                                # metade de cima
    rim = smooth(0.72, 0.95, d) * inside
    over(y0, y1, x0, x1, (0.03, 0.08, 0.16), rim * (0.18 + 0.40 * top))
    bottom = smooth(0.15, 0.85, dy) * smooth(0.45, 0.88, d) * inside
    over(y0, y1, x0, x1, (1.0, 1.0, 1.0), bottom * 0.50)
    hx, hy = (xx - (cx - 0.34 * r)) / (0.24 * r), (yy - (cy - 0.40 * r * stretch)) / (0.17 * r)
    spec = np.clip(1 - np.sqrt(hx * hx + hy * hy), 0, 1) ** 1.6
    over(y0, y1, x0, x1, (1.0, 1.0, 1.0), spec * 0.92 * inside)


def trail(cx, top_y, bottom_y, r):
    """Rastro de uma gota que escorreu: faixa úmida fina e contas pequenas pelo caminho."""
    x = cx
    for y in np.arange(top_y, bottom_y, 3):
        x += rng.normal(0, 0.35)
        x0, x1 = int((x - r * 0.28) * SS), int((x + r * 0.28) * SS) + 1
        y0, y1 = int(y * SS), int((y + 3) * SS)
        if 0 <= x0 < x1 <= w and 0 <= y0 < y1 <= h:
            fade = (y - top_y) / max(bottom_y - top_y, 1)
            over(y0, y1, x0, x1, (0.85, 0.93, 1.0), np.full((y1 - y0, x1 - x0), 0.05 + 0.08 * fade, np.float32))
        if rng.random() < 0.06:
            drop(x + rng.normal(0, 1), y, rng.uniform(1.2, r * 0.32))
    return x


def keep_out(x, y):
    """Centro livre: a logo e o nome ficam ali."""
    return 0.12 * W < x < 0.88 * W and 0.33 * H < y < 0.64 * H


def density(x, y):
    edge = max(1 - x / (0.22 * W), 1 - (W - x) / (0.22 * W), 0)
    return 0.25 + 0.75 * max(edge, y / H * 0.9, 1 - y / (0.25 * H))


placed = []


def free(x, y, r):
    return all((x - px) ** 2 + (y - py) ** 2 > (r + pr + 2) ** 2 for px, py, pr in placed)


def scatter(count, rmin, rmax, tries=40):
    done = 0
    for _ in range(count * tries):
        if done >= count:
            break
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        r = rng.uniform(rmin, rmax)
        if keep_out(x, y) or rng.random() > density(x, y) or not free(x, y, r):
            continue
        placed.append((x, y, r))
        done += 1


# Escorridos primeiro (ficam por baixo), depois gotas grandes, médias e contas.
for _ in range(7):
    x = rng.choice([rng.uniform(0.03, 0.2), rng.uniform(0.8, 0.97), rng.uniform(0.25, 0.75)]) * W
    y_end = rng.uniform(0.66, 0.97) * H if 0.12 * W < x < 0.88 * W else rng.uniform(0.3, 0.95) * H
    r = rng.uniform(7, 13)
    x_end = trail(x, y_end - rng.uniform(140, 420), y_end, r)
    placed.append((x_end, y_end, r))
    drop(x_end, y_end, r, stretch=1.18)

scatter(26, 13, 24)
scatter(150, 5, 11)
scatter(650, 1.3, 4.2, tries=10)
for x, y, r in placed[7:]:
    drop(x, y, r, stretch=1.0 + (0.1 if r > 10 else 0.0))
# Poucas contas minúsculas no centro, para o vidro não parecer recortado.
for _ in range(36):
    x, y = rng.uniform(0.14, 0.86) * W, rng.uniform(0.35, 0.62) * H
    drop(x, y, rng.uniform(0.9, 2.2))

alpha = A
rgb = np.where(alpha[..., None] > 1e-4, C / np.maximum(alpha[..., None], 1e-4), 0)
img = np.dstack([np.clip(rgb, 0, 1), np.clip(alpha, 0, 1)])
image = Image.fromarray((img * 255).round().astype(np.uint8), "RGBA").resize((W, H), Image.LANCZOS)
OUT.parent.mkdir(parents=True, exist_ok=True)
image.save(OUT, "WEBP", quality=70, alpha_quality=65, method=6)
size = OUT.stat().st_size
print(f"{OUT.relative_to(OUT.parents[2])}: {W}x{H}, {size / 1024:.1f} KiB")
if size > BUDGET:
    raise SystemExit(f"acima do orçamento de {BUDGET // 1024} KiB")

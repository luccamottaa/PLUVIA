#!/usr/bin/env python3
"""Ícones de condição em traço (1.64.2, pedido do dono: "esse ícone tá bem mal feito").

Na 1.63 os traços foram escritos à mão e o sol/lua cruzavam o contorno da nuvem. Aqui tudo sai de geometria:
a nuvem é a união de três círculos com base reta (o mesmo princípio dos ícones coloridos), o contorno é feito
com arcos exatos e o sol, a lua e a nuvem de trás são recortados por essa nuvem com folga (GAP), então nada
cruza o contorno da frente. Precipitação centrada embaixo da nuvem. Grade de 24, traço pelo CSS (currentColor).

Uso: python3 scripts/generate-line-icons.py   (reescreve o bloco LINE_CONDITIONS em
dist/modules/weather-icon-system.js entre os marcadores "linha:inicio"/"linha:fim")
"""
import json
import math
from pathlib import Path

TARGET = Path(__file__).resolve().parent.parent / "dist" / "modules" / "weather-icon-system.js"
GAP = 1.5  # folga entre o contorno da nuvem da frente e o que fica atrás dela (traço de 1,6)


def f(v):
    return ("%.2f" % v).rstrip("0").rstrip(".").replace("-0", "0") if abs(v) > 1e-9 else "0"


class Cloud:
    """Três círculos (esquerdo, meio, direito) com base reta tangente aos de fora."""

    def __init__(self, cx, base, w, scale=1.0):
        s = scale
        r1, r2, r3 = 3.1 * s, 4.6 * s, 3.5 * s
        self.c = [(cx - 4.6 * s, base - r1, r1), (cx - .4 * s, base - 4.7 * s, r2), (cx + 4.2 * s, base - r3, r3)]
        self.base = base

    def inside(self, x, y, pad=0.0):
        for cx, cy, r in self.c:
            if (x - cx) ** 2 + (y - cy) ** 2 < (r + pad) ** 2:
                return True
        left, right = self.c[0][0], self.c[2][0]
        return left - pad < x < right + pad and self.base - 3 < y < self.base + pad

    @staticmethod
    def _meet(a, b):
        (x1, y1, r1), (x2, y2, r2) = a, b
        d = math.hypot(x2 - x1, y2 - y1)
        t = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
        h = math.sqrt(max(r1 * r1 - t * t, 0))
        mx, my = x1 + t * (x2 - x1) / d, y1 + t * (y2 - y1) / d
        p = (mx + h * (y2 - y1) / d, my - h * (x2 - x1) / d)
        q = (mx - h * (y2 - y1) / d, my + h * (x2 - x1) / d)
        return p if p[1] < q[1] else q  # a interseção de cima

    def path(self):
        c1, c2, c3 = self.c
        p12, p23 = self._meet(c1, c2), self._meet(c2, c3)

        def arc(c, a, b):
            ang = lambda p: math.atan2(p[1] - c[1], p[0] - c[0])
            d = (ang(b) - ang(a)) % (2 * math.pi)
            return f"A{f(c[2])} {f(c[2])} 0 {1 if d > math.pi else 0} 1 {f(b[0])} {f(b[1])}"

        start, end = (c1[0], self.base), (c3[0], self.base)
        return f"M{f(start[0])} {f(start[1])}{arc(c1, start, p12)}{arc(c2, p12, p23)}{arc(c3, p23, end)}Z"


def clip(points, masks, closed=False):
    """Polilinha (lista de pontos) recortada: só os trechos fora de todas as máscaras viram 'M…L…'."""
    runs, run = [], []
    for x, y in points:
        if any(m(x, y) for m in masks):
            if len(run) > 1:
                runs.append(run)
            run = []
        else:
            run.append((x, y))
    if len(run) > 1:
        runs.append(run)
    if closed and len(runs) > 1 and runs[0][0] == points[0] and runs[-1][-1] == points[-1]:
        runs[0] = runs.pop() + runs[0]
    return "".join("M" + "L".join(f"{f(x)} {f(y)}" for x, y in r) for r in runs)


def circle_pts(cx, cy, r, step=4):
    return [(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))) for a in range(0, 361, step)]


def sun(cx, cy, r, cloud=None, rays=True, ray_in=1.9, ray_len=1.7):
    masks = [lambda x, y: cloud.inside(x, y, GAP)] if cloud else []
    body = clip(circle_pts(cx, cy, r), masks, closed=True)
    out = f'<path class="wl-sun" d="{body}"/>' if body else ""
    if rays:
        segs = []
        for k in range(8):
            a = math.radians(k * 45)
            p0 = (cx + (r + ray_in) * math.cos(a), cy + (r + ray_in) * math.sin(a))
            p1 = (cx + (r + ray_in + ray_len) * math.cos(a), cy + (r + ray_in + ray_len) * math.sin(a))
            if cloud and (cloud.inside(*p0, GAP) or cloud.inside(*p1, GAP)):
                continue
            segs.append(f"M{f(p0[0])} {f(p0[1])}L{f(p1[0])} {f(p1[1])}")
        if segs:
            out += f'<path class="wl-sun" d="{"".join(segs)}"/>'
    return out


def moon(cx, cy, r, cloud=None):
    """Lua crescente: disco menos um disco deslocado para cima e à direita, contorno amostrado e recortado."""
    ox, oy, orr = cx + r * .55, cy - r * .45, r * .9
    pts = []
    for a in range(0, 361, 3):
        x, y = cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))
        if (x - ox) ** 2 + (y - oy) ** 2 >= orr * orr:
            pts.append((x, y))
    # arco interno (do disco que recorta), dentro do disco da lua
    inner = []
    for a in range(0, 361, 3):
        x, y = ox + orr * math.cos(math.radians(a)), oy + orr * math.sin(math.radians(a))
        if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
            inner.append((x, y))
    # ordena: contorno externo do começo ao fim e volta pelo interno (forma fechada)
    def order(points, center):
        return sorted(points, key=lambda p: math.atan2(p[1] - center[1], p[0] - center[0]) % (2 * math.pi))
    outer = order(pts, (cx, cy))
    # gira para começar logo depois da abertura (maior salto angular)
    angs = [math.atan2(p[1] - cy, p[0] - cx) % (2 * math.pi) for p in outer]
    gaps = [((angs[(i + 1) % len(angs)] - angs[i]) % (2 * math.pi), i) for i in range(len(angs))]
    cut = max(gaps)[1] + 1
    outer = outer[cut:] + outer[:cut]
    inner = order(inner, (ox, oy))
    ia = [math.atan2(p[1] - oy, p[0] - ox) % (2 * math.pi) for p in inner]
    igaps = [((ia[(i + 1) % len(ia)] - ia[i]) % (2 * math.pi), i) for i in range(len(ia))]
    icut = max(igaps)[1] + 1
    inner = inner[icut:] + inner[:icut]
    # liga o fim do externo ao começo do interno mais perto
    if math.dist(outer[-1], inner[0]) > math.dist(outer[-1], inner[-1]):
        inner = inner[::-1]
    shape = outer + inner + [outer[0]]
    masks = [lambda x, y: cloud.inside(x, y, GAP)] if cloud else []
    d = clip(shape, masks, closed=True)
    return f'<path class="wl-moon" d="{d}"/>' if d else ""


def back_cloud(front, back):
    """Nuvem de trás: contorno amostrado da união dela, recortado pela da frente."""
    pts = []
    c1, c2, c3 = back.c
    for cx, cy, r in back.c:
        for x, y in circle_pts(cx, cy, r, 3):
            if y <= back.base + 1e-6 and not any((x - ox) ** 2 + (y - oy) ** 2 < (orr - 1e-3) ** 2 for ox, oy, orr in back.c if (ox, oy) != (cx, cy)):
                pts.append((x, y))
    pts = [p for p in pts if p[1] < back.base - .05]
    steps = 24
    pts += [(c1[0] + (c3[0] - c1[0]) * i / steps, back.base) for i in range(steps + 1)]
    center = (c2[0], back.base - 3)
    pts.sort(key=lambda p: math.atan2(p[1] - center[1], p[0] - center[0]))
    pts.append(pts[0])
    return f'<path d="{clip(pts, [lambda x, y: front.inside(x, y, GAP)], closed=True)}"/>'


def strokes(xs, y0, y1, slant=.9, cls="wl-rain"):
    d = "".join(f"M{f(x)} {f(y0)}L{f(x - slant)} {f(y1)}" for x in xs)
    return f'<path class="{cls}" d="{d}"/>'


def dots(points, cls="wl-dot"):
    d = "".join(f"M{f(x)} {f(y)}h.01" for x, y in points)
    return f'<path class="{cls}" d="{d}"/>'


def build():
    big = Cloud(12.2, 18.6, 1)          # nuvem sozinha (nublado)
    high = Cloud(12.2, 15.2, 1)         # nuvem levantada para precipitação embaixo
    peek = Cloud(13.6, 19.2, 1, .92)    # nuvem com sol/lua atrás, em cima à esquerda
    peek_high = Cloud(13.6, 15.6, 1, .92)
    small = Cloud(15.2, 20, 1, .62)     # poucas nuvens: nuvem pequena embaixo à direita
    cloud = lambda c: f'<path d="{c.path()}"/>'
    xs = [8.8, 12.2, 15.6]
    g = {}
    g["clear-day"] = sun(12, 12, 4.2)
    g["clear-night"] = moon(12, 12, 7)
    g["few-clouds-day"] = sun(10.2, 9.8, 4, small) + cloud(small)
    g["few-clouds-night"] = moon(10.4, 10, 6, small) + cloud(small)
    g["partly-cloudy-day"] = sun(9, 8.6, 3.3, peek, ray_in=1.6, ray_len=1.5) + cloud(peek)
    g["partly-cloudy-night"] = moon(9.4, 8.6, 5, peek) + cloud(peek)
    front = Cloud(11, 19, 1, .94)
    g["overcast"] = back_cloud(front, Cloud(16.2, 13.2, 1, .74)) + cloud(front)
    g["fog"] = cloud(Cloud(12.2, 14.4, 1)) + '<path d="M4.5 17.6h15M7 20.6h10"/>'
    g["drizzle"] = cloud(high) + dots([(9.4, 18.6), (12.6, 18.6), (15.8, 18.6), (11, 21.4), (14.2, 21.4)], "wl-rain wl-dot")
    g["light-rain"] = cloud(high) + strokes([10.6, 14.4], 18.2, 21)
    g["moderate-rain"] = cloud(high) + strokes(xs, 18.2, 21.4)
    g["heavy-rain"] = cloud(high) + strokes([7.8, 11, 14.2, 17.4], 18, 22.2, 1.4, "wl-rain wl-heavy")
    g["showers"] = sun(9, 8.4, 3.1, peek_high, ray_in=1.5, ray_len=1.4) + cloud(peek_high) + strokes([11.2, 15], 18.6, 21.4)
    g["showers-night"] = moon(9.4, 8.2, 4.6, peek_high) + cloud(peek_high) + strokes([11.2, 15], 18.6, 21.4)
    g["sleet"] = cloud(high) + strokes([9.6, 15.2], 18.2, 21) + dots([(12.4, 19.8)])
    g["snow"] = cloud(high) + dots([(8.8, 18.8), (12.2, 18.8), (15.6, 18.8), (10.5, 21.6), (13.9, 21.6)])
    g["thunderstorm"] = cloud(high) + '<path class="wl-bolt" d="M13 16.4 10.6 19.6h3l-2.2 3.2"/>'
    g["thunderstorm-hail"] = cloud(high) + '<path class="wl-bolt" d="M12 16.4 9.6 19.6h3l-2.2 3.2"/>' + dots([(15.6, 18.8), (16.6, 21.6)])
    g["weather-unknown"] = cloud(big)
    return g


def main():
    glyphs = build()
    source = TARGET.read_text()
    start = source.index("  // linha:inicio")
    end = source.index("  // linha:fim", start)
    body = ",\n".join(f"    {json.dumps(name)}: {repr_js(markup)}" for name, markup in glyphs.items())
    block = "  // linha:inicio (gerado por scripts/generate-line-icons.py; não editar à mão)\n  const LINE_CONDITIONS = Object.freeze({\n" + body + ",\n  });\n"
    TARGET.write_text(source[:start] + block + source[end:])
    print(f"{len(glyphs)} ícones em traço gravados em {TARGET.relative_to(TARGET.parents[2])}")


def repr_js(markup):
    assert "'" not in markup
    return "'" + markup + "'"


if __name__ == "__main__":
    main()

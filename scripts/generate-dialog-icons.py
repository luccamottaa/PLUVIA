#!/usr/bin/env python3
"""Ícones das janelas (1.65, pedido do dono: "repaginada total… bota ícones").

Desenhos próprios em traço, grade de 24, viram variáveis CSS com SVG em data URI:
  --i-<nome>   traço branco, para o quadradinho colorido das linhas (estilo Ajustes do iPhone);
  --ii-<nome>  traço cinza-azulado, dentro dos campos de texto (e-mail, senha, nome).
As leituras dos detalhes usam --i-<nome> como máscara (a cor vem do CSS).

Uso: python3 scripts/generate-dialog-icons.py  (reescreve o bloco entre "janelas-icones:inicio" e
"janelas-icones:fim" no fim de dist/continuous.css)
"""
from pathlib import Path
from urllib.parse import quote

TARGET = Path(__file__).resolve().parent.parent / "dist" / "continuous.css"
START, END = "/* janelas-icones:inicio", "/* janelas-icones:fim */"

THERMO = "M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0Z M12 9v6"
ICONS = {
    # linhas da conta
    "bell": "M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15Z M10 20.5a2.2 2.2 0 0 0 4 0",
    "bell-off": "M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15Z M10 20.5a2.2 2.2 0 0 0 4 0 M4 3.5l16 17",
    "sunrise": "M3 18h18 M7 18a5 5 0 0 1 10 0 M12 4v5 M9.5 6.5 12 4l2.5 2.5 M4.5 12l1.6 1 M19.5 12l-1.6 1",
    "sunset": "M3 18h18 M7 18a5 5 0 0 1 10 0 M12 9V4 M9.5 6.5 12 9l2.5-2.5 M4.5 12l1.6 1 M19.5 12l-1.6 1",
    "moon": "M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z",
    "pin": "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z M12 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z",
    "pin-plus": "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z M12 7v6 M9 10h6",
    "phone": "M8 2.5h8a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2Z M11 18.5h2",
    "text": "M3 19l4.5-12L12 19 M4.6 15h5.8 M14.5 12.2c.6-.9 1.6-1.3 2.7-1.3 1.7 0 2.8 1 2.8 2.6V19 M20 15.6c-.9-.4-1.8-.5-2.8-.5-1.6 0-2.7.8-2.7 2 0 1.1.9 1.9 2.2 1.9 1.4 0 2.6-.8 3.3-2",
    "grid": "M4 4h7v7H4Z M13 4h7v4h-7Z M13 10h7v10h-7Z M4 13h7v7H4Z",
    "sparkles": "M11 3l1.6 4.4L17 9l-4.4 1.6L11 15l-1.6-4.4L5 9l4.4-1.6Z M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8Z",
    "data": "M12 5c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3Z M4 8v8c0 1.7 3.6 3 8 3s8-1.3 8-3V8 M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
    "shield": "M12 3l7 3v5.5c0 4.5-3 7.8-7 9.5-4-1.7-7-5-7-9.5V6Z M9 12l2 2 4-4",
    "lock": "M6.5 11h11a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-7A1.5 1.5 0 0 1 6.5 11Z M8 11V8a4 4 0 0 1 8 0v3",
    "doc": "M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M14 3v5h5 M9 13h6 M9 17h6",
    "logout": "M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4 M15 8l4 4-4 4 M19 12H9",
    "trash": "M4 7h16 M9 7V5h6v2 M6.5 7l1 13h9l1-13 M10 11v6 M14 11v6",
    "globe": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M3 12h18 M12 3c2.5 2.6 3.6 5.7 3.6 9s-1.1 6.4-3.6 9c-2.5-2.6-3.6-5.7-3.6-9S9.5 5.6 12 3Z",
    "mail": "M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z M3.5 7l8.5 6 8.5-6",
    "user": "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4.5 20c1-3.6 4-5.5 7.5-5.5s6.5 1.9 7.5 5.5",
    "search": "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z M15.5 15.5 20 20",
    # leituras
    "thermo": THERMO,
    "thermo-up": THERMO + " M18 11V3.5 M15.5 6 18 3.5 20.5 6",
    "thermo-down": THERMO + " M18 3.5V11 M15.5 8.5 18 11l2.5-2.5",
    "umbrella": "M3 12.5a9 9 0 0 1 18 0Z M12 12.5v6a2 2 0 0 1-4 0 M12 3.5v-1",
    "drop": "M12 3s-6 6.4-6 10.8a6 6 0 0 0 12 0C18 9.4 12 3 12 3Z",
    "wind": "M3 8h10a2.5 2.5 0 1 0-2.4-3.2 M3 12h15a2.5 2.5 0 1 1-2.4 3.2 M3 16h7",
    "compass": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M15.5 8.5l-2 5-5 2 2-5Z",
    "sun": "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M12 2.5v2 M12 19.5v2 M2.5 12h2 M19.5 12h2 M5.3 5.3l1.4 1.4 M17.3 17.3l1.4 1.4 M5.3 18.7l1.4-1.4 M17.3 6.7l1.4-1.4",
    "gauge": "M4.2 18.5a9 9 0 1 1 15.6 0 M12 14l3.8-4.3 M12 14h.01",
    "clock": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M12 7v5l3 2",
    "radar": "M12 3a9 9 0 1 0 9 9 M12 7a5 5 0 1 0 5 5 M12 12l6.5-6.5",
    "chart": "M4 20V4 M4 20h16 M8 16l3.5-4 3 2.5L20 8",
}
INPUT_ICONS = ("mail", "lock", "user")


def uri(path, color):
    svg = (f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='{color}' "
           f"stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='{path}'/></svg>")
    return 'url("data:image/svg+xml,' + quote(svg, safe=" ='/:,.-") + '")'


def block():
    lines = [START + " (gerado por scripts/generate-dialog-icons.py; não editar à mão) */", ":root {"]
    lines += [f"  --i-{name}:{uri(path, 'white')};" for name, path in ICONS.items()]
    lines += [f"  --ii-{name}:{uri(ICONS[name], '#8b9bb3')};" for name in INPUT_ICONS]
    lines += ["}", END]
    return "\n".join(lines)


def main():
    css = TARGET.read_text()
    text = block()
    if START in css:
        a = css.index(START)
        b = css.index(END, a) + len(END)
        css = css[:a] + text + css[b:]
    else:
        css = css.rstrip("\n") + "\n\n" + text + "\n"
    TARGET.write_text(css)
    print(f"{len(ICONS)} ícones (+{len(INPUT_ICONS)} de campo) em {TARGET.relative_to(TARGET.parents[1])}")


if __name__ == "__main__":
    main()

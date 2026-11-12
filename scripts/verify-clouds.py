"""Céu antigo removido na 1.71 (o céu de desenho, modules/sky-toon.js, é o único).

Este script testava as camadas do céu antigo (texturas de nuvem, nuvem 3D, estrelas, chuva em SVG, raio), que
saíram do app. Ele fica só porque o passo "python scripts/verify-clouds.py" ainda está em
.github/workflows/visual.yml e o token usado para enviar o PR não tem permissão para mudar workflows. Quando o
passo sair do workflow, apague este arquivo.
"""
print('{"skipped": "céu antigo removido na 1.71; remova este passo de .github/workflows/visual.yml"}')
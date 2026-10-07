# Atalhos do PWA

- No app instalado, segurar o ícone (Android/Chrome, Edge e desktop) mostra três atalhos do `manifest.webmanifest`:
  - **Trocar cidade** → `/?abrir=cidades`
  - **Comparar cidades** → `/?abrir=comparar`
  - **Radar de chuva** → `/?abrir=radar`
- `modules/pwa-shortcuts.js`:
  - Lê `abrir` e tira o parâmetro do endereço na hora (`replaceState`), mantendo os outros e o hash, para um reload não reabrir o diálogo.
  - Age uma vez, depois que a intro some e a primeira previsão chega (`pluvia:weather-updated`; a intro é observada por atributo, sem polling).
  - Sem previsão em 15 s (offline/falha), abre mesmo assim; cada diálogo já trata a falta de dados.
  - Ação desconhecida só é removida da URL.
- Os ícones de 96 px vêm de `scripts/generate-shortcut-icons.py`: círculo azul da marca com glifo branco (lupa, balança, radar).
- **Limites:**
  - Safari/iOS não implementa `shortcuts` no manifest.
  - Widget de tela inicial não existe para PWA em Android nem iOS.
  - O launcher guarda os atalhos na instalação: quem já instalou pode precisar reinstalar para vê-los.
- **Testes:** `tests/pwa-shortcuts.test.cjs` (manifest, ícones 96×96, parse, espera/execução única) e a parte final de `scripts/verify-compare.py` (navegador).

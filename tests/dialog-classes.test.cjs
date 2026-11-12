const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Janelas por classe (1.69.2): listas :is(#cityDialog, #accountDialog, …) no CSS faziam cada elemento da página
// subir pelos ancestrais procurando um daqueles ids (o filtro rápido do navegador não funciona com :is() de
// vários ids). Cada grupo de janelas virou uma classe dlg-<grupo> no index.html, usada como :is(.dlg-<grupo>, #_):
// o #_ não casa com nada e só mantém o peso de id que a lista antiga dava, então a cascata não muda.
const ALL = ['accountDialog', 'alertDetail', 'brazilDialog', 'changelogDialog', 'cityDialog', 'dailyDetailDialog', 'homeLayoutDialog', 'hourlyDetailDialog', 'installDialog', 'installPushDialog', 'monthDialog', 'radarDialog', 'sourcesDialog', 'termsDialog', 'whatsNewDialog'];
const without = (...out) => ALL.filter(id => !out.includes(id));
const GROUPS = {
  'todas': ALL,
  'g14': without('installDialog', 'termsDialog'),
  'g13': without('installDialog', 'termsDialog', 'radarDialog'),
  'folha': without('installDialog', 'installPushDialog', 'radarDialog', 'termsDialog'),
  'conta-fontes': ['accountDialog', 'sourcesDialog'],
  'novidades': ['changelogDialog', 'whatsNewDialog'],
  'cidade-conta-fontes': ['accountDialog', 'cityDialog', 'sourcesDialog'],
  'detalhe': ['dailyDetailDialog', 'hourlyDetailDialog'],
  'cidade-conta': ['accountDialog', 'cityDialog'],
  'conta-termos': ['accountDialog', 'termsDialog'],
  'listas': ['accountDialog', 'brazilDialog', 'cityDialog', 'monthDialog', 'sourcesDialog'],
  'texto': ['changelogDialog', 'installDialog', 'radarDialog', 'termsDialog', 'whatsNewDialog'],
  'misto': ['accountDialog', 'alertDetail', 'cityDialog', 'hourlyDetailDialog', 'sourcesDialog'],
  'conta-home': ['accountDialog', 'homeLayoutDialog']
};
const dist = file => fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8');
const css = ['continuous.css', 'redesign.css', 'styles.css', 'sky.css'].map(dist).join('\n');
const html = dist('index.html');

test('o CSS não volta a usar listas de ids de janelas dentro de :is()', () => {
  const lists = css.match(/:is\(\s*#[A-Za-z]+(?:Dialog|Detail)\s*,[^)]*\)/g) || [];
  assert.deepEqual(lists, [], 'use :is(.dlg-<grupo>, #_) em vez de :is(#xDialog, #yDialog)');
});

test('cada grupo usado no CSS está exatamente nas janelas do grupo', () => {
  const used = new Set([...css.matchAll(/:is\(\.dlg-([a-z0-9-]+), #_\)/g)].map(m => m[1]));
  assert.ok(used.size > 0);
  for (const name of used) assert.ok(GROUPS[name], `grupo desconhecido no CSS: dlg-${name}`);
  for (const id of ALL) {
    const match = html.match(new RegExp(`<dialog id="${id}" class="([^"]*)"`));
    assert.ok(match, `janela ${id} no index.html`);
    const have = match[1].split(/\s+/).filter(c => c.startsWith('dlg-')).map(c => c.slice(4)).sort();
    const want = Object.entries(GROUPS).filter(([, ids]) => ids.includes(id)).map(([name]) => name).sort();
    assert.deepEqual(have, want, id);
  }
});

test('o id fictício #_ não existe na página (senão a regra casaria com ele)', () => {
  assert.doesNotMatch(html, /\sid="_"/);
});
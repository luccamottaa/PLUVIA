// Seletores filtráveis (1.74.1): o recálculo de estilo da página inteira caiu de ~30 para ~24 ms (Chromium, CPU 4×).
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const t = require('../scripts/css-bucket.cjs');

test('troca só o que é equivalente: mesma especificidade, mesmos elementos', () => {
  assert.equal(t.transformSelectorList('#w :is(.a,.b)'), '#w .a, #w .b');
  assert.equal(t.transformSelectorList('.x :is(a,button):focus-visible'), '.x a:focus-visible, .x button:focus-visible');
  assert.equal(t.transformSelectorList('x :is(.a,.b)::before'), 'x .a::before, x .b::before');
  assert.equal(t.transformSelectorList('html body :is(.dlg-folha, #_)::before'), 'html body :where(.dlg-folha):is(.dlg-folha, #_)::before');
  // Especificidades diferentes, combinadores, vendor e listas aninhadas ficam como estão.
  for (const keep of ['x :is(a, .b)', 'x :is(.a .b, .c)', 'x :is(.a:-webkit-autofill, .b:hover)', 'x :is(.a,.b):is(:hover,:active)', 'x :is(:not(.a), .b)', 'x :is(.a,.b) y'])
    assert.equal(t.transformSelectorList(keep), null, keep);
});

test('nenhuma folha publicada tem regra que ainda poderia ser filtrada', () => {
  execFileSync(process.execPath, ['scripts/css-bucket.cjs', '--check', 'dist/sky.css', 'dist/styles.css', 'dist/redesign.css', 'dist/continuous.css', 'dist/dialogs.css'], {stdio:'pipe'});
});

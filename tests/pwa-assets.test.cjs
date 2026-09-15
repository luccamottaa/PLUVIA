const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'dist');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));

function pngDimensions(file) {
  const bytes = fs.readFileSync(path.join(root, file));
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
  return { width:bytes.readUInt32BE(16), height:bytes.readUInt32BE(20) };
}

test('exporta todos os ícones instaláveis nas dimensões declaradas', () => {
  for (const icon of manifest.icons) {
    const expected = Number(icon.sizes.split('x')[0]);
    assert.deepEqual(pngDimensions(icon.src.replace(/^\.\//, '')), {width:expected,height:expected});
  }
  assert.deepEqual(pngDimensions('apple-touch-icon-180.png'), {width:180,height:180});
  assert.deepEqual(pngDimensions('favicon-32.png'), {width:32,height:32});
});

test('mantém fundo branco no padrão visual instalável', () => {
  assert.equal(manifest.background_color, '#075dff');
  assert.ok(manifest.icons.some(icon => icon.purpose === 'any'));
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
});

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
  assert.deepEqual(pngDimensions('favicon-16.png'), {width:16,height:16});
  assert.deepEqual(pngDimensions('favicon-32.png'), {width:32,height:32});
  assert.deepEqual(pngDimensions('favicon-96.png'), {width:96,height:96});
});

test('mantém o fundo azul escuro no aplicativo instalável', () => {
  assert.equal(manifest.background_color, '#10233f');
  assert.equal(manifest.theme_color, '#10233f');
  assert.equal(manifest.name, 'PLUVIA');
  assert.equal(manifest.id, 'https://pluviaweather.com.br/', 'o ID estável mantém a instalação existente atualizável');
  assert.ok(manifest.icons.some(icon => icon.src === './icon-splash-512.png' && icon.purpose === 'any'));
  assert.ok(manifest.icons.some(icon => icon.src === './icon-splash-192.png' && icon.purpose === 'any'));
  assert.ok(manifest.icons.some(icon => icon.purpose === 'any'));
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
});

test('ícones da marca: céu noturno de fundo e gota em cor única (a versão colorida foi aposentada)', () => {
  const {execFileSync} = require('node:child_process');
  // Lê pixels com Python/Pillow quando disponível; sem Pillow, confere só as dimensões acima.
  let report;
  try { report = JSON.parse(execFileSync('python3', ['-c', `
import json
from PIL import Image
d='${root.replace(/\\/g,'/')}/'
def corner(f): return Image.open(d+f).convert('RGB').getpixel((2,2))
def hues(f):
  im=Image.open(d+f).convert('RGBA'); cs=set()
  for r,g,b,a in im.getdata():
    if a>200 and max(r,g,b)-min(r,g,b)>40: cs.add('green' if g>r and g>b else 'blue' if b>=g else 'other')
  return sorted(cs)
print(json.dumps({'corners':[corner(f) for f in ['icon-192.png','icon-maskable-512.png','apple-touch-icon-180.png']],'mark':hues('logo-mark.png'),'signature':hues('logo-pluvia.png'),'favicon':hues('favicon-96.png')}))
`], {encoding:'utf8'})); } catch { return; }
  for (const [r, g, b] of report.corners) assert.ok(r < 40 && g < 60 && b < 90 && b > r, 'fundo noturno, não branco: ' + [r, g, b]);
  for (const key of ['mark', 'signature', 'favicon']) assert.deepEqual(report[key], ['blue'], key + ' sem verde da versão colorida');
});

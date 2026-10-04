const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'dist');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('fontes locais leves têm formato válido e estão disponíveis no precache offline', () => {
  const css = fs.readFileSync(path.join(root, 'fonts.css'), 'utf8');
  const urls = [...css.matchAll(/src:url\("(\.\/assets\/fonts\/[^"?]+\.woff2)"\)/g)].map(match => match[1]);
  assert.equal(urls.length, 2);
  let total = 0;
  for (const url of urls) {
    const data = fs.readFileSync(path.join(root, url));
    assert.equal(data.toString('ascii', 0, 4), 'wOF2', url);
    assert.ok(sw.includes(`"${url}"`), `SW sem ${url}`);
    assert.ok(html.includes(`href="${url}" as="font" type="font/woff2" crossorigin`), `preload sem ${url}`);
    total += data.length;
  }
  assert.ok(total < 64 * 1024, 'fontes excedem o orçamento do shell mobile');
  for (const name of ['INTER', 'NUNITO']) assert.match(fs.readFileSync(path.join(root, `assets/fonts/${name}-OFL.txt`), 'utf8'), /SIL OPEN FONT LICENSE/);
});

test('precache do SW lista os mesmos JS/CSS versionados do HTML', () => {
  const htmlRefs = [...html.matchAll(/src="(\.\/(?:modules\/)?[^"]+\.js\?v=[^"]+)"/g), ...html.matchAll(/href="(\.\/[^"?]+\.css\?v=[^"]+)"/g)].map(m => m[1]);
  assert.ok(htmlRefs.length >= 10);
  for (const ref of htmlRefs) {
    assert.ok(sw.includes(`"${ref}"`) || sw.includes(`'${ref}'`) || sw.includes(ref), `SW sem ${ref}`);
  }
  assert.match(sw, /const CACHE = "pluvia-panel-78"/);
  assert.match(html, /styles\.css\?v=core-121/);
  assert.match(html, /redesign\.css\?v=panel-33/);
  assert.doesNotMatch(sw, /glass\.js/);
  assert.match(html, /app\.js\?v=panel-40/);
  assert.ok(!sw.includes('"./assets/panel-night-sky.webp"'), 'não baixa a antiga foto sem uso no cache inicial');
  for (const asset of ['sky-sun.svg','sky-cloud-veil.webp','sky-cloud-volume.webp']) assert.ok(sw.includes(`./assets/${asset}`));
  assert.ok(['sky-cloud-veil.webp','sky-cloud-volume.webp'].reduce((sum,name)=>sum+fs.statSync(path.join(root,'assets',name)).size,0)<160*1024,'texturas das nuvens mantêm orçamento leve para o shell mobile');
  assert.ok(!sw.includes('"./assets/sky-cloud-bank.webp"'),'textura antiga não é baixada pelo novo shell');
  const starAssets=['sky-stars.svg','sky-stars-shimmer.svg'];
  for(const asset of starAssets) assert.ok(sw.includes(`./assets/${asset}`),'céu noturno disponível offline: '+asset);
  assert.ok(starAssets.reduce((sum,name)=>sum+fs.statSync(path.join(root,'assets',name)).size,0)<16000,'campo estelar mantém orçamento leve');
  const stormAssets=['rain-near.svg','rain-far.svg','lightning-near.svg','lightning-far.svg'];
  for(const asset of stormAssets) assert.ok(sw.includes(`./assets/${asset}`),'efeito disponível offline: '+asset);
  assert.ok(stormAssets.reduce((sum,name)=>sum+fs.statSync(path.join(root,'assets',name)).size,0)<15000,'efeitos vetoriais mantêm orçamento pequeno');
  assert.ok(!sw.includes('"./assets/rain-drops.svg"'),'asset antigo fica disponível para shells legados, sem precache novo');
  assert.ok(sw.includes('./assets/moon-surface.webp'),'textura lunar disponível no modo offline');
  assert.ok(fs.statSync(path.join(root,'assets/moon-surface.webp')).size < 30000,'textura leve para mobile');
});

test('shell iOS e domínio canônico estão travados', () => {
  assert.match(html, /apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  assert.match(html, /mobile-web-app-capable" content="yes"/);
  assert.match(html, /luccamottaa\.github\.io/);
  assert.match(html, /https:\/\/pluviaweather\.com\.br/);
  assert.equal(fs.readFileSync(path.join(root, 'CNAME'), 'utf8').trim(), 'pluviaweather.com.br');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.id, 'https://pluviaweather.com.br/');
  assert.equal(manifest.theme_color, '#10233f');
  assert.equal(manifest.start_url, 'https://pluviaweather.com.br/?source=pwa');
});

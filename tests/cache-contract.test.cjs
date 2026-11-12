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
  assert.deepEqual(urls, ['./assets/fonts/sora-latin-v1.woff2', './assets/fonts/nunito-wordmark-v32.woff2'], 'texto em Sora (1.43) e a marca em Nunito, ambas locais');
  let total = 0;
  for (const url of urls) {
    const data = fs.readFileSync(path.join(root, url));
    assert.equal(data.toString('ascii', 0, 4), 'wOF2', url);
    assert.ok(sw.includes(`"${url}"`), `SW sem ${url}`);
    assert.ok(html.includes(`href="${url}" as="font" type="font/woff2" crossorigin`), `preload sem ${url}`);
    total += data.length;
  }
  assert.ok(total < 64 * 1024, 'fontes excedem o orçamento do shell mobile');
  for (const name of ['INTER', 'NUNITO', 'SORA']) assert.match(fs.readFileSync(path.join(root, `assets/fonts/${name}-OFL.txt`), 'utf8'), /SIL OPEN FONT LICENSE/);
});

test('fonts.css vai inline no shell (sem folha bloqueante) com o mesmo texto do arquivo', () => {
  const css = fs.readFileSync(path.join(root, 'fonts.css'), 'utf8').trim();
  assert.ok(html.includes(css), 'o @font-face inline divergiu de fonts.css');
  assert.doesNotMatch(html, /<link rel="stylesheet" href="\.\/fonts\.css/);
  assert.match(html, /<link rel="preconnect" href="https:\/\/api\.open-meteo\.com" crossorigin \/>/);
  // 1.71: sem o céu antigo, a textura de nuvem (312 KB) não é mais pré-carregada na abertura (só as janelas usam).
  assert.doesNotMatch(html, /intro-glass/, 'as gotas da intro saíram na 1.63');
  assert.doesNotMatch(html, /<link rel="preload" href="\.\/assets\/sky-cloud-veil\.webp/);
});

test('precache do SW lista os mesmos JS/CSS versionados do HTML', () => {
  const htmlRefs = [...html.matchAll(/src="(\.\/(?:modules\/)?[^"]+\.js\?v=[^"]+)"/g), ...html.matchAll(/href="(\.\/[^"?]+\.css\?v=[^"]+)"/g)].map(m => m[1]);
  assert.ok(htmlRefs.length >= 10);
  for (const ref of htmlRefs) {
    assert.ok(sw.includes(`"${ref}"`) || sw.includes(`'${ref}'`) || sw.includes(ref), `SW sem ${ref}`);
  }
  assert.match(sw, /const CACHE = "pluvia-panel-360"/);
  // O analytics identifica o deploy por esta meta: precisa acompanhar a geração do SW.
  assert.equal(html.match(/<meta name="pluvia-release" content="([^"]+)" \/>/)?.[1], sw.match(/const CACHE = "([^"]+)"/)?.[1]);
  assert.match(html, /styles\.css\?v=core-138/);
  assert.match(html, /redesign\.css\?v=panel-53/);
  assert.doesNotMatch(sw, /glass\.js/);
  assert.match(html, /app\.js\?v=panel-164/);
  assert.ok(!sw.includes('"./assets/panel-night-sky.webp"'), 'não baixa a antiga foto sem uso no cache inicial');
  for (const asset of ['sky-sun.svg','sky-cloud-veil.webp','sky-stars.svg']) assert.ok(sw.includes(`./assets/${asset}`));
  assert.ok(['sky-cloud-veil.webp','sky-cloud-volume.webp'].reduce((sum,name)=>sum+fs.statSync(path.join(root,'assets',name)).size,0)<600*1024,'texturas das nuvens mantêm orçamento do shell mobile');
  assert.ok(!sw.includes('"./assets/sky-cloud-bank.webp"'),'textura antiga não é baixada pelo novo shell');
  // 1.71: o céu antigo saiu. Texturas de nuvem por condição, chuva, raio e brilho das estrelas não existem mais nem
  // entram no cache; ficam o véu (janelas), a nuvem volumétrica (entrada de generate-og-cities.py), o Sol do
  // Ciclo do dia e o campo de estrelas do fundo das janelas.
  for (const gone of ['sky-cloud-overcast.webp','sky-cloud-rain.webp','sky-cloud-storm.webp','sky-cloud-fog.webp','sky-cloud-stratus.webp','sky-cloud-bank.webp',
    'sky-stars-shimmer.svg','rain-near.svg','rain-far.svg','rain-near-wind.svg','rain-far-wind.svg','rain-drops.svg','lightning-bolt.svg']) {
    assert.ok(!fs.existsSync(path.join(root,'assets',gone)),`${gone} saiu com o céu antigo`);
    assert.ok(!sw.includes(gone),`${gone} fora do precache`);
  }
  assert.ok(!sw.includes('sky-cloud-volume.webp'),'a nuvem volumétrica só alimenta o gerador das prévias');
  assert.ok(fs.statSync(path.join(root,'assets','sky-stars.svg')).size<16000,'campo estelar das janelas mantém orçamento leve');  assert.ok(sw.includes('./assets/moon-surface.webp?v=moon-1'),'textura lunar disponível no modo offline');
  assert.ok(fs.statSync(path.join(root,'assets/moon-surface.webp')).size < 30000,'textura leve para mobile');
  // Cartão da Lua: textura de 512 px só para o disco grande; no precache para o cartão abrir offline.
  assert.ok(fs.statSync(path.join(root,'assets/moon-surface-hd.webp')).size < 90000,'textura HD dentro do orçamento');
  assert.ok(sw.includes('./assets/moon-surface-hd.webp?v=moon-hd-1'),'textura HD disponível offline');
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

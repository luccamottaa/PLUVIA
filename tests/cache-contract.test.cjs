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
  assert.deepEqual(urls, ['./assets/fonts/nunito-wordmark-v32.woff2'], 'só a marca tem fonte local; o texto usa a do sistema (SF Pro)');
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

test('fonts.css vai inline no shell (sem folha bloqueante) com o mesmo texto do arquivo', () => {
  const css = fs.readFileSync(path.join(root, 'fonts.css'), 'utf8').trim();
  assert.ok(html.includes(css), 'o @font-face inline divergiu de fonts.css');
  assert.doesNotMatch(html, /<link rel="stylesheet" href="\.\/fonts\.css/);
  assert.match(html, /<link rel="preconnect" href="https:\/\/api\.open-meteo\.com" crossorigin \/>/);
  assert.match(html, /<link rel="preload" href="\.\/assets\/sky-cloud-veil\.webp\?v=clouds-9" as="image" type="image\/webp" fetchpriority="high" \/>/);
});

test('precache do SW lista os mesmos JS/CSS versionados do HTML', () => {
  const htmlRefs = [...html.matchAll(/src="(\.\/(?:modules\/)?[^"]+\.js\?v=[^"]+)"/g), ...html.matchAll(/href="(\.\/[^"?]+\.css\?v=[^"]+)"/g)].map(m => m[1]);
  assert.ok(htmlRefs.length >= 10);
  for (const ref of htmlRefs) {
    assert.ok(sw.includes(`"${ref}"`) || sw.includes(`'${ref}'`) || sw.includes(ref), `SW sem ${ref}`);
  }
  assert.match(sw, /const CACHE = "pluvia-panel-275"/);
  // O analytics identifica o deploy por esta meta: precisa acompanhar a geração do SW.
  assert.equal(html.match(/<meta name="pluvia-release" content="([^"]+)" \/>/)?.[1], sw.match(/const CACHE = "([^"]+)"/)?.[1]);
  assert.match(html, /styles\.css\?v=core-134/);
  assert.match(html, /redesign\.css\?v=panel-51/);
  assert.doesNotMatch(sw, /glass\.js/);
  assert.match(html, /app\.js\?v=panel-140/);
  assert.ok(!sw.includes('"./assets/panel-night-sky.webp"'), 'não baixa a antiga foto sem uso no cache inicial');
  for (const asset of ['sky-sun.svg','sky-cloud-veil.webp','sky-cloud-volume.webp']) assert.ok(sw.includes(`./assets/${asset}`));
  assert.ok(['sky-cloud-veil.webp','sky-cloud-volume.webp'].reduce((sum,name)=>sum+fs.statSync(path.join(root,'assets',name)).size,0)<600*1024,'texturas das nuvens mantêm orçamento do shell mobile');
  assert.ok(!sw.includes('"./assets/sky-cloud-bank.webp"'),'textura antiga não é baixada pelo novo shell');
  // Nuvens por condição: baixadas (e guardadas pelo SW) só quando aquele céu aparece, fora do precache.
  const skyCss=fs.readFileSync(path.join(root,'sky.css'),'utf8');
  for (const name of ['overcast','rain','storm','fog','stratus']) {
    const asset=`sky-cloud-${name}.webp`;
    assert.ok(fs.existsSync(path.join(root,'assets',asset)),asset);
    // 1.29.3: 3984 × 1328, 1:1 no iPhone (a de 528 px de altura era esticada quase 4× e ficava borrada).
    // Continuam fora do precache e com teto de tamanho: só quem vê aquele céu baixa, uma vez.
    // 1.29.4: chuva e tempestade redesenhadas com borda mais definida (clouds-10).
    const version=['rain','storm'].includes(name)?'clouds-10':'clouds-9';
    assert.ok(skyCss.includes(`./assets/${asset}?v=${version}`),`${asset} usada pelo céu da condição`);
    assert.ok(!sw.includes(asset),`${asset} fica fora do precache`);
    assert.ok(fs.statSync(path.join(root,'assets',asset)).size<(name==='overcast'?700:600)*1024,`${asset} com tamanho controlado para baixar sob demanda`);
  }
  const starAssets=['sky-stars.svg','sky-stars-shimmer.svg'];
  for(const asset of starAssets) assert.ok(sw.includes(`./assets/${asset}`),'céu noturno disponível offline: '+asset);
  assert.ok(starAssets.reduce((sum,name)=>sum+fs.statSync(path.join(root,'assets',name)).size,0)<16000,'campo estelar mantém orçamento leve');
  const stormAssets=['rain-near.svg','rain-far.svg','rain-near-wind.svg','rain-far-wind.svg','lightning-bolt.svg'];
  for(const asset of stormAssets) assert.ok(sw.includes(`./assets/${asset}`),'efeito disponível offline: '+asset);
  assert.ok(stormAssets.reduce((sum,name)=>sum+fs.statSync(path.join(root,'assets',name)).size,0)<15000,'efeitos vetoriais mantêm orçamento pequeno');
  assert.ok(!sw.includes('"./assets/rain-drops.svg"'),'asset antigo fica disponível para shells legados, sem precache novo');
  assert.ok(sw.includes('./assets/moon-surface.webp?v=moon-1'),'textura lunar disponível no modo offline');
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

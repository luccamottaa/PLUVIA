'use strict';
// Gera as páginas públicas das capitais (/clima/<nome>-<uf>/), o bloco de links do rodapé
// e o sitemap a partir do index.html e de capitals.js. Rode depois de mudar o shell:
//   node scripts/generate-city-pages.cjs          (grava)
//   node scripts/generate-city-pages.cjs --check  (falha se algo estiver desatualizado)
// As páginas são o mesmo app com a cidade escolhida; o conteúdo próprio de cada uma é
// título, descrição, canonical, dados estruturados e uma nota factual (estado e fuso).
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const dist = path.resolve(__dirname, '../dist');
const SITE = 'https://pluviaweather.com.br';
const START = '<!-- capitais:inicio -->', END = '<!-- capitais:fim -->';

function capitalsApi() {
  const context = vm.createContext({Intl, localStorage:{getItem:() => null, setItem() {}}});
  vm.runInContext(fs.readFileSync(path.join(dist, 'capitals.js'), 'utf8'), context);
  return vm.runInContext('({CAPITALS, citySlug, cityPagePath, cityPageTitle})', context);
}
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const jsonLd = value => JSON.stringify(value).replace(/</g, '\\u003c');
function utcOffset(timezone) {
  const part = new Intl.DateTimeFormat('en-US', {timeZone:timezone, timeZoneName:'shortOffset'})
    .formatToParts(new Date(Date.UTC(2026, 0, 15))).find(item => item.type === 'timeZoneName').value;
  return part.replace('GMT', 'UTC').replace('-', '−');
}
const description = city => `Previsão do tempo em ${city.name} (${city.uf}) agora: temperatura, chuva por hora, próximos 7 dias, qualidade do ar e avisos oficiais do INMET.`;

function linksBlock(api, current = null) {
  const items = api.CAPITALS.map(city => `<li><a href="${api.cityPagePath(city)}"${city.id === current?.id ? ' aria-current="page"' : ''}>${escapeHtml(city.name)}</a></li>`).join('');
  const where = current?.uf === 'DF' ? 'é a capital federal, no Distrito Federal' : current && `é a capital ${preposition(current)} ${escapeHtml(current.state)}`;
  const note = current ? `<p class="capital-page-note">${escapeHtml(current.name)} ${where}. Horários no fuso ${escapeHtml(current.timezone)} (${utcOffset(current.timezone)}).</p>` : '';
  return `${START}<nav class="capital-links" aria-label="Previsão nas capitais">${note}<details><summary>Previsão nas capitais</summary><ul>${items}</ul></details></nav>${END}`;
}
// "capital do Amazonas", "da Bahia", "de Alagoas"... sem inventar: tabela explícita por UF.
const ARTICLES = {AC:'do',AL:'de',AP:'do',AM:'do',BA:'da',CE:'do',DF:'do',ES:'do',GO:'de',MA:'do',MT:'de',MS:'de',MG:'de',PA:'do',PB:'da',PR:'do',PE:'de',PI:'do',RJ:'do',RN:'do',RS:'do',RO:'de',RR:'de',SC:'de',SP:'de',SE:'de',TO:'do'};
function preposition(city) {
  if (!ARTICLES[city.uf]) throw new Error('UF sem preposição: ' + city.uf);
  return ARTICLES[city.uf];
}

function withLinks(html, block) {
  const start = html.indexOf(START), end = html.indexOf(END);
  if (start < 0 || end < start) throw new Error('index.html sem o bloco das capitais');
  return html.slice(0, start) + block + html.slice(end + END.length);
}
function replaceOnce(html, pattern, replacement) {
  let count = 0;
  const out = html.replace(pattern, (...match) => { count++; return typeof replacement === 'function' ? replacement(...match) : replacement; });
  if (count !== 1) throw new Error('Esperava uma ocorrência de ' + pattern);
  return out;
}

function cityPage(template, api, city) {
  const url = SITE + api.cityPagePath(city), title = api.cityPageTitle(city), text = description(city);
  let html = withLinks(template, linksBlock(api, city));
  html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
  html = replaceOnce(html, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeHtml(text)}" />\n    <meta name="pluvia-city" content="${city.id}" />`);
  html = replaceOnce(html, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`);
  html = replaceOnce(html, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`);
  html = replaceOnce(html, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${escapeHtml(title)}" />`);
  html = replaceOnce(html, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${escapeHtml(text)}" />`);
  html = replaceOnce(html, /<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${escapeHtml(title)}" />`);
  html = replaceOnce(html, /<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${escapeHtml(text)}" />`);
  const graph = {'@context':'https://schema.org','@graph':[
    {'@type':'WebPage','@id':url,url,name:title,description:text,inLanguage:'pt-BR',isPartOf:{'@type':'WebSite',name:'PLUVIA',url:SITE + '/'},
      about:{'@type':'City',name:city.name,containedInPlace:{'@type':'AdministrativeArea',name:city.state},geo:{'@type':'GeoCoordinates',latitude:city.lat,longitude:city.lon}}},
    {'@type':'BreadcrumbList',itemListElement:[
      {'@type':'ListItem',position:1,name:'PLUVIA',item:SITE + '/'},
      {'@type':'ListItem',position:2,name:`${city.name} (${city.uf})`,item:url}]}]};
  html = replaceOnce(html, /<script type="application\/ld\+json">[^<]*<\/script>/, `<script type="application/ld+json">${jsonLd(graph)}</script>`);
  // O texto inicial do título já nomeia a cidade para quem lê o HTML sem executar o app.
  html = replaceOnce(html, /<span id="cityName">Sua cidade<\/span>/, `<span id="cityName">${escapeHtml(city.name)}</span>`);
  // As páginas vivem em /clima/<slug>/: referências relativas ao shell passam à raiz do site.
  html = html.replace(/((?:src|href)=")\.\//g, '$1/').replace(/url\("\.\//g, 'url("/');
  if (/(?:src|href)="\.\.?\//.test(html)) throw new Error('Referência relativa restante em ' + city.name);
  return html;
}

function sitemap(api) {
  const urls = [SITE + '/', ...api.CAPITALS.map(city => SITE + api.cityPagePath(city))];
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((loc, index) => `  <url>\n    <loc>${loc}</loc>\n    <changefreq>hourly</changefreq>\n    <priority>${index ? '0.8' : '1.0'}</priority>\n  </url>\n`).join('') + '</urlset>\n';
}

function build() {
  const api = capitalsApi();
  const index = withLinks(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'), linksBlock(api));
  const files = new Map([['index.html', index], ['sitemap.xml', sitemap(api)]]);
  for (const city of api.CAPITALS) files.set(path.join('clima', api.citySlug(city), 'index.html'), cityPage(index, api, city));
  return {api, files};
}

module.exports = {build, cityPage, linksBlock, sitemap, capitalsApi, utcOffset};
if (require.main === module) {
  const check = process.argv.includes('--check');
  const {files} = build();
  const expected = new Set([...files.keys()].filter(file => file.startsWith('clima')));
  const existing = fs.existsSync(path.join(dist, 'clima')) ? fs.readdirSync(path.join(dist, 'clima')).map(slug => path.join('clima', slug, 'index.html')) : [];
  const stale = [...files].filter(([file, content]) => !fs.existsSync(path.join(dist, file)) || fs.readFileSync(path.join(dist, file), 'utf8') !== content).map(([file]) => file);
  const orphans = existing.filter(file => !expected.has(file));
  if (check) {
    if (stale.length || orphans.length) { console.error('Páginas das capitais desatualizadas; rode node scripts/generate-city-pages.cjs:', [...stale, ...orphans].join(', ')); process.exit(1); }
    console.log(`OK: ${expected.size} páginas de capitais, rodapé e sitemap atualizados.`);
  } else {
    for (const file of orphans) fs.rmSync(path.dirname(path.join(dist, file)), {recursive:true});
    for (const file of stale) { fs.mkdirSync(path.dirname(path.join(dist, file)), {recursive:true}); fs.writeFileSync(path.join(dist, file), files.get(file)); }
    console.log(`Gravados ${stale.length} arquivos; removidos ${orphans.length}.`);
  }
}

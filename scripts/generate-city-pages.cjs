'use strict';
// Gera as páginas públicas (/clima/<nome>-<uf>/) das capitais e de PAGE_CITY_IDS, o bloco de
// links do rodapé e o sitemap a partir do index.html, de capitals.js e de cities/<uf>.js. Rode depois de mudar o shell:
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
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(dist, 'capitals.js'), 'utf8'), context);
  const api = vm.runInContext('({CAPITALS, PAGE_CITY_IDS, MORE_PAGE_CITY_IDS, citySlug, cityPagePath, cityPageTitle, stateNames})', context);
  // Registro completo (coordenadas e fuso) de cada município com página, da base estadual publicada.
  const rows = new Map();
  for (const file of fs.readdirSync(path.join(dist, 'cities'))) vm.runInContext(fs.readFileSync(path.join(dist, 'cities', file), 'utf8'), context);
  // A base agrupa fusos de mesmo deslocamento (Parintins aparece como America/Porto_Velho); na página
  // vale o fuso da capital do estado quando o deslocamento é o mesmo em janeiro e julho.
  const sameOffset = (a, b) => [0, 6].every(month => offsetAt(a, month) === offsetAt(b, month));
  for (const chunk of Object.values(context.PLUVIA_CITY_CHUNKS)) for (const [id, name, uf, lat, lon, zone] of chunk.rows) {
    const capital = api.CAPITALS.find(city => city.uf === uf), timezone = chunk.timezones[zone];
    rows.set(id, {id, name, uf, state:api.stateNames.get(uf), lat, lon, timezone:capital && sameOffset(capital.timezone, timezone) ? capital.timezone : timezone});
  }
  api.OTHERS = [...api.PAGE_CITY_IDS, ...api.MORE_PAGE_CITY_IDS].map(id => {
    const city = rows.get(id);
    if (!city?.state || !city.timezone || api.CAPITALS.some(capital => capital.id === id)) throw new Error('PAGE_CITY_IDS inválido: ' + id);
    return city;
  });
  if (new Set(api.OTHERS.map(city => city.id)).size !== api.OTHERS.length) throw new Error('PAGE_CITY_IDS repetido');
  // Rodapé da Home: capitais e os polos de PAGE_CITY_IDS; as demais aparecem nas páginas do mesmo estado.
  api.FEATURED = api.OTHERS.slice(0, api.PAGE_CITY_IDS.length);
  api.PAGES = [...api.CAPITALS, ...api.OTHERS];
  return api;
}
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const jsonLd = value => JSON.stringify(value).replace(/</g, '\\u003c');
function offsetAt(timezone, month) {
  return new Intl.DateTimeFormat('en-US', {timeZone:timezone, timeZoneName:'shortOffset'}).formatToParts(new Date(Date.UTC(2026, month, 15))).find(item => item.type === 'timeZoneName').value;
}
function utcOffset(timezone) {
  const part = new Intl.DateTimeFormat('en-US', {timeZone:timezone, timeZoneName:'shortOffset'})
    .formatToParts(new Date(Date.UTC(2026, 0, 15))).find(item => item.type === 'timeZoneName').value;
  return part.replace('GMT', 'UTC').replace('-', '−');
}
const description = city => `Previsão do tempo em ${city.name} (${city.uf}) agora: temperatura, chuva por hora, próximos 7 dias, qualidade do ar e avisos oficiais do INMET.`;

function linksBlock(api, current = null) {
  const list = cities => cities.map(city => `<li><a href="${api.cityPagePath(city)}"${city.id === current?.id ? ' aria-current="page"' : ''}>${escapeHtml(city.name)}</a></li>`).join('');
  const nearby = current ? api.OTHERS.filter(city => city.uf === current.uf && !api.FEATURED.includes(city)) : [];
  const others = [...api.FEATURED, ...nearby].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(city => `<li><a href="${api.cityPagePath(city)}"${city.id === current?.id ? ' aria-current="page"' : ''}>${escapeHtml(city.name)} (${city.uf})</a></li>`).join('');
  const capital = current && api.CAPITALS.some(city => city.id === current.id);
  const where = !current ? '' : current.uf === 'DF' ? 'é a capital federal, no Distrito Federal' : capital ? `é a capital ${preposition(current)} ${escapeHtml(current.state)}` : `é um município do estado ${preposition(current)} ${escapeHtml(current.state)}`;
  const note = current ? `<p class="capital-page-note">${escapeHtml(current.name)} ${where}. Horários no fuso ${escapeHtml(current.timezone)} (${utcOffset(current.timezone)}).</p>` : '';
  return `${START}<nav class="capital-links" aria-label="Previsão nas capitais e em outras cidades">${note}<details><summary>Previsão nas capitais</summary><ul>${list(api.CAPITALS)}</ul></details><details><summary>Outras cidades</summary><ul>${others}</ul></details></nav>${END}`;
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
  const record = api.CAPITALS.includes(city) ? '' : `\n    <meta name="pluvia-city-record" content="${escapeHtml(JSON.stringify({id:city.id, name:city.name, uf:city.uf, state:city.state, lat:city.lat, lon:city.lon, timezone:city.timezone}))}" />`;
  html = replaceOnce(html, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeHtml(text)}" />\n    <meta name="pluvia-city" content="${city.id}" />${record}`);
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
  const urls = [[SITE + '/', '1.0'], ...api.CAPITALS.map(city => [SITE + api.cityPagePath(city), '0.8']), ...api.OTHERS.map(city => [SITE + api.cityPagePath(city), '0.6'])];
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(([loc, priority]) => `  <url>\n    <loc>${loc}</loc>\n    <changefreq>hourly</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`).join('') + '</urlset>\n';
}

function build() {
  const api = capitalsApi();
  const index = withLinks(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'), linksBlock(api));
  const files = new Map([['index.html', index], ['sitemap.xml', sitemap(api)]]);
  for (const city of api.PAGES) files.set(path.join('clima', api.citySlug(city), 'index.html'), cityPage(index, api, city));
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
    console.log(`OK: ${expected.size} páginas de cidades, rodapé e sitemap atualizados.`);
  } else {
    for (const file of orphans) fs.rmSync(path.dirname(path.join(dist, file)), {recursive:true});
    for (const file of stale) { fs.mkdirSync(path.dirname(path.join(dist, file)), {recursive:true}); fs.writeFileSync(path.join(dist, file), files.get(file)); }
    console.log(`Gravados ${stale.length} arquivos; removidos ${orphans.length}.`);
  }
}

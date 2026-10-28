const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const api = require('../dist/modules/compact-header.js');

test('linha do cabeçalho compacto: temperatura e condição', () => {
  assert.equal(api.format('30', 'Céu limpo'), '30° | Céu limpo');
  assert.equal(api.format('-2', ''), '-2°');
  // Sem leitura (esqueleto vazio ou "--"), só a condição: nada de "--°".
  assert.equal(api.format('', 'Consultando o tempo…'), 'Consultando o tempo…');
  assert.equal(api.format('--', 'Indisponível'), 'Indisponível');
});

test('Sol e Lua esmaecem nos primeiros pixels de rolagem, em passos de 5%', () => {
  assert.equal(api.fadeFor(0), 1);
  assert.equal(api.fadeFor(40), 1);
  assert.equal(api.fadeFor(140), .5);
  assert.equal(api.fadeFor(240), 0);
  assert.equal(api.fadeFor(5000), 0);
  assert.equal(api.fadeFor(NaN), 1);
});

test('cabeçalho no HTML, no precache e sobre o degradê do céu, sem blur', () => {
  const html = fs.readFileSync('dist/index.html', 'utf8'), sw = fs.readFileSync('dist/sw.js', 'utf8');
  const css = fs.readFileSync('dist/continuous.css', 'utf8');
  // A faixa com máscara é irmã da pílula (1.41.2): com o ícone dentro do elemento mascarado o Safari não o pintava.
  assert.match(html, /<div class="compact-head" aria-hidden="true"><span class="compact-band"><span class="sky-twilight sky-twilight-page"><\/span><\/span><span class="compact-pill">/);
  // A película do crepúsculo de dentro vem depois da principal (captureSky lê a primeira).
  assert.ok(html.indexOf('class="compact-head"') > html.indexOf('sky-twilight-page'));
  assert.match(html, /modules\/compact-header\.js\?v=compact-4" defer/);
  assert.match(sw, /modules\/compact-header\.js\?v=compact-4/);
  const head = css.slice(css.indexOf('.night-stage > .compact-head {'));
  assert.doesNotMatch(head.slice(0, head.indexOf('}')), /mask-image|contain:paint/);
  const rule = css.slice(css.indexOf('.compact-head > .compact-band {'));
  assert.match(rule.slice(0, rule.indexOf('}')), /mask-image:linear-gradient\(#000 calc\(100% - 44px\),transparent\)/);
  assert.match(rule, /background-image:var\(--sky-color\)/);
  assert.match(rule, /background-size:100% 100lvh/);
  assert.doesNotMatch(rule.slice(0, rule.indexOf('}')), /backdrop-filter|blur/);
});

test('sem títulos grudados nem cartões cortados (1.39.1: o dono achou feio, conteúdo passava atrás dos títulos)', () => {
  const css = fs.readFileSync('dist/continuous.css', 'utf8');
  assert.doesNotMatch(css, /pluvia-tuck|--tuck-|animation-timeline:view/);
});

test('pílula com o ícone da condição só quando o código é do texto à vista (1.41)', () => {
  const cond = (text, data) => ({textContent:text, dataset:data});
  assert.equal(api.iconKey(cond('Nublado', {code:'3', day:'0', text:'Nublado'})), '3:0');
  assert.equal(api.iconKey(cond('Chuva', {code:'61', day:'1', text:'Chuva'})), '61:1');
  // Troca de cidade ("Consultando o tempo…") e falha ("Tempo indisponível") trocam o texto: sem ícone velho.
  assert.equal(api.iconKey(cond('Consultando o tempo…', {code:'3', day:'1', text:'Nublado'})), '');
  assert.equal(api.iconKey(cond('Nublado', {})), '');
  const html = fs.readFileSync('dist/index.html', 'utf8'), css = fs.readFileSync('dist/continuous.css', 'utf8');
  const app = fs.readFileSync('dist/app.js', 'utf8');
  assert.match(html, /<span class="compact-pill"><span class="compact-icon"><\/span><strong class="compact-city"><\/strong><span class="compact-now"><\/span><\/span>/);
  assert.match(app, /Object\.assign\(conditionNode\.dataset, \{code:String\(current\.weather_code\), day:isDay \? "1" : "0", text:conditionNode\.textContent\}\)/);
  const pill = css.slice(css.indexOf('.compact-head > .compact-pill {'));
  assert.doesNotMatch(pill.slice(0, pill.indexOf('}')), /backdrop-filter|blur|transform/);
});

test('ícone da pílula acompanha a condição num DOM simulado', () => {
  const nodes = {};
  const el = (text = '') => ({textContent:text, dataset:{}, innerHTML:'', closest:() => null});
  nodes.cityName = el('Porto Alegre'); nodes.temperature = el('15'); nodes.condition = el('Nublado');
  Object.assign(nodes.condition.dataset, {code:'3', day:'0', text:'Nublado'});
  const parts = {'.compact-city':el(), '.compact-now':el(), '.compact-icon':el()};
  const head = {offsetHeight:150, querySelector:sel => parts[sel], hasAttribute:() => false, toggleAttribute() {}};
  let observer;
  const root = {
    PLUVIA:{weatherIcons:{markup:(code, day) => `<img data-code="${code}" data-day="${day}">`}},
    document:{readyState:'complete', querySelector:sel => sel === '.compact-head' ? head : null, querySelectorAll:() => [],
      getElementById:id => nodes[id]},
    MutationObserver:class { constructor(fn) { observer = fn; } observe() {} },
    requestAnimationFrame:fn => fn(), addEventListener() {}, scrollY:0
  };
  api.start(root);
  assert.equal(parts['.compact-city'].textContent, 'Porto Alegre');
  assert.equal(parts['.compact-now'].textContent, '15° | Nublado');
  assert.equal(parts['.compact-icon'].innerHTML, '<img data-code="3" data-day="false">');
  nodes.condition.textContent = 'Consultando o tempo…'; observer();
  assert.equal(parts['.compact-icon'].innerHTML, '');
});

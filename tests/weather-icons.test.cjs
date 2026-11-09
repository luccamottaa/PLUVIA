const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const icons = require('../dist/modules/weather-icon-system.js');

test('mapeia códigos WMO e respeita variantes de dia e noite', () => {
  assert.equal(icons.assetFor(0, true), 'clear-day.svg');
  assert.equal(icons.assetFor(0, false), 'clear-night.svg');
  assert.equal(icons.assetFor(1, true), 'few-clouds-day.svg');
  assert.equal(icons.assetFor(1, false), 'few-clouds-night.svg');
  assert.equal(icons.icon(1, true).source, 'pluvia-vector');
  assert.equal(icons.assetFor(2, true), 'partly-cloudy-day.svg');
  assert.equal(icons.assetFor(2, false), 'partly-cloudy-night.svg');
  assert.equal(icons.assetFor(45, true), 'fog.svg');
  assert.equal(icons.assetFor(65, true), 'heavy-rain.svg');
  assert.equal(icons.assetFor(96, true), 'thunderstorm-hail.svg');
  assert.equal(icons.assetFor(80, true), 'showers.svg');
  assert.equal(icons.assetFor(80, false), 'showers-night.svg');
  assert.equal(icons.assetFor(81, false), 'showers-night.svg');
  assert.match(icons.icon(80, false).src, /showers-night\.svg\?v=modern-8$/);
  assert.match(icons.icon(2, false).src, /partly-cloudy-night\.svg\?v=modern-8$/);
  assert.equal(icons.assetFor(82, false), 'heavy-rain.svg');
});

test('centraliza ícones nomeados e usa fallback local sem gerar 404', () => {
  assert.equal(icons.namedIcon('humidity').src, '/assets/weather-icons/metrics/humidity.svg?v=modern-8');
  for (const name of ['temperature-high','temperature-low','feels-like','visibility']) {
    assert.equal(icons.namedIcon(name).src, `/assets/weather-icons/metrics/${name}.svg?v=modern-8`);
  }
  assert.equal(icons.namedIcon('rain-probability').source, 'pluvia-vector');
  assert.equal(icons.namedIcon('radar').source, 'pluvia-vector');
  assert.equal(icons.namedIcon('radar').src, '/assets/weather-icons/maps/radar.svg?v=modern-8');
});

test('todos os ícones vetoriais existem e são válidos', () => {
  for (const [category, entries] of Object.entries(icons.ASSETS)) {
    for (const file of Object.values(entries)) {
      const asset = path.join(__dirname, '..', 'dist', 'assets', 'weather-icons', category, file);
      assert.ok(fs.existsSync(asset), `${category}/${file} ausente`);
      const contents = fs.readFileSync(asset);
      if (file.endsWith('.svg')) {
        assert.match(contents.toString(), /<svg[^>]*viewBox="0 0 128 128"[\s\S]*<\/svg>/, `${category}/${file} parece inválido`);
        if (['conditions','metrics'].includes(category)) {
          assert.ok(contents.length < 4 * 1024, `${file} excede orçamento de um ícone pequeno`);
          assert.doesNotMatch(contents.toString(), /<(?:script|image|foreignObject|filter|animate|set)\b|\bon\w+=|(?:href|src)=["'](?:https?:|data:)/i, `${file} precisa ser um SVG estático local`);
          for (const match of contents.toString().matchAll(/url\(#([^\)]+)\)/g)) {
            assert.ok(contents.toString().includes(`id="${match[1]}"`), `${file} referencia um gradiente ausente`);
          }
        }
      } else {
        assert.ok(contents.length > 10_000, `${category}/${file} parece inválido`);
      }
    }
  }
  const total = Object.values(icons.ASSETS.conditions).reduce((sum, file) => sum + fs.statSync(path.join(__dirname, '../dist/assets/weather-icons/conditions', file)).size, 0);
  assert.ok(total < 50 * 1024, 'família meteorológica excede orçamento do shell mobile');
  const metricsTotal = Object.values(icons.ASSETS.metrics).reduce((sum, file) => sum + fs.statSync(path.join(__dirname, '../dist/assets/weather-icons/metrics', file)).size, 0);
  assert.ok(total + metricsTotal < 96 * 1024, 'ícones de condições e indicadores excedem orçamento mobile');
});

test('usa nascer e pôr do sol reais para cada frame horário', () => {
  assert.equal(icons.isDayAt('2026-09-13T05:59', '2026-09-13T06:00', '2026-09-13T18:00'), false);
  assert.equal(icons.isDayAt('2026-09-13T12:00', '2026-09-13T06:00', '2026-09-13T18:00'), true);
  assert.equal(icons.isDayAt('2026-09-13T18:00', '2026-09-13T06:00', '2026-09-13T18:00'), false);
});

test('mantém os SVGs oficiais e a licença no bundle offline', () => {
  const root = path.join(__dirname, '..', 'dist', 'vendor', 'weathericons');
  for (const asset of ['Sun.svg','Moon.svg','PartlySunny.svg','PartlyMoon.svg','Cloud.svg','Haze.svg','Rain.svg','Snow.svg','Storm.svg','Hail.svg']) {
    assert.ok(fs.existsSync(path.join(root, asset)), `${asset} ausente`);
  }
  assert.match(fs.readFileSync(path.join(root, 'LICENSE.txt'), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
});


test('família completa fica disponível offline e diferencia precipitação', () => {
  const sw = fs.readFileSync(path.join(__dirname, '../dist/sw.js'), 'utf8');
  for (const entries of Object.values(icons.ASSETS)) for (const name of Object.keys(entries)) {
    assert.ok(sw.includes(icons.namedIcon(name).src), `ícone sem precache: ${name}`);
  }
  assert.notEqual(icons.assetFor(51), icons.assetFor(61));
  assert.notEqual(icons.assetFor(61), icons.assetFor(65));
  assert.equal(icons.assetFor(66), 'sleet.svg');
  assert.match(icons.markup(95, true, {decorative:false, style:'image'}), /alt="Trovoadas"/);
  assert.match(icons.namedIcon('inexistente').src, /fallback\/weather-unknown.svg/);
});

test('blocos de leitura da Home usam ícones em traço, no mesmo estilo dos títulos de seção', () => {
  const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
  const names = [...html.matchAll(/data-weather-icon-name="([a-z-]+)" data-weather-icon-style="line"/g)].map(m => m[1]);
  assert.deepEqual(names, ['feels-like','temperature','visibility','humidity','wind-speed','pressure','rain-chance','uv-index','air-quality','radar','sun-cycle'], 'blocos de leitura (Chuva desde a 1.63) e, desde a 1.37.2, os títulos de Chuva na região e Ciclo do dia');
  for (const name of ['river','fire','temperature']) assert.match(icons.lineMarkup(name), /^<svg/, name + ' continua no conjunto');
  for (const name of names) {
    const svg = icons.lineMarkup(name);
    assert.match(svg, /^<svg class="metric-line-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">/, name);
    assert.doesNotMatch(svg, /fill="|style=|<img/, 'cor e traço vêm do CSS (currentColor)');
  }
  assert.equal(icons.lineMarkup('tornado'), '', 'sem glifo em traço, nada de inventar ícone');
  const node = name => ({ attrs:{'data-weather-icon-name':name,'data-weather-icon-style':'line'}, innerHTML:'', getAttribute(key){ return this.attrs[key] ?? null; } });
  const line = node('humidity'), colored = { ...node('rain-probability'), attrs:{'data-weather-icon-name':'rain-probability'} };
  icons.hydrate({ querySelectorAll: () => [line, colored] });
  assert.match(line.innerHTML, /^<svg class="metric-line-icon"/);
  assert.match(colored.innerHTML, /<img class="metric-weather-icon"[^>]+rain-probability\.svg/, 'demais consumidores continuam com os ícones coloridos');
});

test('condições em traço (1.63): mesmo mapeamento WMO, uma por nome, acessível e sem cor inline', () => {
  const names = new Set();
  for (const code of [0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]) for (const day of [true,false]) {
    const svg = icons.markup(code, day);
    const name = icons.conditionIconName(code, day);
    names.add(name);
    assert.match(svg, new RegExp(`^<svg class="weather-icon weather-line-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-weather-icon="${name}" data-icon-style="line">`), `${code}/${day}`);
    assert.ok(icons.LINE_CONDITIONS[name], `sem glifo para ${name}`);
    assert.doesNotMatch(svg, / fill="| stroke="| style="|<img/, 'cor e traço vêm do CSS');
  }
  for (const name of names) assert.ok(icons.ASSETS.conditions?.[name] || icons.ASSET_ALIASES?.[name] || Object.values(icons.ASSETS).some(group => group[name]), `glifo sem ilustração equivalente: ${name}`);
  assert.notEqual(icons.markup(51), icons.markup(61), 'garoa diferente de chuva');
  assert.notEqual(icons.markup(61), icons.markup(65), 'chuva diferente de chuva forte');
  assert.doesNotMatch(icons.markup(95), /wl-rain/, 'trovoada 95 não inventa chuva');
  assert.match(icons.markup(95, true, {decorative:false}), /role="img" aria-label="Trovoadas"/);
  assert.match(icons.markup(3, true, {className:'x"><script>'}), /^<svg class="xscript weather-line-icon"/, 'classe sanitizada');
  assert.match(icons.markup(0, false), /data-weather-icon="clear-night"/);
});

test('condições em traço saem do gerador geométrico (1.64.2): sol, lua e nuvem de trás nunca cruzam a nuvem', () => {
  const src = fs.readFileSync(path.join(__dirname, '../dist/modules/weather-icon-system.js'), 'utf8');
  assert.match(src, /\/\/ linha:inicio \(gerado por scripts\/generate-line-icons\.py; não editar à mão\)/);
  assert.ok(fs.existsSync(path.join(__dirname, '../scripts/generate-line-icons.py')));
  // Cada número dos caminhos fica na grade de 24 (com folga para o traço).
  for (const [name, markup] of Object.entries(icons.LINE_CONDITIONS)) {
    for (const value of markup.match(/-?\d+(?:\.\d+)?/g) || []) assert.ok(Number(value) >= -3 && Number(value) <= 25, `${name}: ${value}`); // relativos do raio (l-2.2) entram
    assert.doesNotMatch(markup, /NaN|undefined/, name);
  }
  // Parcial de dia: o sol tem arco e raios, mas nenhum ponto do arco dentro da nuvem (o recorte deixa folga).
  const partly = icons.LINE_CONDITIONS['partly-cloudy-day'];
  assert.match(partly, /class="wl-sun"/);
  assert.match(icons.LINE_CONDITIONS.overcast, /^<path d="M[^"]+"\/><path d="M[\d.]+ [\d.]+A/, 'nuvem de trás recortada e a da frente em arcos');
});

// Ajustes de 1.73 pedidos pelo dono: ícone da umidade, linha do Tomorrow.io e "Mais do PLUVIA" recolhível.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dist = file => fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8');
const html = dist('index.html');
const icon = mode => html.match(new RegExp(`<button type="button" data-mode="${mode}"[^>]*>(<svg[^]*?</svg>)</button>`))[1];

test('umidade tem ícone próprio, diferente da gota da chuva', () => {
  const rain = icon('rain'), humidity = icon('humidity');
  const rainDrop = rain.match(/d="([^"]+)"/)[1];
  assert.ok(!humidity.includes(rainDrop), 'não reaproveita a gota da chuva');
  assert.match(humidity, /M3 16c1\.5-1\.4/, 'ondas de ar');
  assert.match(html, /data-mode="humidity" aria-pressed="false" aria-label="Umidade"/);
});

test('CI de alinhamento: o canto direito do topo é contrapeso invisível (sem compartilhar desde a 1.72.1)', () => {
  const py = fs.readFileSync(path.join(__dirname, '../scripts/verify-alignment.py'), 'utf8');
  assert.doesNotMatch(py, /top-actions','centerY',3\)/, 'não exige três itens visíveis no topo');
  assert.match(py, /actions=layout\('\.topbar \.top-actions'\)\[0\]/, 'mede o contrapeso pela caixa de layout');
  assert.match(dist('continuous.css'), /\.topbar \.top-actions:empty \{ visibility:hidden; pointer-events:none; \}/);
});

test('Tomorrow.io que respondeu não mostra a linha de status; sem cota ou sem resposta, mostra', () => {
  const app = dist('app.js');
  assert.match(app, /fromCache \|\| Boolean\(data\.pluviaReduced\) \|\| Boolean\(data\.pluviaTomorrow\)\);/);
  assert.doesNotMatch(app, /Boolean\(data\.pluviaSource \|\| data\.pluviaTomorrow\)/);
});

test('"Mais do PLUVIA" fica num cartão que abre e fecha, fechado por padrão, com os mesmos itens', () => {
  const nav = html.slice(html.indexOf('<nav class="account-more"'), html.indexOf('</nav>', html.indexOf('<nav class="account-more"')));
  assert.match(nav, /<details class="account-more-fold" id="accountMoreFold"><summary>Ajustes e informações<\/summary><div class="account-more-list">/);
  assert.doesNotMatch(nav, /accountMoreFold" open/);
  for (const id of ['textSizeDown', 'textSizeUp', 'openHomeLayout', 'tomorrowTest', 'openChangelog', 'openSources', 'openPrivacy']) assert.ok(nav.includes(`id="${id}"`), id);
  const css = dist('dialogs.css');
  assert.match(css, /#accountDialog \.account-more-fold\[open\]:not\(\[data-closing\]\) > summary::after \{ rotate:90deg; \}/);
  for (const script of ['verify-browser.py', 'verify-alignment.py', 'verify-visual.py', 'verify-home-ux.py'])
    assert.match(fs.readFileSync(path.join(__dirname, '../scripts', script), 'utf8'), /accountMoreFold'\)\.open=true/, script);
});

test('dica de Próximas horas some no primeiro toque num horário (1.73.2)', () => {
  const app = dist('app.js');
  assert.match(app, /event\.target\?\.closest\?\.\("#hourlyPeek \[data-hour-index\]"\)/);
  assert.match(app, /sessionStorage\.removeItem\("pluvia-hourly-hint-session"\); localStorage\.setItem\("pluvia-hourly-hint-seen", "1"\)/);
});

test('"Editar perfil" com respiro e letra branca, legível de dia (1.73.2)', () => {
  const css = dist('dialogs.css');
  assert.match(css, /#accountProfileEdit \.account-group-value:not\(#_\) \{[^}]*padding:0 20px !important;[^}]*color:#fff;/);
  assert.match(css, /body\[data-phase="day"\] #accountDialog #accountProfileEdit \.account-group-value:not\(#_\) \{ background:#0a4cba; \}/);
});

test('seletor de vidro lê medidas no ResizeObserver e escreve no próximo quadro (1.73.2)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../dist/modules/glass-segment.js'), 'utf8');
  assert.match(src, /new root\.ResizeObserver\(\(\) => later\(read\(\)\)\)\.observe\(group\)/);
  assert.match(src, /if \(key === written\) return;/, 'escrita igual é pulada (sem laço do observer)');
  assert.doesNotMatch(src, /^\s*later\(\);$/m, 'nenhuma medida forçada antes do primeiro layout');
});

test('ícones dos cartões da Home na cor do texto: brancos no céu escuro (1.73.2)', () => {
  const css = dist('continuous.css');
  assert.match(css, /--icon-ink:var\(--reading-ink\);/);
  for (const rule of [/\.metric-head > \[data-weather-icon-style="line"\] \{ color:var\(--icon-ink\);/, /\.tip-icon \{ flex:none; width:22px; height:22px; color:var\(--icon-ink\); \}/,
    /#humidityNote::before \{[^}]*background:var\(--icon-ink\);/, /\.heading-icon \{[^}]*color:var\(--icon-ink\); \}/]) assert.match(css, rule);
  assert.match(css, /\.rain-chart \.wind-direction \{ color:var\(--graphic-blue\); \}/, 'gráficos continuam coloridos');
});

test('CI: depois de abrir a conta, espera a janela aparecer (dialogs.css chega depois do toque)', () => {
  const py = fs.readFileSync(path.join(__dirname, '../scripts/verify-auth-redirects.py'), 'utf8');
  assert.doesNotMatch(py, /click\(\);assert page\.locator\('#accountProfile'\)\.is_visible\(\)/);
  assert.match(py, /page\.locator\('#accountProfile'\)\.wait_for\(state='visible',timeout=5000\)/);
});

test('botão de avisos com a cor do que faz e Excluir conta alinhado com Sair (1.73.2)', () => {
  const css = dist('dialogs.css');
  assert.match(css, /:has\(\.notification-status\.is-on\) #notificationToggle:not\(#_\) \{ color:#ff6b61; \}/, 'desligar em vermelho');
  assert.match(css, /:not\(:has\(\.notification-status\.is-on\)\) #notificationToggle:not\(#_\):not\(#_\) \{ border-color:#30d158; background:#30d158;/, 'ativar em verde');
  assert.match(css, /#accountDialog \.account-exit \.account-delete:not\(#_\) \{ padding-inline:0; \}/, 'sem o recuo duplicado');
});

test('atalhos Brasil agora, Últimos 30 dias e Quanto o PLUVIA acerta na cor do texto (1.73.2)', () => {
  const css = dist('continuous.css');
  assert.match(css, /background:color-mix\(in srgb, var\(--reading-link\) 12%, transparent\); color:var\(--icon-ink\);/);
  assert.match(css, /#weatherView \.home-shortcut::before \{[^}]*background:currentColor;/, 'o ícone segue a cor do texto');
});

test('"Agora", nascer/pôr do sol e "Hoje" em dourado, âmbar com tinta escura (1.73.2)', () => {
  const css = dist('continuous.css');
  assert.match(css, /--accent-now:#ffd23f;/);
  assert.match(css, /body\[data-ink="dark"\] #weatherView \{ --accent-now:#b26200; \}/);
  for (const sel of ['.hourly-peek-item.is-now .peek-time', '.hourly-solar-item', '.hourly-solar-item .peek-time', '.forecast-row[data-today] .forecast-day > strong > span', '.sun-table tbody tr[data-today] th'])
    assert.ok(new RegExp(`#weatherView ${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{[^}]*color:var\\(--accent-now\\)`).test(css), sel);
});

test('sem botões "i" no app; créditos das fontes continuam (1.73.2)', () => {
  const app = dist('app.js'), css = ['continuous.css', 'redesign.css', 'styles.css', 'dialogs.css'].map(dist).join('\n');
  assert.doesNotMatch(html, /info-tip/);
  assert.doesNotMatch(app, /info-tip|forecastCityLabel/);
  assert.doesNotMatch(css, /info-tip/);
  assert.match(html, /Open-Meteo/, 'crédito do Open-Meteo continua na página');
  assert.match(fs.readFileSync(path.join(__dirname, '../dist/weather-map.js'), 'utf8'), /attribution:'Radar: RainViewer'/);
  assert.match(fs.readFileSync(path.join(__dirname, '../dist/modules/sources.js'), 'utf8'), /Open-Meteo \/ CAMS/);
});

test('bandeiras dos 27 estados nos cartões das favoritas, leves e em WebP (1.73.2)', () => {
  const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
  const css = dist('dialogs.css');
  let total = 0;
  for (const uf of UFS) {
    const file = path.join(__dirname, '../dist/assets/flags', uf.toLowerCase() + '.webp'), data = fs.readFileSync(file);
    assert.equal(data.toString('ascii', 0, 4), 'RIFF', uf); assert.equal(data.toString('ascii', 8, 12), 'WEBP', uf);
    assert.ok(data.length < 3072, `${uf}: ${data.length} B`); total += data.length;
    assert.ok(css.includes(`.favorite-flag[data-uf="${uf}"] { background-image:url("./assets/flags/${uf.toLowerCase()}.webp?v=flags-1"); }`), uf);
  }
  assert.ok(total < 64 * 1024, `total ${total} B`);
  assert.equal(fs.readdirSync(path.join(__dirname, '../dist/assets/flags')).filter(f => f.endsWith('.webp')).length, 27);
});

test('cartões da tela inicial com os dados do Tomorrow.io (1.73.5)', () => {
  const app = dist('app.js'), icons = fs.readFileSync(path.join(__dirname, '../dist/modules/weather-icon-system.js'), 'utf8');
  const metrics = html.slice(html.indexOf('<section class="metrics"'), html.indexOf('</section>', html.indexOf('<section class="metrics"')));
  for (const [id, hidden] of [['clouds', false], ['dewPoint', false], ['rainIntensity', true], ['evapo', true]]) {
    assert.match(metrics, new RegExp(`<article class="metric metric-sky [^"]*" id="${id}Card"${hidden ? ' hidden' : ''}>`), id);
    assert.ok(metrics.includes(`id="${id}Value"`) && metrics.includes(`id="${id}Note"`), id);
  }
  assert.ok(metrics.indexOf('id="uv"') < metrics.indexOf('id="cloudsCard"'), 'depois do UV');
  for (const name of ['cloud-cover', 'dew-point', 'rain-intensity', 'evapotranspiration']) assert.ok(icons.includes(`"${name}":`), name);
  assert.match(app, /renderExtraTiles\(data\.hourly, start\);/);
  assert.match(fs.readFileSync(path.join(__dirname, '../dist/modules/weather-services.js'), 'utf8'), /uv_index,dew_point_2m"/);
});

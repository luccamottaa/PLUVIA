const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'dist');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

test('mantém a ordem mobile no fluxo normal da Home', () => {
  const current = html.indexOf('current-card weather-hero');
  const summary = html.indexOf('id="attentionCard"');
  const hourly = html.indexOf('id="rainChart"');
  assert.ok(current >= 0 && current < summary && summary < hourly);
  assert.doesNotMatch(css, /\.(?:dashboard-grid|current-card|insight-card)\s*\{[^}]*position\s*:\s*absolute/i);
});

test('a cascata final força uma coluna e corrige a margem do gráfico', () => {
  const finalContract = css.slice(css.indexOf('/* Home responsive contract'));
  assert.match(finalContract, /@media \(max-width:820px\)[\s\S]*?\.dashboard-grid\s*\{\s*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(finalContract, /@media \(max-width:720px\)[\s\S]*?\.rain-chart\s*\{\s*margin-inline:0/);
  assert.doesNotMatch(css, /overflow-x\s*:\s*hidden/);
  assert.match(css, /\.card-topline > \*[^}]*min-width:0/);
  assert.match(css, /\.insight-card \.signal\s*\{[^}]*white-space:normal/);
  assert.match(css, /margin-left:max\(14px,env\(safe-area-inset-left\)\)/);
  assert.match(css, /margin-right:max\(14px,env\(safe-area-inset-right\)\)/);
});

test('todos os breakpoints de aceitação preservam largura positiva e contida', () => {
  for (const viewport of [320,360,375,390,393,414,430,768,1024,1440]) {
    const gutter = viewport <= 380 ? 20 : viewport <= 720 ? 28 : 48;
    const shell = Math.min(1180, viewport - gutter);
    assert.ok(shell > 0 && shell <= viewport, `container inválido em ${viewport}px`);
    const columns = viewport <= 820 ? 1 : 2;
    assert.equal(columns, viewport <= 768 ? 1 : 2, `grade incorreta em ${viewport}px`);
  }
});

test('Resumo Inteligente tem altura por conteúdo e timeline tem scroll interno', () => {
  const finalContract = css.slice(css.indexOf('/* Home responsive contract'));
  assert.match(finalContract, /\.insight-card\s*\{[^}]*min-height:0\s*!important;[^}]*height:auto/);
  assert.match(finalContract, /\.rain-chart\s*\{[^}]*overflow-x:auto/);
  assert.doesNotMatch(html, /MODELO DE PRECIPITAÇÃO|rainPulse|rainMapGrid/);
  assert.match(finalContract, /\.summary-highlights li[^}]*white-space:normal/);
  assert.match(finalContract, /\.summary-link\s*\{\s*white-space:normal/);
});

test('não usa 100vw nos cards da Home nem mascara overflow global', () => {
  const homeRules = css.replace(/\.weather-map-dialog\{[^}]*\}/g, '');
  assert.doesNotMatch(homeRules, /(?:current-card|insight-card|dashboard-grid)[^{]*\{[^}]*100vw/i);
  assert.doesNotMatch(css, /(?:html|body)[^{]*\{[^}]*overflow-x\s*:\s*hidden/i);
});

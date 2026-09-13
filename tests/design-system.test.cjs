const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'dist');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

for (const token of [
  '--bg-secondary', '--panel-subtle', '--weather-rain', '--weather-storm',
  '--weather-heat', '--weather-wind', '--weather-uv', '--weather-air',
  '--space-1', '--space-16', '--radius-sm', '--radius-lg'
]) assert(css.includes(token), `token ausente: ${token}`);

assert(html.indexOf('weather-hero') < html.indexOf('id="goOutCard"'), 'o hero deve anteceder o PLUVIA Sinal');
assert.match(html, /card-primary/);
assert.match(html, /card-secondary/);
assert.match(html, /card-detail/);
assert.match(html, /card-interactive/);
assert.match(html, /AGORA NO PLUVIA/);
assert.match(html, /id="windCompass"[^>]+role="img"[^>]+aria-label=/);
assert.match(app, /document\.body\.dataset\.weather/);
assert.match(app, /document\.body\.dataset\.phase/);
assert.match(app, /classList\.toggle\("is-night"/);
assert.match(app, /class="hour-temp"/);
assert.match(app, /Sem alertas meteorológicos ativos/);
assert.match(css, /@media \(max-width:380px\)/);
assert.match(css, /@media \(max-width:720px\)/);
assert.match(css, /@media \(prefers-color-scheme: dark\)/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(css, /\.metric:hover \{ transform:none; box-shadow:none; \}/);

console.log('PASS Design System: tokens, hierarchy, atmosphere, wind, hourly temperature, dark mode, mobile and reduced motion.');

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// 1.70.3 (pedido do dono, print do iPhone): "Próxima janela seca" e a nota "… que ontem neste horário" saíram da Home.
const dist = file => fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8');

test('a Home não tem mais a janela seca nem a nota de ontem', () => {
  const html = dist('index.html'), app = dist('app.js'), css = dist('continuous.css');
  assert.doesNotMatch(html, /id="dryWindow"|dry-window-line|id="yesterdayNote"|yesterday-note/);
  assert.doesNotMatch(app, /function (findDryWindow|setDryWindow|setYesterdayNote)\(|\$\("(dryWindow|yesterdayNote)"\)/);
  assert.doesNotMatch(css, /\.yesterday-note|\.dry-window-line/);
});
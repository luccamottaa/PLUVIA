const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, 'dist', file), 'utf8');
const html = read('index.html');
const app = read('app.js');
const p0 = read('p0.js');
const sw = read('sw.js');

assert(!html.includes('municipalities.js'), 'municípios não podem bloquear o primeiro paint');
assert(!html.includes('auth.js') && !html.includes('authDialog'), 'o painel público não deve carregar login');
assert.match(html, /id="citySearch"[^>]+aria-autocomplete="list"/);
assert.match(html, /id="openCitySearch"[\s\S]+id="selectedCityLabel"/);
assert.match(p0, /setTimeout\([\s\S]+1500\)/, 'Manaus precisa abrir em até 1,5 s');
assert.match(p0, /sessionStorage/, 'a introdução deve aparecer uma vez por sessão');
assert.match(app, /O clima é do ponto do município|Não é a sua rua/);
assert.match(app, /Ainda seco, mas pode vir/);
assert.match(app, /Prioridade definida pelo aviso oficial do INMET/);
assert.match(html, /não radar nem chuva na sua rua/i);
assert.match(app, /prefers-reduced-motion: reduce/);
assert.match(html, /summary_large_image/);
assert.match(html, /og-pluvia\.png/);
assert.match(app, /Comparando nove pontos ao redor/);
assert.match(app, /Volume previsto sozinho não vira alerta/);
assert.match(app, /Defesa Civil Nacional/);
assert(!sw.slice(0, sw.indexOf('self.addEventListener("activate"')).includes('municipalities.js'), 'a lista completa não deve entrar no precache');
assert.match(sw, /endsWith\("\/municipalities\.js"\)/, 'municípios devem usar cache imutável depois da primeira busca');
assert.match(sw, /pluvia-core-39/);

console.log('PASS product shell: public first paint, 1.5 s fallback, lazy municipalities, honest point data and versioned offline shell.');

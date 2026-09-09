const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'dist/municipalities.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(`${source}\n;globalThis.__catalog=MUNICIPALITIES;`, context);
const catalog = context.__catalog;
const byState = new Map();

for (const row of catalog.rows) {
  const uf = row[2];
  if (!byState.has(uf)) byState.set(uf, []);
  byState.get(uf).push(row);
}

const banner = '// Gerado de municipalities.js. Nomes/IDs: IBGE; coordenadas: Kelvin S. do Prado (MIT).\n';
const index = catalog.rows.map(([id, name, uf]) => [id, name, uf]);
fs.writeFileSync(path.join(root, 'dist/municipality-index.js'), `${banner}globalThis.PLUVIA_MUNICIPALITY_INDEX=${JSON.stringify(index)};\n`);

const target = path.join(root, 'dist/cities');
fs.mkdirSync(target, {recursive:true});
for (const [uf, rows] of byState) {
  const payload = {timezones:catalog.timezones, rows};
  fs.writeFileSync(path.join(target, `${uf.toLowerCase()}.js`), `${banner}globalThis.PLUVIA_CITY_CHUNKS=globalThis.PLUVIA_CITY_CHUNKS||{};globalThis.PLUVIA_CITY_CHUNKS.${uf}=${JSON.stringify(payload)};\n`);
}

console.log(`Gerados ${index.length} nomes e ${byState.size} arquivos estaduais.`);

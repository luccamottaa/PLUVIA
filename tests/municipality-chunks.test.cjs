const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const context = vm.createContext({globalThis:{}});
const read = file => fs.readFileSync(path.join(dist, file), 'utf8');

vm.runInContext(read('municipality-index.js'), context);
const index = context.globalThis.PLUVIA_MUNICIPALITY_INDEX;
assert.equal(index.length, 5571);
assert.equal(new Set(index.map(row => row[0])).size, 5571);
assert(fs.statSync(path.join(dist, 'municipality-index.js')).size < fs.statSync(path.join(dist, 'municipalities.js')).size);

const rows = [];
for (const filename of fs.readdirSync(path.join(dist, 'cities')).sort()) {
  vm.runInContext(read(path.join('cities', filename)), context);
  const uf = filename.slice(0, 2).toUpperCase();
  const chunk = context.globalThis.PLUVIA_CITY_CHUNKS[uf];
  assert(chunk?.rows.length > 0);
  assert(chunk.rows.every(row => row[2] === uf));
  rows.push(...chunk.rows);
}

assert.equal(context.globalThis.PLUVIA_CITY_CHUNKS && Object.keys(context.globalThis.PLUVIA_CITY_CHUNKS).length, 27);
assert.equal(rows.length, 5571);
assert.equal(rows.map(row => row[0]).sort().join(','), index.map(row => row[0]).sort().join(','));
for (const name of ['Parintins','Iranduba','Manacapuru','Tefé','Tabatinga']) assert(index.some(row => row[1] === name && row[2] === 'AM'));

const runtime = vm.createContext({
  Intl,
  localStorage:{getItem(){return null;},setItem(){}},
  globalThis:null
});
runtime.globalThis = runtime;
vm.runInContext(read('municipality-index.js'), runtime);
vm.runInContext(read('capitals.js'), runtime);
assert.equal(vm.runInContext('searchCities("Parintins")[0].needsDetails', runtime), true);
vm.runInContext(read(path.join('cities','am.js')), runtime);
assert.equal(vm.runInContext('hydrateCityState("AM")', runtime), true);
assert.equal(vm.runInContext('searchCities("Parintins")[0].lat', runtime), -2.63741);
assert.equal(vm.runInContext('searchCities("São Paulo")[0].needsDetails', runtime), undefined);

console.log('PASS municipality chunks: índice leve, 27 UFs e 5.571 registros completos sem bloquear o primeiro paint.');

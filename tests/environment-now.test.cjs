const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const env = require('../dist/modules/environment-now.js');

const now = Date.parse('2026-10-14T16:00:00Z');
const helpers = {time:at => new Date(at - 4 * 3600_000).toISOString().slice(11, 16), number:(n, d) => n.toFixed(d).replace('.', ',')};
const data = {
  river:{at:'2026-10-14T14:45:00.000Z', place:'Manaus', river:'Rio Negro', levelCm:1749, station:'14990000', change24hCm:-7},
  fires:{count:5, radiusKm:50, nearestKm:40.6, updatedAt:'2026-10-14T15:40:00Z'}
};

test('pedido: só IBGE e coordenadas de referência, nada além', () => {
  assert.equal(env.requestUrl({id:'1302603', lat:-3.119, lon:-60.022}),
    'https://dszyyrcvwrpyiypwyvxe.supabase.co/rest/v1/rpc/pluvia_city_environment?p_city=1302603&p_lat=-3.119&p_lon=-60.022');
  assert.equal(env.requestUrl({id:'x', lat:1, lon:2}), null);
  assert.equal(env.requestUrl({id:'1302603'}), null);
});

test('rio: cota em metros, variação de 24 h e horário da ANA no fuso da cidade', () => {
  const item = env.river(data, now);
  assert.deepEqual(env.describeRiver(item, helpers), {value:'17,49 m', note:'Rio Negro em Manaus · descendo 7 cm em 24 h · ANA, às 10:45'});
  assert.match(env.describeRiver({...item, changeCm:12}, helpers).note, /subindo 12 cm em 24 h/);
  assert.match(env.describeRiver({...item, changeCm:1}, helpers).note, /estável em 24 h/);
  // Sem leitura de 24 h antes: não diz "estável".
  assert.equal(env.describeRiver({...item, changeCm:null}, helpers).note, 'Rio Negro em Manaus · ANA, às 10:45');
});

test('rio: leitura velha, futura, sem cota ou sem nome some', () => {
  assert.equal(env.river({river:{...data.river, at:'2026-10-14T03:00:00Z'}}, now), null);
  assert.equal(env.river({river:{...data.river, at:'2026-10-14T17:00:00Z'}}, now), null);
  assert.equal(env.river({river:{...data.river, levelCm:null}}, now), null);
  assert.equal(env.river({river:{...data.river, river:''}}, now), null);
  assert.equal(env.river({river:null}, now), null);
});

test('focos: contagem, raio e o mais perto; zero, velho ou inválido não aparece', () => {
  assert.deepEqual(env.describeFires(env.fires(data, now)), {value:'5', note:'Detectados a até 50 km nas últimas 24 h · o mais perto a 41 km · satélites do INPE'});
  assert.match(env.describeFires(env.fires({fires:{...data.fires, count:1, nearestKm:0.3}}, now)).note, /^Detectado a até .* o mais perto a 1 km/);
  assert.equal(env.fires({fires:{...data.fires, count:0, nearestKm:null}}, now), null);
  assert.equal(env.fires({fires:{...data.fires, updatedAt:'2026-10-14T08:00:00Z'}}, now), null);
  assert.equal(env.fires({fires:{...data.fires, count:'5'}}, now), null);
  assert.equal(env.fires({fires:null}, now), null);
});

test('focos: o texto não atribui causa à qualidade do ar', () => {
  const note = env.describeFires(env.fires(data, now)).note;
  assert.doesNotMatch(note, /fumaça|qualidade do ar|queimada/i);
});

test('cartões escondidos no HTML, script versionado no shell e no SW', () => {
  const html = fs.readFileSync('dist/index.html', 'utf8'), sw = fs.readFileSync('dist/sw.js', 'utf8');
  assert.match(html, /<article class="metric station-metric panel card-detail" id="riverLevel"[^>]*hidden>/);
  assert.match(html, /<article class="metric station-metric panel card-detail" id="fireSpots"[^>]*hidden>/);
  assert.match(html, /modules\/environment-now\.js\?v=environment-1/);
  assert.match(sw, /modules\/environment-now\.js\?v=environment-1/);
  assert.match(html, /Programa Queimadas do INPE/);
  assert.match(html, />ANA<\/a>/);
});

// Placar do radar (13/11/2026): a leitura do servidor tem de ser a mesma do app, a hora é a que termina em
// hour_end, lacuna não vira seco e o aeroporto só conta chuva no próprio aeroporto.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load(file) {
  const code = fs.readFileSync(file, 'utf8');
  const names = [...code.matchAll(/^export (?:const|function|async function) (\w+)/gm)].map(match => match[1]);
  const context = vm.createContext({URL, Date, Number, Math, Array, Error, JSON, String, Boolean, Map, crypto:globalThis.crypto});
  return vm.runInContext(`(() => {\n${code.replace(/^export /gm, '')}\nreturn {${names.join(', ')}};\n})()`, context);
}
const radar = load('supabase/functions/_shared/radar-verify.js');
const metar = load('supabase/functions/_shared/metar.js');
const {CAPITALS} = load('supabase/functions/_shared/forecast-verify.js');

// Telha 256 × 256 RGBA com eco (alfa 200) nos pixels pedidos.
function tile(wet) {
  const rgba = new Uint8Array(256 * 256 * 4);
  for (const [x, y] of wet) rgba[(y * 256 + x) * 4 + 3] = 200;
  return rgba;
}
const square = (cx, cy, r) => { const out = []; for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) out.push([x, y]); return out; };

test('mesmo pixel do app para as 27 capitais (lonLatToPixel de radar-probe.js)', () => {
  const app = fs.readFileSync('dist/modules/radar-probe.js', 'utf8');
  const source = app.slice(app.indexOf('function lonLatToPixel'), app.indexOf('function snapshot'));
  const appPixel = vm.runInNewContext(`(${source.trim()})`, {Math, Number});
  assert.equal(CAPITALS.length, 27);
  for (const {name, lat, lon} of CAPITALS) assert.deepEqual({...radar.cityPixel(lon, lat)}, {...appPixel(lon, lat, 7)}, name);
});

test('janela 9 × 9: um quarto com eco molha a cidade; perto da borda desliza ou encolhe como no app', () => {
  // 21 de 81 pixels (≥ 1/4) molha; 20 não.
  const wet21 = square(100, 100, 4).slice(0, 21), wet20 = wet21.slice(0, 20);
  assert.ok(radar.windowShare(tile(wet21), 100, 100) >= radar.WET_SHARE);
  assert.ok(radar.windowShare(tile(wet20), 100, 100) < radar.WET_SHARE);
  // Borda esquerda: no app o canto fica em 0 e a largura continua 9 (x de 0 a 8).
  assert.equal(radar.windowShare(tile(square(4, 100, 4)), 1, 100), 1);
  // Borda direita: a janela encolhe para os pixels que existem (x de 250 a 255, 6 colunas).
  assert.equal(radar.windowShare(tile(square(252, 100, 3).filter(([x]) => x >= 250)), 254, 100), 6 * 7 / (6 * 9));
  assert.equal(radar.windowShare(tile([]), 100, 100), 0);
});

test('quadros da hora que termina em hour_end; menos de 4 quadros não vira hora seca', () => {
  const end = 1794578400;
  const past = Array.from({length:13}, (_, i) => ({time:end - 7200 + i * 600, path:`/v2/radar/${(i + 10).toString(16)}aa`}));
  const frames = radar.framesInHour(past, end);
  assert.deepEqual(frames.map(frame => frame.time), [end - 3000, end - 2400, end - 1800, end - 1200, end - 600, end]);
  assert.deepEqual([...radar.framesInHour([{time:end, path:'https://outro.host/x'}], end)], []);
  assert.equal(radar.radarHour('1302603', 'rainviewer', end, [0, 0.1, null]), null, 'lacuna');
  const row = radar.radarHour('1302603', 'rainviewer', end, [0, 0.3, 0.1, 0.26, null, 0]);
  assert.equal(row.frames, 5); assert.equal(row.wet_frames, 2); assert.equal(row.max_share, 0.3);
  assert.equal(row.hour_end, new Date(end * 1000).toISOString());
  assert.equal(radar.radarHour('manaus', 'rainviewer', end, [0, 0, 0, 0]), null);
  assert.equal(radar.lastHourEnd(Date.parse('2026-11-13T14:12:30Z')), Date.parse('2026-11-13T14:00:00Z') / 1000);
});

test('aeroporto: o mais próximo até 35 km, só boletins da hora; chuva ou garoa no aeroporto, não nas proximidades', () => {
  const end = Date.parse('2026-11-13T14:00:00Z') / 1000, lat = -3.119, lon = -60.022;
  const near = {icaoId:'SBMN', lat:-3.146, lon:-59.986}, far = {icaoId:'SBEG', lat:-3.039, lon:-60.05};
  const report = (station, minutesBefore, wxString) => ({...station, obsTime:end - minutesBefore * 60, wxString});
  // SBMN fica mais perto do ponto do que SBEG: vale o SBMN, mesmo com SBEG relatando chuva.
  const row = radar.airportHour([report(near, 0, 'VCSH'), report(near, 30, ''), report(far, 0, 'RA')], '1302603', lat, lon, end, metar.parseWeather);
  assert.equal(row.icao, 'SBMN'); assert.equal(row.reports, 2); assert.equal(row.rained, false, 'VCSH é nas proximidades');
  assert.equal(radar.airportHour([report(near, 10, '-SHRA')], '1302603', lat, lon, end, metar.parseWeather).rained, true);
  assert.equal(radar.airportHour([report(near, 10, '-DZ BR')], '1302603', lat, lon, end, metar.parseWeather).rained, true);
  assert.equal(radar.airportHour([report(near, 10, 'TS')], '1302603', lat, lon, end, metar.parseWeather).rained, false, 'trovoada sem chuva');
  assert.equal(radar.airportHour([report(near, 61, 'RA')], '1302603', lat, lon, end, metar.parseWeather), null, 'boletim da hora anterior');
  assert.equal(radar.airportHour([report({icaoId:'SBXX', lat:-4, lon:-61}, 5, 'RA')], '1302603', lat, lon, end, metar.parseWeather), null, 'longe demais');
});

test('função e migration: só o cron chama, só totais, nada de URL no log, CSI e não acurácia', () => {
  const fn = fs.readFileSync('supabase/functions/radar-verify/index.ts', 'utf8');
  assert.match(fn, /x-pluvia-cron-secret/);
  assert.doesNotMatch(fn, /console\.(log|warn|error)/, 'erros só por report() com código fixo');
  assert.match(fs.readFileSync('supabase/config.toml', 'utf8'), /\[functions\.radar-verify\]\s*\n#[^\n]*\nverify_jwt = false/);
  assert.match(fs.readFileSync('.github/workflows/deploy-function.yml', 'utf8'), /- radar-verify/);
  const sql = fs.readFileSync('supabase/migrations/20261113180000_radar_verification.sql', 'utf8');
  assert.match(sql, /grant execute on function public\.pluvia_radar_store\(jsonb, jsonb\) to service_role;/);
  assert.doesNotMatch(sql, /pluvia_radar_store\(jsonb, jsonb\) to (anon|authenticated)/);
  assert.match(sql, /revoke all on private\.radar_scores from public, anon, authenticated/);
  for (const column of ['hits', 'misses', 'false_alarms', 'csi_pct', 'pod_pct', 'far_pct']) assert.match(sql, new RegExp(`as ${column}`));
});

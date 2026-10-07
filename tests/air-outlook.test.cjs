const test = require('node:test');
const assert = require('node:assert/strict');
const layer = require('../dist/modules/weather-data-layer.js');

function series(days = 5) {
  const time = [], aqi = [], pm = [];
  const start = Date.parse('2026-10-07T00:00:00Z');
  for (let hour = 0; hour < days * 24; hour++) {
    time.push(new Date(start + hour * 3600000).toISOString().slice(0, 16));
    aqi.push(40 + Math.floor(hour / 24)); pm.push(10 + Math.floor(hour / 24));
  }
  return {time, us_aqi:aqi, pm2_5:pm};
}

test('próximos dias do ar: pior AQI horário e média de PM2,5 por data local, só depois de hoje', () => {
  const hourly = series();
  hourly.us_aqi[24 * 2 + 15] = 130; // pico isolado no dia 09
  const outlook = layer.airOutlook('2026-10-07T12:00', hourly);
  assert.deepEqual(outlook.map(day => [day.date, day.aqiMax, day.pm25Mean]), [['2026-10-08', 41, 11], ['2026-10-09', 130, 12], ['2026-10-10', 43, 13]]);
});

test('dias com menos de 18 horas válidas ficam de fora; ausência não vira ar limpo', () => {
  const hourly = series();
  for (let hour = 24; hour < 24 + 7; hour++) hourly.us_aqi[hour] = null; // dia 08 com 17 horas
  hourly.us_aqi[24 * 2] = 'ruim'; hourly.us_aqi[24 * 2 + 1] = 900;      // inválidos não contam
  const outlook = layer.airOutlook('2026-10-07T12:00', hourly);
  assert.deepEqual(outlook.map(day => day.date), ['2026-10-09', '2026-10-10', '2026-10-11']);
  assert.equal(outlook[0].samples, 22);
  assert.deepEqual(layer.airOutlook('2026-10-07T12:00', {time:hourly.time, us_aqi:hourly.us_aqi.slice(1)}), [], 'séries desalinhadas são rejeitadas');
  assert.deepEqual(layer.airOutlook(null, hourly), []);
});

test('o snapshot normalizado leva a previsão junto da leitura atual', () => {
  const hourly = series();
  const snapshot = layer.normalizeOpenMeteo(require('./support/forecast.cjs').forecast(), {current:{time:'2026-10-07T12:00', us_aqi:35, pm2_5:8}, hourly}, {id:'1302603', name:'Manaus', timezone:'America/Manaus', lat:-3.1, lon:-60});
  assert.equal(snapshot.airQuality.outlook.length, 3);
});

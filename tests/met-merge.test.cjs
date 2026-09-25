const test = require('node:test');
const assert = require('node:assert/strict');
const {merge,weatherCode} = require('../dist/modules/met-merge.js');
const {validateForecast,normalizeOpenMeteo} = require('../dist/modules/weather-data-layer.js');

const hours = ['2026-09-25T09:00','2026-09-25T10:00','2026-09-25T11:00'];
const repeat = value => [value,value,value];
function openMeteo() {return {
  utc_offset_seconds:-14400,
  current:{time:'2026-09-25T10:00',temperature_2m:31,apparent_temperature:36,relative_humidity_2m:70,precipitation:0,weather_code:2,cloud_cover:40,is_day:1,wind_speed_10m:12,wind_direction_10m:90,wind_gusts_10m:25,pressure_msl:1009},
  hourly:{time:hours,temperature_2m:repeat(31),apparent_temperature:repeat(36),relative_humidity_2m:repeat(70),precipitation_probability:repeat(45),precipitation:repeat(.4),rain:repeat(.4),weather_code:repeat(2),cloud_cover:repeat(40),visibility:repeat(10000),wind_speed_10m:repeat(12),wind_gusts_10m:repeat(25),pressure_msl:repeat(1009),uv_index:repeat(8)},
  daily:{time:['2026-09-25'],weather_code:[80],temperature_2m_max:[34],temperature_2m_min:[25],apparent_temperature_max:[39],apparent_temperature_min:[28],precipitation_sum:[5],rain_sum:[5],precipitation_probability_max:[70],uv_index_max:[11],sunrise:['2026-09-25T05:50'],sunset:['2026-09-25T17:58']}
};}
const hour = (local,value,extra={}) => ({time:`2026-09-25T${String(local+4).padStart(2,'0')}:00:00Z`,temperatureC:value,windKmh:7.2,...extra});
const met = {source:'MET Norway',hourly:[hour(10,28,{humidity:64,pressureHpa:1007,cloudCover:75,windDirection:225,precipitationNextHourMm:1.3,symbol:'rainshowers_day'}),hour(11,29,{precipitationNextHourMm:0,symbol:'cloudy'})]};

test('substitui dados do MET no mesmo horário e preserva o que ele não fornece', () => {
  const forecast = openMeteo();
  const result = merge(forecast,met,'America/Manaus',Date.parse('2026-09-25T14:10:00Z'));
  assert.equal(result.used,true);
  assert.equal(result.forecast.current.temperature_2m,28);
  assert.equal(result.forecast.current.wind_speed_10m,7.2);
  assert.equal(result.forecast.current.relative_humidity_2m,64);
  assert.equal(result.forecast.current.pressure_msl,1007);
  assert.equal(result.forecast.current.weather_code,81);
  assert.equal(result.forecast.hourly.temperature_2m[1],28);
  assert.equal(result.forecast.hourly.temperature_2m[2],29);
  assert.equal(result.forecast.hourly.precipitation[2],1.3,'chuva acumulada da hora 10 à 11 corresponde à hora 11');
  assert.equal(result.forecast.hourly.precipitation[1],.4,'a hora anterior permanece Open-Meteo');
  assert.equal(result.forecast.current.apparent_temperature,36);
  assert.equal(result.forecast.hourly.precipitation_probability[2],45);
  assert.equal(result.forecast.daily.temperature_2m_max[0],34,'dia atual incompleto mantém máximo do Open-Meteo');
  assert.equal(result.forecast.pluviaSources.metNorway.includes('hourly.precipitation'),true);
  assert.equal(validateForecast(result.forecast).valid,true);
  assert.equal(normalizeOpenMeteo(result.forecast,null,{id:'1302603',timezone:'America/Manaus'}).source.weather,'met-norway+open-meteo');
  assert.equal(forecast.current.temperature_2m,31,'a resposta original não é modificada');
});

test('mantém valores originais para previsão ausente, obsoleta ou fora do intervalo válido', () => {
  const original = openMeteo();
  assert.equal(merge(original,null,'America/Manaus').forecast,original);
  const obsolete = {source:'MET Norway',hourly:[{...hour(10,27),time:'2026-09-20T14:00:00Z'}]};
  assert.equal(merge(original,obsolete,'America/Manaus',Date.parse('2026-09-25T14:10:00Z')).used,false);
  const partial = {source:'MET Norway',hourly:[hour(10,999,{windKmh:0,humidity:null,cloudCover:Infinity,precipitationNextHourMm:-1})]};
  const result = merge(original,partial,'America/Manaus',Date.parse('2026-09-25T14:10:00Z'));
  assert.equal(result.forecast.current.temperature_2m,31);
  assert.equal(result.forecast.current.wind_speed_10m,0);
  assert.equal(result.forecast.hourly.precipitation[2],.4);
  assert.equal(validateForecast(result.forecast).valid,true);
  const future = merge(original,{source:'MET Norway',hourly:[hour(11,25)]},'America/Manaus',Date.parse('2026-09-25T14:35:00Z'));
  assert.equal(future.forecast.current.temperature_2m,31,'o horário seguinte não substitui o tempo atual');
  assert.equal(future.forecast.hourly.temperature_2m[2],25);
});

test('ícones traduzem os códigos do MET sem transformar noite em dia', () => {
  assert.equal(weatherCode('clearsky_night'),0);
  assert.equal(weatherCode('rainshowers_night'),81);
  assert.equal(weatherCode('unknown_code'),undefined);
});

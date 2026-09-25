const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('supabase/functions/met-forecast/index.js','utf8');
const freshTime = () => new Date(Date.now()+30*60_000).toISOString();
const payload = (precipitation = 1.3) => ({properties:{timeseries:[{
  time:freshTime(), data:{instant:{details:{air_temperature:31,wind_speed:2,wind_speed_of_gust:3,relative_humidity:72,wind_from_direction:90,cloud_area_fraction:50,air_pressure_at_sea_level:1008}},next_1_hours:{details:{precipitation_amount:precipitation},summary:{symbol_code:'rainshowers_day'}}}
}]}});

test('MET Norway é consultado no servidor com identificação, cache e unidades corretas', async () => {
  let handle, requests = [];
  const context = vm.createContext({URL,Date,Response,AbortSignal,Map,Set,
    Deno:{serve:fn=>{handle=fn;}},
    fetch:async (url, options) => {
      requests.push({url:String(url),options});
      return new Response(JSON.stringify(payload()),{status:200,headers:{expires:new Date(Date.now()+600_000).toUTCString()}});
    }
  });
  vm.runInContext(source,context);
  const request = new Request('https://example.supabase.co/functions/v1/met-forecast?lat=-3.1199&lon=-60.0217',{headers:{origin:'https://pluviaweather.com.br','x-real-ip':'192.0.2.8'}});
  const first = await handle(request);
  assert.equal(first.status,200);
  assert.equal(first.headers.get('access-control-allow-origin'),'https://pluviaweather.com.br');
  const data = await first.json();
  assert.equal(data.source,'MET Norway');
  assert.equal(data.temperatureC,31);
  assert.equal(data.windKmh,7.2);
  assert.equal(data.precipitation.amountMm,1.3);
  assert.equal(data.precipitation.hours,1);
  assert.equal(data.hourly.length,1);
  assert.equal(data.hourly[0].humidity,72);
  assert.equal(data.hourly[0].windDirection,90);
  assert.equal(data.hourly[0].gustKmh,10.8);
  assert.equal(data.hourly[0].pressureHpa,1008);
  assert.equal(data.hourly[0].precipitationNextHourMm,1.3);
  assert.equal(data.hourly[0].symbol,'rainshowers_day');
  assert.match(requests[0].url,/lat=-3\.12&lon=-60\.02/);
  assert.match(requests[0].options.headers['User-Agent'],/PLUVIA\/1\.0/);
  assert.match(first.headers.get('cache-control'),/max-age=/);
  const second = await handle(request);
  assert.equal(second.status,200);
  assert.equal(requests.length,1,'consulta repetida deve usar o cache do servidor');
  const bad = await handle(new Request('https://example.supabase.co/functions/v1/met-forecast?lat=52&lon=13',{headers:{origin:'https://pluviaweather.com.br'}}));
  assert.equal(bad.status,400);
  const foreign = await handle(new Request(request.url,{headers:{origin:'https://site-aleatorio.example'}}));
  assert.equal(foreign.status,403);
  const preflight = await handle(new Request(request.url,{method:'OPTIONS',headers:{origin:'https://pluviaweather.com.br'}}));
  assert.equal(preflight.status,204);
});

test('fonte secundária exibe ausências e falhas sem fabricar probabilidade de chuva', async () => {
  let handle;
  const context = vm.createContext({URL,Date,Response,AbortSignal,Map,Set,Deno:{serve:fn=>{handle=fn;}},
    fetch:async () => new Response(JSON.stringify({properties:{timeseries:[{time:freshTime(),data:{instant:{details:{air_temperature:27,wind_speed:0}}}}]}}),{status:200})
  });
  vm.runInContext(source,context);
  const url='https://example.supabase.co/functions/v1/met-forecast?lat=-3.12&lon=-60.02';
  const response=await handle(new Request(url));
  assert.equal(response.status,200);
  assert.equal((await response.json()).precipitation,null);
  vm.runInContext('fetch = async () => new Response("{}",{status:503})',context);
  const failure=await handle(new Request(url.replace('-60.02','-60.03')));
  assert.equal(failure.status,502);
});

test('o cliente consulta o MET Norway e apresenta a atribuição da previsão combinada', async () => {
  const service = require('../dist/modules/weather-services.js');
  const calls=[];
  const clone=service.createServices({client:{getJson:async (url,options)=>{calls.push({url,options});return {source:'MET Norway'};}}});
  const city={lat:-3.1199,lon:-60.0217,timezone:'America/Manaus'};
  assert.equal((await clone.metNorway.getForecast(city)).source,'MET Norway');
  assert.match(calls[0].url,/lat=-3\.12&lon=-60\.02/);
  assert.equal(calls[0].options.timeoutMs,11000);
  assert.equal(clone.weather.source,'open-meteo');
  const html=fs.readFileSync('dist/index.html','utf8');
  assert.doesNotMatch(html,/SEGUNDA PREVISÃO/);
  assert.doesNotMatch(html,/id="forecastSourceNote"/);
  assert.match(html,/creativecommons\.org\/licenses\/by\/4\.0/);
  const app=fs.readFileSync('dist/app.js','utf8');
  assert.match(app,/fetchForecast\(city, revision\), services\.airQuality\.getCurrent\(city\), Promise\.resolve\(\)\.then\(\(\) => services\.metNorway\.getForecast\(city\)\)/);
  assert.match(app,/loadWeather\(revision\), loadInmetAlerts\(revision\)/);
  assert.doesNotMatch(app,/yesterdayComparison/);
  assert.match(app,/if \(revision !== cityRevision\) return;/);
});

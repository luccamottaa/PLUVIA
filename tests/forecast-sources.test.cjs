// Fontes extras da previsão (novembro/2026): modelo de chuva por cidade (placar) e "Testar Tomorrow.io".
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sources=require('../dist/modules/forecast-sources.js');
const time=require('../dist/modules/city-time.js');

const city={id:'1302603',name:'Manaus',lat:-3.119,lon:-60.022,timezone:'America/Manaus'};
const parse=(value,place)=>time.parse(value,place);
const HOUR=3600e3;
const times=['2026-11-09T10:00','2026-11-09T11:00','2026-11-09T12:00','2026-11-09T13:00'];
function forecast(){
  return {current:{time:'2026-11-09T11:15',temperature_2m:30,apparent_temperature:34,relative_humidity_2m:70,weather_code:2,wind_speed_10m:8,wind_direction_10m:90,wind_gusts_10m:20,pressure_msl:1010,cloud_cover:40},
    hourly:{time:times.slice(),temperature_2m:[29,30,31,32],apparent_temperature:[33,34,35,36],precipitation:[0,0,0,0],rain:[0,0,0,0],precipitation_probability:[10,10,10,10],weather_code:[2,2,2,2],
      relative_humidity_2m:[70,70,70,70],wind_speed_10m:[8,8,8,8],wind_gusts_10m:[20,20,20,20],wind_direction_10m:[90,90,90,90],pressure_msl:[1010,1010,1010,1010],uv_index:[5,6,7,8],visibility:[20000,20000,20000,20000],cloud_cover:[40,40,40,40],cape:[100,100,100,100]},
    daily:{time:['2026-11-09'],temperature_2m_max:[33]}};
}
// Manaus é UTC−4: 11:00 local = 15:00 UTC.
const utc=local=>new Date(time.parse(local,city)).toISOString();

test('troca de chuva: só com horas iguais e as duas séries completas; o resto não muda',()=>{
  const other={hourly:{time:times.slice(),precipitation:[0,1.2,3,0],precipitation_probability:[20,60,80,30]}};
  const swapped=sources.swapRain(forecast(),other,'gfs_seamless');
  assert.deepEqual(swapped.hourly.precipitation,[0,1.2,3,0]);
  assert.deepEqual(swapped.hourly.precipitation_probability,[20,60,80,30]);
  assert.deepEqual(swapped.hourly.temperature_2m,[29,30,31,32]);
  assert.equal(swapped.pluviaRainModel,'gfs_seamless');
  assert.equal(sources.swapRain(forecast(),{hourly:{...other.hourly,precipitation:[0,null,3,0]}},'gfs_seamless'),null);
  assert.equal(sources.swapRain(forecast(),{hourly:{...other.hourly,time:times.slice(1)}},'gfs_seamless'),null);
});

test('lista de vencedores: só id IBGE e modelos do Open-Meteo (nunca tomorrow_io)',()=>{
  assert.deepEqual({...sources.cleanModels({'3550308':'ecmwf_ifs025','1302603':'tomorrow_io','x':'gfs_seamless','4106902':'best_match'})},{'3550308':'ecmwf_ifs025'});
  assert.deepEqual({...sources.cleanModels(null)},{});
});

test('Tomorrow.io por cima: instantâneo do ponto T, chuva/chance/código da hora que termina em T; ausente fica',()=>{
  const data={current:{time:utc('2026-11-09T11:00'),temperatureC:27,apparentC:30,humidity:88,windKmh:12,gustKmh:30,windDirection:180,pressureHpa:1008,cloudCover:90,code:63},
    hourly:[
      {time:utc('2026-11-09T10:00'),temperatureC:26,rainMm:2.5,probability:90,code:63,visibilityKm:4,humidity:null},
      {time:utc('2026-11-09T11:00'),temperatureC:27,rainMm:0.2,probability:40,code:61,visibilityKm:8},
      {time:utc('2026-11-09T12:00'),temperatureC:null,rainMm:null,probability:null,code:null},
    ]};
  const out=sources.overlayTomorrow(forecast(),data,city,parse);
  assert.equal(out.pluviaSource,'tomorrow');
  assert.deepEqual(out.hourly.temperature_2m,[26,27,31,32]);
  assert.deepEqual(out.hourly.precipitation,[0,2.5,0.2,0]);
  assert.deepEqual(out.hourly.rain,[0,2.5,0.2,0]);
  assert.deepEqual(out.hourly.precipitation_probability,[10,90,40,10]);
  assert.deepEqual(out.hourly.weather_code,[2,63,61,2]);
  assert.deepEqual(out.hourly.visibility,[4000,8000,20000,20000]);
  assert.deepEqual(out.hourly.relative_humidity_2m,[70,70,70,70]);
  assert.deepEqual(out.hourly.cape,[100,100,100,100]);
  assert.equal(out.current.temperature_2m,27);
  assert.equal(out.current.weather_code,63);
  assert.equal(out.daily.temperature_2m_max[0],33);
  assert.equal(sources.overlayTomorrow(forecast(),{hourly:[]},city,parse),null);
});

function harness({map={}, tomorrow, fail}={}){
  const store=new Map(), calls=[];
  const fetchJson=async url=>{
    calls.push(url);
    if(url.includes('pluvia_rain_models'))return map;
    if(url.includes('tomorrow-forecast')){if(fail)throw Object.assign(new Error('x'),{code:fail});return tomorrow;}
    return {hourly:{time:times.slice(),precipitation:[0,1,2,3],precipitation_probability:[50,50,50,50]}};
  };
  let clock=Date.parse('2026-11-09T15:20:00Z');
  const api=sources.createSources({fetchJson,now:()=>clock,parse,forecastUrl:()=>'https://api.open-meteo.com/v1/forecast?latitude=-3.119&longitude=-60.022&timezone=America%2FManaus&current=x&hourly=temperature_2m&daily=y&past_hours=24&forecast_days=8',store:()=>({getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)})});
  return {api,calls,store,advance:ms=>{clock+=ms;}};
}

test('sem lista guardada a primeira abertura não espera nem troca; com vencedor, pede só chuva ao modelo',async()=>{
  const h=harness({map:{'1302603':'icon_seamless'}});
  assert.equal(h.api.start(city),null);
  await new Promise(r=>setImmediate(r));
  const task=h.api.start(city);
  assert.ok(task);
  await new Promise(r=>setImmediate(r));
  const url=new URL(h.calls.find(u=>u.includes('models=')));
  assert.equal(url.searchParams.get('models'),'icon_seamless');
  assert.equal(url.searchParams.get('hourly'),'precipitation,precipitation_probability');
  assert.equal(url.searchParams.get('current'),null);
  assert.equal(url.searchParams.get('past_hours'),'24');
  const shown=await h.api.apply(forecast(),task,{waitMs:200});
  assert.deepEqual(shown.hourly.precipitation,[0,1,2,3]);
  assert.equal(shown.pluviaRainModel,'icon_seamless');
});

test('teste do Tomorrow.io: desligado não consulta; 429 volta ao Open-Meteo e espera antes de tentar de novo',async()=>{
  const h=harness({fail:'rate_limited'});
  assert.equal(h.api.start(city),null);
  assert.ok(!h.calls.some(u=>u.includes('tomorrow-forecast')));
  h.store.set('pluvia-tomorrow-test','1');
  const shown=await h.api.apply(forecast(),h.api.start(city),{waitMs:200});
  assert.equal(shown.pluviaTomorrow,'limited');
  assert.equal(shown.pluviaSource,undefined);
  assert.deepEqual(shown.hourly.temperature_2m,[29,30,31,32]);
  const before=h.calls.filter(u=>u.includes('tomorrow-forecast')).length;
  await h.api.apply(forecast(),h.api.start(city),{waitMs:200});
  assert.equal(h.calls.filter(u=>u.includes('tomorrow-forecast')).length,before,'dentro da espera não consulta');
  h.advance(31*60e3);
  await h.api.apply(forecast(),h.api.start(city),{waitMs:200});
  assert.equal(h.calls.filter(u=>u.includes('tomorrow-forecast')).length,before+1,'passada a espera, tenta de novo');
});

test('teste do Tomorrow.io ligado e respondendo: previsão por cima e cache de 30 min',async()=>{
  const tomorrow={source:'Tomorrow.io',current:null,hourly:[{time:utc('2026-11-09T11:00'),temperatureC:25}]};
  const h=harness({tomorrow});
  h.store.set('pluvia-tomorrow-test','1');
  const shown=await h.api.apply(forecast(),h.api.start(city),{waitMs:200});
  assert.equal(shown.pluviaSource,'tomorrow');
  assert.equal(shown.hourly.temperature_2m[1],25);
  await h.api.apply(forecast(),h.api.start(city),{waitMs:200});
  assert.equal(h.calls.filter(u=>u.includes('tomorrow-forecast')).length,1);
});

test('função tomorrow-forecast: código WMO, m/s → km/h, ausente vira null e janela de horas',()=>{
  const src=fs.readFileSync('supabase/functions/_shared/tomorrow-forecast.js','utf8').replace(/^export /gm,'');
  const t=vm.runInNewContext(src+';({normalizeTomorrow,reading,WMO,TEST_FIELDS})',{Date,Number,Math,Array,Object,JSON});
  const now=Date.parse('2026-11-09T15:20:00Z');
  const json={data:{timelines:[
    {timestep:'current',intervals:[{startTime:'2026-11-09T15:20:00Z',values:{temperature:28.4,windSpeed:5,weatherCode:4001,humidity:'80'}}]},
    {timestep:'1h',intervals:[
      {startTime:'2026-11-09T15:00:00Z',values:{temperature:28,rainAccumulation:1.2,weatherCode:4200,visibility:9.9}},
      {startTime:'2026-11-09T16:00:00Z',values:{temperature:null,precipitationIntensity:0.4,weatherCode:9999}},
      {startTime:'2026-11-20T16:00:00Z',values:{temperature:30}},
    ]}]}};
  const out=t.normalizeTomorrow(json,now);
  assert.equal(out.current.windKmh,18);
  assert.equal(out.current.code,63);
  assert.equal(out.current.humidity,null);
  assert.equal(out.hourly.length,2);
  assert.equal(out.hourly[0].code,61);
  assert.equal(out.hourly[1].code,null);
  assert.equal(out.hourly[1].rainMm,0.4);
  assert.equal(out.hourly[1].temperatureC,null);
  assert.equal(t.normalizeTomorrow({data:{timelines:[]}},now),null);
  assert.ok(t.TEST_FIELDS.includes('weatherCode'));
});

test('dias refeitos a partir das horas do Tomorrow.io: só dia com as 24 horas; nascer/pôr ficam (1.73.4)',()=>{
  const day=Array.from({length:24},(_,h)=>`2026-11-10T${String(h).padStart(2,'0')}:00`);
  const allTimes=[...day,'2026-11-11T00:00'];
  const fill=(v)=>allTimes.map(()=>v);
  const base={current:{time:'2026-11-10T08:00',temperature_2m:25},
    hourly:{time:allTimes,temperature_2m:fill(25),apparent_temperature:fill(27),precipitation:fill(0),rain:fill(0),precipitation_probability:fill(10),weather_code:fill(1),uv_index:fill(2)},
    daily:{time:['2026-11-10','2026-11-11'],temperature_2m_max:[25,26],temperature_2m_min:[25,24],apparent_temperature_max:[27,28],apparent_temperature_min:[27,26],
      precipitation_sum:[0,0],rain_sum:[0,0],precipitation_probability_max:[10,10],uv_index_max:[2,2],weather_code:[1,1],sunrise:['2026-11-10T05:50','2026-11-11T05:50']}};
  // Tomorrow.io das 12:00 às 15:00 de 10/11: mais quente, com chuva e trovoada.
  const hours=[[12,33,2.0,80,95,9],[13,34,1.5,70,63,8],[14,31,0,40,3,5],[15,30,0,20,2,3]];
  const data={hourly:hours.map(([h,t,mm,p,code,uv])=>({time:utc(`2026-11-10T${h}:00`),temperatureC:t,apparentC:t+4,rainMm:mm,probability:p,code,uvIndex:uv}))};
  const out=sources.overlayTomorrow(base,data,city,parse);
  assert.equal(out.daily.temperature_2m_max[0],34,'máxima vem das horas do Tomorrow.io');
  assert.equal(out.daily.temperature_2m_min[0],25,'mínima das horas da madrugada (Open-Meteo)');
  assert.equal(out.daily.apparent_temperature_max[0],38);
  assert.equal(out.daily.precipitation_sum[0],3.5,'chuva da hora que termina em T: 2,0 (13h) + 1,5 (14h)');
  assert.equal(out.daily.precipitation_probability_max[0],80);
  assert.equal(out.daily.uv_index_max[0],9);
  assert.equal(out.daily.weather_code[0],95,'condição mais severa do dia');
  assert.equal(out.daily.temperature_2m_max[1],26,'dia sem as 24 horas fica como estava');
  assert.deepEqual(out.daily.sunrise,base.daily.sunrise,'nascer/pôr do sol continuam do Open-Meteo');
  assert.equal(out.pluviaTomorrowDays,1);
  assert.equal(base.daily.temperature_2m_max[0],25,'não mexe na previsão original');
});

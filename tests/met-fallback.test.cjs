const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const metMerge=require('../dist/modules/met-merge.js'),weatherData=require('../dist/modules/weather-data-layer.js'),time=require('../dist/modules/city-time.js');
const sunContext=vm.createContext({});vm.runInContext(fs.readFileSync('dist/vendor/suncalc.js','utf8'),sunContext);
const sun=sunContext.PLUVIA.sun;
const city={id:'1302603',name:'Manaus',lat:-3.119,lon:-60.022,timezone:'America/Manaus'};
const now=Date.parse('2026-10-06T14:20:00-04:00');
// MET: série horária por ~60h e depois passos de 6h, como a API real.
function met({hours=60,rainAt={}}={}) {
 const start=Date.parse('2026-10-06T18:00:00Z'),hourly=[];
 for(let i=0;i<hours;i++) hourly.push(point(start+i*3600000,i));
 for(let i=hours+5;i<hours+45;i+=6) hourly.push(point(start+i*3600000,i));
 function point(at,i){return {time:new Date(at).toISOString(),temperatureC:26+Math.sin(i/24*Math.PI*2)*6,humidity:70,pressureHpa:1010,cloudCover:60,windKmh:9,gustKmh:20,windDirection:90,precipitationNextHourMm:rainAt[i]??0,symbol:rainAt[i]?'rain':'partlycloudy_day'};}
 return {source:'MET Norway',time:new Date(start).toISOString(),hourly};
}
test('MET sozinho vira previsão reduzida: só a parte horária contínua, ausências como null',()=>{
 const data=metMerge.toForecast(met({rainAt:{3:2.4}}),city,{sun,now});
 assert.ok(data.pluviaReduced);
 assert.equal(data.hourly.time.length,60,'passos de 6h ficam de fora');
 assert.equal(data.hourly.time[0],'2026-10-06T14:00');
 for(const key of ['apparent_temperature','precipitation_probability','uv_index','visibility']) assert.ok(data.hourly[key].every(v=>v===null),key);
 assert.equal(data.current.apparent_temperature,null);
 assert.equal(data.hourly.precipitation[0],null,'primeiro intervalo sem acumulado anterior');
 assert.equal(data.hourly.precipitation[4],2.4,'next_1_hours do ponto 3 pertence ao intervalo que termina na hora 4');
 assert.equal(data.hourly.weather_code[3],63);
 assert.equal(data.current.time,'2026-10-06T14:00');assert.equal(data.current.is_day,1);
 assert.equal(data.daily.time[0],'2026-10-06');
 assert.equal(data.daily.temperature_2m_max[0],null,'hoje incompleto: sem máxima inventada');
 assert.ok(Number.isFinite(data.daily.temperature_2m_max[1]),'amanhã completo tem máxima');
 assert.ok(data.daily.time.length<=3);
 assert.match(data.daily.sunrise[1],/^2026-10-07T0[56]:\d\d$/,'nascer calculado no fuso municipal');
 assert.equal(weatherData.validateForecast(data,{reduced:true}).valid,true,weatherData.validateForecast(data,{reduced:true}).errors.join());
 assert.equal(weatherData.validateForecast(data).valid,false,'modo normal continua exigindo os campos completos');
});
test('previsão reduzida recusa série antiga, curta ou de outra fonte',()=>{
 assert.equal(metMerge.toForecast(met(),city,{sun,now:now+5*3600000}).current.time,'2026-10-06T19:00');
 assert.equal(metMerge.toForecast(met(),city,{sun,now:now-4*3600000}),null,'sem ponto perto de agora');
 assert.equal(metMerge.toForecast(met({hours:2}),city,{sun,now}),null);
 assert.equal(metMerge.toForecast({...met(),source:'outra'},city,{sun,now}),null);
 const broken=met();broken.hourly[0].temperatureC='26';
 assert.equal(weatherData.validateForecast(metMerge.toForecast(broken,city,{sun,now}),{reduced:true}).valid,false,'temperatura atual inválida não passa');
});

const source=fs.readFileSync('dist/app.js','utf8');
function setup({saved=null}={}) {
 const paints=[],errors=[],node={setAttribute(){},classList:{remove(){},add(){}},textContent:'',innerHTML:''};
 const metPayload=met();
 const context=vm.createContext({activeCity:city,cityRevision:0,displayedWeather:null,$:()=>node,errorTimer:null,clearTimeout,setTimeout:()=>0,document:{hidden:false},Date:{now:()=>now},
  services:{airQuality:{getCurrent:async()=>null},metNorway:{getForecast:async()=>metPayload}},
  fetchForecast:async()=>{throw Object.assign(new Error('fora do ar'),{code:'provider_unavailable',retryable:true});},
  weatherData,cached:()=>saved,cache(){},markWeatherUnavailable(){},renderVisibility(){},
  render:(...args)=>{paints.push(args);context.displayedWeather={forecast:args[0],fromCache:args[2]};},
  cityDate:value=>new Date(time.parse(value,city)),validForecast:weatherData.validateForecast,
  PLUVIA:{sources:{set(){}},sun,metMerge:{merge:original=>({forecast:original,used:false}),toForecast:(m,c,o)=>metMerge.toForecast(m,c,{...o,now})}}});
 vm.runInContext(source.slice(source.indexOf('async function loadWeather('),source.indexOf('async function refreshAll(')),context);
 vm.runInContext('showWeatherError=message=>errors.push(message)',Object.assign(context,{errors}));
 return {context,paints,errors};
}
test('Open-Meteo fora do ar e sem dados salvos: mostra a previsão reduzida do MET e avisa',async()=>{
 const s=setup();
 assert.equal(await s.context.loadWeather(),true);
 assert.equal(s.paints.length,1);assert.ok(s.paints[0][0].pluviaReduced);assert.equal(s.paints[0][2],false);
 assert.match(s.errors[0],/previsão reduzida do MET Norway/);
});
test('dados salvos recentes (até 3h) têm prioridade sobre a previsão reduzida',async()=>{
 const forecast=require('./support/forecast.cjs').forecast();
 const s=setup({saved:{at:now-3600000,weatherAt:now-3600000,data:{forecast,air:null}}});
 assert.equal(await s.context.loadWeather(),false);
 assert.equal(s.paints.length,1);assert.equal(s.paints[0][0],forecast);assert.equal(s.paints[0][2],true,'renderizado como dado salvo');
 assert.match(s.errors[0],/última previsão salva/);
});

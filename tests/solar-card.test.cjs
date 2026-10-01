const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const time=require('../dist/modules/city-time.js');
const {create}=require('../dist/modules/sky-atmosphere.js');
const {forecast,city}=require('./support/forecast.cjs');
const app=fs.readFileSync('dist/app.js','utf8');
function setup() {
 const nodes=new Map(),el=id=>{if(!nodes.has(id)) nodes.set(id,{style:{},hidden:false,textContent:''});return nodes.get(id);};
 const sky=create();const data=forecast();data.daily.sunrise[1]='2026-10-02T05:45';data.daily.sunset[1]='2026-10-02T17:30';
 sky.apply(2,1,data.daily,city,Date.parse('2026-10-01T12:00-04:00'));
 const context=vm.createContext({PLUVIA:{time,sky},activeCity:city,$:el,document:{querySelector:()=>({classList:{toggle(){}}})},cityDate:value=>new Date(time.parse(value,city)),formatUpdateTime:at=>new Intl.DateTimeFormat('pt-BR',{timeZone:city.timezone,hour:'2-digit',minute:'2-digit'}).format(at)});
 vm.runInContext(app.slice(app.indexOf('function solarArcPoint('),app.indexOf('function setDataStatus(')),context);
 return {context,nodes,data};
}
test('card solar escolhe o dia local atual, oculta o sol à noite e acompanha o céu',()=>{
 const {context,nodes,data}=setup();
 context.renderSun(data.daily,Date.parse('2026-10-02T00:00-04:00'));
 assert.equal(nodes.get('sunrise').textContent,'05:45');assert.equal(nodes.get('sunset').textContent,'17:30');assert.equal(nodes.get('sunDot').hidden,true);
 context.renderSun(data.daily,Date.parse('2026-10-02T12:00-04:00'));assert.equal(nodes.get('sunDot').hidden,false);
 context.renderSun(data.daily,Date.parse('2026-10-02T17:30-04:00'));assert.equal(nodes.get('sunDot').hidden,true);
 context.renderSun(data.daily,Date.parse('2026-11-01T12:00-04:00'));assert.equal(nodes.get('sunrise').textContent,'--:--');
});
test('previsão diária não chama ontem de Hoje nem cria zero para chuva ausente',()=>{
 const list={innerHTML:''},data=forecast();
 data.daily.precipitation_sum[7]=null;data.daily.precipitation_probability_max[7]=null;
 const context=vm.createContext({PLUVIA:{time},activeCity:city,$:()=>list,fmt:value=>Number.isFinite(value)?String(value):'--',weather:()=>['Nublado'],weatherIcons:{markup:()=>'',markupName:()=>''}});
 vm.runInContext(app.slice(app.indexOf('function renderForecast('),app.indexOf('function solarArcPoint(')),context);
 context.renderForecast(data.daily,30,Date.parse('2026-10-02T00:01-04:00'));
 assert.equal((list.innerHTML.match(/<strong>Hoje/g)||[]).length,1);
 assert.doesNotMatch(list.innerHTML,/01 de out/);assert.match(list.innerHTML,/Previsão de chuva indisponível/);assert.doesNotMatch(list.innerHTML,/NaN|Infinity/);
});

test('relógio avança previsão e card solar à meia-noite sem novo request',()=>{
 const calls=[],data=forecast('2026-10-01',23),at=Date.parse('2026-10-02T00:00:00-04:00');
 const saved={forecast:data,air:null,hour:1,day:'2026-10-01',weatherAt:at-3600000,airAt:null,fromCache:true,cacheAt:at-3600000};
 const context=vm.createContext({activeCity:city,displayedWeather:saved,PLUVIA:{time},weatherData:require('../dist/modules/weather-data-layer.js'),$:()=>({}),document:{hidden:false},updateSolarAtmosphere(){},selectCurrentHour:times=>time.hourIndex(times,city,at),render:(...args)=>calls.push(args),renderSun(){},Date:class extends Date {constructor(value){super(value??at);}static now(){return at;}}});
 vm.runInContext(app.slice(app.indexOf('function updateClock('),app.indexOf('function cityDate(')),context);context.updateClock();
 assert.equal(calls.length,1);assert.equal(calls[0][0],data);assert.equal(calls[0][4].weatherAt,saved.weatherAt);
});

test('amanhecer entre duas horas atualiza ícones sem renovar a idade do dado',()=>{
 const data=forecast(),at=Date.parse('2026-10-01T06:01-04:00'),calls=[];
 const saved={forecast:data,air:null,hour:1,day:'2026-10-01',phase:'night',weatherAt:at-3600000,airAt:null};
 const context=vm.createContext({activeCity:city,displayedWeather:saved,PLUVIA:{time},weatherData:require('../dist/modules/weather-data-layer.js'),$:()=>({}),document:{hidden:false},updateSolarAtmosphere:()=>({phase:'day'}),selectCurrentHour:()=>1,render:(...args)=>calls.push(args),renderSun(){},Date:class extends Date{constructor(value){super(value??at);}}});
 vm.runInContext(app.slice(app.indexOf('function updateClock('),app.indexOf('function cityDate(')),context);context.updateClock();
 assert.equal(calls.length,1);assert.equal(calls[0][4].weatherAt,saved.weatherAt);
});

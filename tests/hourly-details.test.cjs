const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
const moon = require('../dist/vendor/suncalc.js');
const moonView = require('../dist/modules/moon-view.js');
const hourlySource = app.slice(app.indexOf('let hourlyMode = '), app.indexOf('\nfunction renderForecast('));
const detailsSource = app.slice(app.indexOf('function renderVisibility('), app.indexOf('\nfunction cache(', app.indexOf('function renderVisibility(')));
const hours = ['2026-09-24T16:00','2026-09-24T17:00','2026-09-24T18:00'];
const data = {
  time:hours, temperature_2m:[27,29,28], weather_code:[1,2,3],
  wind_speed_10m:[0,15,null], wind_gusts_10m:[5,25,30], wind_direction_10m:[0,90,null],
  precipitation_probability:[0,35,80], precipitation:[0,0.3,2]
};

function screen() {
  const chart = {innerHTML:'',scrollLeft:12,dataset:{},setAttribute(name,value){this[name]=value;}};
  const elements = {
    rainChart:chart, dryWindow:{textContent:''}, visibilityValue:{textContent:''},
    visibilityNote:{textContent:''}, visibilityBadge:{hidden:true,textContent:'',dataset:{}},
    moonIcon:{d:'',setAttribute(name,value){this[name]=value;}},
    moonDisc:{visibility:'hidden',setAttribute(name,value){this[name]=value;}}, moonPhase:{textContent:''}
  };
  const ctx = {
    $:id => elements[id], activeCity:{name:'Manaus'},
    cityDate:value=>new Date(value+'Z'),formatUpdateTime:at=>new Date(at).toISOString().slice(11,16),
    fmt:(value,digits=0) => Number.isFinite(value) ? value.toFixed(digits).replace('.',',') : '--',
    shortTime:time => time.slice(11,16), windDirection:deg => ({0:'N',90:'L'})[deg],
    weather:() => ['Céu variável'], forecastIsDay:() => true,
    weatherIcons:{markup:() => '<img alt="Tempo">'},
    findDryWindow:() => 'Sem chuva nas próximas horas', PLUVIA:{moon}
  };
  const hourly = vm.runInNewContext(`${hourlySource}\n({renderHourly,setMode:mode=>hourlyMode=mode})`,ctx);
  ctx.PLUVIA.moonView = moonView.create({document:{getElementById:id=>elements[id]},
    getIllumination:date=>ctx.PLUVIA.moon?.getMoonIllumination(date)});
  const details = {...vm.runInNewContext(`${detailsSource}\n({renderVisibility})`,ctx),
    renderMoon:at=>ctx.PLUVIA.moonView.update(at)};
  return {hourly,details,elements,ctx};
}

test('o mesmo gráfico alterna tempo, chuva e vento sem inventar leituras ausentes', () => {
  const {hourly,elements} = screen();
  hourly.renderHourly(data,0,{time:['2026-09-24']});
  assert.match(elements.rainChart.innerHTML,/class="temp-bar"/);
  assert.match(elements.rainChart.innerHTML,/27°/);
  hourly.setMode('rain'); hourly.renderHourly(data,0,{time:['2026-09-24']});
  assert.match(elements.rainChart.innerHTML,/data-prob="80"/);
  assert.match(elements.rainChart.innerHTML,/2,0 mm/);
  hourly.setMode('wind'); hourly.renderHourly(data,0,{time:['2026-09-24']});
  assert.match(elements.rainChart.innerHTML,/Raj\. 25/);
  assert.match(elements.rainChart.innerHTML,/transform:rotate\(90deg\)/);
  assert.match(elements.rainChart.innerHTML,/--<\/span>/);
  assert.equal(elements.rainChart.scrollLeft,12);
  assert.match(elements.rainChart['aria-label'],/velocidade em km\/h/);
  hourly.renderHourly({...data,wind_speed_10m:[null,null,null]},0,{time:['2026-09-24']});
  assert.match(elements.rainChart.innerHTML,/Vento por hora indisponível/);
});

test('visibilidade baixa aparece no resumo, dado ausente fica indisponível', () => {
  const {details,elements} = screen();
  details.renderVisibility(800);
  assert.equal(elements.visibilityValue.textContent,'800 m');
  assert.equal(elements.visibilityBadge.hidden,false);
  assert.equal(elements.visibilityBadge.dataset.level,'low');
  details.renderVisibility(10000,true);
  assert.equal(elements.visibilityValue.textContent,'10 km');
  assert.equal(elements.visibilityBadge.hidden,true);
  details.renderVisibility(null);
  assert.equal(elements.visibilityValue.textContent,'--');
  assert.match(elements.visibilityNote.textContent,/indisponível/);
});
test('eventos da timeline reutilizam a fonte solar, respeitam intervalo e mostram sensação',()=>{
 const {hourly,elements,ctx}=screen();
 ctx.PLUVIA.sky={dayAt:()=>({rise:Date.parse('2026-09-24T06:00Z'),set:Date.parse('2026-09-24T17:45Z')})};
 hourly.renderHourly({...data,apparent_temperature:[32,33,31]},0,{time:['2026-09-24']});
 const chart=elements.rainChart.innerHTML;
 assert.match(chart,/Sens\. 32°/);assert.match(chart,/Pôr do sol 17:45/);assert.equal((chart.match(/Pôr do sol/g)||[]).length,1);
 ctx.PLUVIA.sky.dayAt=()=>null;hourly.renderHourly(data,0,{});assert.doesNotMatch(elements.rainChart.innerHTML,/Pôr do sol/);
});

test('a fase da Lua segue as efemérides de setembro de 2026', () => {
  const {details,elements} = screen();
  for (const [date,label] of [
    ['2026-09-11T03:27:00Z','Lua nova'],
    ['2026-09-18T20:44:00Z','Quarto crescente'],
    ['2026-09-26T16:49:00Z','Lua cheia'],
    ['2026-10-03T13:25:00Z','Quarto minguante']
  ]) {
    details.renderMoon(new Date(date));
    assert.equal(elements.moonPhase.textContent,label);
  }
  assert.match(html,/data-hourly-mode="conditions"[\s\S]+data-hourly-mode="rain"[\s\S]+data-hourly-mode="wind"/);
  assert.match(html,/id="moonPhase"/);
  assert.match(html,/id="visibilityValue"/);
});

test('a lua texturizada acompanha as oito fases e desaparece sem dados', () => {
  const {details,elements,ctx} = screen();
  const paths = new Set();
  ctx.PLUVIA.moon = {getMoonIllumination:date => ({phase:date.getUTCHours() / 8})};
  for (let hour = 0; hour < 8; hour++) {
    details.renderMoon(new Date(`2026-09-24T0${hour}:00:00Z`));
    paths.add(elements.moonIcon.d);
  }
  assert.equal(paths.size,8);
  assert.equal(elements.moonIcon.d.includes('A34 34'),true);
  assert.equal(elements.moonDisc.visibility,'visible');
  ctx.PLUVIA.moon = {getMoonIllumination:() => ({phase:NaN})};
  details.renderMoon(new Date());
  assert.equal(elements.moonIcon.d,'');
  assert.equal(elements.moonDisc.visibility,'hidden');
  assert.match(html,/<svg class="moon-phase-icon"[^>]*>[\s\S]*?<use href="#moonDisc"/);
  assert.match(html,/href="\.\/assets\/moon-surface\.webp"/);
});

test('a iluminação varia dentro da mesma fase e respeita os quartos e extremos', () => {
  const {details,elements,ctx} = screen();
  let phase = .64;
  ctx.PLUVIA.moon = {getMoonIllumination:() => ({phase})};
  details.renderMoon();
  const before = elements.moonIcon.d;
  const name = elements.moonPhase.textContent;
  phase = .65; details.renderMoon();
  assert.equal(elements.moonPhase.textContent,name);
  assert.notEqual(elements.moonIcon.d,before);
  for (phase of [.25,.75]) {
    details.renderMoon();
    assert.match(elements.moonIcon.d,/L40 6Z$/);
    assert.doesNotMatch(elements.moonIcon.d,/NaN|Infinity/);
  }
  for (phase of [0,1]) {
    details.renderMoon();
    assert.equal(elements.moonIcon.d,'');
    assert.equal(elements.moonDisc.visibility,'visible');
    assert.equal(elements.moonPhase.textContent,'Lua nova');
  }
  for (phase of [NaN,-.1,1.1]) {
    details.renderMoon();
    assert.equal(elements.moonIcon.d,'');
    assert.equal(elements.moonDisc.visibility,'hidden');
  }
  phase = .5; details.renderMoon();
  assert.equal(elements.moonDisc.visibility,'visible');
  assert.equal(elements.moonPhase.textContent,'Lua cheia');
});

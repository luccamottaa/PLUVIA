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
    rainChart:chart, dryWindow:{textContent:''}, hourlyChartLegend:{textContent:''}, visibilityValue:{textContent:''},
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
    findDryWindow:() => 'Sem chuva nas próximas horas', setDryWindow:text => { elements.dryWindow.textContent = text; }, PLUVIA:{moon,hourlyDetail:require('../dist/modules/hourly-detail.js')}
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
  assert.match(elements.rainChart.innerHTML,/80% de chance/);
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


test('probabilidade alta não fabrica volume; lacunas e valores inválidos não desenham barras',()=>{
 const {hourly,elements}=screen();hourly.setMode('rain');
 hourly.renderHourly({...data,precipitation_probability:[0,95,80],precipitation:[0,0,null]},0,{});
 assert.match(elements.rainChart.innerHTML,/95% de chance/);
 assert.match(elements.rainChart.innerHTML,/0,0 mm/);
 assert.doesNotMatch(elements.rainChart.innerHTML,/class="rain-bar"/);
 assert.match(elements.hourlyChartLegend.textContent,/volume previsto em mm por hora/);
 hourly.renderHourly({...data,time:[hours[0],hours[2]],precipitation:[0,5]},0,{});
 assert.doesNotMatch(elements.rainChart.innerHTML,/class="rain-bar"/);
 hourly.renderHourly({...data,precipitation:[0,-3,'5'],precipitation_probability:[0,101,'90']},0,{});
 assert.doesNotMatch(elements.rainChart.innerHTML,/class="rain-bar"|101%|90%/);
});
test('sensação tem escala própria, temperatura de referência e lacunas honestas',()=>{
 const {hourly,elements}=screen();hourly.setMode('feels');
 hourly.renderHourly({...data,apparent_temperature:[33,null,37]},0,{});
 assert.match(elements.rainChart.innerHTML,/33°<small>Temp. 27°/);
 assert.match(elements.rainChart.innerHTML,/37°<small>Temp. 28°/);
 assert.equal((elements.rainChart.innerHTML.match(/class="temp-bar"/g)||[]).length,2);
 assert.match(elements.rainChart['aria-label'],/sensação térmica/);
 hourly.renderHourly(data,0,{});
 assert.match(elements.rainChart.innerHTML,/Sensação térmica por hora indisponível/);
});

test('volume usa escala proporcional compartilhada, independente da chance e do fuso do dispositivo',()=>{
 const {hourly,elements}=screen();hourly.setMode('rain');
 hourly.renderHourly({...data,time:['2026-09-24T23:00','2026-09-25T00:00','2026-09-25T01:00'],precipitation:[0,1,2],precipitation_probability:[0,99,10]},0,{});
 assert.match(elements.rainChart.innerHTML,/height:75.0px/);
 assert.match(elements.rainChart.innerHTML,/height:150.0px/);
 assert.match(elements.rainChart.innerHTML,/99% de chance/);
 hourly.renderHourly({...data,time:['invalid',hours[1],hours[2]]},0,{});
 assert.equal((elements.rainChart.innerHTML.match(/data-hour-index=/g)||[]).length,2);
});
test('gráfico recolhido não é montado; abre e desenha com os mesmos dados', () => {
  const {hourly,elements} = screen();
  elements.hourlyChartDetails = {open:false};
  elements.rainChart.innerHTML = '<p>antigo</p>';
  hourly.renderHourly(data,0,{time:['2026-09-24']});
  assert.equal(elements.rainChart.innerHTML,'<p>antigo</p>','fechado: nenhuma coluna montada');
  assert.equal(elements.rainChart.dataset.pending,'true');
  assert.equal(elements.dryWindow.textContent,'Sem chuva nas próximas horas','a janela seca fica fora do gráfico e continua atualizada');
  elements.hourlyChartDetails.open = true;
  hourly.renderHourly(data,0,{time:['2026-09-24']});
  assert.match(elements.rainChart.innerHTML,/class="temp-bar"/);
  assert.equal(elements.rainChart.dataset.pending,undefined);
  assert.equal(elements.rainChart.scrollLeft,12,'a rolagem do gráfico aberto se mantém');
});

test('janela seca só aparece quando chove ou pode chover agora', () => {
  const source = app.slice(app.indexOf('function findDryWindow('), app.indexOf('\nfunction forecastIsDay('));
  const line = {hidden:false}, value = {textContent:'', closest:() => line};
  const ctx = {$:id => id === 'dryWindow' ? value : null, shortTime:time => time.slice(11,16)};
  const {findDryWindow, setDryWindow} = vm.runInNewContext(`${source}\n({findDryWindow,setDryWindow})`, ctx);
  const time = Array.from({length:12}, (_, i) => `2026-10-01T${String(10+i).padStart(2,'0')}:00`);
  const dry = {time, precipitation_probability:Array(12).fill(10)};
  assert.equal(findDryWindow(dry, 0), '', 'já seco: repetiria o "Vai chover?" do topo');
  setDryWindow(findDryWindow(dry, 0));
  assert.equal(line.hidden, true);
  const wet = {time, precipitation_probability:[80,80,80,80,10,10,10,10,10,10,10,10]};
  assert.equal(findDryWindow(wet, 0), 'Hoje, das 13:00 às 15:00: menor probabilidade de chuva', 'intervalos terminam no horário (i+1)');
  setDryWindow(findDryWindow(wet, 0));
  assert.equal(line.hidden, false);
  const missing = {time, precipitation_probability:Array(12).fill(null)};
  assert.equal(findDryWindow(missing, 0), 'Janela de baixa chance de chuva indisponível', 'ausente não vira seco');
});

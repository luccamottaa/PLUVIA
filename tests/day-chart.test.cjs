'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const daily=require('../dist/modules/daily-detail.js');
const insights=require('../dist/modules/weather-insights.js');
const H=3600000,start=Date.parse('2026-10-26T00:00:00-04:00');
const day=(temps,mm=[])=>({date:'2026-10-26',start,end:start+24*H,complete:true,hours:temps.map((t,i)=>({stamp:start+i*H,temperature:t,mm:mm[i]??0}))});

test('curva só com 4 temperaturas ou mais; mínima e máxima marcadas',()=>{
  assert.equal(daily.chart(day([24,25,26])),'');
  const svg=daily.chart(day([24,24,23,23,24,26,28,30,32,33,33,32,30,28,27,26,25,25,24,24,24,24,24,24]));
  assert.match(svg,/aria-hidden="true"/);
  assert.equal((svg.match(/class="day-chart-line"/g)||[]).length,1);
  assert.match(svg,/>33°</);assert.match(svg,/>23°</);
  assert.match(svg,/Sem chuva prevista/,'dia completo e seco diz isso');
  assert.doesNotMatch(svg,/Agora/,'sem o instante atual não marca Agora');
});

test('hora sem leitura quebra a curva em dois traços, e volume vira barra só pelo mm',()=>{
  const reading=day(Array.from({length:24},(_,i)=>25+Math.sin(i/4)*4));
  reading.hours.splice(10,1);
  reading.hours[5].mm=10;reading.hours[6].mm=.05;reading.hours[7].mm=2.5;
  const svg=daily.chart(reading,{now:start+12.5*H});
  assert.equal((svg.match(/class="day-chart-line"/g)||[]).length,2);
  assert.equal((svg.match(/class="day-chart-rain"/g)||[]).length,2,'0,05 mm não vira barra');
  const heights=[...svg.matchAll(/class="day-chart-rain"[^>]*height="([\d.]+)"/g)].map(m=>Number(m[1]));
  assert.equal(heights[0],30,'10 mm enche a faixa');assert.equal(heights[1],15,'2,5 mm é metade (raiz)');
  assert.match(svg,/Agora/);
});

test('janela de proteção solar: bloco contínuo de UV ≥ 3 e lacuna não inventa horário',()=>{
  const time=Array.from({length:24},(_,i)=>`2026-10-26T${String(i).padStart(2,'0')}:00`);
  const uv=[0,0,0,0,0,0,0,1,2,4,6,8,9,9,8,6,3,1,0,0,0,0,0,0];
  assert.deepEqual(insights.uvWindow({time,uv_index:uv},7),{from:'09:00',until:'17:00',now:false,text:'Proteção solar das 09:00 às 17:00'});
  assert.equal(insights.uvWindow({time,uv_index:uv},12).text,'Proteção solar até 17:00');
  assert.equal(insights.uvWindow({time,uv_index:uv},18),null,'depois do bloco não há o que proteger');
  const hole=[...uv];hole[13]=null;
  assert.equal(insights.uvWindow({time,uv_index:hole},10),null);
});

test('dedo no gráfico: hora mais perto da posição, só entre horas com temperatura',()=>{
  const reading=day(Array.from({length:24},(_,i)=>20+i),Array.from({length:24},(_,i)=>i===14?1.2:0));
  const first=daily.chartPoint(reading,0),last=daily.chartPoint(reading,9999),mid=daily.chartPoint(reading,6+14/24*308);
  assert.equal(first.hour.stamp,start,'antes do começo fica na primeira hora');
  assert.equal(last.hour.stamp,start+23*H,'depois do fim fica na última hora');
  assert.equal(mid.hour.stamp,start+14*H);assert.equal(mid.hour.temperature,34);assert.equal(mid.hour.mm,1.2);
  assert.ok(mid.y<first.y,'temperatura maior fica mais alta no gráfico');
  const holes=day(Array.from({length:24},(_,i)=>25));holes.hours[12].temperature=null;
  assert.notEqual(daily.chartPoint(holes,6+12/24*308).hour.stamp,start+12*H,'hora sem temperatura não é escolhida');
  assert.equal(daily.chartPoint(day([24,25,26]),100),null,'sem gráfico, sem leitura');
  assert.equal(daily.chartPoint(reading,NaN),null);
});

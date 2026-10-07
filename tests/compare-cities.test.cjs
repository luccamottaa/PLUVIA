const {test}=require('node:test'),assert=require('node:assert/strict');
const compare=require('../dist/modules/compare-cities.js');
const {forecast,city}=require('./support/forecast.cjs');
const now=Date.parse('2026-10-01T16:30:00Z'); // 12:30 em Manaus, hora atual da fixture

test('resumo usa leitura atual, máxima/mínima do dia municipal e "Vai chover?" da Home',()=>{
 const data=forecast();
 const summary=compare.summarize(data,{current:{us_aqi:42}},city,now);
 assert.equal(summary.temperature,30);assert.equal(summary.feelsLike,34);
 assert.equal(summary.high,34);assert.equal(summary.low,24);
 assert.equal(summary.rain.tone,'dry');assert.match(summary.rain.text,/Sem chuva prevista nas próximas 12 horas/);
 assert.equal(summary.volume,0);assert.equal(summary.rainHours,12);assert.equal(summary.aqi,42);
});

test('chuva usa o intervalo que termina em i+1 e soma o volume só com a série completa',()=>{
 const data=forecast();const start=1; // hora atual (12:00)
 data.hourly.precipitation=data.hourly.precipitation.map((_,i)=>i===start+3?3:i===start+4?1:0);
 data.hourly.precipitation_probability=data.hourly.precipitation.map(v=>v?80:10);
 const summary=compare.summarize(data,null,city,now);
 assert.equal(summary.rain.tone,'rain');assert.match(summary.rain.text,/chuva moderada a partir das 14h/);
 assert.equal(summary.volume,4);
 data.hourly.precipitation[start+6]=null;
 const partial=compare.summarize(data,null,city,now);
 assert.equal(partial.volume,null,'buraco na série não vira zero');
});

test('valores ausentes ficam null e sem leitura atual não há resumo',()=>{
 const data=forecast();data.current.apparent_temperature=null;data.daily.time=data.daily.time.map(day=>day.replace('2026','2025'));
 const summary=compare.summarize(data,{current:{us_aqi:'50'}},city,now);
 assert.equal(summary.feelsLike,null);assert.equal(summary.high,null);assert.equal(summary.low,null);assert.equal(summary.aqi,null);
 data.current.temperature_2m=null;
 assert.equal(compare.summarize(data,null,city,now),null);
 assert.equal(compare.summarize(forecast(),null,{...city,timezone:''},now),null);
});

test('opções juntam locais, favoritos e capitais sem repetir nem incluir a cidade aberta',()=>{
 const groups=compare.options({
  activeId:'1302603',
  places:[{name:'Casa',cityId:'1302603',cityName:'Manaus',uf:'AM'},{name:'Faculdade',cityId:'1501402',cityName:'Belém',uf:'PA'}],
  favorites:['1501402','2611606','x'],
  capitals:[{id:'1302603',name:'Manaus',uf:'AM'},{id:'2611606',name:'Recife',uf:'PE'},{id:'3550308',name:'São Paulo',uf:'SP'}],
  names:new Map([['2611606','Recife/PE']])
 });
 assert.deepEqual(groups.map(g=>g.label),['Meus locais','Favoritos','Capitais']);
 assert.deepEqual(groups.map(g=>g.items.map(i=>i.id)),[['1501402'],['2611606'],['3550308']]);
 assert.equal(groups[0].items[0].label,'Faculdade · Belém/PA');
 assert.equal(groups[1].items[0].label,'Recife/PE');
 assert.deepEqual(compare.options({activeId:'1302603'}),[]);
});

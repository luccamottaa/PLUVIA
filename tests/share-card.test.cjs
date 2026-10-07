const {test}=require('node:test'),assert=require('node:assert/strict');
const card=require('../dist/modules/share-card.js');
const data=require('../dist/modules/weather-data-layer.js'),{forecast,city}=require('./support/forecast.cjs');
const now=Date.parse('2026-10-01T12:00:00-04:00');

test('card do story usa a leitura municipal, chuva no intervalo seguinte e o dia local, sem coordenadas',()=>{
  const raw=forecast();raw.hourly.precipitation[4]=3;raw.hourly.precipitation_probability[4]=80;
  const snapshot=data.normalizeOpenMeteo(raw,null,city,{checkedAt:now});
  const model=card.model(snapshot,{condition:'Parcialmente nublado',now});
  assert.equal(model.city,'Manaus/AM');assert.equal(model.temperature,30);assert.equal(model.feels,34);
  assert.deepEqual([model.high,model.low],[34,24]);
  assert.match(model.rain,/chuva/i);assert.match(model.stamp,/^Atualizado em .*12:00 · horário local$/);
  assert.match(model.source,/Open-Meteo/);assert.equal(model.night,false);
  assert.doesNotMatch(JSON.stringify(model),/-3\.119|-60\.022|latitude|user/);
});

test('leitura antiga é identificada; ausente, inválida ou com mais de 36 h não gera card',()=>{
  const snapshot=data.normalizeOpenMeteo(forecast(),null,city,{checkedAt:now});
  assert.match(card.model(snapshot,{now:now+6*60000}).stamp,/^Leitura salva de/);
  assert.equal(card.model(snapshot,{now:now+36*3600000+1}),null);
  assert.equal(card.model({...snapshot,current:{...snapshot.current,temperature:null}},{now}),null);
  const noDaily=card.model({...snapshot,raw:{forecast:{...snapshot.raw.forecast,daily:{time:[]}}}},{now});
  assert.equal(noDaily.high,null,'sem o dia municipal, máx./mín. ficam ausentes (não zero)');
});

test('quebra de linha respeita a largura e corta com reticências',()=>{
  const ctx={measureText:text=>({width:text.length*10})};
  assert.deepEqual(card.wrap(ctx,'Leve guarda-chuva: chuva moderada a partir das 14h.',200,2),['Leve guarda-chuva:','chuva moderada a…']);
  assert.deepEqual(card.wrap(ctx,'Curto',200),['Curto']);
});

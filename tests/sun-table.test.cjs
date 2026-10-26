'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const table=require('../dist/modules/sun-table.js');
require('../dist/vendor/suncalc.js');
const time=require('../dist/modules/city-time.js');
const sun=globalThis.PLUVIA.sun;
const manaus={id:'1302603',name:'Manaus',timezone:'America/Manaus',lat:-3.119,lon:-60.0217};
const clock=city=>stamp=>new Intl.DateTimeFormat('pt-BR',{timeZone:city.timezone,hour:'2-digit',minute:'2-digit'}).format(stamp);

test('14 dias seguidos no calendário da cidade, com nascer antes do pôr e duração coerente',()=>{
  const at=Date.parse('2026-10-26T23:30:00-04:00');
  const list=table.rows({city:manaus,at,days:14,sun,time});
  assert.equal(list.length,14);
  assert.equal(list[0].date,'2026-10-26','23h30 em Manaus ainda é dia 26, mesmo já sendo 27 em UTC');
  assert.equal(list[13].date,'2026-11-08');
  for(const row of list){assert.ok(row.rise<row.set);assert.equal(row.length,Math.round((row.set-row.rise)/60000));assert.ok(row.length>12*60 && row.length<12*60+20,'perto do equador o dia tem ~12h');}
  const fmt=clock(manaus);
  assert.match(fmt(list[0].rise),/^05:/);assert.match(fmt(list[0].set),/^17:/);
});

test('fuso com horário de verão no sul e cidade sem dados válidos',()=>{
  const porto={id:'4314902',name:'Porto Alegre',timezone:'America/Sao_Paulo',lat:-30.03,lon:-51.23};
  const list=table.rows({city:porto,at:Date.parse('2026-12-21T15:00:00-03:00'),days:2,sun,time});
  assert.ok(list[0].length>14*60,'solstício de verão em Porto Alegre passa de 14h de luz');
  assert.deepEqual(table.rows({city:{...manaus,lat:'x'},sun,time}),[]);
  assert.deepEqual(table.rows({city:manaus,sun:null,time}),[]);
});

test('texto da duração e deriva do pôr do sol em uma semana',()=>{
  assert.equal(table.lengthText(725),'12h 05min');
  assert.equal(table.lengthText(null),'—');
  const porto={id:'4314902',name:'Porto Alegre',timezone:'America/Sao_Paulo',lat:-30.03,lon:-51.23};
  const list=table.rows({city:porto,at:Date.parse('2026-11-01T12:00:00-03:00'),days:8,sun,time});
  const drift=table.setDrift(list,clock(porto));
  assert.ok(drift>0 && drift<15,'em novembro o Sol se põe mais tarde a cada semana no Sul: '+drift);
  assert.equal(table.setDrift(list.slice(0,3),clock(porto)),null,'sem a leitura de daqui a uma semana não diz nada');
});

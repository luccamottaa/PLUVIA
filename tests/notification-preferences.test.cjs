const {test}=require('node:test'),assert=require('node:assert/strict');
const model=require('../dist/modules/notification-preferences.js');
test('reabrir preferências preserva desmarcações, pausa global e resumo diário',()=>{
 const p=model.defaults({notifications_enabled:false,official_alerts:false,storms:false,rain_approaching:false,daily_summary:true,daily_summary_time:'18:30:00'});
 assert.equal(p.notifications_enabled,false);assert.equal(p.official_alerts,false);assert.equal(p.storms,false);assert.equal(p.rain_approaching,false);
 assert.equal(p.heavy_rain,true);assert.equal(p.daily_summary,true);assert.equal(p.daily_summary_time,'18:30');
 assert.equal(p.lightning,false);assert.equal(p.quiet_start,null);assert.equal(p.minimum_severity,1);
});
test('salvar coleta todos os tipos desmarcados e valida o horário',()=>{
 const inputs=Object.fromEntries(model.fields.map(field=>[field,{checked:false}]));inputs.daily_summary_time={value:'21:15'};
 const form={elements:{namedItem:name=>inputs[name]}};
 const p=model.collect(form,{daily_summary_time:'09:00'});
 for(const field of model.fields) assert.equal(p[field],false);
 assert.equal(p.daily_summary_time,'21:15');inputs.daily_summary_time.value='99:99';
 assert.equal(model.collect(form,{daily_summary_time:'09:00'}).daily_summary_time,'09:00');
});
test('seleção de cidades é explícita, única e limitada a 30',()=>{
 const city=(id,checked=true)=>({checked,dataset:{notificationCity:id}});
 assert.deepEqual(model.selectedCities([city('1302603'),city('1302603'),city('2611606',false),city('inválida')]),['1302603']);
 assert.throws(()=>model.selectedCities(Array.from({length:31},(_,i)=>city(String(1000000+i)))),/30 cidades/);
});
test('normaliza horários SQL sem apagar silêncio, severidade e fuso salvos',()=>{
 const p=model.defaults({quiet_start:'22:15:00',quiet_end:'06:30:00',minimum_severity:3,timezone:'America/Sao_Paulo'});
 assert.equal(p.quiet_start,'22:15');assert.equal(p.quiet_end,'06:30');assert.equal(p.minimum_severity,3);assert.equal(p.timezone,'America/Sao_Paulo');
 const form={elements:{namedItem:()=>null}};assert.deepEqual(model.collect(form,p),p);
 const invalid=model.defaults({quiet_start:'99:00',quiet_end:'05:00',minimum_severity:'4',timezone:'not-a-zone'});
 assert.equal(invalid.quiet_start,null);assert.equal(invalid.quiet_end,null);assert.equal(invalid.minimum_severity,1);assert.equal(invalid.timezone,undefined);
});
test('silêncio pode ser ativado, editado e removido explicitamente sem resetar tipos',()=>{
 const inputs={quiet_enabled:{checked:true},quiet_start:{value:'23:00'},quiet_end:{value:'07:00'},minimum_severity:{value:'3'},timezone:{value:'America/Manaus'}};
 const form={elements:{namedItem:name=>inputs[name]}};
 const result=model.collect(form,{storms:false});assert.equal(result.storms,false);assert.equal(result.quiet_start,'23:00');assert.equal(result.quiet_end,'07:00');assert.equal(result.minimum_severity,3);
 inputs.quiet_enabled.checked=false;const cleared=model.collect(form,result);assert.equal(cleared.quiet_start,null);assert.equal(cleared.quiet_end,null);assert.equal(cleared.minimum_severity,3);
});
test('recusa silêncio incompleto, início igual ao fim, nível inválido e fuso inválido',()=>{
 const inputs={quiet_enabled:{checked:true},quiet_start:{value:'22:00'},quiet_end:{value:'22:00'},minimum_severity:{value:'2'},timezone:{value:'UTC'}};
 const form={elements:{namedItem:name=>inputs[name]}};
 assert.throws(()=>model.collect(form),/início e fim/);inputs.quiet_end.value='';assert.throws(()=>model.collect(form),/início e fim/);
 inputs.quiet_enabled.checked=false;inputs.minimum_severity.value='5';assert.throws(()=>model.collect(form),/nível/);
 inputs.minimum_severity.value='2';inputs.timezone.value='bad';assert.throws(()=>model.collect(form),/fuso/);
});

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

const {test}=require('node:test'),assert=require('node:assert/strict');
const {build,deliver,mount}=require('../dist/modules/share-weather.js');
const data=require('../dist/modules/weather-data-layer.js'),{forecast,city}=require('./support/forecast.cjs');
const now=Date.parse('2026-10-01T12:00:00-04:00');
const snapshot=data.normalizeOpenMeteo(forecast(),null,city,{checkedAt:now});
test('compartilha leitura municipal, sensação, fonte e data sem coordenadas ou dados pessoais',()=>{
 const result=build(snapshot,'Parcialmente nublado',now);
 assert.equal(result.title,'PLUVIA · Manaus');assert.match(result.text,/30 °C.*Parcialmente/);assert.match(result.text,/Sensação 34 °C/);
 assert.match(result.text,/01\/10.*12:00/);assert.match(result.text,/Open-Meteo/);assert.doesNotMatch(JSON.stringify(result),/-3.119|-60.022|latitude|user_id/);
 assert.equal(result.url,'https://pluviaweather.com.br/');
});
test('dados antigos são identificados e leituras ausentes ou expiradas não são compartilhadas',()=>{
 assert.match(build(snapshot,'Nublado',now+6*60000).text,/Leitura salva/);
 assert.match(build({...snapshot,source:{...snapshot.source,freshness:'stale'}},'Nublado',now).text,/Leitura salva/);
 assert.equal(build(snapshot,'Nublado',now+36*3600000+1),null);assert.equal(build(snapshot,'Nublado',now-1),null);
 assert.equal(build({...snapshot,current:{...snapshot.current,temperature:null}},'',now),null);
 assert.equal(build({...snapshot,current:{...snapshot.current,time:'invalid'}},'',now),null);
});
test('Web Share, cópia, cancelamento e fallback manual têm resultados distintos',async()=>{
 const payload=build(snapshot,'Nublado',now),sent=[],copied=[];
 assert.equal(await deliver(payload,{share:async p=>sent.push(p)}),'shared');assert.equal(sent[0],payload);
 assert.equal(await deliver(payload,{clipboard:{writeText:async text=>copied.push(text)}}),'copied');assert.match(copied[0],/https:\/\/pluviaweather/);
 assert.equal(await deliver(payload,{share:async()=>{throw Object.assign(Error(),{name:'AbortError'});},clipboard:{writeText:async()=>assert.fail('cancelar não deve copiar')}}),'cancelled');
 assert.equal(await deliver(payload,{share:async()=>{throw Error('unsupported');},clipboard:{writeText:async()=>{throw Error('denied');}}}),'manual');
 assert.equal(await deliver(null,{}),'unavailable');
});
test('mudança de cidade invalida compartilhamento e ignora conclusão atrasada',async()=>{
 const events={},nodes=new Map(),el=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',disabled:true,open:false,addEventListener(type,fn){this[type]=fn;},showModal(){this.open=true;},close(){this.open=false;},focus(){},select(){}});return nodes.get(id);};
 let resolve;const recent={...snapshot,source:{...snapshot.source,checkedAt:Date.now()},current:{...snapshot.current,time:new Date().toISOString()}};
 const root={document:{getElementById:el},navigator:{share:()=>new Promise(r=>resolve=r)},PLUVIA:{weatherData:{get:()=>recent}},addEventListener:(name,fn)=>events[name]=fn};
 mount(root);events['pluvia:weather-updated']({detail:{cityId:city.id}});assert.equal(el('shareWeather').disabled,false);
 const sharing=el('shareWeather').click();events['pluvia:city-changed']();resolve();await sharing;
 assert.equal(el('shareWeather').disabled,true);assert.equal(el('shareWeatherStatus').textContent,'');assert.equal(el('shareWeatherDialog').open,false);
});

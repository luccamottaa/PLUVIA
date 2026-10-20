// Regressões da caça aos bugs de 20/10/2026 (1.24.2): cada caso reproduz o defeito encontrado.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {isRepeat}=require('../supabase/functions/_shared/notification-policy.js');
const worker=stripTypeScriptTypes(fs.readFileSync('supabase/functions/push-process/index.ts','utf8').replace(/^import .*;\n/gm,''));
const push=vm.runInNewContext(worker.slice(0,worker.indexOf('Deno.serve('))+';({eveningSummaryCandidate,summaryDue})',{Intl,Date,URL,URLSearchParams});
const app=fs.readFileSync('dist/app.js','utf8');

test('valor que arredonda para zero não vira "-0"',()=>{
  const fmt=vm.runInNewContext(app.match(/^const fmt = .*$/m)[0]+';fmt');
  assert.equal(fmt(-0.3),'0');assert.equal(fmt(-0.04,1),'0,0');assert.equal(fmt(-0.6),'-1');assert.equal(fmt(-2.5,1),'-2,5');assert.equal(fmt(null),'--');
});
test('sigla de estado dentro do nome não vira filtro ("Pé de Serra", "Sento Sé")',()=>{
  const ctx=vm.createContext({Intl,Date,localStorage:{getItem:()=>null,setItem(){}},document:{querySelector:()=>null}});ctx.globalThis=ctx;
  vm.runInContext(fs.readFileSync('dist/municipalities.js','utf8')+'\n'+fs.readFileSync('dist/capitals.js','utf8')+'\n;globalThis.__s=searchCities;',ctx);
  const first=q=>ctx.__s(q)[0]; const label=c=>c&&`${c.name}/${c.uf}`;
  assert.equal(label(first('Pé de Serra')),'Pé de Serra/BA');
  assert.equal(label(first('sento se')),'Sento Sé/BA');
  assert.equal(label(first('Aracaju SE')),'Aracaju/SE','sigla solta continua filtrando');
  assert.equal(label(first('rio branco ac')),'Rio Branco/AC');
});
test('"chuva chegando" pelo radar segura o "chuva nas próximas horas" do mesmo episódio',()=>{
  const now=Date.parse('2026-10-20T14:35:00Z');
  const sent=[{status:'accepted',sent_at:'2026-10-20T14:00:00Z',notification_events:{city_id:'1',event_type:'rain_incoming',severity:2}}];
  assert.equal(isRepeat({type:'rain_approaching',cityId:'1',severity:1},sent,now),true);
  assert.equal(isRepeat({type:'heavy_rain',cityId:'1',severity:3},sent,now),false,'chuva forte continua passando');
  const before=[{status:'accepted',sent_at:'2026-10-20T14:00:00Z',notification_events:{city_id:'1',event_type:'rain_approaching',severity:1}}];
  assert.equal(isRepeat({type:'rain_incoming',cityId:'1',severity:2},before,now),false,'o radar ainda pode seguir a previsão');
});
test('janela do resumo: de 4 min antes a 30 min depois, inclusive na virada da meia-noite',()=>{
  const at=(h,m)=>h*60+m;
  assert.equal(push.summaryDue(at(6,56),at(7,0)),true);assert.equal(push.summaryDue(at(6,55),at(7,0)),false);
  assert.equal(push.summaryDue(at(7,5),at(7,0)),true,'local visitado depois das 07:04 ainda recebe');
  assert.equal(push.summaryDue(at(7,30),at(7,0)),true);assert.equal(push.summaryDue(at(7,31),at(7,0)),false);
  assert.equal(push.summaryDue(at(23,57),at(0,0)),true);assert.equal(push.summaryDue(at(0,20),at(0,0)),true);
});
test('resumo da noite não diz "Leve guarda-chuva" e "Sem chuva prevista" juntos',()=>{
  const loc={city_id:'1302603',city_name:'Manaus',uf:'AM',latitude:-3.1,longitude:-60,timezone:'America/Manaus'};
  const now=new Date('2026-10-21T00:00Z'),start=Date.parse('2026-10-20T21:00-04:00')/1000;
  const time=Array.from({length:30},(_,i)=>start+i*3600),wet=Date.parse('2026-10-21T00:00-04:00')/1000;
  const data={current:{time:now.getTime()/1000},hourly:{time,precipitation:time.map(x=>x===wet?3:0),precipitation_probability:time.map(x=>x===wet?70:10)},
    daily:{time:[Date.parse('2026-10-20T00:00-04:00')/1000,wet],temperature_2m_max:[33,32],temperature_2m_min:[24,23],precipitation_probability_max:[20,70],precipitation_sum:[0,3]}};
  const body=push.eveningSummaryCandidate(data,loc,{evening_summary:true,evening_summary_time:'20:00'},now).body;
  assert.equal(body,'Máxima de 32 °C e mínima de 23 °C. Sem chuva prevista.');
});
test('voz: fim sem resultado nem erro não deixa "Ouvindo…" na tela; erro não é sobrescrito',()=>{
  const voice=require('../dist/modules/voice-search.js');
  for(const withError of [false,true]){
    const el=id=>({id,hidden:true,textContent:'',value:'',listeners:{},addEventListener(t,f){this.listeners[t]=f;},setAttribute(){},removeAttribute(){},dispatchEvent(){},focus(){}});
    const nodes={voiceSearch:el('voiceSearch'),citySearch:el('citySearch'),cityPickerStatus:el('cityPickerStatus'),cityDialog:el('cityDialog')};
    let rec;class R{constructor(){rec=this;}start(){}abort(){}}
    voice.mount({doc:{getElementById:id=>nodes[id]},Recognition:R});
    nodes.voiceSearch.listeners.click();
    if(withError) rec.onerror({error:'no-speech'});
    rec.onend();
    assert.match(nodes.cityPickerStatus.textContent,withError?/Não ouvi nada/:/Não ouvi o nome da cidade/);
  }
});
test('eclipse que já terminou hoje deixa de ser o próximo',async()=>{
  const A=require('../dist/vendor/astronomy-2.1.19.min.js'),ecl=require('../dist/modules/eclipses.js');
  const city={id:'4106902',lat:-25.43,lon:-49.27};
  const first=await ecl.request(city,Date.parse('2026-10-20T12:00Z'),{library:A});
  const day=new Date(first.solar.peak).toISOString().slice(0,10);
  const morning=await ecl.request(city,Date.parse(day+'T01:00Z'),{library:A});
  const after=morning.solar.end+3600000;
  assert.equal(ecl.peek(city,after),undefined);
  const next=await ecl.request(city,after,{library:A});
  assert.ok(next.solar.peak>after,'recalcula e mostra o eclipse seguinte');
});
test('chuva de meteoros: na madrugada do pico vale a noite de ontem',()=>{
  assert.match(app,/nextShower\(globalThis\.PLUVIA\.time\.dayKey\(at-12\*3600000,activeCity\)/);
  const events=require('../dist/modules/sky-events.js');
  assert.equal(events.nextShower('2026-10-21',-3.1)?.night,events.nextShower('2026-10-20',-3.1)?.night,'a noite de 21→22 é a mesma vista da tarde do dia 21');
});

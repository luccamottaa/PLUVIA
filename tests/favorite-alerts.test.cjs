const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({Date,Intl,URL,AbortController,setTimeout,clearTimeout,document:{querySelectorAll:()=>[],getElementById:()=>({}),createElement:()=>({})}});
for(const file of ['dist/municipalities.js','dist/capitals.js','dist/modules/sources.js','dist/modules/weather-services.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const source=fs.readFileSync('dist/app.js','utf8');vm.runInContext(source.slice(0,source.lastIndexOf('\nsetupCityPicker();')),context);
const now=Date.now(),city={id:'1302603',name:'Manaus',uf:'AM',state:'Amazonas'},other={id:'4106902',name:'Curitiba',uf:'PR',state:'Paraná'};
const notice={id:1,descricao:'Chuva intensa',geocodes:'1302603',severidade:'Perigo',inicio:new Date(now-60000).toISOString(),fim:new Date(now+60000).toISOString()};
function set(rows,{available=true,at=now}={}){context.fixture=rows;context.at=at;context.available=available;vm.runInContext('lastInmetResponse={hoje:fixture};lastInmetReadAt=at;lastInmetAvailable=available',context);}
test('favoritos recebem somente avisos municipais vigentes da consulta compartilhada, sem depender da cidade aberta',()=>{
 set([notice]);assert.equal(context.favoriteCityAlerts(city,now).alerts[0].severity.className,'orange');assert.equal(context.favoriteCityAlerts(other,now).alerts.length,0);
 for(const row of [{...notice,geocodes:'4106902',municipios:'Manaus',uf:'AM'},{...notice,geocodes:'',estados:'Amazonas'},{...notice,fim:new Date(now).toISOString()},{...notice,inicio:new Date(now+30000).toISOString()},{...notice,encerrado:true},{...notice,inicio:null}]){set([row]);assert.equal(context.favoriteCityAlerts(city,now).alerts.length,0);}
});
test('falha, dado antigo ou relógio anterior tornam avisos indisponíveis, nunca ausência confirmada',()=>{
 for(const options of [{available:false},{at:now-600001},{at:now+1}]){set([notice],options);const result=context.favoriteCityAlerts(city,now);assert.equal(result.status,'unavailable');assert.equal(result.alerts.length,0);}
 set([]);assert.equal(context.favoriteCityAlerts(city,now).status,'ready');
});
test('homônimos exigem UF ou IBGE e não criam implementação paralela de seleção',()=>{
 set([{...notice,geocodes:'',municipios:'Curitiba',uf:'AM'}]);assert.equal(context.favoriteCityAlerts(other,now).alerts.length,0);
 set([{...notice,geocodes:'',municipios:'Curitiba',uf:'PR'}]);assert.equal(context.favoriteCityAlerts(other,now).alerts.length,1);
});

test('nome municipal único pode usar catálogo completo; nome parcial nunca confirma',()=>{vm.runInContext('municipalitiesReady=true',context);set([{...notice,geocodes:'',municipios:'Manaus',uf:''}]);assert.equal(context.favoriteCityAlerts(city,now).alerts.length,1);set([{...notice,geocodes:'',municipios:'Manaus do Sul',uf:'AM'}]);assert.equal(context.favoriteCityAlerts(city,now).alerts.length,0);});

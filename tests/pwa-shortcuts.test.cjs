const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const shortcuts=require('../dist/modules/pwa-shortcuts.js');
const dist=path.join(__dirname,'..','dist');

test('manifest declara três atalhos com URL dentro do escopo e ícones de 96px existentes',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(dist,'manifest.webmanifest'),'utf8'));
 assert.deepEqual(manifest.shortcuts.map(item=>item.url),['/?abrir=cidades','/?abrir=comparar','/?abrir=radar']);
 for(const item of manifest.shortcuts){
  assert.ok(item.name && item.short_name.length<=12,item.name);
  assert.equal(new URL(item.url,manifest.scope).origin,new URL(manifest.scope).origin);
  const icon=item.icons[0];assert.equal(icon.sizes,'96x96');
  const file=path.join(dist,icon.src);const png=fs.readFileSync(file);
  assert.equal(png.readUInt32BE(16),96);assert.equal(png.readUInt32BE(20),96);
 }
});

test('parse reconhece só ações conhecidas e limpa o parâmetro preservando o resto',()=>{
 assert.deepEqual(shortcuts.parse('https://pluviaweather.com.br/?abrir=comparar&source=pwa#agora'),{action:'comparar',clean:'/?source=pwa#agora'});
 assert.deepEqual(shortcuts.parse('https://pluviaweather.com.br/?abrir=radar'),{action:'radar',clean:'/'});
 assert.deepEqual(shortcuts.parse('https://pluviaweather.com.br/?abrir=%3Cscript%3E'),{action:null,clean:'/'});
 assert.deepEqual(shortcuts.parse('https://pluviaweather.com.br/?source=pwa'),{action:null,clean:null});
});

function boot(href,{intro=false}={}){
 const events=new Map(),history=[],calls=[];let observed=null;
 const nodes={pluviaIntro:{hidden:!intro},expandRadar:{click:()=>calls.push('radar')}};
 const context={URL,location:{href},history:{state:null,replaceState:(s,t,url)=>history.push(url)},
  document:{getElementById:id=>nodes[id]||null},setTimeout:()=>1,clearTimeout(){},
  MutationObserver:class{constructor(fn){observed=fn;}observe(){}disconnect(){}},
  addEventListener:(type,fn)=>events.set(type,fn),removeEventListener:type=>events.delete(type),
  openCitySearch:()=>calls.push('cidades'),PLUVIA:{compare:{open:()=>calls.push('comparar')}},displayedWeather:null};
 context.globalThis=context;vm.createContext(context);
 vm.runInContext(fs.readFileSync(path.join(dist,'modules/pwa-shortcuts.js'),'utf8'),context);
 return {context,events,history,calls,nodes,mutate:()=>observed?.()};
}

test('ação espera a primeira previsão e a intro sumir, roda uma vez e não reabre no reload',()=>{
 const app=boot('https://pluviaweather.com.br/?abrir=comparar',{intro:true});
 assert.deepEqual(app.history,['/'],'endereço limpo antes de agir');
 assert.deepEqual(app.calls,[]);
 app.context.displayedWeather={forecast:{}};app.events.get('pluvia:weather-updated')();
 assert.deepEqual(app.calls,[],'intro ainda na tela');
 app.nodes.pluviaIntro.hidden=true;app.mutate();
 assert.deepEqual(app.calls,['comparar']);
 assert.equal(app.events.has('pluvia:weather-updated'),false);
 const radar=boot('https://pluviaweather.com.br/?abrir=radar');radar.context.displayedWeather={};radar.events.get('pluvia:weather-updated')();
 assert.deepEqual(radar.calls,['radar']);
 const plain=boot('https://pluviaweather.com.br/');
 assert.deepEqual(plain.history,[]);assert.equal(plain.events.size,0);
});

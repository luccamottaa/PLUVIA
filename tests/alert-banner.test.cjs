const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','dist','app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','dist','continuous.css'),'utf8');
const source=app.slice(app.indexOf('function setAlertBanner('),app.indexOf('function renderInmetAlerts('));
function run(item,others=0){
  const attrs={},els={alertBannerTitle:{textContent:''},alertBannerTime:{textContent:''}};
  const banner={hidden:true,setAttribute:(k,v)=>{attrs[k]=v;},removeAttribute:k=>{delete attrs[k];}};
  els.alertBanner=banner;
  const ctx={$:id=>els[id],activeCity:{timezone:'America/Manaus'},globalThis:{},Intl,Date,Number,String,
    decodeHtml:v=>v,firstValue:(o,keys,fallback)=>keys.map(k=>o?.[k]).find(Boolean)??fallback};
  vm.runInNewContext(`${source}\nsetAlertBanner(item,0,others)`,Object.assign(ctx,{item,others}));
  attrs.time=els.alertBannerTime.textContent;
  return {banner,attrs,title:els.alertBannerTitle.textContent};
}
const severity={yellow:{className:'yellow',rank:1,label:'Alerta amarelo'},orange:{className:'orange',rank:2,label:'Alerta laranja'},
  red:{className:'red',rank:3,label:'Alerta vermelho'},unknown:{className:'unknown',rank:0,label:'Aviso meteorológico'}};
test('faixa no topo mostra aviso amarelo, laranja e vermelho vigentes; severidade desconhecida não sobe',()=>{
  for(const level of ['yellow','orange','red']){
    const {banner,attrs,title}=run({alert:{descricao:'Baixa Umidade'},severity:severity[level],end:Date.parse('2026-10-10T21:00:00-04:00')});
    assert.equal(banner.hidden,false,level);
    assert.equal(attrs['data-severity'],level);
    assert.match(title,/do INMET · Baixa Umidade$/);
  }
  assert.equal(run({alert:{},severity:severity.unknown}).banner.hidden,true);
  assert.equal(run(null).banner.hidden,true);
});
test('amarelo é discreto: mais baixo e sem sombra, ainda com alvo de 44 px',()=>{
  assert.match(css,/#weatherView \.alert-banner\[data-severity="yellow"\] \{ min-height:44px; [^}]*box-shadow:none; \}/);
});

test('com outros avisos na região, a faixa diz quantos (eles ficam no detalhe) e o cartão some',()=>{
  const item={alert:{descricao:'Baixa Umidade'},severity:severity.yellow,end:Date.parse('2026-10-13T22:59:00-04:00')};
  assert.equal(run(item).attrs.time,'Vigente até 13/10, 22:59');
  assert.equal(run(item,1).attrs.time,'Vigente até 13/10, 22:59 · +1 aviso na região');
  assert.equal(run(item,2).attrs.time,'Vigente até 13/10, 22:59 · +2 avisos na região');
  assert.match(css,/#weatherView #alertas\[data-alert-state="banner"\] \{ display:none !important; \}/);
  const risks=fs.readFileSync(path.join(__dirname,'..','dist','modules','risks.js'),'utf8');
  assert.match(risks,/Outros avisos na região[\s\S]*data-notice="\$\{i\}"/);
  assert.match(risks,/if \(!\$\('alertDetail'\)\.open\) \$\('alertDetail'\)\.showModal\(\)/,'trocar de aviso com o diálogo aberto não reabre o modal');
});

test('aviso só previsto da cidade vai para a faixa em linha translúcida e vira a faixa colorida ao valer',()=>{
  const item={alert:{descricao:'Chuvas Intensas'},severity:severity.yellow,stage:'future',
    start:Date.parse('2026-10-13T23:01:00-04:00'),end:Date.parse('2026-10-14T23:01:00-04:00')};
  const {banner,attrs,title}=run(item);
  assert.equal(banner.hidden,false);
  assert.equal(attrs['data-stage'],'future');
  assert.equal(title,'Alerta amarelo previsto · Chuvas Intensas');
  assert.match(attrs.time,/^INMET · a partir de ter\.?,? 13\/10,? 23:01$/);
  const active=run({...item,stage:'active'});
  assert.equal(active.attrs['data-stage'],undefined);
  assert.match(active.title,/^Alerta amarelo do INMET · /);
  assert.match(css,/#weatherView \.alert-banner\[data-stage="future"\] \{ min-height:44px; [^}]*box-shadow:none; \}/);
  // Seleção: vigente vence previsto; previsto só da cidade, nunca de leitura anterior; bolinha só com vigente.
  const render=app.slice(app.indexOf('function alertBannerFor('),app.indexOf('function updateInmetTimestamp('));
  assert.match(render,/item\.stage === "future" && item\.area === city\.name/);
  assert.match(render,/activeOfficial\?\.severity\?\.rank >= 1 \? activeOfficial : upcoming/);
  assert.match(render,/!stale && candidate/);
  assert.doesNotMatch(render,/AppBadge/,"a faixa não mexe na bolinha do ícone");
  assert.match(source,/noteAlertNudge\("official", show && !future\)/);
});

test('abertura: faixa vazia do mesmo formato guarda o lugar enquanto o INMET responde (só o formato fica salvo)',()=>{
  const shapeSource=app.slice(app.indexOf('const ALERT_SHAPE_KEY'),app.indexOf('// Bolinha no ícone'));
  const map=new Map();
  const localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
  const attrs={},els={alertBannerTitle:{textContent:'x'},alertBannerTime:{textContent:'y'}};
  const banner={hidden:true,disabled:false,setAttribute:(k,v)=>{attrs[k]=v;},removeAttribute:k=>{delete attrs[k];},hasAttribute:k=>k in attrs};
  els.alertBanner=banner;
  const ctx={$:id=>els[id],globalThis:{localStorage},Date,JSON,Number,Object,Array};
  vm.runInNewContext(`${shapeSource}\nthis.api={rememberAlertShape,expectedAlertShape,holdAlertBanner,alertShapeKind}`,ctx);
  const {rememberAlertShape,expectedAlertShape,holdAlertBanner,alertShapeKind}=ctx.api;
  const now=Date.parse('2026-10-13T12:00:00Z');
  assert.equal(alertShapeKind({severity:severity.yellow,stage:'future'}),'future');
  assert.equal(alertShapeKind({severity:severity.yellow,stage:'active'}),'yellow');
  assert.equal(alertShapeKind({severity:severity.red,stage:'active'}),'strong');
  assert.equal(alertShapeKind({severity:severity.unknown}),'');
  rememberAlertShape('1302603',{severity:severity.orange,stage:'active',alert:{descricao:'Acumulado de chuva'}},now);
  const stored=map.get('pluvia-alert-shape');
  assert.ok(!/Acumulado|orange|laranja/.test(stored),'nunca guarda o aviso ou a severidade');
  assert.equal(expectedAlertShape('1302603',now+3600e3),'strong');
  assert.equal(expectedAlertShape('1302603',now+13*3600e3),'','vale 12 h');
  assert.equal(expectedAlertShape('1302603',now-1),'','relógio que voltou não reserva');
  assert.equal(expectedAlertShape('3550308',now),'');
  rememberAlertShape('1302603',null,now);
  assert.equal(expectedAlertShape('1302603',now),'','leitura sem faixa apaga o formato');
  for(let i=0;i<25;i++) rememberAlertShape(String(1000000+i),{severity:severity.yellow,stage:'future'},now+i);
  assert.equal(Object.keys(JSON.parse(map.get('pluvia-alert-shape'))).length,20,'no máximo 20 cidades');
  assert.equal(holdAlertBanner(''),false);
  assert.equal(holdAlertBanner('future'),true);
  assert.equal(banner.hidden,false);
  assert.equal(banner.disabled,true);
  assert.equal(attrs['data-pending'],'future');
  assert.equal(attrs['aria-hidden'],'true');
  assert.equal(els.alertBannerTitle.textContent,' ');
  // A leitura troca a faixa vazia no mesmo lugar: sem descer de novo e de volta ao alcance do toque.
  const sourceBanner=app.slice(app.indexOf('function setAlertBanner('),app.indexOf('// Formato da última faixa'));
  vm.runInNewContext(`${sourceBanner}\nsetAlertBanner(item,0,0)`,Object.assign(ctx,{activeCity:{timezone:'America/Manaus'},Intl,String,
    decodeHtml:v=>v,firstValue:(o,keys,fallback)=>keys.map(k=>o?.[k]).find(Boolean)??fallback,dropIn:()=>{throw new Error('não deve descer');},dropMotion:()=>true,
    item:{alert:{descricao:'Chuvas Intensas'},severity:severity.yellow,stage:'active',end:now+3600e3}}));
  assert.equal(attrs['data-pending'],undefined);
  assert.equal(attrs['aria-hidden'],undefined);
  assert.equal(banner.disabled,false);
  assert.equal(attrs['data-severity'],'yellow');
  // Linha "Consultando": some da tela com a faixa vazia; o link oficial não sobrepõe a frase no celular.
  assert.match(css,/#weatherView #alertas\[data-alert-state="pending"\] \{ position:absolute !important;/);
  assert.match(css,/@media\(max-width:420px\) \{[^}]*:is\(\[data-alert-state="clear"\],\[data-alert-state="loading"\]\) \.source-link \{ display:none; \}/);
  assert.match(app,/const held = holdAlertBanner\(expectedAlertShape\(city\.id\)\);/);
  assert.match(app,/if \(!stale\) rememberAlertShape\(activeCity\?\.id, bannerItem\);/);
});

test('a mesma leitura nacional guarda o formato da faixa das favoritas e buscas recentes (sem a cidade aberta)',()=>{
  const pick=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b));
  const source=[pick('const ALERT_SHAPE_KEY','function holdAlertBanner('),pick('function alertBannerFor(','function renderInmetAlerts(')].join('\n');
  const map=new Map(),localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
  const cities=new Map([['1302603',{id:'1302603',name:'Manaus'}],['1501402',{id:'1501402',name:'Belém'}],['3550308',{id:'3550308',name:'São Paulo'}],['4314902',{id:'4314902',name:'Porto Alegre'}]]);
  const now=Date.parse('2026-10-13T12:00:00Z');
  const alertsFor={Belém:[{stage:'active',area:'Belém',severity:severity.orange,start:now-1,end:now+3600e3}],
    'São Paulo':[{stage:'future',area:'São Paulo',severity:severity.yellow,start:now+3600e3,end:now+7200e3}],'Porto Alegre':[]};
  const ctx={globalThis:{localStorage},Date,JSON,Number,Object,Array,Set,activeCity:{id:'1302603',name:'Manaus'},cityById:cities,
    swipeCities:()=>['1302603','1501402','3550308'],recentCityIds:()=>['4314902','9999999'],
    selectInmetAlerts:(raw,at,city)=>alertsFor[city.name]||[]};
  vm.runInNewContext(`${source}\nrememberNearbyAlertShapes({},${now});this.out={expectedAlertShape}`,ctx);
  assert.equal(ctx.out.expectedAlertShape('1501402',now),'strong');
  assert.equal(ctx.out.expectedAlertShape('3550308',now),'future');
  assert.equal(ctx.out.expectedAlertShape('4314902',now),'');
  assert.equal(ctx.out.expectedAlertShape('1302603',now),'','a cidade aberta fica com a leitura dela');
  assert.match(app,/renderInmetAlerts\(raw\);\n    updateInmetTimestamp\(\);\n    rememberNearbyAlertShapes\(raw\);/);
});

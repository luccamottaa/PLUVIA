const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','dist','app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','dist','continuous.css'),'utf8');
// Cascata "descendo" (troca de cidade): blocos à vista descem em ordem; ao rolar nada fica escondido
// (revelar ao entrar na tela parecia um corte no iPhone); só top/clip-path, nada de camadas.
const source=app.slice(app.indexOf('const DROP_BLOCKS'),app.indexOf('const cityResetIds'));
function block(name,{top=0,height=100,hidden=false}={}){
  const attrs={},props={};
  return {name,hidden,attrs,props,dataset:new Proxy({},{get:(_,k)=>attrs['data-'+k]}),
    setAttribute(k,v){attrs[k]=String(v);},removeAttribute(k){delete attrs[k];},
    closest:()=>null,getBoundingClientRect:()=>({top,bottom:top+height,height}),
    style:{setProperty(k,v){props[k]=v;},removeProperty(k){delete props[k];}}};
}
function load({reduced=false,blocks=[],io=true,weather={}}={}){
  const listeners={},observers=[];
  class IO{constructor(cb,opts){this.cb=cb;this.opts=opts;this.seen=new Set();observers.push(this);}observe(n){this.seen.add(n);}unobserve(n){this.seen.delete(n);}disconnect(){this.seen.clear();}}
  const g={matchMedia:q=>({matches:reduced&&/reduce/.test(q)}),getComputedStyle:()=>({top:'0px'}),innerHeight:800};
  if(io) g.IntersectionObserver=IO;
  const ctx={globalThis:g,IntersectionObserver:IO,displayedWeather:weather,setTimeout:(f,ms)=>{ctx.timers.push([f,ms]);return ctx.timers.length;},clearTimeout:()=>{},timers:[],document:{querySelectorAll:selector=>{ctx.selector=selector;return blocks;},addEventListener:(t,f)=>{listeners[t]=f;}}};
  const api=vm.runInNewContext(`${source}\n({dropIn,dropCityContent,DROP_BLOCKS})`,ctx);
  return {...api,ctx,listeners,observers};
}
test('troca de cidade: só os blocos à vista descem, em ordem, depois dos textos do topo',()=>{
  const blocks=[block('banner',{top:300}),block('alertas',{top:420}),block('escondido',{top:500,hidden:true}),block('abaixo',{top:900}),block('vazio',{top:700,height:0})];
  const {dropCityContent,ctx,observers}=load({blocks});
  dropCityContent();
  assert.match(ctx.selector,/^#weatherView #yesterdayNote,#weatherView #alertBanner,#weatherView #alertas/);
  assert.equal(blocks.filter(b=>b.attrs['data-drop']==='go').length,0,'nada é medido no mesmo quadro (reflow forçado)');
  const [io]=observers;
  assert.deepEqual([...io.seen].map(b=>b.name),['banner','alertas','abaixo','vazio']);
  io.cb([...io.seen].map(b=>({target:b,isIntersecting:b.name!=='abaixo',intersectionRect:{height:b.name==='vazio'?0:50}})).reverse());
  assert.deepEqual(blocks.filter(b=>b.attrs['data-drop']==='go').map(b=>[b.name,b.props['--drop-delay']]),[['banner','240ms'],['alertas','310ms']]);
  assert.equal(blocks[3].attrs['data-drop'],undefined,'fora da tela não anima nem fica escondido');
  assert.equal(blocks[4].attrs['data-drop'],undefined,'bloco sem altura não anima');
});
test('cidade sem dado salvo: os blocos esperam escondidos a previsão e descem juntos quando ela chega',()=>{
  const blocks=[block('banner',{top:300}),block('abaixo',{top:900})];
  const {dropCityContent,ctx,observers}=load({blocks,weather:null});
  const events={};
  ctx.globalThis.addEventListener=(t,f)=>{events[t]=f;};ctx.globalThis.removeEventListener=()=>{};
  ctx.globalThis.requestAnimationFrame=f=>f();
  ctx.document.querySelectorAll=s=>/hold/.test(s)?blocks.filter(b=>b.attrs['data-drop']==='hold'):blocks;
  dropCityContent();
  assert.deepEqual(blocks.map(b=>b.attrs['data-drop']),['hold','hold'],'esqueletos não descem antes dos dados');
  assert.equal(observers.length,0);
  assert.equal(ctx.timers[0][1],800,'limite de espera');
  events['pluvia:weather-updated']();
  assert.deepEqual(blocks.map(b=>[b.name,b.attrs['data-drop'],b.props['--drop-delay']]),[['banner','go','0ms'],['abaixo',undefined,undefined]]);
  ctx.timers[0][0]();
  assert.equal(blocks[0].attrs['data-drop'],'go','o limite depois da previsão não repete a cascata');
});
test('reduzir movimento: nada desce',()=>{
  const blocks=[block('a',{top:100}),block('b',{top:1200})];
  const {dropCityContent,observers}=load({reduced:true,blocks});
  dropCityContent();
  assert.deepEqual(blocks.map(b=>b.attrs['data-drop']),[undefined,undefined]);
  assert.equal(observers.length,0);
});
test('rolar não esconde nem revela seções: o bloco abaixo da dobra já está inteiro (sem o "corte")',()=>{
  const code=app.replace(/\/\/.*$/gm,'');
  assert.doesNotMatch(code,/setupScrollAnimations|data-drop", "wait"|drop === "wait"/);
  assert.doesNotMatch(css,/\[data-drop="wait"\]/);
  const blocks=[block('meio',{top:1200})];
  const {observers,listeners}=load({blocks});
  assert.equal(observers.length,0,'abrir a página não observa a rolagem');
  {
    const b=block('x');b.attrs['data-drop']='go';b.props['--drop-delay']='70ms';
    listeners.animationend({animationName:'pluvia-drop',target:b});
    assert.equal(b.attrs['data-drop'],undefined);assert.equal(b.props['--drop-delay'],undefined);
    const c=block('y');c.attrs['data-drop']='go';
    listeners.animationend({animationName:'outra',target:c});
    assert.equal(c.attrs['data-drop'],'go','outras animações não encerram a cascata');
  }
});
test('CSS: desce só por top e clip-path (sem camadas) e reduced-motion mostra tudo parado',()=>{
  const keyframes=css.match(/@keyframes pluvia-drop \{[^\n]*\}/)[0];
  assert.match(keyframes,/from \{ top:-18px; clip-path:inset\(0 0 100% 0\); \}/);
  assert.doesNotMatch(keyframes,/transform|translate|opacity|scale|filter/);
  assert.match(css,/#weatherView \[data-drop="go"\] \{ position:relative; animation:pluvia-drop [^}]*var\(--drop-delay,0ms\) both; \}/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\) \{ #weatherView \[data-drop\] \{ clip-path:none; animation:none; \} \}/);
  assert.doesNotMatch(source.replace(/\/\/.*$/gm,''),/transform|opacity|z-?index/i);
});
test('troca de cidade reaproveita a leitura nacional do INMET com menos de 5 min, sem "Consultando"',()=>{
  const choose=app.slice(app.indexOf('function chooseCity('),app.indexOf('function toggleFavoriteCity('));
  assert.match(choose,/const inmetFresh = Boolean\(lastInmetAvailable && lastInmetResponse\) && inmetAge >= 0 && inmetAge < 300000;/);
  assert.match(choose,/if \(!inmetFresh\) \{ lastInmetResponse = null; lastInmetReadAt = 0; \}/);
  assert.match(choose,/if \(inmetFresh\) \{ renderInmetAlerts\(lastInmetResponse\); updateInmetTimestamp\(\); \}\n  else \{[\s\S]*setAlertState\(held \? "pending" : "loading"\);\n  \}/);
});
test('dado que chega depois desce no lugar: alertas saindo de "Consultando", dicas e nota de ontem que surgem',()=>{
  const pick=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end));
  const source=[pick('function setAlertState(','// Faixa no topo'),pick('function renderTips(','function setRainAnswer('),pick('function setYesterdayNote(','function clearWeatherInsights(')].join('\n');
  const dropped=[];
  const els={alertas:{dataset:{alertState:'loading'}},tips:{hidden:true,dataset:{}},tipsList:{replaceChildren(){},set textContent(v){}},yesterdayNote:{textContent:'',dataset:{}}};
  const ctx={$:id=>els[id],dropIn:list=>dropped.push(...list.map(n=>Object.keys(els).find(k=>els[k]===n))),dropMotion:()=>true,onScreen:()=>true,whenOnScreen:(nodes,done)=>done(nodes),
    TIP_ICONS:{},weatherIcons:null,document:{createElement:()=>({dataset:{},setAttribute(){},append(){},className:'',innerHTML:'',textContent:''})}};
  const api=vm.runInNewContext(`${source}\n({setAlertState,renderTips,setYesterdayNote})`,ctx);
  api.setAlertState('alerts');api.setAlertState('clear');
  api.renderTips([{kind:'uv',text:'UV alto'}]);api.renderTips([{kind:'uv',text:'UV alto'}]);
  api.setYesterdayNote({text:'2° mais quente que ontem'});api.setYesterdayNote({text:'parecida'});
  assert.deepEqual(dropped,['alertas','tips','yesterdayNote'],'só a primeira chegada de cada bloco desce; atualizações não reanimam');
  const load=app.slice(app.indexOf('async function loadWeather('),app.indexOf('async function refreshAll('));
  assert.match(load,/if \(fromSkeleton && !introCovering\(\)\) \{ animateCityText\(\); dropVisibleBlocks\(120\); \}/,'cidade sem nada salvo: esqueletos viram dados em cascata');
  assert.match(app,/function introCovering\(\) \{\n  const intro = \$\("pluviaIntro"\);\n  return Boolean\(intro && !intro\.hidden && !intro\.dataset\.done\);/,'com a intro cobrindo a tela a animação é pulada');
});

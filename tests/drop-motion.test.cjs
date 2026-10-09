const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','dist','app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','dist','continuous.css'),'utf8');
// Cascata "descendo" (troca de cidade e rolagem): blocos à vista descem em ordem, os de baixo esperam
// aparecer ao rolar; só top/clip-path, nada de camadas.
const source=app.slice(app.indexOf('const DROP_BLOCKS'),app.indexOf('const cityResetIds'));
function block(name,{top=0,height=100,hidden=false}={}){
  const attrs={},props={};
  return {name,hidden,attrs,props,dataset:new Proxy({},{get:(_,k)=>attrs['data-'+k]}),
    setAttribute(k,v){attrs[k]=String(v);},removeAttribute(k){delete attrs[k];},
    closest:()=>null,getBoundingClientRect:()=>({top,bottom:top+height,height}),
    style:{setProperty(k,v){props[k]=v;},removeProperty(k){delete props[k];}}};
}
function load({reduced=false,blocks=[],io=true}={}){
  const listeners={},observers=[];
  class IO{constructor(cb,opts){this.cb=cb;this.opts=opts;this.seen=new Set();observers.push(this);}observe(n){this.seen.add(n);}unobserve(n){this.seen.delete(n);}}
  const g={matchMedia:q=>({matches:reduced&&/reduce/.test(q)}),getComputedStyle:()=>({top:'0px'}),innerHeight:800};
  if(io) g.IntersectionObserver=IO;
  const ctx={globalThis:g,IntersectionObserver:IO,document:{querySelectorAll:selector=>{ctx.selector=selector;return blocks;},addEventListener:(t,f)=>{listeners[t]=f;}}};
  const api=vm.runInNewContext(`${source}\n({dropIn,dropCityContent,setupScrollAnimations,DROP_BLOCKS})`,ctx);
  return {...api,ctx,listeners,observers};
}
test('troca de cidade: só os blocos à vista descem, em ordem, depois dos textos do topo',()=>{
  const blocks=[block('banner',{top:300}),block('alertas',{top:420}),block('escondido',{top:500,hidden:true}),block('esperando',{top:600}),block('abaixo',{top:900}),block('vazio',{top:700,height:0})];
  blocks[3].attrs['data-drop']='wait';
  const {dropCityContent,ctx}=load({blocks});
  dropCityContent();
  assert.match(ctx.selector,/^#weatherView #yesterdayNote,#weatherView #alertBanner,#weatherView #alertas/);
  assert.deepEqual(blocks.filter(b=>b.attrs['data-drop']==='go').map(b=>[b.name,b.props['--drop-delay']]),[['banner','240ms'],['alertas','310ms']]);
  assert.equal(blocks[3].attrs['data-drop'],'wait','bloco que ainda espera a rolagem continua esperando');
  assert.equal(blocks[4].attrs['data-drop'],undefined,'fora da tela não anima');
});
test('reduzir movimento: nada desce nem espera',()=>{
  const blocks=[block('a',{top:100}),block('b',{top:1200})];
  const {dropCityContent,setupScrollAnimations,observers}=load({reduced:true,blocks});
  dropCityContent();setupScrollAnimations();
  assert.deepEqual(blocks.map(b=>b.attrs['data-drop']),[undefined,undefined]);
  assert.equal(observers.length,0);
});
test('rolagem: blocos abaixo da dobra esperam e descem uma vez quando aparecem, em ordem',()=>{
  const blocks=[block('visivel',{top:200}),block('meio',{top:1200}),block('fim',{top:1600})];
  const {setupScrollAnimations,observers,ctx,listeners}=load({blocks});
  setupScrollAnimations();
  assert.doesNotMatch(ctx.selector,/yesterdayNote|alertBanner/,'textos do topo não esperam rolagem');
  assert.deepEqual(blocks.map(b=>b.attrs['data-drop']),[undefined,'wait','wait'],'o que já está na tela não some');
  const [io]=observers;
  assert.deepEqual([...io.seen].map(b=>b.name),['meio','fim']);
  io.cb([{isIntersecting:true,target:blocks[2],boundingClientRect:{top:900}},{isIntersecting:true,target:blocks[1],boundingClientRect:{top:500}},{isIntersecting:false,target:blocks[0],boundingClientRect:{top:0}}]);
  assert.deepEqual([blocks[1],blocks[2]].map(b=>[b.attrs['data-drop'],b.props['--drop-delay']]),[['go','0ms'],['go','90ms']],'de cima para baixo');
  assert.equal(io.seen.size,0,'revela uma vez: girar a tela não reanima');
  listeners.animationend({animationName:'pluvia-drop',target:blocks[1]});
  assert.equal(blocks[1].attrs['data-drop'],undefined);
  assert.equal(blocks[1].props['--drop-delay'],undefined);
  listeners.animationend({animationName:'outra',target:blocks[2]});
  assert.equal(blocks[2].attrs['data-drop'],'go','outras animações não encerram a cascata');
});
test('sem IntersectionObserver nada fica escondido',()=>{
  const blocks=[block('meio',{top:1200})];
  const {setupScrollAnimations}=load({blocks,io:false});
  setupScrollAnimations();
  assert.equal(blocks[0].attrs['data-drop'],undefined);
});
test('CSS: desce só por top e clip-path (sem camadas) e reduced-motion mostra tudo parado',()=>{
  const keyframes=css.match(/@keyframes pluvia-drop \{[^\n]*\}/)[0];
  assert.match(keyframes,/from \{ top:-18px; clip-path:inset\(0 0 100% 0\); \}/);
  assert.doesNotMatch(keyframes,/transform|translate|opacity|scale|filter/);
  assert.match(css,/#weatherView \[data-drop="go"\] \{ position:relative; animation:pluvia-drop [^}]*var\(--drop-delay,0ms\) both; \}/);
  assert.match(css,/#weatherView \[data-drop="wait"\] \{ clip-path:inset\(0 0 100% 0\); \}/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\) \{ #weatherView \[data-drop\] \{ clip-path:none; animation:none; \} \}/);
  assert.doesNotMatch(source.replace(/\/\/.*$/gm,''),/transform|opacity|z-?index/i);
});
test('troca de cidade reaproveita a leitura nacional do INMET com menos de 5 min, sem "Consultando"',()=>{
  const choose=app.slice(app.indexOf('function chooseCity('),app.indexOf('function toggleFavoriteCity('));
  assert.match(choose,/const inmetFresh = Boolean\(lastInmetAvailable && lastInmetResponse\) && inmetAge >= 0 && inmetAge < 300000;/);
  assert.match(choose,/if \(!inmetFresh\) \{ lastInmetResponse = null; lastInmetReadAt = 0; \}/);
  assert.match(choose,/if \(inmetFresh\) \{ renderInmetAlerts\(lastInmetResponse\); updateInmetTimestamp\(\); \}\n  else \{[\s\S]*setAlertState\("loading"\);\n  \}/);
});

const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','dist','app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','dist','continuous.css'),'utf8');
// Céu entre cidades: cópia leve do céu antigo some sobre o novo, só quando o céu muda de fato.
const source=app.slice(app.indexOf('const SKY_KEYS'),app.indexOf('// Efeito leve em poucos textos pequenos'));
function el(tag){
  const node={tag,style:{},children:[],attrs:{},listeners:{},removed:false,
    append(...c){node.children.push(...c);},after(n){node.afterNode=n;},remove(){node.removed=true;},
    setAttribute(k,v){node.attrs[k]=v;},addEventListener(t,f){node.listeners[t]=f;},className:''};
  return node;
}
function load({reduced=false,data={phase:'day',solar:'sunset',weather:'sun',clouds:'standard',rain:'none'}}={}){
  const effects=el('div'),stage={querySelector:sel=>sel==='.sky-effects'?effects:null,getBoundingClientRect:()=>({top:-120})};
  const root={dataset:{...data}};
  const timers=[];
  const ctx={document:{documentElement:root,querySelector:sel=>sel==='.night-stage'?stage:sel==='.sky-twilight-page'?{}:null,createElement:el},
    globalThis:{matchMedia:()=>({matches:reduced}),getComputedStyle:(node,pseudo)=>pseudo==='::before'
      ?{backgroundImage:'linear-gradient(red, blue)',position:'absolute',top:'0px',height:'1350px',maskImage:'linear-gradient(#000 65%, transparent)'}
      :node===root?{getPropertyValue:()=>' #a7d7ec '}:{backgroundImage:'linear-gradient(orange, pink)',opacity:'0.8'}},
    setTimeout:(fn,ms)=>timers.push({fn,ms})};
  const api=vm.runInNewContext(`${source}\n({captureSky,fadeSky,skyKey})`,ctx);
  return {...api,root,effects,timers};
}
test('céu que muda (pôr do sol → noite) ganha a cópia do antigo depois do céu novo, que some sozinha',()=>{
  const t=load();
  const old=t.captureSky();
  assert.equal(old.key,'day|sunset|sun|standard|none');
  assert.deepEqual(JSON.parse(JSON.stringify(old.gradient)),{image:'linear-gradient(red, blue)',fixed:false,top:-120,height:1350,mask:'linear-gradient(#000 65%, transparent)'});
  Object.assign(t.root.dataset,{phase:'night',solar:'none'});
  t.fadeSky(old);
  const veil=t.effects.afterNode;
  assert.ok(veil,'a cópia entra logo depois das camadas do céu, abaixo do conteúdo');
  assert.equal(veil.className,'sky-fade');
  assert.equal(veil.attrs['aria-hidden'],'true');
  assert.equal(veil.style.backgroundColor,'#a7d7ec');
  const [gradient,glow]=veil.children;
  assert.deepEqual([gradient.style.backgroundImage,gradient.style.top,gradient.style.height,gradient.style.maskImage],['linear-gradient(red, blue)','-120px','1350px','linear-gradient(#000 65%, transparent)']);
  assert.deepEqual([glow.style.backgroundImage,glow.style.opacity],['linear-gradient(orange, pink)','0.8'],'a luz do crepúsculo vai junto');
  veil.listeners.animationend();
  assert.equal(veil.removed,true);
  assert.ok(t.timers.some(x=>x.ms===2000),'some mesmo sem animationend');
});
test('mesmo céu nas duas cidades não cria camada; reduzir movimento não captura',()=>{
  const t=load();
  t.fadeSky(t.captureSky());
  assert.equal(t.effects.afterNode,undefined);
  assert.equal(load({reduced:true}).captureSky(),null);
});
test('CSS: só opacidade numa camada do tamanho da tela, e nenhuma com reduced-motion',()=>{
  assert.match(css,/\.night-stage > \.sky-fade \{ position:fixed; inset:0; z-index:-1; [^}]*animation:pluvia-sky-fade 1\.1s [^}]*\}/);
  assert.match(css,/@keyframes pluvia-sky-fade \{ from \{ opacity:1; \} to \{ opacity:0; \} \}/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\) \{ \.night-stage > \.sky-fade \{ display:none; \} \}/);
});

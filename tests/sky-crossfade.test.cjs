const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','dist','app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','dist','continuous.css'),'utf8');
// Céu entre cidades: cópia do céu antigo (degradê, crepúsculo, nuvens e Sol/Lua) some sobre o novo,
// só quando o céu muda de fato; aplicada em toda troca de céu, não só no gesto.
const source=app.slice(app.indexOf('const SKY_KEYS'),app.indexOf('// Efeito leve em poucos textos pequenos'));
const applySource=app.slice(app.indexOf('let skyApplied'),app.indexOf('function weatherIconSvg('));
function el(tag,{classes=[],computed={},offset={}}={}){
  const vars={};
  const node={tag,style:{setProperty(k,v){vars[k]=v;},getPropertyValue:k=>vars[k]||'',vars},children:[],attrs:{},listeners:{},dataset:{},removed:false,computed,
    classList:{contains:c=>classes.includes(c)},className:classes.join(' '),offsetLeft:offset.left||0,offsetTop:offset.top||0,offsetWidth:offset.width||0,offsetHeight:offset.height||0,
    append(...c){node.children.push(...c);},after(n){node.afterNode=n;},remove(){node.removed=true;},
    setAttribute(k,v){node.attrs[k]=v;},removeAttribute(k){delete node.attrs[k];},addEventListener(t,f){node.listeners[t]=f;},
    cloneNode(){const copy=el(tag,{classes});copy.clonedFrom=node;return copy;}};
  return node;
}
function load({reduced=false,hidden=false,intro=false,data={phase:'day',solar:'sunset',weather:'partly',clouds:'standard',rain:'none'}}={}){
  const cloud=el('span',{classes:['sky-clouds','sky-clouds-back'],offset:{top:-60,width:2310,height:640},computed:{display:'block',visibility:'visible',opacity:'1',zIndex:'2',
    transform:'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -500.5, 0, 0, 1)',backgroundImage:'url("veil.webp")',backgroundSize:'1920px 100%',backgroundPosition:'0px 0px',backgroundRepeat:'repeat-x',
    filter:'none',maskImage:'radial-gradient(red, transparent)',maskSize:'960px 100%',maskPosition:'0px 0px',maskRepeat:'repeat-x'}});
  const sun=el('span',{classes:['sky-sun'],offset:{width:84,height:84},computed:{display:'block',visibility:'visible',opacity:'0.9',zIndex:'1',transform:'matrix(1, 0, 0, 1, 250, 120)',
    getPropertyValue:k=>k==='--twilight-opacity'?' 0.6 ':''}});
  const moon=el('span',{classes:['sky-moon'],computed:{display:'none',visibility:'visible',opacity:'0',zIndex:'1'}});
  const rain=el('span',{classes:['sky-rain']});
  const effects=el('div',{computed:{maskImage:'linear-gradient(#000 65%, transparent)'}});
  effects.getBoundingClientRect=()=>({top:-40,left:0,width:390,height:1350});
  effects.querySelectorAll=sel=>sel==='.sky-clouds,.sky-sun,.sky-moon'?[cloud,sun,moon]:[rain];
  effects.style.setProperty('--sun-orbit-x','0.5');effects.style.setProperty('--sun-orbit-y','0.2');
  const stage={querySelector:sel=>sel==='.sky-effects'?effects:null,getBoundingClientRect:()=>({top:-120})};
  const root={dataset:{...data}};
  const timers=[];
  const read=(node,pseudo)=>pseudo==='::before'
    ?{backgroundImage:'linear-gradient(red, blue)',position:'absolute',top:'0px',height:'1350px',maskImage:'linear-gradient(#000 65%, transparent)'}
    :node===root?{getPropertyValue:()=>' #a7d7ec '}:node.computed&&Object.keys(node.computed).length?node.computed:{backgroundImage:'linear-gradient(orange, pink)',opacity:'0.8'};
  const doc={documentElement:root,hidden,createElement:tag=>el(tag),
    querySelector:sel=>sel==='.night-stage'?stage:sel==='.sky-twilight-page'?{}:sel==='.sky-effects'?effects:sel==='.pluvia-intro:not([hidden])'&&intro?{}:null};
  const ctx={document:doc,globalThis:{matchMedia:()=>({matches:reduced}),getComputedStyle:read},setTimeout:(fn,ms)=>timers.push({fn,ms}),Date};
  const api=vm.runInNewContext(`${source}\n({captureSky,fadeSky,skyKey})`,ctx);
  return {...api,root,effects,timers,cloud,sun,ctx};
}
test('céu que muda ganha a cópia do antigo (degradê, crepúsculo, nuvens e Sol) depois do céu novo, que some sozinha',()=>{
  const t=load();
  const old=t.captureSky();
  assert.equal(old.key,'day|sunset|partly|standard|none');
  assert.deepEqual(JSON.parse(JSON.stringify(old.gradient)),{image:'linear-gradient(red, blue)',fixed:false,top:-120,height:1350,mask:'linear-gradient(#000 65%, transparent)'});
  assert.deepEqual([...old.scene.layers.map(l=>l.kind)],['clouds','sun'],'a Lua escondida não é copiada');
  Object.assign(t.root.dataset,{phase:'night',solar:'none'});
  t.fadeSky(old);
  const veil=t.effects.afterNode;
  assert.ok(veil,'a cópia entra logo depois das camadas do céu, abaixo do conteúdo');
  assert.equal(veil.className,'sky-fade');
  assert.equal(veil.attrs['aria-hidden'],'true');
  assert.equal(veil.style.backgroundColor,'#a7d7ec');
  const [gradient,glow,scene]=veil.children;
  assert.deepEqual([gradient.style.backgroundImage,gradient.style.top,gradient.style.height,gradient.style.maskImage],['linear-gradient(red, blue)','-120px','1350px','linear-gradient(#000 65%, transparent)']);
  assert.deepEqual([glow.style.backgroundImage,glow.style.opacity],['linear-gradient(orange, pink)','0.8'],'a luz do crepúsculo vai junto');
  assert.equal(scene.className,'sky-fade-scene');
  assert.deepEqual([scene.style.top,scene.style.width,scene.style.height,scene.style.maskImage],['-40px','390px','1350px','linear-gradient(#000 65%, transparent)'],'no lugar e com a máscara de .sky-effects');
  const [cloud,sun]=scene.children;
  assert.deepEqual([cloud.style.left,cloud.style.top,cloud.style.width,cloud.style.backgroundImage,cloud.style.backgroundSize,cloud.style.maskImage,cloud.style.maskSize,cloud.style.maskRepeat,cloud.style.zIndex,cloud.style.animation],
    ['-500.5px','-60px','2310px','url("veil.webp")','1920px 100%','radial-gradient(red, transparent)','960px 100%','repeat-x','2','none'],'nuvem parada onde estava, sem transform');
  assert.equal(cloud.style.transform,undefined);
  assert.equal(sun.clonedFrom,t.sun);
  assert.deepEqual([sun.style.display,sun.style.transform,sun.style.left,sun.style.top,sun.style.opacity,sun.style.vars['--twilight-opacity']],['block','none','250px','120px','0.9','0.6'],'Sol no mesmo ponto, por left/top');
  veil.listeners.animationend();
  assert.equal(veil.removed,true);
  assert.ok(t.timers.some(x=>x.ms===2000),'some mesmo sem animationend');
});
test('mesmo céu e Sol no mesmo lugar não cria camada; Sol noutra posição cria',()=>{
  const t=load();
  t.fadeSky(t.captureSky());
  assert.equal(t.effects.afterNode,undefined);
  const old=t.captureSky();
  t.effects.style.setProperty('--sun-orbit-x','0.56');
  t.fadeSky(old);
  assert.ok(t.effects.afterNode,'outra cidade com o mesmo tempo, Sol em outro ponto do arco');
});
test('reduzir movimento, página oculta ou abertura não capturam',()=>{
  assert.equal(load({reduced:true}).captureSky(),null);
  assert.equal(load({hidden:true}).captureSky(),null);
  assert.equal(load({intro:true}).captureSky(),null);
});
test('toda troca de céu passa pela cópia, menos a abertura e o mesmo céu repetido',()=>{
  const calls=[];let veilAt=0;
  const ctx={activeCity:{id:'a'},Date:{now:()=>10000},
    document:{querySelector:()=>veilAt?{dataset:{at:String(veilAt)}}:null},
    captureSky:()=>{calls.push('capture');return {key:'old'};},fadeSky:old=>calls.push(['fade',old?.key||null]),
    globalThis:{PLUVIA:{sky:{apply:(code)=>{calls.push(['apply',code]);return 'state';}}}}};
  const api=vm.runInNewContext(`${applySource}\n({applyWeatherAtmosphere,set:c=>activeCity=c})`,ctx);
  api.applyWeatherAtmosphere(null,null);
  api.applyWeatherAtmosphere(2,1);
  assert.deepEqual(calls,[['apply',null],['fade',null],['apply',2],['fade',null]],'abertura: nenhum céu anterior a suavizar');
  calls.length=0;api.applyWeatherAtmosphere(2,1);
  assert.deepEqual(calls,[['apply',2],['fade',null]],'mesmo céu da mesma cidade (atualização) não captura');
  calls.length=0;api.set({id:'b'});api.applyWeatherAtmosphere(null,null);
  assert.deepEqual(calls,['capture',['apply',null],['fade','old']],'troca de cidade: captura antes de aplicar');
  calls.length=0;veilAt=9800;api.applyWeatherAtmosphere(61,1);
  assert.deepEqual(calls,[['apply',61],['fade',null]],'previsão salva logo depois: a cópia da cidade anterior continua valendo');
  calls.length=0;veilAt=0;api.applyWeatherAtmosphere(3,1);
  assert.deepEqual(calls,['capture',['apply',3],['fade','old']],'a previsão que chega depois também suaviza');
});
test('CSS: só opacidade numa camada do tamanho da tela, cópias sem camadas próprias, nenhuma com reduced-motion',()=>{
  assert.match(css,/\.night-stage > \.sky-fade \{ position:fixed; inset:0; z-index:-1; [^}]*animation:pluvia-sky-fade 1\.1s [^}]*\}/);
  assert.match(css,/\.night-stage > \.sky-fade > \.sky-fade-scene \{ position:absolute; overflow:hidden; isolation:isolate; \}/);
  assert.match(css,/@keyframes pluvia-sky-fade \{ from \{ opacity:1; \} to \{ opacity:0; \} \}/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\) \{ \.night-stage > \.sky-fade \{ display:none; \} \}/);
  assert.doesNotMatch(source.replace(/\/\/.*$/gm,''),/will-change|translate|requestAnimationFrame/);
});

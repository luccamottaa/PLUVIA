const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const time=require('../dist/modules/city-time.js');
const {create}=require('../dist/modules/sky-atmosphere.js');
const motion=require('../dist/modules/dialog-motion.js');
const city={id:'1302603',lat:-3.119,lon:-60.022,timezone:'America/Manaus'};
const at=Date.parse('2026-10-01T22:00:00-04:00');

test('formatadores Intl são reaproveitados e formatam igual a um novo',()=>{
  const options={timeZone:'America/Manaus',hour:'2-digit',minute:'2-digit'};
  const first=time.dateFormat('pt-BR',options);
  assert.equal(time.dateFormat('pt-BR',{...options}),first,'mesmas opções devolvem o mesmo formatador');
  assert.notEqual(time.dateFormat('pt-BR',{...options,timeZone:'America/Sao_Paulo'}),first);
  assert.equal(first.format(at),new Intl.DateTimeFormat('pt-BR',options).format(at));
  assert.equal(time.numberFormat('pt-BR',{maximumFractionDigits:1}).format(2.25),(2.25).toLocaleString('pt-BR',{maximumFractionDigits:1}));
  assert.throws(()=>time.dateFormat('pt-BR',{timeZone:'Fuso/Inexistente'}),RangeError,'fuso inválido continua falhando como antes');
  for(let i=0;i<300;i++) time.dateFormat('pt-BR',{timeZone:'UTC',minute:'2-digit',second:'2-digit',fractionalSecondDigits:1+i%3,hour:i%2 ? 'numeric' : '2-digit',era:['long','short','narrow'][i%3],weekday:['long','short','narrow'][i%5%3]});
  const app=fs.readFileSync(require.resolve('../dist/app.js'),'utf8');
  assert.doesNotMatch(app,/new Intl\.DateTimeFormat\(/,'app.js usa os formatadores guardados');
});

function sceneDocument() {
  const node=()=>({dataset:{},values:{},style:{setProperty(key,value){this.owner.values[key]=value;}}});
  const make=()=>{const n=node();n.style.owner=n;return n;};
  const root=make(),body=make(),intro=make(),page=make(),twilight=make();
  let reads=0;const listeners={};
  const animations=[{animationName:'clouds-back',playbackRate:1},{animationName:'clouds-front',playbackRate:1}];
  const layer={getAnimations:()=>{reads++;return animations;}};
  const document={documentElement:root,body,
    querySelectorAll:selector=>selector==='.sky-clouds' ? [layer] : selector==='.intro-sky,.sky-effects,.sky-twilight-page' ? [intro,page,twilight] : [],
    addEventListener:(name,fn)=>{listeners[name]=fn;}};
  return {document,root,body,scenes:[intro,page,twilight],animations,listeners,reads:()=>reads};
}

test('variáveis do céu ficam nas cenas, não na raiz (evita recalcular o estilo da página inteira)',()=>{
  const s=sceneDocument();
  create({document:s.document}).apply(63,1,null,city,at,20);
  for(const scene of s.scenes) {
    assert.ok('--sun-visibility' in scene.values && '--rain-opacity' in scene.values && '--cloud-rate' in scene.values);
  }
  assert.deepEqual(s.root.values,{},'nada de variável herdada em <html>');
  assert.deepEqual(s.body.values,{},'nem em <body>');
  assert.equal(s.root.dataset.rain,'moderate','os atributos de estado continuam na raiz para os seletores');
});

test('ritmo das nuvens só consulta getAnimations quando muda ou quando o CSS cria animações',()=>{
  const s=sceneDocument();
  const sky=create({document:s.document});
  sky.apply(3,1,null,city,at,20);
  assert.equal(s.reads(),1);assert.equal(s.animations[0].playbackRate,1.6);
  sky.update(at+30000);sky.apply(3,1,null,city,at,20);
  assert.equal(s.reads(),1,'mesmo vento: nenhuma leitura que force estilo');
  sky.apply(3,1,null,city,at,5);
  assert.equal(s.reads(),2);assert.equal(s.animations[0].playbackRate,.7);
  s.animations[0].playbackRate=1;
  s.listeners.animationstart({animationName:'sky-rain-fall'});
  assert.equal(s.reads(),2,'outras animações não interessam');
  s.listeners.animationstart({animationName:'clouds-back'});
  assert.equal(s.reads(),3);assert.equal(s.animations[0].playbackRate,.7,'animação recriada recebe o vento atual');
});

class Element {
  constructor(tag,className='') {this.localName=tag;this.className=className;this.childNodes=[];this.dataset={};this.parent=null;}
  append(...nodes) {for(const node of nodes) {if(node.parent) node.parent.childNodes.splice(node.parent.childNodes.indexOf(node),1);node.parent=this;this.childNodes.push(node);}}
  get parentElement() {return this.parent;}
  get classList() {return {contains:name=>this.className.split(' ').includes(name)};}
  hasAttribute(name) {return name.replace(/^data-/,'').replace(/-(\w)/g,(_,c)=>c.toUpperCase()) in this.dataset;}
  querySelector(selector) {
    if(selector===':scope > summary') return this.childNodes.find(node=>node.localName==='summary') || null;
    if(selector===':scope > .details-motion') return this.childNodes.find(node=>node.className==='details-motion') || null;
    return null;
  }
  closest(selector) {for(let node=this;node;node=node.parent) if(node.localName===selector) return node;return null;}
}
function detailsSetup({reduce=false,tip=false}={}) {
  const details=new Element('details',tip ? 'info-tip' : 'astronomy-details');details.open=false;
  const summary=new Element('summary'),list=new Element('dl'),note=new Element('p');
  details.append(summary,list,note);
  let click=null,styleReads=0;const timers=new Map();let clock=0;
  const scope={matchMedia:()=>({matches:reduce}),getComputedStyle:()=>({get gridTemplateRows() {styleReads++;return '0px';}}),
    setTimeout(fn) {timers.set(++clock,fn);return clock;},clearTimeout(id) {timers.delete(id);},
    document:{documentElement:{hasAttribute:()=>false},createElement:tag=>new Element(tag),
      querySelectorAll:selector=>selector==='details:not(.info-tip)' && !tip ? [details] : [],
      addEventListener:(name,fn)=>{if(name==='click') click=fn;}}};
  const api=motion(scope);
  const tap=()=>{const event={target:summary,defaultPrevented:false,preventDefault() {this.defaultPrevented=true;}};click(event);return event;};
  const flush=()=>{for(const [id,fn] of [...timers]) {timers.delete(id);fn();}};
  return {api,details,summary,list,note,tap,flush,timers,styleReads:()=>styleReads};
}

test('<details> abre e fecha pela altura, com o conteúdo no invólucro e o fechamento só no fim',()=>{
  const s=detailsSetup();
  const wrap=s.details.childNodes[1];
  assert.equal(wrap.className,'details-motion','invólucro criado na abertura da página');
  assert.deepEqual(wrap.childNodes[0].childNodes,[s.list,s.note],'só o resumo fica fora');
  assert.equal(s.details.childNodes[0],s.summary);
  const opening=s.tap();
  assert.equal(opening.defaultPrevented,true,'o toque nativo não abre de uma vez');
  assert.equal(s.details.open,true);assert.equal(wrap.hasAttribute('data-collapsed'),false);
  assert.equal(s.styleReads(),1,'parte de 0fr numa única leitura de estilo');
  assert.equal(wrap.dataset.moving,'true');s.flush();assert.equal(wrap.hasAttribute('data-moving'),false);
  s.tap();
  assert.equal(s.details.open,true,'continua aberto enquanto encolhe');
  assert.equal(wrap.dataset.collapsed,'true');assert.equal(s.details.dataset.closing,'true');
  s.tap();
  assert.equal(wrap.hasAttribute('data-collapsed'),false,'tocar de novo no meio volta a abrir');
  assert.equal(s.details.hasAttribute('data-closing'),false);
  s.tap();s.flush();
  assert.equal(s.details.open,false);assert.equal(wrap.hasAttribute('data-collapsed'),false);assert.equal(s.details.hasAttribute('data-closing'),false);
});

test('reduced motion e ⓘ não são interceptados',()=>{
  const reduced=detailsSetup({reduce:true});
  assert.equal(reduced.tap().defaultPrevented,false);assert.equal(reduced.timers.size,0);
  reduced.api.toggleDetails(reduced.details);assert.equal(reduced.details.open,true,'abrir por código também funciona sem movimento');
  const tip=detailsSetup({tip:true});
  assert.equal(tip.tap().defaultPrevented,false,'o ⓘ tem o próprio movimento em app.js');
  assert.equal(tip.details.childNodes.length,3,'e não ganha invólucro');
});

test('CSS do movimento: só grid-template-rows, sem transform/opacity e desligado em reduced-motion/modo seguro',()=>{
  const css=fs.readFileSync(require.resolve('../dist/continuous.css'),'utf8');
  assert.match(css,/details > \.details-motion \{ display:grid; grid-template-rows:1fr; transition:grid-template-rows [^;]+; \}/);
  assert.match(css,/details > \.details-motion\[data-collapsed\] \{ grid-template-rows:0fr; \}/);
  assert.match(css,/prefers-reduced-motion:reduce\) \{ details > \.details-motion \{ transition:none; \} \}/);
  assert.match(css,/:root\[data-safe\] details > \.details-motion \{ transition:none; \}/);
  assert.doesNotMatch(css,/pluvia-content-enter/,'a entrada antiga com transform saiu');
  assert.match(css,/\.city-dot\[aria-current="true"\]::before \{ width:18px; opacity:1; \}/,'bolinha ativa vira pílula por largura, sem transform');
});

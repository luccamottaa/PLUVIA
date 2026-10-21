const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','dist','app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','dist','continuous.css'),'utf8');
const source=app.slice(app.indexOf('function fadeIn('),app.indexOf('function stepCity('));
function node(){
  const log=[],props={};
  return {log,props,style:{
    set transition(v){props.transition=v;log.push(['transition',v]);},get transition(){return props.transition;},
    setProperty(k,v,p){props[k]=v;log.push(['set',k,v,p]);},removeProperty(k){delete props[k];log.push(['remove',k]);}}};
}
function run({reduced=false,nodes=[node(),node()],stagger=90}={}){
  const timers=[];
  const ctx={document:{documentElement:{hasAttribute:()=>false}},$:()=>null,
    globalThis:{matchMedia:()=>({matches:reduced}),getComputedStyle:()=>({color:''})},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){}};
  const {fadeIn}=vm.runInNewContext(`${source}\n({fadeIn})`,ctx);
  fadeIn([...nodes,null,{}],400,stagger);
  return {nodes,timers};
}
test('texto parte de transparente e volta por transição de cor, em sequência, sem camadas',()=>{
  const {nodes,timers}=run();
  for(const [index,n] of nodes.entries()){
    assert.deepEqual(n.log[1],['set','color','transparent','important'],'transparente acima do !important da folha');
    assert.equal(n.props.transition,`color 400ms ease-out ${index*90}ms`);
    assert.equal('color' in n.props,false,'a cor volta à da folha, pela transição');
  }
  assert.equal(timers.length,2);
  timers.forEach(t=>t.fn());
  for(const n of nodes) assert.equal(n.props.transition,undefined,'a transição temporária é limpa');
  assert.doesNotMatch(source.replace(/\/\/.*$/gm,''),/transform|translate|scale|opacity|z-?index|animate\(/i);
});
test('reduzir movimento não anima',()=>{
  assert.equal(run({reduced:true}).nodes[0].log.length,0);
});
function slide({api=true,reduced=false}={}){
  const calls=[],root={dataset:{},hasAttribute:()=>false};let finish;
  const texts=new Map(['.intro h1','.wx-copy','#condition'].map(sel=>{const props={};return [sel,{props,style:{setProperty:(k,v)=>{props[k]=v;},removeProperty:k=>{delete props[k];}}}];}));
  const names=()=>Object.fromEntries([...texts].map(([sel,node])=>[sel,node.props['view-transition-name']]));
  const document={documentElement:root,querySelector:selector=>texts.get(selector.replace('#weatherView ',''))};
  if(api) document.startViewTransition=cb=>{calls.push(['start',names(),{...root.dataset}]);cb();return {updateCallbackDone:Promise.resolve(),finished:new Promise(r=>{finish=r;})};};
  const ctx={document,globalThis:{matchMedia:()=>({matches:reduced})},chooseCity:id=>calls.push(['choose',id]),animateCityText:()=>calls.push(['fade']),dropCityContent:()=>calls.push(['drop'])};
  const source=app.slice(app.indexOf('const SLIDE_TEXTS'),app.indexOf('function stepCity('));
  const {slideToCity}=vm.runInNewContext(`${source}\n({slideToCity})`,ctx);
  return {slideToCity,calls,names,root,finish:()=>finish?.()};
}
test('troca de cidade desliza por View Transition e cai no fade sem a API ou em reduced-motion',async()=>{
  const s=slide();
  s.slideToCity('1501402',1);
  assert.deepEqual(s.calls,[['start',{'.intro h1':'pluvia-city','.wx-copy':'pluvia-temp','#condition':'pluvia-condition'},{}],['choose','1501402'],['drop']],'nomes só nos três textos, a raiz sem atributo; troca e cascata dentro da transição');
  s.finish();await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(s.names(),{'.intro h1':undefined,'.wx-copy':undefined,'#condition':undefined},'os nomes saem depois da transição');
  const back=slide();back.slideToCity('x',-1);
  assert.equal(back.calls[0][1]['.intro h1'],'pluvia-city-prev','o gesto para trás vai no nome');
  for(const opts of [{api:false},{reduced:true}]){
    const f=slide(opts);f.slideToCity('y',1);
    assert.deepEqual(f.calls,[['choose','y'],['fade'],['drop']],JSON.stringify(opts));
  }
  const setup=app.slice(app.indexOf('function setupCitySwipe('),app.indexOf('function updateCityLabels('));
  assert.match(setup,/slideToCity\(id,/,'tocar numa bolinha também desliza');
});
test('a raiz nunca é fotografada nem ganha atributo na troca (recalculava a página inteira)',()=>{
  assert.match(css,/:root \{ view-transition-name:none; \}/);
  assert.doesNotMatch(css+app,/data-city-slide\]|citySlide/,'sem atributo na raiz');
  assert.doesNotMatch(css,/view-transition-name:pluvia/,'nomes só no estilo dos textos, durante a troca');
  for(const name of ['pluvia-city','pluvia-temp','pluvia-condition','pluvia-city-prev']) assert.match(css,new RegExp(`::view-transition-new\\(${name}\\)`));
});
test('ⓘ abre e fecha pela altura (grid 0fr ↔ 1fr), sem transform/opacity',()=>{
  assert.match(css,/\.info-tip-body\[data-inline\]\[data-collapsed\] \{ grid-template-rows:0fr;/);
  const rule=css.match(/#weatherView \.info-tip-body\[data-inline\] \{ display:grid;[^}]*\}/)[0];
  assert.doesNotMatch(rule,/transform|opacity/);
});
test('no toque os esqueletos ficam parados (o brilho em transform virava uma camada por barra)',()=>{
  assert.match(css,/@media \(hover:none\), \(pointer:coarse\) \{ #weatherView \.sk::after \{ animation:none; display:none; \} \}/);
});

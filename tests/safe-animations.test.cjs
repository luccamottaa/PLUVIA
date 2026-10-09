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
const slideSource=app.slice(app.indexOf('function slideToCity('),app.indexOf('function stepCity('));
function slide({api=true,reduced=false}={}){
  const calls=[],dataset={};let finish;
  const root={dataset,hasAttribute:()=>false};
  const document={documentElement:root};
  if(api) document.startViewTransition=cb=>{calls.push(['start',{...dataset}]);cb();return {updateCallbackDone:Promise.resolve(),finished:new Promise(r=>{finish=r;})};};
  const ctx={document,globalThis:{matchMedia:()=>({matches:reduced})},chooseCity:id=>calls.push(['choose',id]),animateCityText:()=>calls.push(['fade']),dropCityContent:()=>calls.push(['drop'])};
  const {slideToCity}=vm.runInNewContext(`${slideSource}\n({slideToCity})`,ctx);
  return {slideToCity,calls,dataset,finish:()=>finish?.()};
}
test('troca de cidade desliza por View Transition e cai no fade sem a API ou em reduced-motion',async()=>{
  const s=slide();
  s.slideToCity('1501402',1);
  assert.deepEqual(s.calls,[['start',{citySlide:'next'}],['choose','1501402'],['drop']],'a troca e a cascata acontecem dentro da transição, com a direção do gesto');
  s.finish();await new Promise(r=>setTimeout(r,0));
  assert.equal(s.dataset.citySlide,undefined,'os nomes da transição saem depois dela');
  const back=slide();back.slideToCity('x',-1);
  assert.equal(back.calls[0][1].citySlide,'prev');
  for(const opts of [{api:false},{reduced:true}]){
    const f=slide(opts);f.slideToCity('y',1);
    assert.deepEqual(f.calls,[['choose','y'],['fade'],['drop']],JSON.stringify(opts));
  }
  const setup=app.slice(app.indexOf('function setupCitySwipe('),app.indexOf('function updateCityLabels('));
  assert.match(setup,/slideToCity\(id,/,'tocar numa bolinha também desliza');
});
test('a transição só nomeia quatro textos do topo durante a troca; a raiz não é fotografada',()=>{
  const names=[...css.matchAll(/:root\[data-city-slide\] ([^{]+)\{ view-transition-name:([a-z-]+); \}/g)].map(m=>[m[1].trim(),m[2]]);
  assert.deepEqual(names,[['#weatherView .intro h1','pluvia-city'],['#weatherView .wx-copy','pluvia-temp'],['#weatherView #condition','pluvia-condition'],['#weatherView #rainAnswer','pluvia-rain']]);
  assert.match(css,/:root\[data-city-slide\] \{ view-transition-name:none; \}/);
  assert.doesNotMatch(css,/^(?!.*data-city-slide).*view-transition-name:pluvia/m,'nomes só existem durante a troca');
});
test('ⓘ abre e fecha pela altura (grid 0fr ↔ 1fr), sem transform/opacity',()=>{
  assert.match(css,/\.info-tip-body\[data-inline\]\[data-collapsed\] \{ grid-template-rows:0fr;/);
  const rule=css.match(/#weatherView \.info-tip-body\[data-inline\] \{ display:grid;[^}]*\}/)[0];
  assert.doesNotMatch(rule,/transform|opacity/);
});
test('no toque os esqueletos ficam parados (o brilho em transform virava uma camada por barra)',()=>{
  assert.match(css,/@media \(hover:none\), \(pointer:coarse\) \{ #weatherView \.sk::after \{ animation:none; display:none; \} \}/);
});

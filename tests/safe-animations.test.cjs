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
function run({safe=false,reduced=false,nodes=[node(),node()],stagger=90}={}){
  const timers=[];
  const ctx={document:{documentElement:{hasAttribute:name=>safe&&name==='data-safe'}},$:()=>null,
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
test('modo seguro e reduzir movimento não animam',()=>{
  assert.equal(run({safe:true}).nodes[0].log.length,0);
  assert.equal(run({reduced:true}).nodes[0].log.length,0);
});
test('troca de cidade (gesto e bolinhas) anima só textos pequenos do topo, não blocos inteiros',()=>{
  const helper=app.slice(app.indexOf('function animateCityText('),app.indexOf('function stepCity('));
  assert.match(helper,/fadeIn\(\[\$\("cityName"\), \$\("temperature"\), \$\("condition"\), \$\("rainAnswer"\)\]/);
  assert.doesNotMatch(helper,/agora|dashboard-grid|weatherView/);
  const setup=app.slice(app.indexOf('function setupCitySwipe('),app.indexOf('function updateCityLabels('));
  assert.match(setup,/chooseCity\(id\);\s*animateCityText\(\);/,'tocar numa bolinha também anima');
});
test('no toque os esqueletos ficam parados (o brilho em transform virava uma camada por barra)',()=>{
  assert.match(css,/@media \(hover:none\), \(pointer:coarse\) \{ #weatherView \.sk::after \{ animation:none; display:none; \} \}/);
});

const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','dist','app.js'),'utf8');
const source=app.slice(app.indexOf('function fadeIn('),app.indexOf('function stepCity('));
function run({safe=false,reduced=false}={}){
  const calls=[];
  const node={animate:(frames,options)=>calls.push({frames,options})};
  const ctx={document:{documentElement:{hasAttribute:name=>safe&&name==='data-safe'}},globalThis:{matchMedia:()=>({matches:reduced})}};
  const {fadeIn}=vm.runInNewContext(`${source}\n({fadeIn})`,ctx);
  fadeIn([node,null,{}],200);
  return calls;
}
test('troca de cidade e ⓘ animam só opacidade (sem transform, que derrubava o iPhone)',()=>{
  const calls=run();
  assert.equal(calls.length,1,'nós ausentes ou sem animate são ignorados');
  for(const frame of calls[0].frames) assert.deepEqual(Object.keys(frame),['opacity']);
  assert.equal(calls[0].options.duration,200);
  assert.doesNotMatch(source,/transform|translate|scale|zIndex|z-index/);
});
test('modo seguro e reduzir movimento não animam',()=>{
  assert.equal(run({safe:true}).length,0);
  assert.equal(run({reduced:true}).length,0);
});
test('a troca anima apenas textos pequenos do topo, não blocos inteiros',()=>{
  const step=app.slice(app.indexOf('function stepCity('),app.indexOf('function setupCitySwipe('));
  assert.match(step,/fadeIn\(\["cityName","temperature","condition","rainAnswer"\]/);
  assert.doesNotMatch(step,/agora|dashboard-grid|weatherView/);
});

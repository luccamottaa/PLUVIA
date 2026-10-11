const {test}=require('node:test');
const assert=require('node:assert/strict');
const reports=require('../dist/modules/rain-reports.js');

test('resumo da última hora: contagens ordenadas, ninguém e resposta inválida',()=>{
  assert.equal(reports.summarize({dry:1,drizzle:0,rain:4,heavy:2}),'Na última hora: 4 chuva · 2 chuva forte · 1 sem chuva (7 pessoas).');
  assert.equal(reports.summarize({dry:0,drizzle:1,rain:0,heavy:0}),'Na última hora: 1 garoa (1 pessoa).');
  assert.equal(reports.summarize({dry:0,drizzle:0,rain:0,heavy:0}),'Ninguém respondeu na última hora.');
  assert.equal(reports.summarize({dry:null,drizzle:0,rain:0,heavy:0}),'','contagem ausente não vira zero');
  assert.equal(reports.summarize(null),'');
});

function fakeDom(){
  const listeners={};const make=(id,extra={})=>({id,textContent:'',hidden:false,attrs:{},dataset:{},disabled:false,
    setAttribute(k,v){this.attrs[k]=v;},toggleAttribute(k,on){this.attrs[k]=on;},addEventListener(t,f){listeners[id+':'+t]=f;},...extra});
  const buttons=reports.KINDS.map(kind=>make('b-'+kind,{dataset:{kind}}));
  const box=make('rainReport',{querySelectorAll:()=>buttons});
  const els={rainReport:box,rainReportSummary:make('rainReportSummary'),rainReportQuestion:make('rainReportQuestion')};
  return {doc:{getElementById:id=>els[id]||null},els,buttons,listeners};
}
function memoryStorage(){const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),m};}

test('envia só a cidade, a resposta e o id aleatório; troca de cidade descarta resposta atrasada',async()=>{
  const {doc,els,buttons,listeners}=fakeDom();const storage=memoryStorage();const calls=[];let release;
  const http={createClient:()=>({abortAll(){},getJson:(url,opts={})=>{calls.push({url,opts});
    if(opts.method==='POST')return Promise.resolve('ok');
    if(url.includes('1302603')&&calls.length===1)return new Promise(r=>{release=r;});
    return Promise.resolve([{dry:0,drizzle:0,rain:3,heavy:0,latest:null}]);}})};
  const api=reports.mount({doc,storage,http,crypto:{randomUUID:()=>'0f8fad5b-d9cb-469f-a165-70867728950e'},now:()=>1e12});
  api.setCity({id:'1302603',name:'Manaus'});
  assert.equal(els.rainReportQuestion.textContent,'Tá chovendo aí em Manaus?');
  assert.equal(els.rainReport.hidden,true,'escondido até o servidor responder uma vez');
  api.setCity({id:'1501402',name:'Belém'});
  release([{dry:9,drizzle:0,rain:0,heavy:0}]);await new Promise(r=>setImmediate(r));
  assert.match(els.rainReportSummary.textContent,/3 chuva/,'resumo de Manaus não aparece em Belém');
  assert.equal(els.rainReport.hidden,false);assert.equal(storage.getItem('pluvia-rain-ready'),'true');
  await api.report('rain');
  const post=calls.find(c=>c.opts.method==='POST');
  assert.deepEqual(JSON.parse(post.opts.body),{p_city:'1501402',p_kind:'rain',p_device:'0f8fad5b-d9cb-469f-a165-70867728950e'});
  assert.match(post.url,/rpc\/pluvia_rain_report$/);
  assert.match(els.rainReportSummary.textContent,/^Valeu!/);
  assert.equal(buttons.find(b=>b.dataset.kind==='rain').attrs['aria-pressed'],'true');
  assert.ok(buttons.every(b=>b.disabled),'um relato a cada 15 minutos');
  api.setCity({id:'1302603',name:'Manaus'});
  assert.ok(buttons.every(b=>!b.disabled),'em outra cidade pode responder');
  assert.ok(listeners['rainReport:click']);
});

test('sem a função publicada (404) o cartão nunca aparece',async()=>{
  const {doc,els}=fakeDom();
  const http={createClient:()=>({abortAll(){},getJson:()=>Promise.reject(Object.assign(Error('x'),{code:'http_error',status:404}))})};
  const api=reports.mount({doc,storage:memoryStorage(),http});
  api.setCity({id:'1302603',name:'Manaus'});await new Promise(r=>setImmediate(r));
  assert.equal(els.rainReport.hidden,true);assert.equal(els.rainReportSummary.textContent,'');
});

test('servidor ocupado ou erro não marcam resposta',async()=>{
  const {doc,els,buttons}=fakeDom();const storage=memoryStorage();
  const http={createClient:()=>({abortAll(){},getJson:(url,opts={})=>opts.method==='POST'?Promise.resolve('busy'):Promise.resolve([])})};
  const api=reports.mount({doc,storage,http,crypto:{randomUUID:()=>'0f8fad5b-d9cb-469f-a165-70867728950e'}});
  api.setCity({id:'1302603',name:'Manaus'});await api.report('dry');
  assert.match(els.rainReportSummary.textContent,/Muita gente/);
  assert.ok(buttons.every(b=>!b.disabled));assert.equal(storage.getItem('pluvia-rain-answer'),null);
});

test('a migration fecha a tabela e só libera as duas funções',()=>{
  const sql=require('node:fs').readFileSync(__dirname+'/../supabase/migrations/20261011020000_rain_reports.sql','utf8');
  assert.match(sql,/enable row level security/);assert.match(sql,/revoke all on public\.rain_reports from anon, authenticated/);
  assert.match(sql,/set search_path = ''/);assert.match(sql,/interval '2 days'/);
  assert.doesNotMatch(sql,/grant (select|insert|update|delete)/i);
});

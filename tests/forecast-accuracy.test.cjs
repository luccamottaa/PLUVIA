// Quanto o PLUVIA acerta (1.37): só totais do RPC, os dois lados e só com casos suficientes.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const acc=require('../dist/modules/forecast-accuracy.js');

test('chuvas avisadas, "vai chover" que choveu e "não vai chover" que ficou seco',()=>{
  const s=acc.summarize({since:'2026-10-19T04:00:00+00:00',windows:[
    {hours:12,windows:148,rained:49,hits:44,misses:5,false_alarms:47,dry_but_rained:0,said_dry:28,dry_right:28},
    {hours:3,windows:193,rained:19,hits:14,misses:5,false_alarms:44,dry_but_rained:2,said_dry:96,dry_right:94}]});
  assert.equal(s.any,true);
  assert.deepEqual(s.windows[12].caught,{part:44,total:49,pct:90});
  assert.deepEqual(s.windows[12].rainRight,{part:44,total:91,pct:48});
  assert.deepEqual(s.windows[12].dryRight,{part:28,total:28,pct:100});
  assert.equal(s.windows[3].dryRight.pct,98);
  assert.equal(s.since,Date.parse('2026-10-19T04:00:00Z'));
});

test('poucos casos não viram porcentagem; resposta inválida não inventa',()=>{
  const s=acc.summarize({windows:[{hours:12,windows:40,rained:3,hits:3,false_alarms:1,said_dry:20,dry_right:20}]});
  assert.equal(s.windows[12].caught,null,'3 chuvas: poucas');
  assert.equal(s.windows[12].rainRight,null);
  assert.equal(s.windows[12].dryRight.pct,100);
  assert.equal(acc.summarize({windows:[]}).any,false);
  assert.equal(acc.summarize(null).any,false);
  assert.equal(acc.summarize({windows:[{hours:12,windows:'9',rained:-1}]}).windows[12],undefined);
  assert.equal(acc.summarize({windows:[{hours:6,windows:9,rained:9,hits:9,false_alarms:0,said_dry:0,dry_right:0}]}).windows[6],undefined);
});

test('fora das capitais usa a capital do estado e diz isso',()=>{
  const capitals=[{id:'1302603',name:'Manaus',uf:'AM'},{id:'3550308',name:'São Paulo',uf:'SP'}];
  assert.deepEqual(acc.target({id:'1302603',name:'Manaus',uf:'AM'},capitals),{id:'1302603',name:'Manaus',own:true});
  assert.deepEqual(acc.target({id:'1303403',name:'Parintins',uf:'AM'},capitals),{id:'1302603',name:'Manaus',own:false});
  assert.equal(acc.target({id:'9',uf:'XX'},capitals),null);
  const src=fs.readFileSync('dist/modules/forecast-accuracy.js','utf8');
  assert.match(src,/capital do estado; por enquanto só medimos nas capitais/);
});

// DOM mínimo: só o que a seção usa.
function node(tag){
  const n={tag,className:'',children:[],_text:'',
    get textContent(){return n._text+n.children.map(c=>c.textContent).join('');},
    set textContent(v){n._text=String(v);n.children=[];},
    append(...c){n.children.push(...c);},replaceChildren(...c){n._text='';n.children=c;},
    addEventListener(){}};
  return n;
}
async function openSection(data){
  const els={accuracyBody:node('div'),monthDialog:Object.assign(node('dialog'),{open:false}),accuracyStatus:node('p')};
  let fire=null;
  const root={document:{getElementById:id=>els[id]||null,createElement:node},
    MutationObserver:class{constructor(fn){fire=fn;}observe(){}},
    PLUVIA:{http:{createClient:()=>({getJson:async()=>data,abortAll(){}})}}};
  globalThis.activeCity={id:'1302603',name:'Manaus',uf:'AM'};
  globalThis.CAPITALS=[{id:'1302603',name:'Manaus',uf:'AM'}];
  acc.mount(root);
  els.monthDialog.open=true;fire();
  await new Promise(r=>setImmediate(r));
  delete globalThis.activeCity;delete globalThis.CAPITALS;
  return els.accuracyBody.children;
}
const windows=[
  {hours:12,windows:148,rained:49,hits:44,misses:5,false_alarms:47,dry_but_rained:0,said_dry:28,dry_right:28},
  {hours:3,windows:193,rained:19,hits:14,misses:5,false_alarms:44,dry_but_rained:2,said_dry:96,dry_right:94}];

test('3 horas vêm primeiro e em destaque; a hora exata diz, com número, que é bem mais difícil; alarmes falsos escritos',async()=>{
  const nodes=await openSection({since:'2026-10-19T04:00:00+00:00',windows,hourly:{lead_hours:6,hours:665,hits:1,misses:15,false_alarms:31}});
  const blocks=nodes.filter(n=>/accuracy-block/.test(n.className));
  assert.equal(blocks.length,2);
  assert.match(blocks[0].className,/accuracy-main/);
  assert.match(blocks[0].textContent,/^Nas próximas 3 horas/);
  assert.match(blocks[1].textContent,/^Nas próximas 12 horas/);
  assert.ok(nodes.indexOf(blocks[0])<nodes.findIndex(n=>n.className==='accuracy-hour'));
  assert.ok(nodes.findIndex(n=>n.className==='accuracy-hour')<nodes.indexOf(blocks[1]),'hora exata entre as 3 h e as 12 h');
  const hour=nodes.find(n=>n.className==='accuracy-hour').textContent;
  assert.match(hour,/das 32 horas em que a previsão feita 6 horas antes marcou chuva, choveu naquela hora em 1 \(3%\)/);
  // 3 h: 14 acertos em 58 "vai chover"; os 44 alarmes falsos aparecem por extenso.
  assert.match(blocks[0].textContent,/14 de 58 vezes; nas outras 44, não choveu/);
});

test('banco antigo (sem a hora exata) ou poucos casos: a frase fica, sem número inventado',async()=>{
  for(const hourly of [undefined,{lead_hours:6,hours:40,hits:1,misses:2,false_alarms:2}]){
    const nodes=await openSection({windows,hourly});
    const hour=nodes.find(n=>n.className==='accuracy-hour').textContent;
    assert.match(hour,/^Acertar a hora exata da chuva é bem mais difícil/);
    assert.doesNotMatch(hour,/%|das \d+ horas/);
  }
  assert.equal(acc.hourly({lead_hours:6,hits:'1',false_alarms:31}),null);
  assert.deepEqual(acc.hourly({lead_hours:6,hits:1,false_alarms:31}),{lead:6,right:{part:1,total:32,pct:3}});
});

test('migration: só totais, chave publicável, search_path vazio',()=>{
  const sql=fs.readFileSync('supabase/migrations/20261027220000_forecast_accuracy_public.sql','utf8');
  assert.match(sql,/security definer\s+set search_path = ''/);
  assert.match(sql,/grant execute on function public\.pluvia_forecast_accuracy\(text\) to anon, authenticated, service_role/);
  assert.match(sql,/p_city ~ '\^\\d\{7\}\$'/);
  assert.match(sql,/measured = window_hours/,'só janelas com todas as horas medidas');
  const html=fs.readFileSync('dist/index.html','utf8'),sw=fs.readFileSync('dist/sw.js','utf8');
  const ref=html.match(/modules\/forecast-accuracy\.js\?v=[\w-]+/)[0];
  assert.ok(sw.includes('./'+ref));
  assert.match(html,/<button id="homeAccuracy" class="home-shortcut"/);
});

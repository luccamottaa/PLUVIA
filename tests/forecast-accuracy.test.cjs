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

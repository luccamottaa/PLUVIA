const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const push=require('../dist/modules/push-style.js');
const dist=path.join(__dirname,'..','dist');

test('cada tipo do servidor tem ícone próprio existente, título sem emoji e botão',()=>{
 for(const [type,style] of Object.entries(push.STYLES)){
  const look=push.style({type,title:'🌧️ Algo',body:'Texto.',severity:3,source:'Open-Meteo · modelo'});
  assert.equal(look.title,type==='official_alert'?'INMET · Algo':'Algo',type);
  assert.ok(look.action && look.action!=='Ver detalhes',type);
  if(style.icon){assert.match(look.icon,/^\.\/assets\/notifications\/.+\.png$/);assert.ok(fs.existsSync(path.join(dist,look.icon)),look.icon);}
 }
 // Todo tipo emitido pelo push-process tem estilo.
 const processor=fs.readFileSync(path.join(__dirname,'..','supabase/functions/push-process/index.ts'),'utf8');
 const types=new Set([...processor.matchAll(/type: "([a-z_]+)", severity/g)].map(m=>m[1]));
 assert.ok(types.size>=9,[...types].join());
 for(const type of types) assert.ok(push.STYLES[type],'sem estilo: '+type);
});

test('aviso oficial usa a cor da severidade do INMET e mantém a fonte no título',()=>{
 for(const [severity,file] of [[2,'alert-2'],[3,'alert-3'],[4,'alert-4'],[1,'alert-2']])
  assert.equal(push.style({type:'official_alert',title:'⚠️ Tempestade',severity}).icon,`./assets/notifications/${file}.png`);
 const look=push.style({type:'official_alert',title:'⚠️ Chuvas Intensas',body:'Perigo em Manaus. Fonte: INMET.',severity:3,source:'INMET · alerta oficial'});
 assert.equal(look.title,'INMET · Chuvas Intensas');assert.equal(look.body,'Perigo em Manaus. Fonte: INMET.');
 assert.deepEqual(look.vibrate,[200,100,200]);
});

test('previsão de modelo continua identificada sem repetir; teste e tipo desconhecido usam a marca',()=>{
 assert.equal(push.style({type:'strong_wind',title:'💨 Rajadas',body:'Rajadas de 70 km/h.',source:'Open-Meteo · modelo'}).body,'Rajadas de 70 km/h. Previsão do modelo; pode mudar.');
 assert.equal(push.style({type:'storm',title:'⛈️ Tempestade',body:'Sinal no modelo.',source:'Open-Meteo · modelo'}).body,'Sinal no modelo.');
 const test=push.style({type:'test',title:'🔔 PLUVIA',body:'Funcionando.'});
 assert.equal(test.title,'Notificações ativas');assert.equal(test.icon,'./icon-192.png');assert.equal(test.vibrate,undefined);
 const unknown=push.style({type:'nova_coisa',title:'',body:''});
 assert.equal(unknown.title,'PLUVIA');assert.equal(unknown.icon,'./icon-192.png');assert.equal(unknown.action,'Ver detalhes');
 assert.equal(push.style({type:'rain_approaching',severity:'abc'}).severity,1);
});

test('service worker mostra a notificação personalizada e cai no formato genérico sem o módulo',async()=>{
 const run=async(withModule)=>{
  const shown=[];const listeners={};
  const self={addEventListener:(type,fn)=>listeners[type]=fn,registration:{showNotification:async(title,options)=>shown.push({title,options})},navigator:{},location:{origin:'https://pluviaweather.com.br'}};
  const context=vm.createContext({self,caches:{},fetch(){},URL,Response:{error(){}},console,
   importScripts:url=>{if(!withModule)throw Error('offline');assert.match(url,/push-style\.js\?v=/);vm.runInContext(fs.readFileSync(path.join(dist,'modules/push-style.js'),'utf8'),context);}});
  context.globalThis=context;self.PLUVIA=undefined;
  vm.runInContext(fs.readFileSync(path.join(dist,'sw.js'),'utf8').replace(/self\.PLUVIA/g,'globalThis.PLUVIA'),context);
  let done;listeners.push({data:{json:()=>({type:'storm',title:'⛈️ Tempestade possível',body:'Sinal no modelo.',severity:4,source:'Open-Meteo · modelo',url:'./#alertas'})},waitUntil:p=>done=p});
  await done;return shown[0];
 };
 const styled=await run(true);
 assert.equal(styled.title,'Tempestade possível');assert.equal(styled.options.icon,'./assets/notifications/storm.png');
 assert.equal(styled.options.actions[0].title,'Ver alertas');assert.equal(styled.options.requireInteraction,true);assert.equal(styled.options.vibrate.length,5);
 const plain=await run(false);
 assert.equal(plain.title,'PLUVIA');assert.equal(plain.options.icon,'./icon-192.png');assert.equal(plain.options.vibrate,undefined);
});

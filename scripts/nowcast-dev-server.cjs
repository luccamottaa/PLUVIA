// Loopback-only development harness. This file and fixtures never ship in dist/.
const http=require('node:http');
const {createHandler}=require('../supabase/functions/_shared/nowcast/service.js');
const {evaluate}=require('../supabase/functions/_shared/nowcast/engine.js');
const {fixture}=require('../tests/support/nowcast-fixtures.cjs');
const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1],live=args.includes('--live');
const scenario=args.includes('--scenario')?arg('--scenario'):'approaching';
const scenarios=['approaching','dry','stationary','away','forming','intensifying','radar-down','stale','discordant','outside','no-location'];
if(!scenarios.includes(scenario)) throw new Error('Unknown development scenario');
const port=args.includes('--port')?Number(arg('--port')):4174;
const handler=createHandler(live?{}:{collect:async()=>fixture(scenario)});
http.createServer(async(req,res)=>{
 if(!/^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host || '')) {res.writeHead(403).end();return;}
 const url=new URL(req.url,'http://127.0.0.1:'+port);
 if(url.pathname==='/api/nowcast') {
  try {
   const request=new Request(url,{method:req.method,headers:{origin:'http://127.0.0.1:'+port}});
   let response=await handler(request);
   if(!live && response.status===200 && url.search) {
    const validated=await response.json();
    response=new Response(JSON.stringify(validated.status==='REJECTED_MOCK' ? evaluate({...fixture(scenario),
      location:scenario==='no-location'?null:validated.location},{allowMock:true}) : validated),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
   }
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
  } catch {res.writeHead(503,{'Content-Type':'application/json'}).end('{"error":"dev_server_unavailable"}');}
  return;
 }
 const upstream=http.request({hostname:'127.0.0.1',port:4173,path:req.url,method:req.method},response=>{
   res.writeHead(response.statusCode,response.headers);response.pipe(res);
 });
 upstream.on('error',()=>res.writeHead(503).end('Start node dist/dev-server.cjs --host 127.0.0.1 --port 4173 first.'));
 req.pipe(upstream);
}).listen(port,'127.0.0.1',()=>console.log(`PLUVIA Nowcast ${live?'LIVE METAR':'DEV / MOCK DATA · '+scenario} · http://127.0.0.1:${port}`));

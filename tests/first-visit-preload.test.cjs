// A previsão da primeira visita começa a baixar no topo do index.html e é consumida uma única vez pelo app.
// A URL precisa ser exatamente a que o app pede para Manaus (senão baixaria duas vezes).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('dist/index.html','utf8'),app=fs.readFileSync('dist/app.js','utf8');
const services=require('../dist/modules/weather-services.js').createServices({client:{}});
const [,lat,lon,tz]=fs.readFileSync('dist/capitals.js','utf8').match(/\['1302603','Manaus','AM','Amazonas',(-?[\d.]+),(-?[\d.]+),'([^']+)'\]/);
const manaus={id:'1302603',lat:Number(lat),lon:Number(lon),timezone:tz};
const script=html.match(/<script>\s*try \{\s*if \(window\.fetch && localStorage\.getItem\("pluvia-city"\) == null[\s\S]*?<\/script>/)[0].replace(/<\/?script>/g,'');
function run({saved=null,meta=false}={}){
  const calls=[],window={fetch:(url,options)=>{calls.push({url,options});return Promise.resolve({ok:true,json:()=>({ok:1})});}};
  vm.runInNewContext(script,{window,Date,Error,localStorage:{getItem:key=>key==='pluvia-city'?saved:null},document:{querySelector:()=>meta?{}:null}});
  return {calls,early:window.PLUVIA_EARLY_FORECAST};
}
test('primeira visita começa a previsão no topo, com a mesma URL do app, e sem <link rel=preload>',()=>{
  const {calls,early}=run();
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,services.weather.forecastUrl(manaus));
  assert.equal(early.url,services.weather.forecastUrl(manaus));
  assert.doesNotMatch(script,/rel\s*=\s*["']preload/,'o WebKit reaproveitava o preload nas atualizações seguintes');
  assert.ok(html.indexOf('PLUVIA_EARLY_FORECAST')<html.indexOf('src="./p0.js'),'antes dos scripts');
});
test('com cidade salva ou numa página de cidade nada é baixado no topo',()=>{
  assert.equal(run({saved:'"3550308"'}).calls.length,0);
  assert.equal(run({meta:true}).calls.length,0);
});
test('o app consome o fetch do topo uma única vez, só para a mesma URL',async()=>{
  const source=app.slice(app.indexOf('function takeEarlyForecast('),app.indexOf('function prefetchForecast('));
  const g={PLUVIA_EARLY_FORECAST:{url:'U',at:Date.now(),promise:Promise.resolve('dados')}};
  const take=vm.runInNewContext(`${source};takeEarlyForecast`,{globalThis:g,services:{weather:{forecastUrl:()=> 'U'}},Date,Promise,setTimeout,Error});
  assert.equal(await take({}),'dados');
  assert.equal(take({}),null,'segunda vez vai à rede');
  g.PLUVIA_EARLY_FORECAST={url:'OUTRA',at:Date.now(),promise:Promise.resolve('x')};
  assert.equal(take({}),null,'outra cidade não usa');
  g.PLUVIA_EARLY_FORECAST={url:'U',at:Date.now()-3*60000,promise:Promise.resolve('x')};
  assert.equal(take({}),null,'velho demais não usa');
});

// O pré-download da primeira visita (index.html) precisa pedir exatamente as URLs que o app pede para Manaus:
// uma URL diferente baixaria a previsão duas vezes.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('dist/index.html','utf8');
const services=require('../dist/modules/weather-services.js').createServices({client:{}});
const capitals=fs.readFileSync('dist/capitals.js','utf8');
const [,lat,lon,tz]=capitals.match(/\['1302603','Manaus','AM','Amazonas',(-?[\d.]+),(-?[\d.]+),'([^']+)'\]/);
const manaus={id:'1302603',lat:Number(lat),lon:Number(lon),timezone:tz};
const script=html.match(/<script>\s*try \{\s*if \(localStorage\.getItem\("pluvia-city"\) == null[\s\S]*?<\/script>/)[0].replace(/<\/?script>/g,'');
function run({saved=null,meta=false}={}){
  const links=[];
  vm.runInNewContext(script,{localStorage:{getItem:key=>key==='pluvia-city'?saved:null},
    document:{querySelector:()=>meta?{}:null,createElement:()=>({}),head:{appendChild:link=>links.push(link)}}});
  return links;
}
test('primeira visita pré-baixa previsão, ar e avisos com as mesmas URLs do app',()=>{
  const links=run();
  assert.deepEqual(links.map(link=>link.href),[services.weather.forecastUrl(manaus),services.airQuality.currentUrl(manaus),services.alerts.activeUrl]);
  for(const link of links) assert.deepEqual([link.rel,link.as,link.crossOrigin],['preload','fetch','anonymous']);
  assert.ok(html.indexOf('first-visit-preload')<html.indexOf('src="./p0.js'),'antes dos scripts');
});
test('com cidade salva ou numa página de cidade nada é pré-baixado',()=>{
  assert.equal(run({saved:'"3550308"'}).length,0);
  assert.equal(run({meta:true}).length,0);
});

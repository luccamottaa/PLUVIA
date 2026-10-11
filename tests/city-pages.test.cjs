const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {build}=require('../scripts/generate-city-pages.cjs');
const dist=path.join(__dirname,'..','dist');
const {api,files}=build();
const pages=[...files].filter(([file])=>file.startsWith('clima'));
const assets=html=>[...html.matchAll(/(?:src|href)="\.?\/([^"#]+\.(?:js|css)\?v=[^"]+)"/g)].map(m=>m[1]).sort();

test('páginas, rodapé e sitemap gravados correspondem ao gerador (rode scripts/generate-city-pages.cjs)',()=>{
 for(const [file,content] of files)assert.equal(fs.readFileSync(path.join(dist,file),'utf8'),content,file);
 assert.deepEqual(fs.readdirSync(path.join(dist,'clima')).sort(),Array.from(api.PAGES,city=>api.citySlug(city)).sort());
});

test('cada cidade com página tem título, descrição, canonical e dados estruturados próprios',()=>{
 assert.equal(api.CAPITALS.length,27);assert.equal(pages.length,27+api.OTHERS.length);assert.ok(api.OTHERS.length>=80);
 const titles=new Set(),canonicals=new Set();
 for(const [file,html] of pages){
  const city=api.PAGES.find(item=>file===path.join('clima',api.citySlug(item),'index.html'));
  const url='https://pluviaweather.com.br'+api.cityPagePath(city);
  titles.add(html.match(/<title>([^<]*)<\/title>/)[1]);
  canonicals.add(html.match(/<link rel="canonical" href="([^"]*)"/)[1]);
  assert.match(html,new RegExp(`<link rel="canonical" href="${url}" />`));
  assert.match(html,new RegExp(`<meta property="og:url" content="${url}" />`));
  assert.match(html,new RegExp(`<meta name="pluvia-city" content="${city.id}" />`));
  assert.ok(html.includes(`<span id="cityName">${city.name.replace(/'/g,'&#39;')}</span>`),file);
  assert.ok(html.includes(`<a href="${api.cityPagePath(city)}" aria-current="page">`),file);
  const data=JSON.parse(html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)[1]);
  const page=data['@graph'].find(node=>node['@type']==='WebPage');
  assert.equal(page.url,url);assert.equal(page.about.name,city.name);assert.equal(page.about.geo.latitude,city.lat);
  assert.equal(data['@graph'].find(node=>node['@type']==='BreadcrumbList').itemListElement.at(-1).item,url);
  // Em /clima/<slug>/ nenhum recurso pode resolver relativo à pasta da página.
  assert.doesNotMatch(html,/(?:src|href)="\.\.?\//,file);assert.doesNotMatch(html,/url\("\.\//,file);
  assert.deepEqual(assets(html),assets(files.get('index.html')),'mesmas versões de JS/CSS da Home: '+file);
 }
 assert.equal(titles.size,pages.length);assert.equal(canonicals.size,pages.length);
 assert.ok(!canonicals.has('https://pluviaweather.com.br/'));
});

test('a Home mantém canonical próprio e lista capitais e polos sem marcar nenhuma',()=>{
 const home=files.get('index.html');
 assert.match(home,/<link rel="canonical" href="https:\/\/pluviaweather\.com\.br\/" \/>/);
 assert.doesNotMatch(home,/<meta name="pluvia-city"/);assert.doesNotMatch(home,/aria-current="page"/);
 assert.equal((home.match(/<li><a href="\/clima\//g)||[]).length,api.CAPITALS.length+api.FEATURED.length);
 assert.ok(api.PAGES.length>600,'páginas extras ficam fora do rodapé da Home');
 assert.doesNotMatch(home,/capital-page-note/);
});

test('sitemap lista a Home, as capitais e as outras cidades',()=>{
 const locs=[...files.get('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
 assert.equal(locs.length,1+api.PAGES.length);assert.ok(locs.includes('https://pluviaweather.com.br/clima/parintins-am/'));assert.equal(locs[0],'https://pluviaweather.com.br/');
 assert.ok(locs.includes('https://pluviaweather.com.br/clima/sao-luis-ma/'));
 assert.match(fs.readFileSync(path.join(dist,'robots.txt'),'utf8'),/Sitemap: https:\/\/pluviaweather\.com\.br\/sitemap\.xml/);
});

test('página de cidade abre a própria cidade mesmo com outra salva',()=>{
 const chosen=[];
 const context=vm.createContext({
  document:{getElementById:()=>({hidden:true,innerHTML:'',addEventListener(){}}),querySelector:selector=>selector.includes('pluvia-city')?{content:'1501402'}:null,addEventListener(){},documentElement:{scrollTop:0},body:{scrollTop:0}},
  window:{scrollTo(){},addEventListener(){},isSecureContext:false},navigator:{},
  setTimeout:()=>1,clearTimeout(){},activeCity:null,
  cityById:new Map([['1302603',{id:'1302603'}],['1501402',{id:'1501402'}]]),CITIES:[],
  readPreference:()=> '1302603',prefetchForecast(){},locationMessage(){},openCitySearch(){},
  chooseCity:id=>chosen.push(id),
 });
 vm.runInContext(fs.readFileSync(path.join(dist,'p0.js'),'utf8'),context);
 assert.deepEqual(chosen,['1501402']);
});

test('na página de cidade a URL acompanha a cidade escolhida; na Home nunca muda',()=>{
 const app=fs.readFileSync(path.join(dist,'app.js'),'utf8');
 const source=app.slice(app.indexOf('function syncCityPage('),app.indexOf('function chooseCity('));
 const run=pathname=>{
  const calls=[];const context=vm.createContext({document:{querySelectorAll:()=>[]},Intl,localStorage:{getItem:()=>null,setItem(){}},location:{pathname,hash:''},history:{state:null,replaceState:(s,t,url)=>calls.push(url)}});
  context.globalThis=context;
  vm.runInContext(fs.readFileSync(path.join(dist,'capitals.js'),'utf8')+'\n'+source,context);
  return {calls,sync:id=>vm.runInContext(`syncCityPage(cityById.get(${JSON.stringify(id)}) || {id:${JSON.stringify(id)},name:${JSON.stringify(({'2400109':'Acari','1303403':'Parintins'})[id]||'')},uf:${JSON.stringify(id.startsWith('24')?'RN':'AM')}})`,context)};
 };
 let page=run('/clima/manaus-am/');page.sync('1501402');assert.deepEqual(page.calls,['/clima/belem-pa/']);
 page=run('/clima/manaus-am/');page.sync('1302603');assert.deepEqual(page.calls,[],'mesma cidade não reescreve');
 page=run('/clima/manaus-am/');page.sync('2400109');assert.deepEqual(page.calls,['/'],'município sem página volta para a Home');
 page=run('/clima/manaus-am/');page.sync('1303403');assert.deepEqual(page.calls,['/clima/parintins-am/'],'Parintins tem página');
 page=run('/');page.sync('1501402');assert.deepEqual(page.calls,[],'a Home não muda de endereço');
});

test('página fora das capitais traz o município completo e o app o registra sem o índice',()=>{
 const html=files.get(path.join('clima','parintins-am','index.html'));
 const content=html.match(/<meta name="pluvia-city-record" content="([^"]*)" \/>/)[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&');
 const record=JSON.parse(content);
 assert.deepEqual(record,{id:'1303403',name:'Parintins',uf:'AM',state:'Amazonas',lat:-2.63741,lon:-56.729,timezone:'America/Manaus'});
 assert.match(html,/Parintins é um município do estado do Amazonas\. Horários no fuso America\/Manaus \(UTC−4\)\./);
 assert.doesNotMatch(files.get(path.join('clima','manaus-am','index.html')),/pluvia-city-record/,'capitais já estão no app');
 const load=meta=>{const context=vm.createContext({Intl,localStorage:{getItem:()=>null,setItem(){}},document:{querySelector:selector=>selector==='meta[name="pluvia-city-record"]' && meta!=null ? {content:meta} : null}});context.globalThis=context;
  vm.runInContext(fs.readFileSync(path.join(dist,'capitals.js'),'utf8'),context);return vm.runInContext('cityById',context);};
 assert.equal(load(content).get('1303403').timezone,'America/Manaus');
 assert.equal(load(JSON.stringify({...record,lat:'x'})).has('1303403'),false,'registro inválido é ignorado');
 assert.equal(load('{quebrado').has('1303403'),false);
});

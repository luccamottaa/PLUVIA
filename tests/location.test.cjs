const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
const source=fs.readFileSync(path.join(root,'dist/app.js'),'utf8');
const nodes=new Map([...html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)].map(([tag,id])=>[id,{
  innerHTML:'',textContent:'',value:'',style:{},dataset:{},hidden:/\shidden(?:\s|>)/.test(tag),attrs:{},events:{},
  classList:{add(){},remove(){},toggle(){}},setAttribute(k,v){this.attrs[k]=v;},
  addEventListener(k,fn){this.events[k]=fn;},focus(){},showModal(){this.open=true;},close(){this.open=false;}
}]));
const requests=[];
const storage=new Map([['pluvia-city','"2611101"']]); // Old saved city must not be displayed on arrival.
const context=vm.createContext({document:{getElementById:id=>nodes.get(id),querySelectorAll:()=>[]},
  navigator:{geolocation:{getCurrentPosition(success,error){requests.push({success,error});}}},
  localStorage:{getItem:key=>storage.get(key),setItem:(k,v)=>storage.set(k,v)},
  Intl,Date,URL,AbortController,setTimeout,clearTimeout,
  DOMParser:class{parseFromString(text){return {documentElement:{textContent:text}};}}
});
for(const file of ['municipalities.js','capitals.js']) vm.runInContext(fs.readFileSync(path.join(root,'dist',file),'utf8'),context);
vm.runInContext(source.slice(0,source.lastIndexOf('\nsetupCityPicker();')),context);
const run=s=>vm.runInContext(s,context);
assert.equal(run('activeCity'),null);
context.setupCityPicker();
let refreshes=0;
context.refreshAll=async()=>{refreshes++;return true;};
context.requestLocation();
assert.equal(requests.length,1);assert.equal(refreshes,0);assert.equal(nodes.get('weatherView').hidden,false);
requests[0].error({code:1});
assert.equal(run('activeCity'),null);assert.equal(nodes.get('weatherView').hidden,false);
assert(nodes.get('locationStatus').textContent.includes('não autorizada'));
context.requestLocation();requests[1].error({code:3});
assert.equal(run('activeCity'),null);assert.equal(refreshes,0);
context.requestLocation();
context.openCitySearch();
assert.equal(nodes.get('cityDialog').open,true);
context.chooseCity('1303403');
assert.equal(nodes.get('cityDialog').open,false);
assert.equal(run('activeCity.name'),'Parintins');
requests[2].success({coords:{latitude:-23.551,longitude:-46.633}});
assert.equal(run('activeCity.name'),'Parintins'); // Late GPS cannot replace a manual choice.
context.requestLocation();requests[3].success({coords:{latitude:-3.119,longitude:-60.022}});
assert.equal(run('activeCity.name'),'Manaus');assert.equal(nodes.get('weatherView').hidden,false);
assert.equal(nodes.get('locationWelcome').hidden,true);assert.equal(nodes.get('siteNav').hidden,false);
assert.equal(nodes.get('welcomeLocate').disabled,false);
assert.equal(refreshes,2);
const fallbackNotice=nodes.get('locationNotice');
fallbackNotice.hidden=false;fallbackNotice.textContent='Sem localização — mostrando Manaus';
context.chooseCity('1303403');
assert.equal(run('activeCity.name'),'Parintins');
assert.equal(fallbackNotice.hidden,true,'a different city must clear the Manaus fallback notice');
assert.equal(fallbackNotice.textContent,'');
fallbackNotice.hidden=false;fallbackNotice.textContent='Aviso antigo';
const refreshesBeforeReselect=refreshes;
context.chooseCity('1303403');
assert.equal(fallbackNotice.hidden,true,'explicitly reselecting the city also acknowledges the fallback');
assert.equal(refreshes,refreshesBeforeReselect,'reselection must not trigger duplicate weather requests');
fallbackNotice.hidden=false;fallbackNotice.textContent='Aviso válido';
context.chooseCity('invalid-city');
assert.equal(fallbackNotice.hidden,false,'an invalid selection must leave the current notice intact');
assert(html.indexOf('<dialog') < html.indexOf('<div id="weatherView" class="initial-loading" aria-busy="true">'));
assert.match(html, /<span id="cityName">Seu céu<\/span>/);
console.log('PASS location: honest loading shell, permission failures, manual search, GPS, late-request isolation and fallback notice reset.');

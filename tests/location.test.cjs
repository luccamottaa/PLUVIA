const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
const source=fs.readFileSync(path.join(root,'dist/app.js'),'utf8');
const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,{
  innerHTML:'',textContent:'',value:'',style:{},dataset:{},hidden:id==='weatherView',attrs:{},events:{},
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
assert.equal(requests.length,1);assert.equal(refreshes,0);assert.equal(nodes.get('weatherView').hidden,true);
requests[0].error({code:1});
assert.equal(run('activeCity'),null);assert.equal(nodes.get('weatherView').hidden,true);
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
assert(html.indexOf('<dialog') < html.indexOf('<div id="weatherView" hidden>'));
console.log('PASS location-first: no saved/default city, denied and timed-out location, manual search dialog, GPS success, and late GPS isolation.');

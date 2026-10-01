const {test}=require('node:test'),assert=require('node:assert/strict');
const {snapshot,valid,MAX_AGE_MS}=require('../dist/favorite-cities.js');
test('favoritos mostram valores reais e chance máxima nas próximas horas',()=>{
 const value=snapshot({current:{temperature_2m:29,weather_code:2,time:'2026-09-30T20:00',is_day:0},hourly:{time:['2026-09-30T19:00','2026-09-30T20:00','2026-09-30T21:00','2026-09-30T22:00'],precipitation_probability:[100,0,40,20]}},1000);
 assert.equal(value.temperature,29);assert.equal(value.rain,40);assert.equal(value.isDay,false);
 assert.equal(valid(value,2000),true);assert.equal(valid(value,1000+MAX_AGE_MS+1),false);assert.equal(valid(value,999),false);
});
test('favoritos não inventam chuva nem temperatura quando o serviço omite dados',()=>{
 assert.equal(snapshot({current:{temperature_2m:null,weather_code:0}}),null);
 const value=snapshot({current:{temperature_2m:0,weather_code:0}});
 assert.equal(value.temperature,0);assert.equal(value.rain,null);
});
test('favoritos continuam disponíveis na busca sem elementos na página principal',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 function element() {
  return {children:[],dataset:{},attrs:{},events:{},textContent:'',hidden:false,
   setAttribute(key,value){this.attrs[key]=value;},
   append(...children){this.children.push(...children);},
   replaceChildren(...children){this.children=children;},
   addEventListener(type,handler){this.events[type]=handler;},
   closest(){return this.dataset.favoriteId ? this : null;}};
 }
 const nodes=new Map(['dialogFavoriteList','dialogFavorites','dialogFavoriteStatus'].map(id=>[id,element()]));
 const events={},choices=[],cached=JSON.stringify({temperature:29,code:95,rain:70,at:Date.now()});
 const cities=new Map([['1302603',{id:'1302603',name:'Manaus',uf:'AM'}],['1303403',{id:'1303403',name:'Parintins',uf:'AM'}]]);
 const context=vm.createContext({
  document:{getElementById:id=>nodes.get(id),createElement:element,addEventListener(){}},
  navigator:{onLine:false},localStorage:{getItem:()=>cached},
  favorites:new Set(cities.keys()),cityById:cities,activeCity:cities.get('1302603'),
  ensureCityDetails:async id=>cities.get(id),chooseCity:(id,city)=>choices.push({id,city}),
  addEventListener:(type,handler)=>{events[type]=handler;},setTimeout,
  PLUVIA:{weatherIcons:{condition:()=>({label:'Trovoadas'})}}
 });
 vm.runInContext(fs.readFileSync(require.resolve('../dist/favorite-cities.js'),'utf8'),context);
 const list=nodes.get('dialogFavoriteList');
 assert.equal(nodes.get('dialogFavorites').hidden,false);
 assert.equal(list.children.length,2);
 assert.equal(list.children[0].children[0].textContent,'Manaus/AM');
 assert.equal(list.children[0].children[1].textContent,'29°');
 assert.equal(list.children[0].children[2].textContent,'Trovoadas');
 await list.events.click({target:list.children[1]});
 assert.equal(choices[0].id,'1303403');
 assert.equal(choices[0].city,cities.get('1303403'));
 assert.equal(nodes.get('dialogFavoriteStatus').textContent,'');
 context.favorites.clear();events['pluvia:favorites-changed']();
 assert.equal(list.children.length,0);
 assert.equal(nodes.get('dialogFavorites').hidden,true);
 context.favorites.add('1302603');events['pluvia:favorites-changed']();
 assert.equal(list.children.length,1);
 assert.equal(nodes.get('dialogFavorites').hidden,false);
});

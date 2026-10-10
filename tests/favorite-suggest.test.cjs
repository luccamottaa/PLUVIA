const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','dist','app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','dist','index.html'),'utf8');
const source=app.slice(app.indexOf('const VISITS_KEY'),app.indexOf('function renderCityOptions('));
function setup(){
  const store=new Map(),tracked=[],listeners={},clock={now:Date.parse('2026-10-10T12:00:00Z')};
  const els={favoriteSuggest:{hidden:true},favoriteSuggestCity:{textContent:''}};
  for(const id of ['favoriteSuggestSave','favoriteSuggestDismiss'])els[id]={addEventListener:(type,fn)=>{listeners[id]=fn;}};
  const ctx={$:id=>els[id],favorites:new Set(),activeCity:{id:'1302603',name:'Manaus'},JSON,Object,Array,Number,String,Math,
    Date:{now:()=>clock.now},localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))},
    globalThis:{pluviaAnalytics:{track:name=>tracked.push(name)}}};
  ctx.toggleFavoriteCity=()=>{ctx.favorites.add(ctx.activeCity.id);return true;};
  vm.runInNewContext(source+'\nsetupFavoriteSuggest();this.api={countCityVisit,renderFavoriteSuggest};',ctx);
  const visit=(hours=7)=>{clock.now+=hours*3600000;ctx.api.countCityVisit(ctx.activeCity.id);ctx.api.renderFavoriteSuggest();};
  return {ctx,els,store,tracked,listeners,visit};
}
test('convite aparece só na 3ª visita em momentos diferentes e some ao salvar',()=>{
  const t=setup();
  t.visit();t.visit(1);t.visit(2);
  assert.equal(t.els.favoriteSuggest.hidden,true,'visitas com menos de 6 h contam uma vez');
  t.visit();assert.equal(t.els.favoriteSuggest.hidden,true);
  t.visit();assert.equal(t.els.favoriteSuggest.hidden,false);
  assert.equal(t.els.favoriteSuggestCity.textContent,'Manaus');
  t.ctx.api.renderFavoriteSuggest();
  assert.deepEqual(t.tracked,['Favorite Suggested'],'mesma cidade não conta o convite duas vezes');
  t.listeners.favoriteSuggestSave();
  assert.ok(t.ctx.favorites.has('1302603'));assert.equal(t.els.favoriteSuggest.hidden,true);
  assert.deepEqual(t.tracked,['Favorite Suggested','Favorite Suggestion Accepted']);
});
test('"Agora não" vale para aquela cidade; outra cidade frequente ainda recebe o convite',()=>{
  const t=setup();
  for(let i=0;i<3;i++)t.visit();
  t.listeners.favoriteSuggestDismiss();
  assert.equal(t.els.favoriteSuggest.hidden,true);t.visit();assert.equal(t.els.favoriteSuggest.hidden,true);
  t.ctx.activeCity={id:'1100205',name:'Porto Velho'};
  for(let i=0;i<3;i++)t.visit();
  assert.equal(t.els.favoriteSuggest.hidden,false);
  assert.doesNotMatch([...t.store.values()].join(),/Manaus|Porto Velho|lat|lon/,'guarda só ids e contagens');
});
test('favoritas, lista cheia e dados corrompidos não mostram convite',()=>{
  const t=setup();t.store.set('pluvia-city-visits','{oops');
  t.visit();assert.equal(t.els.favoriteSuggest.hidden,true);
  for(let i=0;i<3;i++)t.visit();
  t.ctx.favorites=new Set(Array.from({length:30},(_,i)=>String(1000000+i)));
  t.ctx.api.renderFavoriteSuggest();assert.equal(t.els.favoriteSuggest.hidden,true);
});
test('convite fica no topo, escondido por padrão, com dois botões nativos',()=>{
  assert.match(html,/id="cityDots"[^>]*hidden><\/div>\s*<div class="favorite-suggest" id="favoriteSuggest" hidden><button id="favoriteSuggestSave"[^>]*type="button">[\s\S]*?<button id="favoriteSuggestDismiss"[^>]*type="button">Agora não<\/button><\/div>/);
});

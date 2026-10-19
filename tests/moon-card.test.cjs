const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const moonView=require('../dist/modules/moon-view.js');
const time=require('../dist/modules/city-time.js');

const city={id:'1302603',name:'Manaus',timezone:'America/Manaus',lat:-3.1,lon:-60.02};
function card(astronomy){
  const app=fs.readFileSync('dist/app.js','utf8');
  const start=app.indexOf('function renderMoonCard('), end=app.indexOf('\nfunction renderSun(',start);
  const nodes={moonNextLabel:{textContent:''},moonNextTime:{textContent:''},moonFullIn:{textContent:''}};
  const ctx={activeCity:city,$:id=>nodes[id],formatUpdateTime:stamp=>new Date(stamp).toISOString().slice(11,16),
    globalThis:{PLUVIA:{time,sky:{astronomyAt:at=>astronomy(at)},skyEvents:{nextPhases:()=>({full:Date.parse('2026-10-26T12:00:00Z')})}}}};
  vm.createContext(ctx);vm.runInContext(app.slice(start,end)+'\nthis.renderMoonCard=renderMoonCard;',ctx);
  return {render:at=>ctx.renderMoonCard(at,astronomy(at)),nodes};
}

test('percentual da iluminação aparece sozinho no cartão (o rótulo já diz Iluminação)',()=>{
  const nodes={moonIllumination:{textContent:''},moonPhase:{textContent:''}};
  moonView.create({document:{getElementById:id=>nodes[id]},getIllumination:()=>({phase:.6,fraction:.56})}).update();
  assert.equal(nodes.moonIllumination.textContent,'56%');
  moonView.create({document:{getElementById:id=>nodes[id]},getIllumination:()=>null}).update();
  assert.equal(nodes.moonIllumination.textContent,'Indisponível');
});

test('próximo evento da Lua: hoje antes de amanhã, e "amanhã" quando o de hoje já passou',()=>{
  const day=Date.parse('2026-10-19T04:00:00Z');
  const astronomy=at=>at<day+86400000 ? {moonRise:Date.parse('2026-10-19T16:43:00Z'),moonSet:Date.parse('2026-10-19T04:10:00Z')}
    : {moonRise:Date.parse('2026-10-20T17:30:00Z'),moonSet:Date.parse('2026-10-20T05:00:00Z')};
  const {render,nodes}=card(astronomy);
  render(Date.parse('2026-10-19T12:00:00Z'));
  assert.equal(nodes.moonNextLabel.textContent,'Nascer da Lua');assert.equal(nodes.moonNextTime.textContent,'16:43');
  render(Date.parse('2026-10-19T20:00:00Z'));
  assert.equal(nodes.moonNextLabel.textContent,'Pôr da Lua');assert.equal(nodes.moonNextTime.textContent,'amanhã, 05:00');
});

test('dias até a lua cheia contam no calendário municipal; sem eventos não inventa horário',()=>{
  const {render,nodes}=card(()=>({moonRise:null,moonSet:null}));
  render(Date.parse('2026-10-19T12:00:00Z'));
  assert.equal(nodes.moonFullIn.textContent,'em 7 dias');
  assert.equal(nodes.moonNextTime.textContent,'Indisponível');
  render(Date.parse('2026-10-25T15:00:00Z'));
  assert.equal(nodes.moonFullIn.textContent,'amanhã');
  render(Date.parse('2026-10-26T01:00:00Z'));
  assert.equal(nodes.moonFullIn.textContent,'amanhã','21h em Manaus ainda é dia 25');
});

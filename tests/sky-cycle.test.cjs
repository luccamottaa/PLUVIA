const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {create}=require('../dist/modules/sky-atmosphere.js');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync('dist/vendor/suncalc.js','utf8'),context);
const sun=context.PLUVIA.sun;
const cities=[
  {id:'1302603',lat:-3.119,lon:-60.022,timezone:'America/Manaus'},
  {id:'2611101',lat:-9.389,lon:-40.503,timezone:'America/Recife'},
  {id:'4106902',lat:-25.429,lon:-49.267,timezone:'America/Sao_Paulo'}
];
const instant=Date.parse('2026-09-30T12:00:00-04:00');
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-6,message || `${a} != ${b}`);
function setup() {
  const root={dataset:{},style:{values:{},setProperty(key,value){this.values[key]=value;}}};
  return {root,sky:create({document:{documentElement:root},sun})};
}

test('sol atravessa o céu, culmina no meio do dia e some no pôr do sol, sem API',()=>{
  for(const city of cities) {
    const {sky}=setup();
    const times=sun.getTimes(new Date(instant),city.lat,city.lon);
    const rise=times.sunrise.getTime(),set=times.sunset.getTime();
    sky.apply(null,null,null,city,rise);
    const morning=sky.update(rise),noon=sky.update((rise+set)/2),evening=sky.update(set);
    close(morning.sunX,.12);close(morning.sunY,1);
    close(noon.sunX,.5);close(noon.sunY,0);
    close(evening.sunX,.88);close(evening.sunY,1);
    assert.equal(noon.sunVisibility,1);
    assert.equal(evening.sunVisibility,0);
    assert.equal(evening.phase,'night');
  }
});

test('lua percorre a noite até o nascer do sol seguinte, preservando a fase lunar',()=>{
  for(const city of cities) {
    const {sky}=setup();
    const set=sun.getTimes(new Date(instant),city.lat,city.lon).sunset.getTime();
    const rise=sun.getTimes(new Date(instant+86400000),city.lat,city.lon).sunrise.getTime();
    sky.apply(0,1,null,city,set);
    const evening=sky.update(set),middle=sky.update((set+rise)/2),morning=sky.update(rise-1);
    close(evening.moonX,.12);close(evening.moonY,1);
    close(middle.moonX,.5);close(middle.moonY,0);
    close(morning.moonX,.88);close(morning.moonY,1);
    assert.equal(middle.moonVisibility,1);
    assert.equal(sky.update(rise).moonVisibility,0);
  }
});

test('trajetória noturna fica contínua à meia-noite e usa os dias adjacentes da previsão',()=>{
  const {sky}=setup();
  const daily={sunrise:['2026-09-30T05:46:00-04:00','2026-10-01T05:47:00-04:00'],sunset:['2026-09-30T17:54:00-04:00','2026-10-01T17:55:00-04:00']};
  const start=Date.parse(daily.sunset[0]),end=Date.parse(daily.sunrise[1]);
  sky.apply(0,0,daily,cities[0],start);
  const midnight=Date.parse('2026-10-01T00:00:00-04:00');
  const before=sky.update(midnight-1),after=sky.update(midnight+1);
  close(before.moonX,after.moonX);close(before.moonY,after.moonY);
  close(sky.update((start+end)/2).moonX,.5);
});

test('noite com mudança de horário de verão usa a duração real até o próximo amanhecer',()=>{
  const sky=create();
  const city={timezone:'America/New_York'};
  const daily={sunrise:['2026-10-31T07:25:00-04:00','2026-11-01T06:26:00-05:00'],sunset:['2026-10-31T17:53:00-04:00','2026-11-01T16:52:00-05:00']};
  const start=Date.parse(daily.sunset[0]),end=Date.parse(daily.sunrise[1]);
  sky.apply(0,0,daily,city,start);
  close(sky.update((start+end)/2).moonX,.5);
});

test('ticks de trinta segundos são suaves; abrir, retomar e trocar cidade acertam a posição imediatamente',()=>{
  const {sky,root}=setup();
  sky.apply(0,1,null,cities[0],instant);
  assert.equal(root.dataset.skyTransition,'instant');
  const start=sky.update(instant+30000);
  assert.equal(root.dataset.skyTransition,'live');
  const next=sky.update(instant+60000);
  assert.ok(next.sunX>start.sunX);
  const reopened=sky.update(instant+5*3600000);
  assert.equal(root.dataset.skyTransition,'instant');
  assert.deepEqual(reopened,setup().sky.apply(0,1,null,cities[0],instant+5*3600000));
  sky.apply(0,1,null,cities[1],instant+5*3600000);
  assert.equal(root.dataset.skyTransition,'instant');
});

test('dias parciais, coordenadas ausentes e efeméride indisponível não produzem posições inválidas',()=>{
  for(const sun of [null,{getTimes(){throw Error('indisponível');}}]) {
    const sky=create({sun});
    for(const city of [null,cities[0]]) {
      const state=sky.apply(null,null,{sunrise:['inválido'],sunset:[]},city,instant);
      assert.equal(state.weather,'unknown');
      assert.equal(state.sunVisibility,0);assert.equal(state.moonVisibility,0);
      for(const key of ['sunX','sunY','moonX','moonY'])assert.ok(Number.isFinite(state[key]));
    }
  }
});

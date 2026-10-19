const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const moonView=require('../dist/modules/moon-view.js');
const skyView=require('../dist/modules/sky-atmosphere.js');
const html=fs.readFileSync('dist/index.html','utf8');
const time=require('../dist/modules/city-time.js');
const vm=require('node:vm');
const vendor=vm.createContext({});vm.runInContext(fs.readFileSync('dist/vendor/suncalc.js','utf8'),vendor);
const cities=[{id:'1302603',lat:-3.119,lon:-60.022,timezone:'America/Manaus'},
 {id:'3550308',lat:-23.55,lon:-46.63,timezone:'America/Sao_Paulo'},
 {id:'2611606',lat:-8.05,lon:-34.9,timezone:'America/Recife'}];

test('intro, céu e card compartilham um disco e uma textura lunar',()=>{
  assert.equal([...html.matchAll(/id="moonDisc"/g)].length,1);
  assert.equal([...html.matchAll(/id="moonIcon"/g)].length,1);
  // Reutilizações do mesmo disco: intro, céu e arco do Ciclo do dia (à noite); o cartão da Lua usa o disco
  // em alta definição, com a mesma máscara de fase.
  assert.equal([...html.matchAll(/href="#moonDisc"/g)].length,3);
  assert.equal([...html.matchAll(/href="#moonDiscHd"/g)].length,1);
  assert.equal([...html.matchAll(/mask="url\(#pluviaMoonPhase\)"/g)].length,2);
  assert.equal([...html.matchAll(/href="\.\/assets\/moon-surface\.webp\?v=moon-1"/g)].length,1);
  assert.ok(html.indexOf('modules/moon-view.js?v=')<html.indexOf('modules/sky-atmosphere.js?v='));
});

test('relógio da atmosfera atualiza a fase e limpa disco e brilho quando ela falta',()=>{
  const fields=Object.fromEntries(['moonDisc','moonIcon','moonPhase'].map(id=>[id,{setAttribute(k,v){this[k]=v;}}]));
  const style={values:{},setProperty(k,v){this.values[k]=v;}};
  const document={getElementById:id=>fields[id],documentElement:{dataset:{},style}};
  const moon=moonView.create({document,getIllumination:date=>({phase:date.getUTCHours()/24})});
  const sky=skyView.create({document,moonView:moon});
  const quarter=Date.parse('2026-09-30T06:00:00Z');
  sky.apply(0,0,null,null,quarter);
  assert.equal(fields.moonPhase.textContent,'Quarto crescente');
  assert.equal(fields.moonDisc.visibility,'visible');
  assert.equal(style.values['--moon-light'],'0.500');
  sky.update(Date.parse('2026-09-30T12:00:00Z'));
  assert.equal(fields.moonPhase.textContent,'Lua cheia');
  assert.equal(style.values['--moon-light'],'1.000');
  sky.update(NaN);
  assert.equal(fields.moonDisc.visibility,'hidden');
  assert.equal(fields.moonPhase.textContent,'Fase indisponível');
  assert.equal(style.values['--moon-light'],'0.000');
});

test('abertura antes de montar o DOM e falha da efeméride não quebram o céu',()=>{
  assert.doesNotThrow(()=>moonView.create().update());
  const moon=moonView.create({getIllumination(){throw new Error('unavailable');}});
  const state=skyView.create({moonView:moon}).apply(0,0);
  assert.equal(state.phase,'night');
});
test('percentual e brilho usam a fração iluminada devolvida pela efeméride compartilhada',()=>{
 const result=moonView.create({getIllumination:()=>({phase:.25,fraction:.47})}).update(Date.parse('2026-10-03T12:00Z'));
 assert.equal(result.fraction,.47);assert.equal(result.label,'Quarto crescente');
});

test('Lua decorativa segue a noite municipal mesmo antes do nascer real em cidades diferentes',()=>{
 for(const city of cities) {
  const at=time.parse('2026-10-03T19:30',city);
  assert.ok(vendor.PLUVIA.moon.getMoonPosition(new Date(at),city.lat,city.lon).altitude<0);
  const sky=skyView.create(vendor.PLUVIA);
  const state=sky.apply(0,0,null,city,at);
  assert.equal(state.phase,'night');assert.equal(state.moonVisibility,1);
  assert.equal(state.sunVisibility,0);
  assert.ok(state.moonX>=.12 && state.moonX<=.88 && state.moonY>=0 && state.moonY<=1);
  assert.equal(sky.astronomyAt(at).moonAvailable,true);
  assert.deepEqual(skyView.create(vendor.PLUVIA).apply(0,0,null,city,at),state,'abrir a página não reinicia trajetória');
 }
});
test('meia-noite preserva a trajetória ilustrada e trocar de cidade usa seu próprio ciclo',()=>{
 const sky=skyView.create(vendor.PLUVIA),city=cities[0];
 const before=sky.apply(2,0,null,city,time.parse('2026-10-03T23:59',city));
 const after=sky.update(time.parse('2026-10-04T00:00',city));
 assert.equal(after.moonVisibility,1);assert.equal(after.phase,'night');
 assert.ok(Math.abs(after.moonX-before.moonX)<.003 && Math.abs(after.moonY-before.moonY)<.003);
 const at=time.parse('2026-10-04T01:00',city),a=sky.update(at);
 const b=sky.apply(2,0,null,cities[1],at);
 assert.equal(b.phase,'night');assert.notEqual(a.moonX,b.moonX);
 assert.equal(sky.apply(0,1,null,city,time.parse('2026-10-04T12:00',city)).moonVisibility,0);
});

test('iluminação natural: Lua cheia uniforme, quarto com metade escura e passagem suave no terminador',()=>{
  const size=64, at=(alpha,x,y)=>alpha[y*size+x];
  assert.equal(moonView.shading(0,size),null);assert.equal(moonView.shading(1,size),null);
  const full=moonView.shading(.5,size);
  assert.equal(at(full,32,32),255);assert.ok(at(full,8,32)>=240,'sem escurecer a borda da Lua cheia');
  const quarter=moonView.shading(.25,size);
  for(let x=0;x<31;x+=1) assert.equal(at(quarter,x,32),0,'crescente: lado esquerdo escuro');
  const row=Array.from({length:size-34},(_,i)=>at(quarter,33+i,32));
  for(let i=1;i<row.length;i+=1) assert.ok(row[i]>=row[i-1],'a luz só aumenta do terminador para o limbo');
  assert.ok(row.filter(value=>value>0 && value<230).length>=6,'transição gradual, não um corte seco');
  const waning=moonView.shading(.75,size);
  assert.ok(at(waning,10,32)>200 && at(waning,54,32)===0,'minguante: lado direito escuro');
});
test('máscara sombreada é desenhada uma vez por fase e substitui o terminador duro',()=>{
  const attrs={};let drawn=0;
  const el=id=>({setAttribute(k,v){(attrs[id]||={})[k]=v;},getAttribute(k){return attrs[id]?.[k];}});
  const nodes=Object.fromEntries(['moonShade','moonIcon','moonDisc','moonDiscHd','moonPhase','moonIllumination'].map(id=>[id,el(id)]));
  const canvas={getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){drawn+=1;}}),toDataURL:()=>'data:image/png;base64,AAA'};
  const document={getElementById:id=>nodes[id],createElement:()=>canvas,documentElement:{style:{setProperty(){}}}};
  const view=moonView.create({document,getIllumination:()=>({phase:.3,fraction:.65})});
  view.update(0);view.update(30000);
  assert.equal(drawn,1);assert.equal(attrs.moonShade.href,'data:image/png;base64,AAA');
  assert.equal(attrs.moonIcon.d,'');assert.equal(attrs.moonDiscHd.visibility,'visible');
});

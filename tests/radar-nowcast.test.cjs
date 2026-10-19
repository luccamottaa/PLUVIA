const {test}=require('node:test');
const assert=require('node:assert/strict');
const nowcast=require('../dist/modules/radar-nowcast.js');
const {SIZE,CENTER}=nowcast;
// Mancha circular de raio r centrada em (cx, cy).
function blob(cx,cy,r=14){const m=new Uint8Array(SIZE*SIZE);for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if((x-cx)**2+(y-cy)**2<=r*r)m[y*SIZE+x]=1;return m;}

test('mancha andando para a cidade: chegada pelo deslocamento das duas imagens',()=>{
  // 20 min: de 60 px a oeste para 44 px a oeste (16 px = ~19 km em 20 min, ~58 km/h no equador).
  const before=blob(CENTER-60,CENTER),after=blob(CENTER-44,CENTER);
  const result=nowcast.estimate(before,after,SIZE,1200,-3.1);
  assert.ok(result);
  // Borda a 30 px da janela da cidade (raio 4); 8 px por 10 min → ~40 min.
  assert.ok(result.minutes>=30&&result.minutes<=50,String(result.minutes));
  assert.ok(result.speedKmh>=45&&result.speedKmh<=70,String(result.speedKmh));
});

test('mancha se afastando, parada longe, pequena demais ou já em cima da cidade: nada a dizer',()=>{
  assert.equal(nowcast.estimate(blob(CENTER-44,CENTER),blob(CENTER-60,CENTER),SIZE,1200,0),null,'indo embora');
  assert.equal(nowcast.estimate(blob(CENTER-70,CENTER),blob(CENTER-70,CENTER),SIZE,1200,0),null,'parada fora');
  assert.equal(nowcast.estimate(blob(CENTER-50,CENTER,2),blob(CENTER-40,CENTER,2),SIZE,1200,0),null,'eco insuficiente');
  assert.equal(nowcast.estimate(blob(CENTER-8,CENTER),blob(CENTER,CENTER),SIZE,1200,0),null,'já chove na cidade');
  // Formas sem relação entre as imagens (sobreposição ruim): não inventa movimento.
  const noise=a=>{const m=new Uint8Array(SIZE*SIZE);let s=a;for(let i=0;i<m.length;i++){s=(s*16807)%2147483647;m[i]=s%9===0?1:0;}return m;};
  assert.equal(nowcast.estimate(noise(7),noise(11),SIZE,1200,0),null);
});

test('frase desconta o tempo desde a imagem e some quando velha ou já chegou',()=>{
  const now=Date.parse('2026-10-19T15:00:00Z');
  const result={minutes:40,frameAt:now-10*60_000};
  assert.equal(nowcast.answer(result,now).text,'Chuva a caminho pelo radar: deve chegar em cerca de 30 min, pelo movimento das últimas imagens.');
  assert.match(nowcast.answer({minutes:20,frameAt:now-10*60_000},now).text,/nos próximos 10 min/);
  assert.equal(nowcast.answer({minutes:10,frameAt:now-8*60_000},now),null,'já deveria ter chegado');
  assert.equal(nowcast.answer({minutes:60,frameAt:now-25*60_000},now),null,'imagem velha');
  assert.equal(nowcast.answer(null,now),null);
});

test('busca do movimento é leve (grade reduzida)',()=>{
  const before=blob(CENTER-60,CENTER-10),after=blob(CENTER-44,CENTER-6);
  const t=process.hrtime.bigint();for(let i=0;i<5;i++)nowcast.estimate(before,after,SIZE,1200,0);
  const ms=Number(process.hrtime.bigint()-t)/1e6/5;
  assert.ok(ms<60,`${ms.toFixed(1)} ms`);
});

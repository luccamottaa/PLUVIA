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

test('app e servidor dão o mesmo resultado (núcleo copiado em _shared/radar-nowcast.js)',async()=>{
  const server=await import('../supabase/functions/_shared/radar-nowcast.js');
  for(const [a,b] of [[-60,-44],[-44,-60],[-70,-70],[-30,-20]]){
    const before=blob(CENTER+a,CENTER+5),after=blob(CENTER+b,CENTER+3);
    assert.deepEqual(server.estimate(before,after,SIZE,1200,-3.1),nowcast.estimate(before,after,SIZE,1200,-3.1),`${a}→${b}`);
  }
  // Janela montada das telhas decodificadas: o pixel da cidade cai no centro.
  const tiles=server.windowTiles(-60.022,-3.119);
  assert.ok(tiles.length>=1&&tiles.length<=4);
  const decoded=tiles.map(t=>{const rgba=new Uint8Array(256*256*4);const px=server.pixelOf(-60.022,-3.119);const x=Math.round(px.x)-t.tx*256,y=Math.round(px.y)-t.ty*256;if(x>=0&&x<256&&y>=0&&y<256)rgba[(y*256+x)*4+3]=255;return {...t,rgba};});
  const m=server.windowMask(decoded);
  assert.equal(m[CENTER*SIZE+CENTER],1);
});

test('próxima hora: barras de 5 em 5 min com a mancha empurrada pelo mesmo deslocamento',()=>{
  const now=Date.parse('2026-10-19T15:00:00Z');
  const before=blob(CENTER-60,CENTER),after=blob(CENTER-44,CENTER);
  const step=nowcast.stepFor(before,after,SIZE,1200);
  assert.ok(step);
  const coming=nowcast.nextHour({mask:after,perStep:step.perStep,frameAt:now},now);
  assert.equal(coming.points.length,13);
  assert.deepEqual(coming.points.map(p=>p.minutes),[0,5,10,15,20,25,30,35,40,45,50,55,60]);
  assert.ok(coming.points[0].coverage<0.25,'ainda seco agora');
  assert.match(coming.text,/^Pelo radar, a chuva chega em cerca de \d+ min/);
  // A mesma mancha já em cima da cidade e indo embora: diz quando diminui.
  const leaving=nowcast.stepFor(blob(CENTER-16,CENTER),blob(CENTER,CENTER),SIZE,1200);
  const over=nowcast.nextHour({mask:blob(CENTER,CENTER),perStep:leaving.perStep,frameAt:now},now);
  assert.ok(over.points[0].coverage>=0.25);
  assert.match(over.text,/diminuir em cerca de \d+ min|segue a próxima hora toda/);
  // Imagem velha, sem movimento ou nenhuma barra com chuva: nada aparece.
  assert.equal(nowcast.nextHour({mask:after,perStep:step.perStep,frameAt:now-25*60_000},now),null);
  assert.equal(nowcast.nextHour({mask:after,frameAt:now},now),null);
  assert.equal(nowcast.nextHour({mask:blob(CENTER+60,CENTER),perStep:step.perStep,frameAt:now},now),null,'indo para longe da cidade');
  assert.equal(nowcast.nextHour(null,now),null);
});

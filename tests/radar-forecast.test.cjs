'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const nowcast=require('../dist/modules/radar-nowcast.js');

test('previsão do radar empurra a imagem mais recente pelo passo medido, uma imagem por passo',async()=>{
  const draws=[],loads=[];
  const canvas=()=>{const self={width:0,height:0,getContext:()=>({drawImage:(img,x,y)=>draws.push({img,x,y,into:self})}),toDataURL:()=>'data:image/png;base64,'+draws.filter(d=>d.into===self).map(d=>d.x+','+d.y).join('|')};return self;};
  globalThis.document={createElement:()=>canvas()};
  globalThis.PLUVIA={radar:{loadImage:async url=>{loads.push(url);return {url};}}};
  try {
    const images=await nowcast.forecastImages('https://tile.test','/v2/radar/123',{lat:-3.119,lon:-60.0217},{dx:3.4,dy:-1.6},[1,2,3]);
    assert.equal(images.length,3);
    assert.ok(loads.length>=4 && loads.length<=9,'512 px cruzam de 2×2 a 3×3 telhas');
    assert.ok(loads.every(url=>/^https:\/\/tile\.test\/v2\/radar\/123\/256\/7\/\d+\/\d+\/2\/1_1\.png$/.test(url)));
    assert.deepEqual(images.map(image=>image.url.split(',').slice(1).join(',')),['3,-2','7,-3','10,-5'],'deslocamento arredondado de 1, 2 e 3 passos');
    const [[south,west],[north,east]]=images[0].bounds;
    assert.ok(south<-3.119 && north>-3.119 && west<-60.0217 && east>-60.0217,'a janela contém a cidade');
    assert.ok(Math.abs((east-west)-512/(256*128)*360)<1e-9,'512 pixels no zoom 7');
  } finally { delete globalThis.document; delete globalThis.PLUVIA; }
});

test('sem passo ou sem suporte de imagem, nada de previsão',async()=>{
  await assert.rejects(()=>nowcast.forecastImages('https://tile.test','/p',{lat:0,lon:0},null,[1]));
  const [lat,lon]=nowcast.lonLatOf(256*128/2,256*128/2);
  assert.ok(Math.abs(lat)<1e-9 && Math.abs(lon)<1e-9);
});

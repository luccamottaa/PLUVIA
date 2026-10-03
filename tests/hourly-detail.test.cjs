const {test}=require('node:test'),assert=require('node:assert/strict');
const {detail,rainCopy,mount}=require('../dist/modules/hourly-detail.js');
const hourlyOutlook=require('../dist/modules/hourly-outlook.js');
const hourly={time:['2026-09-30T23:00','2026-10-01T00:00','2026-10-01T01:00'],temperature_2m:[27,26,25],apparent_temperature:[31,30,29],weather_code:[3,61,3],precipitation_probability:[99,80,0],precipitation:[9,2,0],wind_speed_10m:[0,10,null],wind_gusts_10m:[0,25,30],relative_humidity_2m:[75,80,85]};
test('detalhe combina leituras instantâneas com chuva no intervalo seguinte',()=>{
 const first=detail(hourly,0);
 assert.equal(first.temperature,27);assert.equal(first.feelsLike,31);assert.equal(first.probability,80);assert.equal(first.mm,2);
 assert.equal(first.rainEnd,hourly.time[1]);assert.equal(first.wind,0);assert.equal(first.gust,0);
 assert.equal(detail(hourly,1).probability,0);assert.equal(detail(hourly,1).mm,0);
});
test('fim da série, lacuna e valores ausentes não viram chuva zero',()=>{
 assert.equal(detail(hourly,2).probability,null);assert.equal(detail(hourly,2).rainEnd,null);
 const gap=detail({...hourly,time:[hourly.time[0],hourly.time[2]]},0);
 assert.equal(gap.probability,null);assert.equal(gap.mm,null);
 const missing=detail({...hourly,apparent_temperature:[null],wind_speed_10m:['12'],precipitation_probability:[0,120]},0);
 assert.equal(missing.feelsLike,null);assert.equal(missing.wind,null);assert.equal(missing.probability,null);
 for(const index of [-1,0.5,3,null]) assert.equal(detail(hourly,index),null);
});
test('detalhe inclui UV, pressão e direção meteorológica sem coercão de ausências',()=>{
 const reading=detail({...hourly,uv_index:[8],pressure_msl:[1010],wind_direction_10m:[90]},0);
 assert.equal(reading.uv,8);assert.equal(reading.pressure,1010);assert.equal(reading.direction,90);
 const absent=detail({...hourly,uv_index:[null],pressure_msl:['1010'],wind_direction_10m:[361]},0);
 assert.equal(absent.uv,null);assert.equal(absent.pressure,null);assert.equal(absent.direction,null);
});
test('texto da janela cruza meia-noite sem esconder os dados parciais',()=>{
 const copy=rainCopy(hourlyOutlook.build(hourly,1),hourly.time[0]);
 assert.match(copy.title,/23:00 às 00:00 de amanhã/);assert.match(copy.text,/Dados parciais/);assert.match(copy.text,/2,0 mm nessa faixa/);
 const low=rainCopy(hourlyOutlook.build(hourly,2),hourly.time[1]);
 assert.equal(low.title,'Baixa chance nos horários disponíveis');assert.match(low.text,/volume indisponível/);
 assert.match(rainCopy(null).title,/indisponível/);
});
function screen() {
 const nodes=new Map(),events={},clicks={};
 const el=id=>{if(id.startsWith('heroRain'))return null;if(!nodes.has(id)) nodes.set(id,{id,textContent:'',innerHTML:'',dataset:{},disabled:false,open:false,addEventListener(type,fn){clicks[id+':'+type]=fn;}});return nodes.get(id);};
 const dialog=el('hourlyDetailDialog');
 dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;clicks['hourlyDetailDialog:close']?.();};
 const root={PLUVIA:{hourlyDetail:{},hourlyOutlook},document:{getElementById:el,addEventListener(type,fn){events['document:'+type]=fn;}},addEventListener(type,fn){events[type]=fn;}};
 mount(root);
 const update=city=>root.PLUVIA.hourlyDetail.update({hourly,start:0,city:city||{id:'1302603',name:'Manaus',uf:'AM'},fromCache:true});
 update();let focused=0;
 const opener={id:'',dataset:{hourIndex:'0'},isConnected:true,closest:()=>true,focus:()=>focused++};
 return {el,dialog,clicks,events,update,open(){events['document:click']({target:{closest:()=>opener}});},focused:()=>focused};
}
test('navegação por hora tem limites, muda a data e devolve o foco ao fechar',()=>{
 const s=screen();s.open();assert.equal(s.dialog.open,true);assert.equal(s.el('hourlyDetailPrev').disabled,true);
 s.clicks['hourlyDetailNext:click']();assert.match(s.el('hourlyDetailTitle').textContent,/00:00/);assert.match(s.el('hourlyDetailCity').textContent,/out/);
 s.clicks['hourlyDetailDialog:keydown']({key:'ArrowRight',preventDefault(){}});assert.equal(s.el('hourlyDetailNext').disabled,true);
 s.clicks['hourlyDetailNext:click']();assert.match(s.el('hourlyDetailTitle').textContent,/01:00/);
 assert.match(s.el('hourlyDetailSource').textContent,/Leitura salva/);
 s.clicks['hourlyDetailClose:click']();assert.equal(s.dialog.open,false);assert.equal(s.focused(),1);
});
test('trocar de cidade fecha o detalhe antigo sem depender do painel de chuva removido',()=>{
 const s=screen();s.open();s.events['pluvia:city-changed']();
 assert.equal(s.dialog.open,false);
 s.open();assert.equal(s.dialog.open,false);
 s.update({id:'2611606',name:'Recife',uf:'PE'});s.open();assert.match(s.el('hourlyDetailCity').textContent,/Recife\/PE/);
});

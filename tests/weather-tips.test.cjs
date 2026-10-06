const {test}=require('node:test'),assert=require('node:assert/strict');
const {tips}=require('../dist/modules/weather-insights.js');
function forecast(values={}) {
 const time=[],h={time};const keys=['wind_gusts_10m','apparent_temperature','uv_index'];
 for(const k of keys)h[k]=[];
 for(let i=0;i<20;i++){const hour=8+i;time.push(hour<24?`2026-10-06T${String(hour).padStart(2,'0')}:00`:`2026-10-07T${String(hour-24).padStart(2,'0')}:00`);
  for(const k of keys)h[k].push(values[k]?.(hour) ?? (k==='uv_index'?2:k==='apparent_temperature'?30:20));}
 return {hourly:h};
}
test('dia comum não gera dica',()=>{ assert.deepEqual(tips(forecast(),{current:{us_aqi:40}},0),[]); });
test('UV alto mostra o horário do resto do dia',()=>{
 assert.deepEqual(tips(forecast({uv_index:h=>h>=10&&h<=14?7:1}),null,0),[{kind:'uv',text:'UV alto das 10h às 14h: use protetor e prefira a sombra.'}]);
 assert.equal(tips(forecast({uv_index:h=>h===12?9:1}),null,0)[0].text,'UV muito alto por volta das 12h: use protetor e prefira a sombra.');
 assert.deepEqual(tips(forecast({uv_index:h=>h>=10&&h<=14?7:1}),null,8),[],'à noite, o UV de hoje já passou');
});
test('calor, ar e rajadas, sem alarme e no máximo três',()=>{
 const all=tips(forecast({wind_gusts_10m:h=>h===16?62:20,apparent_temperature:h=>h===14?42.4:30,uv_index:()=>8}),{current:{us_aqi:160}},0);
 assert.deepEqual(all.map(t=>t.kind),['wind','heat','air']);
 assert.equal(all[0].text,'Rajadas de até 62 km/h por volta das 16h: atenção a objetos soltos e galhos.');
 assert.equal(all[1].text,'Sensação de até 42° por volta das 14h: beba água e evite esforço no sol.');
 assert.equal(all[2].text,'Ar ruim: prefira atividades leves e em ambientes internos.');
 assert.equal(tips(forecast(),{current:{us_aqi:120}},0)[0].text,'Ar ruim para grupos sensíveis: evite exercício intenso ao ar livre.');
 assert.deepEqual(tips(forecast({apparent_temperature:()=>39}),null,0),[],'sensação de 39° é comum no Norte: sem dica diária');
});
test('ausência não vira zero nem dica',()=>{
 const f=forecast();f.hourly.uv_index=f.hourly.uv_index.map(()=>null);f.hourly.wind_gusts_10m=f.hourly.wind_gusts_10m.map(()=>'60');
 assert.deepEqual(tips(f,{current:{us_aqi:null}},0),[]);
 assert.deepEqual(tips({},null,0),[]);
});

const {test}=require('node:test'),assert=require('node:assert/strict');
const {rainAnswer}=require('../dist/modules/weather-insights.js');
// Série horária local a partir das 13h; mm/chance no índice i+1 descrevem a hora que começa em i.
function series(hours,{mm=()=>0,chance=()=>5,code=()=>3}={}) {
 const time=[],precipitation=[],precipitation_probability=[],weather_code=[];
 for(let i=0;i<hours;i++){time.push(`2026-10-06T${String(13+i).padStart(2,'0')}:00`.replace(/T(\d+)/,(m,h)=>h>23?`T${String(h-24).padStart(2,'0')}`:m));}
 for(let i=0;i<hours;i++){precipitation.push(i===0?0:mm(i-1));precipitation_probability.push(i===0?0:chance(i-1));weather_code.push(i===0?3:code(i-1));}
 return {time:time.map((t,i)=>i+13>23?`2026-10-07T${String(i+13-24).padStart(2,'0')}:00`:t),precipitation,precipitation_probability,weather_code};
}
test('dia seco cobre as horas com leitura',()=>{
 assert.deepEqual(rainAnswer(series(14),0),{tone:'dry',text:'Sem chuva prevista nas próximas 12 horas.',hours:12});
});
test('chuva fraca, forte e trovoada mais tarde, com o horário de início',()=>{
 assert.equal(rainAnswer(series(14,{mm:h=>h>=2?0.8:0,chance:h=>h>=2?70:10}),0).text,'Leve guarda-chuva: chuva fraca a partir das 15h.');
 assert.equal(rainAnswer(series(14,{mm:h=>h>=3&&h<=5?9:0,chance:h=>h>=3&&h<=5?90:10}),0).text,'Leve guarda-chuva: chuva forte a partir das 16h.');
 const storm=rainAnswer(series(14,{mm:h=>h===4?3:0,chance:h=>h===4?80:10,code:h=>h===4?95:3}),0);
 assert.deepEqual([storm.tone,storm.text],['storm','Leve guarda-chuva: trovoada a partir das 17h.']);
});
test('chuva agora diz quando deve parar, ou que não há pausa',()=>{
 assert.equal(rainAnswer(series(14,{mm:h=>h<3?3:0,chance:h=>h<3?90:10}),0).text,'Chuva moderada agora; deve parar por volta das 16h.');
 assert.equal(rainAnswer(series(14,{mm:()=>1,chance:()=>90}),0).text,'Chuva fraca agora; sem pausa prevista nas próximas 12 horas.');
});
test('chance média sem volume vira possibilidade, não certeza',()=>{
 assert.deepEqual(rainAnswer(series(14,{chance:h=>h===5?40:10}),0),{tone:'maybe',text:'Pode chover a partir das 18h (40% de chance).',hours:12,start:'2026-10-06T18:00'});
 assert.equal(rainAnswer(series(14,{chance:h=>h===5?60:10,mm:()=>0}),0).tone,'maybe','60% com 0 mm não é chuva certa');
});
test('dado ausente não vira tempo seco',()=>{
 const gap=series(14);gap.precipitation[4]=null;gap.precipitation_probability[4]=null;
 assert.equal(rainAnswer(gap,0).text,'Sem chuva prevista nas próximas 3 horas.','só as horas antes da lacuna');
 const early=series(14);early.precipitation[2]=null;early.precipitation_probability[2]=null;
 assert.equal(rainAnswer(early,0).tone,'unknown');
 assert.equal(rainAnswer({time:[]},0).tone,'unknown');
});
test('previsão reduzida (sem probabilidade, só mm do MET) também responde',()=>{
 const reduced=series(14,{mm:h=>h===6?1.2:0});reduced.precipitation_probability=reduced.precipitation_probability.map(()=>null);
 assert.equal(rainAnswer(reduced,0).text,'Leve guarda-chuva: chuva fraca a partir das 19h.');
});
test('condição atual de chuva vale como "agora", mesmo com a série horária seca',()=>{
 assert.equal(rainAnswer(series(14),0,{current:{weather_code:65}}).text,'Chuva forte agora; deve parar por volta das 14h.');
 assert.equal(rainAnswer(series(14,{mm:h=>h<2?1:0,chance:h=>h<2?80:5}),0,{current:{weather_code:95}}).text,'Trovoada agora; deve parar por volta das 15h.');
 assert.equal(rainAnswer(series(14),0,{current:{weather_code:3}}).tone,'dry');
});
test('horas no singular e meia-noite com a preposição certa',()=>{
 const late=series(14,{mm:h=>h===11?3:0,chance:h=>h===11?80:5});
 assert.equal(rainAnswer(late,0).text,'Leve guarda-chuva: chuva moderada a partir da meia-noite.');
 const one=series(14,{mm:h=>h===12?1:0,chance:h=>h===12?80:5});
 assert.equal(rainAnswer(one,0,{horizon:13}).text,'Leve guarda-chuva: chuva fraca a partir da 1h.');
});

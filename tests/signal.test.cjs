const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {globalThis:null};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('dist/modules/signal.js','utf8'),context);
const evaluate = context.PLUVIA.signal.evaluate;
const forecast = ({rain=0,prob=10,gust=20,feels=31,uv=2,code=3}={}) => ({
  current:{apparent_temperature:feels,wind_gusts_10m:gust},
  hourly:{time:['a','b','c','d','e','f'],precipitation:Array(6).fill(rain),precipitation_probability:Array(6).fill(prob),wind_gusts_10m:Array(6).fill(gust),apparent_temperature:Array(6).fill(feels),uv_index:Array(6).fill(uv),weather_code:Array(6).fill(code)}
});
const ready={alerts:'ready',air:'ready',weather:'ready'};

assert.equal(evaluate({forecast:forecast(),start:0,officialSeverity:'none',sourceStatus:ready,aqi:30}).level,'good');
assert.equal(evaluate({forecast:forecast(),start:0,officialSeverity:'yellow',sourceStatus:ready,aqi:30}).level,'attention');
assert.equal(evaluate({forecast:forecast(),start:0,officialSeverity:'orange',sourceStatus:ready,aqi:30}).level,'wait');
assert.equal(evaluate({forecast:forecast(),start:0,officialSeverity:'red',sourceStatus:ready,aqi:30}).level,'danger');
assert.equal(evaluate({forecast:forecast({rain:3,prob:80}),start:0,officialSeverity:'none',sourceStatus:ready,aqi:30}).level,'wait');
assert.equal(evaluate({forecast:forecast({rain:6,prob:90}),start:0,officialSeverity:'none',sourceStatus:ready,aqi:30}).level,'danger');
assert.equal(evaluate({forecast:forecast({prob:65,rain:.3}),start:0,officialSeverity:'none',sourceStatus:ready,aqi:30}).level,'attention');
assert.equal(evaluate({forecast:forecast(),start:0,officialSeverity:'unknown',sourceStatus:{...ready,alerts:'error'},aqi:30}).confidence,'low');
assert.equal(evaluate({}).level,'unknown');
console.log('PASS PLUVIA Sinal: quatro estados, alertas oficiais, chuva, confiança e ausência de dados.');

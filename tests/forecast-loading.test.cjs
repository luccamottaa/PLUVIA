const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {forecast,city}=require('./support/forecast.cjs'),weatherData=require('../dist/modules/weather-data-layer.js'),time=require('../dist/modules/city-time.js');
const source=fs.readFileSync('dist/app.js','utf8');
function setup() {
 let air,met;const paints=[],writes=[],data=forecast(),node={setAttribute(){},classList:{remove(){}}};
 const context=vm.createContext({activeCity:city,cityRevision:0,displayedWeather:null,$:()=>node,services:{airQuality:{getCurrent:()=>new Promise(resolve=>air=resolve)},metNorway:{getForecast:()=>new Promise(resolve=>met=resolve)}},fetchForecast:async()=>data,weatherData,cached:()=>null,cache:value=>writes.push(value),render:(...args)=>{paints.push(args);context.displayedWeather={forecast:args[0],air:args[1]};},cityDate:value=>new Date(time.parse(value,city)),validForecast:weatherData.validateForecast,errorTimer:null,clearTimeout,PLUVIA:{sources:{set(){}},metMerge:{merge:original=>({forecast:original,used:false})}}});
 vm.runInContext(source.slice(source.indexOf('async function loadWeather('),source.indexOf('async function refreshAll(')),context);
 return {context,paints,writes,data,finish:()=>{air(null);met(null);}};
}
test('primeira previsão aparece antes de AQI/MET terminarem e continua recebendo os complementos',async()=>{
 const s=setup(),loading=s.context.loadWeather();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(s.paints.length,1);assert.equal(s.paints[0][0],s.data);assert.equal(s.paints[0][4].deferSummaryAi,true);
 assert.equal(s.writes.length,1);s.finish();assert.equal(await loading,true);assert.equal(s.paints.length,2);
});
test('complementos de uma cidade antiga não sobrescrevem a nova cidade',async()=>{
 const s=setup(),loading=s.context.loadWeather();await new Promise(resolve=>setImmediate(resolve));
 s.context.cityRevision++;s.finish();assert.equal(await loading,false);assert.equal(s.paints.length,1);
});

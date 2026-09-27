const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('dist/notifications.js','utf8');
const context=vm.createContext({});
vm.runInContext(code.slice(code.indexOf('  function allAlertPreferences()'),code.indexOf('  async function saveAlertSetup(')),context);
test('todos os alertas disponíveis são habilitados sem horário silencioso',()=>{
 const p=context.allAlertPreferences();
 for(const key of ['notifications_enabled','official_alerts','rain_approaching','heavy_rain','storms','strong_wind','extreme_heat','air_quality','weather_changes']) assert.equal(p[key],true,key);
 assert.equal(p.minimum_severity,1);
 assert.equal(p.quiet_start,null); assert.equal(p.quiet_end,null);
 assert.equal(p.daily_summary,false); assert.equal(p.lightning,false);
});
test('renovação automática do dispositivo não monitora a cidade consultada',async()=>{
 const calls=[];
 const c=vm.createContext({config:{},loadConfig:async()=>({}),deviceInfo:()=>({}),saveSubscriptionId:()=>{},saveAlertSetup:async(location)=>calls.push({setup:location}),invoke:async(name,body)=>{calls.push(body);return {subscriptionId:'test'};}});
 vm.runInContext(code.slice(code.indexOf('  async function register('),code.indexOf('  function allAlertPreferences()')),c);
 await c.register({toJSON:()=>({endpoint:'test'})});
 assert.equal(calls.length,1); assert.equal(calls[0].location,null);
 const selected={cityId:'1302603'};
 await c.register({toJSON:()=>({endpoint:'test'})},selected);
 assert.equal(calls[1].location,selected); assert.equal(calls[2].setup,selected);
 assert.match(code,/checkbox\.checked = false/);
 assert.doesNotMatch(fs.readFileSync('dist/index.html','utf8'),/name="monitor_current_city"[^>]*checked/);
});
test('preferências antigas ativas são sincronizadas sem cadastrar outra cidade',async()=>{
 const calls=[];
 const c=vm.createContext({currentUser:()=>({id:'test'}),config:null,allAlertPreferences:context.allAlertPreferences,paintPreferences:()=>{},paintDevices:()=>{},paintLocations:()=>{},invoke:async(name,body)=>{calls.push(body);return {preferences:{notifications_enabled:true,minimum_severity:3,quiet_start:'22:00'},devices:[],locations:[]};}});
 vm.runInContext(code.slice(code.indexOf('  async function loadConfig()'),code.indexOf('  async function register(')),c);
 await c.loadConfig();
 assert.equal(calls.length,2); assert.equal(calls[1].preferences.minimum_severity,1);
 assert.equal(calls[1].preferences.quiet_start,null); assert.equal(calls[1].location,undefined);
});

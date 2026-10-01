const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('dist/notifications.js','utf8');
const context=vm.createContext({preferencesModel:require('../dist/modules/notification-preferences.js')});
vm.runInContext(code.slice(code.indexOf('  function allAlertPreferences(saved)'),code.indexOf('  async function saveAlertSetup(')),context);
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
 vm.runInContext(code.slice(code.indexOf('  async function register('),code.indexOf('  function allAlertPreferences(saved)')),c);
 await c.register({toJSON:()=>({endpoint:'test'})});
 assert.equal(calls.length,1); assert.equal(calls[0].location,null);
 const selected={cityId:'1302603'};
 await c.register({toJSON:()=>({endpoint:'test'})},selected);
 assert.equal(calls[1].location,selected); assert.equal(calls[2].setup,selected);
 assert.match(code,/checkbox\.checked = false/);
 assert.doesNotMatch(fs.readFileSync('dist/index.html','utf8'),/name="monitor_current_city"[^>]*checked/);
});
test('carregar preferências preserva escolhas sem gravar ou cadastrar cidades',async()=>{
 const calls=[];
 const c=vm.createContext({currentUser:()=>({id:'test'}),config:null,allAlertPreferences:context.allAlertPreferences,paintPreferences:()=>{},paintDevices:()=>{},paintLocations:()=>{},paintCityChoices:()=>{},el:()=>({}),invoke:async(name,body)=>{calls.push(body);return {preferences:{notifications_enabled:true,official_alerts:false,storms:false,daily_summary:true},devices:[],locations:[]};}});
 vm.runInContext(code.slice(code.indexOf('  async function loadConfig()'),code.indexOf('  async function register(')),c);
 await c.loadConfig();
 assert.equal(calls.length,1); assert.equal(calls[0].action,'config');
 assert.equal(c.config.preferences.official_alerts,false); assert.equal(c.config.preferences.storms,false); assert.equal(c.config.preferences.daily_summary,true);
});
test('resposta de outra conta após sair não repinta nem habilita o formulário',async()=>{
 let user={id:'old'},finish,painted=false;const button={disabled:false};
 const c=vm.createContext({currentUser:()=>user,config:null,el:()=>button,paintPreferences:()=>painted=true,paintDevices:()=>{},paintLocations:()=>{},paintCityChoices:()=>{},invoke:()=>new Promise(resolve=>finish=resolve)});
 vm.runInContext(code.slice(code.indexOf('  async function loadConfig()'),code.indexOf('  async function register(')),c);
 const pending=c.loadConfig();user={id:'new'};finish({preferences:{storms:true}});
 assert.equal(await pending,null);assert.equal(c.config,null);assert.equal(painted,false);assert.equal(button.disabled,true);
});
test('o formulário envia tipos escolhidos e várias favoritas numa única gravação',async()=>{
 const model=require('../dist/modules/notification-preferences.js'),calls=[],nodes={notificationPreferencesSave:{disabled:false}};
 const inputs=Object.fromEntries(model.fields.map(field=>[field,{checked:field==='heavy_rain'}]));inputs.monitor_current_city={checked:false};inputs.daily_summary_time={value:'07:00'};
 const choices=['1302603','2611606'].map(id=>({checked:true,dataset:{notificationCity:id}}));nodes.notificationFavoriteChoices={querySelectorAll:()=>choices};
 let submit;const c=vm.createContext({form:{elements:{namedItem:name=>inputs[name]},addEventListener(type,fn){submit=fn;}},preferencesModel:model,busy:false,currentUser:()=>({id:'owner'}),config:{preferences:{storms:true,daily_summary:true}},el:id=>nodes[id],currentLocation:()=>{throw Error('cidade aberta não foi selecionada');},ensureCityDetails:async id=>({id,name:id==='1302603'?'Manaus':'Recife',uf:'AM',lat:-3,lon:-60,timezone:'America/Manaus'}),invoke:async(name,body)=>calls.push(body),loadConfig:async()=>{},message:()=>{},track:()=>{}});
 vm.runInContext(code.slice(code.indexOf('  form.addEventListener("submit"'),code.indexOf("  form.elements.namedItem('daily_summary')")),c);
 await submit({preventDefault(){}});
 assert.equal(calls.length,1);assert.equal(calls[0].action,'preferences');assert.equal(calls[0].preferences.storms,false);assert.equal(calls[0].preferences.daily_summary,false);assert.equal(calls[0].preferences.heavy_rain,true);
 assert.equal(calls[0].location,null);assert.equal(calls[0].locations.length,2);assert.equal(c.busy,false);assert.equal(nodes.notificationPreferencesSave.disabled,false);
});

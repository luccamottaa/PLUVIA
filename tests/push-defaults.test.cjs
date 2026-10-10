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
 const c=vm.createContext({currentUser:()=>({id:'test'}),pushUser:()=>({id:'test'}),config:null,configRevision:0,configOwner:null,allAlertPreferences:context.allAlertPreferences,paintPreferences:()=>{},paintDevices:()=>{},paintLocations:()=>{},paintCityChoices:()=>{},el:()=>({}),invoke:async(name,body)=>{calls.push(body);return {preferences:{notifications_enabled:true,official_alerts:false,storms:false,daily_summary:true},devices:[],locations:[]};}});
 vm.runInContext(code.slice(code.indexOf('  async function loadConfig()'),code.indexOf('  async function register(')),c);
 await c.loadConfig();
 assert.equal(calls.length,1); assert.equal(calls[0].action,'config');
 assert.equal(c.config.preferences.official_alerts,false); assert.equal(c.config.preferences.storms,false); assert.equal(c.config.preferences.daily_summary,true);
});
test('resposta de outra conta após sair não repinta nem habilita o formulário',async()=>{
 let user={id:'old'},finish,painted=false;const button={disabled:false};
 const c=vm.createContext({currentUser:()=>user,pushUser:()=>user,config:null,configRevision:0,configOwner:null,el:()=>button,paintPreferences:()=>painted=true,paintDevices:()=>{},paintLocations:()=>{},paintCityChoices:()=>{},invoke:()=>new Promise(resolve=>finish=resolve)});
 vm.runInContext(code.slice(code.indexOf('  async function loadConfig()'),code.indexOf('  async function register(')),c);
 const pending=c.loadConfig();user={id:'new'};finish({preferences:{storms:true}});
 assert.equal(await pending,null);assert.equal(c.config,null);assert.equal(painted,false);assert.equal(button.disabled,true);
});
test('respostas fora de ordem e troca A → B → A não restauram preferências antigas',async()=>{
 let user={id:'A'};const finish=[],painted=[],button={disabled:false};
 const c=vm.createContext({currentUser:()=>user,pushUser:()=>user,config:null,configRevision:0,configOwner:null,el:()=>button,paintPreferences:p=>painted.push(p),paintDevices:()=>{},paintLocations:()=>{},paintCityChoices:()=>{},invoke:()=>new Promise(resolve=>finish.push(resolve))});
 vm.runInContext(code.slice(code.indexOf('  async function loadConfig()'),code.indexOf('  async function register(')),c);
 const first=c.loadConfig();user={id:'B'};const second=c.loadConfig();user={id:'A'};const last=c.loadConfig();
 finish[2]({preferences:{minimum_severity:4,quiet_start:'23:00'},devices:[],locations:[]});await last;
 finish[0]({preferences:{minimum_severity:1},devices:[],locations:[]});finish[1]({preferences:{minimum_severity:2},devices:[],locations:[]});
 assert.equal(await first,null);assert.equal(await second,null);assert.equal(painted.length,1);assert.equal(c.config.preferences.minimum_severity,4);assert.equal(button.disabled,false);
});
test('ativar outro local preserva o fuso escolhido e as restrições existentes',async()=>{
 const calls=[],preferencesModel=require('../dist/modules/notification-preferences.js');
 const c=vm.createContext({config:{preferences:{minimum_severity:3,quiet_start:'22:00',quiet_end:'06:00',timezone:'America/Manaus'}},preferencesModel,invoke:async(name,body)=>calls.push(body)});
 vm.runInContext(code.slice(code.indexOf('  function allAlertPreferences(saved)'),code.indexOf('  async function enable()')),c);
 await c.saveAlertSetup({timezone:'America/Sao_Paulo'});
 assert.equal(calls[0].preferences.timezone,'America/Manaus');assert.equal(calls[0].preferences.minimum_severity,3);assert.equal(calls[0].preferences.quiet_start,'22:00');
});
test('troca de conta limpa controles e dados de dispositivos antes da leitura nova',async()=>{
 let handler;const painted=[],button={disabled:false};
 const c=vm.createContext({window:{addEventListener(type,fn){handler=fn;}},config:{preferences:{timezone:'America/Sao_Paulo'},devices:[{device_name:'antigo'}]},configOwner:'A',configRevision:0,paintPreferences:p=>painted.push(['preferences',p]),paintDevices:p=>painted.push(['devices',p]),paintLocations:p=>painted.push(['locations',p]),paintCityChoices:()=>{},el:()=>button,loadConfig:async()=>null});
 vm.runInContext(code.slice(code.indexOf('  window.addEventListener("pluvia:auth-changed"'),code.indexOf('  navigator.serviceWorker?')),c);
 const pending=handler({detail:{user:{id:'B'}}});assert.equal(c.config,null);assert.equal(c.configOwner,'B');assert.equal(button.disabled,true);
 assert.equal(painted[0][1],null);assert.equal(painted[1][1].length,0);assert.equal(painted[2][1].length,0);await pending;
});
test('erro de validação de silêncio é explicado e libera o botão sem request',async()=>{
 let submit;const inputs={quiet_enabled:{checked:true},quiet_start:{value:'22:00'},quiet_end:{value:'22:00'}},button={disabled:false},messages=[];
 const c=vm.createContext({form:{elements:{namedItem:name=>inputs[name]},addEventListener(type,fn){submit=fn;}},preferencesModel:require('../dist/modules/notification-preferences.js'),busy:false,currentUser:()=>({id:'owner'}),config:{preferences:{}},configRevision:0,el:()=>button,message:value=>messages.push(value)});
 vm.runInContext(code.slice(code.indexOf('  form.addEventListener("submit"'),code.indexOf("  form.elements.namedItem('daily_summary')")),c);
 await submit({preventDefault(){}});assert.equal(c.busy,false);assert.equal(button.disabled,false);assert.match(messages[0],/início e fim diferentes/);
});
test('o formulário envia tipos escolhidos e várias favoritas numa única gravação',async()=>{
 const model=require('../dist/modules/notification-preferences.js'),calls=[],nodes={notificationPreferencesSave:{disabled:false}};
 const inputs=Object.fromEntries(model.fields.map(field=>[field,{checked:field==='heavy_rain'}]));inputs.monitor_current_city={checked:false};inputs.daily_summary_time={value:'07:00'};
 const choices=['1302603','2611606'].map(id=>({checked:true,dataset:{notificationCity:id}}));nodes.notificationFavoriteChoices={querySelectorAll:()=>choices};
 let submit;const c=vm.createContext({form:{elements:{namedItem:name=>inputs[name]},addEventListener(type,fn){submit=fn;}},preferencesModel:model,busy:false,currentUser:()=>({id:'owner'}),configRevision:0,configOwner:null,config:{preferences:{storms:true,daily_summary:true}},el:id=>nodes[id],currentLocation:()=>{throw Error('cidade aberta não foi selecionada');},ensureCityDetails:async id=>({id,name:id==='1302603'?'Manaus':'Recife',uf:'AM',lat:-3,lon:-60,timezone:'America/Manaus'}),invoke:async(name,body)=>calls.push(body),loadConfig:async()=>{},message:()=>{},track:()=>{}});
 vm.runInContext(code.slice(code.indexOf('  form.addEventListener("submit"'),code.indexOf("  form.elements.namedItem('daily_summary')")),c);
 await submit({preventDefault(){}});
 assert.equal(calls.length,1);assert.equal(calls[0].action,'preferences');assert.equal(calls[0].preferences.storms,false);assert.equal(calls[0].preferences.daily_summary,false);assert.equal(calls[0].preferences.heavy_rain,true);
 assert.equal(calls[0].location,null);assert.equal(calls[0].locations.length,2);assert.equal(c.busy,false);assert.equal(nodes.notificationPreferencesSave.disabled,false);
});

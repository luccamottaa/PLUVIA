const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync(__dirname+'/../dist/notifications.js','utf8');
const preferencesModel=require('../dist/modules/notification-preferences.js');
const body=code.slice(code.indexOf('  function allAlertPreferences'),code.indexOf('  async function enable()'));

function save(existing){
  const sent=[];
  const c=vm.createContext({preferencesModel,config:{preferences:existing},invoke:async(name,payload)=>sent.push(payload)});
  vm.runInContext(body,c);
  return c.saveAlertSetup({cityId:'1302603',timezone:'America/Manaus'}).then(()=>sent[0].preferences);
}
test('primeira ativação liga o resumo das 7h',async()=>{
  const p=await save(null);
  assert.equal(p.daily_summary,true);assert.equal(p.daily_summary_time,'07:00');assert.equal(p.timezone,'America/Manaus');
});
test('preferências salvas mantêm a escolha do resumo',async()=>{
  const off=await save({daily_summary:false,daily_summary_time:'06:30',timezone:'America/Sao_Paulo'});
  assert.equal(off.daily_summary,false);assert.equal(off.daily_summary_time,'06:30');assert.equal(off.timezone,'America/Sao_Paulo');
  assert.equal((await save({daily_summary:true,daily_summary_time:'08:00'})).daily_summary_time,'08:00');
});

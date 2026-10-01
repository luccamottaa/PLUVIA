'use strict';
// Bounded public checks. No login, personal data, push sends, AI or paid lightning calls.
const endpoint='https://dszyyrcvwrpyiypwyvxe.supabase.co';
function classify(error) {return error?.name==='TimeoutError' || error?.name==='AbortError' ? 'timeout' : 'network_error';}
const checks=[
 {component:'site',url:'https://pluviaweather.com.br/',kind:'text',valid:value=>value.includes('id="temperature"') && value.includes('id="accountDialog"')},
 {component:'shell',url:'https://pluviaweather.com.br/sw.js',kind:'text',valid:value=>value.includes('const CACHE = "pluvia-panel-') && value.includes('PRECACHE')},
 {component:'account',url:endpoint+'/auth/v1/settings',headers:{apikey:'sb_publishable_SdPTXhk3Q7aD-ra0S9dm_A_rnXSS4Jc'},valid:value=>value?.external?.email===true},
 {component:'weather',url:'https://api.open-meteo.com/v1/forecast?latitude=-3.119&longitude=-60.022&current=temperature_2m,weather_code&forecast_days=1&timezone=America%2FManaus',valid:value=>Number.isFinite(value?.current?.temperature_2m)&&Number.isFinite(value?.current?.weather_code)},
 {component:'alerts',url:'https://apiprevmet3.inmet.gov.br/avisos/ativos',valid:value=>Array.isArray(value) || Array.isArray(value?.hoje) || ['avisos','alerts','data','features','result'].some(key=>Array.isArray(value?.[key]))},
 {component:'radar',url:'https://api.rainviewer.com/public/weather-maps.json',valid:value=>Array.isArray(value?.radar?.past)&&typeof value.host==='string'}
];
async function check(item,fetchImpl=fetch) {
 try {
  const response=await fetchImpl(item.url,{headers:item.headers,signal:AbortSignal.timeout(12000),cache:'no-store',redirect:'error'});
  if(!response.ok)return {component:item.component,ok:false,code:response.status===429 ? 'rate_limited' : 'provider_unavailable',status:response.status};
  let value;try{value=item.kind==='text' ? await response.text() : await response.json();}catch{return {component:item.component,ok:false,code:'invalid_response'};}
  return {component:item.component,ok:item.valid(value),code:item.valid(value)?'ready':'invalid_response'};
 }catch(error){return {component:item.component,ok:false,code:classify(error)};}
}
async function run() {
 const results=await Promise.all(checks.map(item=>check(item)));
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));
 if(results.some(item=>!item.ok))process.exitCode=1;
}
module.exports={check,classify,checks};if(require.main===module)run();

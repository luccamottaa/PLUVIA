const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const summary=require('../dist/modules/account-summary.js');

test('cartões de Minha conta: valor ao lado do título resume o estado atual',()=>{
  const all=Object.fromEntries(summary.TYPE_FIELDS.map(f=>[f,true]));
  const base={types:all,daily:true,dailyTime:'08:00',evening:true,eveningTime:'20:00',severity:1,quiet:false,citiesChecked:0,citiesAvailable:1,locations:2,devices:4,activeDevices:2};
  assert.deepEqual(summary.texts(base),{types:'Todos',summaries:'Manhã 08:00 · Noite 20:00',timing:'Todos os níveis',cities:'1 disponível',locations:'2 cidades',devices:'2 ativos de 4'});
  const some={...base,types:{...all,storms:false,air_quality:false},daily:false,evening:false,severity:3,quiet:true,quietStart:'22:00',quietEnd:'07:00:00',citiesChecked:1,locations:1,devices:1,activeDevices:1};
  assert.deepEqual(summary.texts(some),{types:'6 de 8',summaries:'Desligados',timing:'A partir de perigo · silêncio 22:00–07:00',cities:'1 marcada',locations:'1 cidade',devices:'1 ativo de 1'});
  const none={...base,types:{},citiesAvailable:0,locations:0,devices:0,activeDevices:0};
  const t=summary.texts(none);
  assert.equal(t.types,'Nenhum');assert.equal(t.cities,'Nenhuma nova');assert.equal(t.locations,'Nenhuma');assert.equal(t.devices,'Nenhum');
});

test('Minha conta: cada assunto num cartão que abre e fecha, sem mudar ids e campos usados pelo código',()=>{
  const html=fs.readFileSync('dist/index.html','utf8'),css=fs.readFileSync('dist/continuous.css','utf8'),js=fs.readFileSync('dist/notifications.js','utf8'),account=fs.readFileSync('dist/account.js','utf8');
  for(const id of ['accountProfileEdit','notificationTypesGroup','notificationSummariesGroup','notificationTimingGroup','notificationCitiesGroup','notificationLocationsGroup','notificationDevicesGroup'])
    assert.match(html,new RegExp(`<details class="account-group" id="${id}"><summary><span class="account-group-title">`),id);
  for(const key of ['types','summaries','timing','cities','locations','devices']) assert.match(html,new RegExp(`data-account-summary="${key}"`),key);
  // Campos continuam no mesmo formulário (o envio lê form.elements).
  const form=html.slice(html.indexOf('<form id="notificationPreferencesForm"'),html.indexOf('</form>',html.indexOf('<form id="notificationPreferencesForm"')));
  for(const name of [...summary.TYPE_FIELDS,'daily_summary','daily_summary_time','evening_summary','evening_summary_time','minimum_severity','quiet_enabled','quiet_start','quiet_end','timezone','monitor_current_city'])
    assert.match(form,new RegExp(`name="${name}"`),name);
  assert.match(form,/id="notificationPreferencesSave" type="submit"/);
  assert.match(js,/function paintSummary\(\) \{ globalThis\.PLUVIA\?\.accountSummary\?\.paint\?\.\(form, document\); \}/);
  assert.match(js,/row\.dataset\.enabled = String\(Boolean\(device\.enabled\)\)/);
  assert.match(account,/if \(edit && !name\) edit\.open = true;/,'sem nome, o cartão do perfil já abre');
  assert.match(css,/html body #accountDialog \.account-group \{ margin:0 0 8px; padding:0 16px; border-radius:var\(--sheet-radius\); background:var\(--dialog-surface\); \}/);
  assert.match(html,/modules\/account-summary\.js\?v=account-summary-1/);
});

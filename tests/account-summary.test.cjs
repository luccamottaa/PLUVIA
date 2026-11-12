const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
// 1.73.2: os resumos ao lado dos títulos (account-summary.js) saíram a pedido do dono; os cartões ficaram.
const TYPE_FIELDS=['official_alerts','rain_approaching','heavy_rain','storms','strong_wind','extreme_heat','air_quality','weather_changes'];

test('Minha conta: cada assunto num cartão que abre e fecha, sem mudar ids e campos usados pelo código',()=>{
  const html=fs.readFileSync('dist/index.html','utf8'),css=fs.readFileSync('dist/continuous.css','utf8')+fs.readFileSync('dist/dialogs.css','utf8'),js=fs.readFileSync('dist/notifications.js','utf8'),account=fs.readFileSync('dist/account.js','utf8');
  // Perfil (1.50): foto, nome e e-mail ficam no summary do cartão de edição, com os mesmos ids.
  assert.match(html,/<details class="account-group account-identity" id="accountProfileEdit"><summary><span class="profile-identity"><span id="profileAvatar"[^>]*>P<\/span><span class="profile-text"><strong id="profileDisplayName">Sua conta<\/strong><span id="accountIdentity"><\/span><\/span><\/span><small class="account-group-value">Editar perfil<\/small><\/summary>/);
  for(const id of ['notificationTypesGroup','notificationSummariesGroup','notificationTimingGroup','notificationCitiesGroup','notificationLocationsGroup','notificationDevicesGroup'])
    assert.match(html,new RegExp(`<details class="account-group" id="${id}"><summary><span class="account-group-title">`),id);
  assert.doesNotMatch(html,/data-account-summary/,'sem resumo ao lado do título (1.73.2)');
  // Campos continuam no mesmo formulário (o envio lê form.elements).
  const form=html.slice(html.indexOf('<form id="notificationPreferencesForm"'),html.indexOf('</form>',html.indexOf('<form id="notificationPreferencesForm"')));
  for(const name of [...TYPE_FIELDS,'daily_summary','daily_summary_time','evening_summary','evening_summary_time','minimum_severity','quiet_enabled','quiet_start','quiet_end','timezone','monitor_current_city'])
    assert.match(form,new RegExp(`name="${name}"`),name);
  assert.match(form,/id="notificationPreferencesSave" type="submit"/);
  // "Salvar avisos" só com mudança (1.50); o teste de notificação fica em Aparelhos.
  assert.match(css,/#notificationPreferencesForm:not\(\[data-dirty\]\):not\(\[data-saved\]\) #notificationPreferencesSave \{ display:none; \}/);
  assert.match(js,/function paintPreferences\(preferences\) \{\n    settleDirty\(\);/);
  const devices=html.slice(html.indexOf('id="notificationDevicesGroup"'),html.indexOf('</details>',html.indexOf('class="notification-checks"')));
  assert.match(devices,/<button id="notificationTest" class="account-row-action" type="button" hidden>/);
  assert.doesNotMatch(js,/paintSummary|accountSummary/);
  assert.match(js,/row\.dataset\.enabled = String\(Boolean\(device\.enabled\)\)/);
  assert.match(account,/if \(edit && !name\) edit\.open = true;/,'sem nome, o cartão do perfil já abre');
  assert.match(css,/html body #accountDialog \.account-group \{ margin:0 0 8px; padding:0 16px; border-radius:var\(--sheet-radius\); background:var\(--dialog-surface\); \}/);
  assert.doesNotMatch(html,/account-summary\.js/);
});
test('Salvar avisos aparece só com mudança e diz "Avisos salvos" quando os dados do servidor chegam no meio da gravação',()=>{
  const vm=require('node:vm');const js=fs.readFileSync('dist/notifications.js','utf8');
  const code=js.slice(js.indexOf('  // "Salvar avisos" só aparece quando algo mudou'),js.indexOf('  form.addEventListener("submit"'));
  const listeners={},button={textContent:'Salvar avisos'},timers=[];
  const form={dataset:{},addEventListener(type,fn){listeners[type]=fn;}};
  const c=vm.createContext({form,busy:false,el:()=>button,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}});
  vm.runInContext(code+';this.settleDirty=settleDirty;',c);
  listeners.change();assert.equal(form.dataset.dirty,'1');
  c.settleDirty();assert.equal(form.dataset.dirty,undefined);assert.equal(form.dataset.saved,undefined,'sem gravação, só limpa');
  listeners.input();vm.runInContext('busy=true',c);c.settleDirty();
  assert.equal(form.dataset.saved,'1');assert.equal(button.textContent,'Avisos salvos');
  listeners.change();assert.equal(form.dataset.saved,undefined);assert.equal(button.textContent,'Salvar avisos','mexer de novo volta ao botão normal');
  vm.runInContext('busy=true',c);c.settleDirty();timers.at(-1)();assert.equal(form.dataset.saved,undefined);assert.equal(button.textContent,'Salvar avisos');
});

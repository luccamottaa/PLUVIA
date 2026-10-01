const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {recentAuthentication,deleteOwnAccount}=require('../supabase/functions/_shared/account-deletion.js');
const {boot,settle}=require('./support/account.cjs');
const now=Date.now(),claims={sub:'owner',exp:now/1000+3600,amr:[{method:'password',timestamp:Math.floor(now/1000)}]};
test('exclusão exige autenticação real recente; refresh não torna login antigo recente',()=>{
 assert(recentAuthentication(claims,'owner',now));
 for(const data of [{...claims,sub:'other'},{...claims,exp:0},{...claims,amr:[]},{...claims,iat:now/1000,amr:[{method:'password',timestamp:now/1000-601}]},{...claims,amr:[{method:'token_refresh',timestamp:now/1000}]},{...claims,amr:[{method:'password',timestamp:now/1000+1}]},{...claims,amr:[{method:'password',timestamp:String(now/1000)}]}])assert.equal(recentAuthentication(data,'owner',now),false);
 assert(recentAuthentication({...claims,amr:[{method:'oauth',timestamp:now/1000}]},'owner',now));
});
test('revoga sessões antes de excluir apenas o proprietário; falha não produz sucesso',async()=>{
 const calls=[],admin={auth:{admin:{signOut:async(token,scope)=>{calls.push(['signOut',scope]);return {};},deleteUser:async(id,soft)=>{calls.push(['delete',id,soft]);return {};}}}};
 await deleteOwnAccount(admin,'private-token','owner');assert.deepEqual(calls,[['signOut','global'],['delete','owner',false]]);
 admin.auth.admin.signOut=async()=>({error:{}});await assert.rejects(()=>deleteOwnAccount(admin,'token','owner'),/session_revoke_failed/);assert.equal(calls.length,2);
 admin.auth.admin.signOut=async()=>({});admin.auth.admin.deleteUser=async()=>({error:{}});await assert.rejects(()=>deleteOwnAccount(admin,'token','owner'),/account_delete_failed/);
});
function endpoint({user={id:'owner'},amr=claims.amr,origin='https://pluviaweather.com.br',failure=false}={}){
 let handler;const calls=[];const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/account-delete/index.ts','utf8').replace(/^import .*;\n/gm,''));
 const token='header.'+Buffer.from(JSON.stringify({...claims,amr})).toString('base64url')+'.signature';
 vm.runInNewContext(source,{Deno:{serve:fn=>handler=fn},authenticatedUser:async()=>user,readJson:async req=>req.body,json:(_,body,status=200)=>({body,status}),preflight:()=>({status:204}),allowedOrigin:()=> 'https://pluviaweather.com.br',atob,Error,SyntaxError,JSON,Date,recentAuthentication,adminClient:()=>({}),deleteOwnAccount:async(_,token,id)=>{calls.push(id);if(failure)throw Error('failure');},console:{warn(){}}});
 return {calls,invoke:body=>handler({method:'POST',headers:new Headers({origin,authorization:'Bearer '+token}),body})};
}
test('endpoint bloqueia anônimo, outra conta, origem, confirmação e login antigo sem excluir',async()=>{
 for(const [options,body,status] of [[{user:null},{ownerId:'owner',confirmation:'EXCLUIR'},401],[{},{ownerId:'other',confirmation:'EXCLUIR'},400],[{},{ownerId:'owner',confirmation:'sim'},400],[{origin:'https://other.test'},{ownerId:'owner',confirmation:'EXCLUIR'},403],[{amr:[{method:'password',timestamp:now/1000-601}]},{ownerId:'owner',confirmation:'EXCLUIR'},403]]){const api=endpoint(options);assert.equal((await api.invoke(body)).status,status);assert.deepEqual(api.calls,[]);}
 const api=endpoint();assert.deepEqual(JSON.parse(JSON.stringify(await api.invoke({ownerId:'owner',confirmation:'EXCLUIR'}))),{status:200,body:{deleted:true}});assert.deepEqual(api.calls,['owner']);
 const failing=endpoint({failure:true});assert.equal((await failing.invoke({ownerId:'owner',confirmation:'EXCLUIR'})).status,503);
});
test('recuperação solicita link sem senha e sem revelar existência da conta, com cooldown',async()=>{
 const app=boot({user:null});await settle();let calls=0,args;
 app.context.location={origin:'https://pluviaweather.com.br',pathname:'/'};
 app.client.auth.resetPasswordForEmail=async(email,options)=>{calls++;args={email,options};return {error:null};};
 app.nodes.get('accountForgot').events.click();assert.equal(app.nodes.get('accountPassword').required,false);
 app.nodes.get('accountEmail').value='user@example.test';await app.nodes.get('accountForm').events.submit({preventDefault(){}});
 assert.equal(args.options.redirectTo,'https://pluviaweather.com.br/?auth_recovery=1');assert.match(app.nodes.get('accountStatus').textContent,/Se houver/);
 await app.nodes.get('accountForm').events.submit({preventDefault(){}});assert.equal(calls,1);
 app.nodes.get('accountLogin').events.click();assert.equal(app.nodes.get('accountPassword').required,true);
});
test('somente PASSWORD_RECOVERY habilita troca; valida confirmação e limpa senhas após salvar',async()=>{
 const app=boot();await settle();let args;
 app.client.auth.updateUser=async value=>{args=value;return {error:null};};
 app.context.document.getElementById('accountNewPassword').value='Safe-password1!';app.context.document.getElementById('accountNewPasswordConfirm').value='Safe-password1!';
 await app.nodes.get('accountRecoveryForm').events.submit({preventDefault(){}});assert.equal(args,undefined);
 app.switchUser(app.user,'PASSWORD_RECOVERY');
 assert.equal(app.nodes.get('accountRecoveryForm').hidden,false);assert.equal(app.nodes.get('accountProfile').hidden,true);
 app.context.document.getElementById('accountNewPasswordConfirm').value='different';await app.nodes.get('accountRecoveryForm').events.submit({preventDefault(){}});assert.equal(args,undefined);
 app.context.document.getElementById('accountNewPasswordConfirm').value='Safe-password1!';await app.nodes.get('accountRecoveryForm').events.submit({preventDefault(){}});
 assert.equal(args.password,'Safe-password1!');assert.equal(app.context.document.getElementById('accountNewPassword').value,'');assert.equal(app.nodes.get('accountRecoveryForm').hidden,true);
});
test('falha real de envio não culpa conexão nem expõe erro SMTP; permite tentar após correção',async()=>{
 const app=boot({user:null});await settle();let calls=0;
 app.context.location={origin:'https://pluviaweather.com.br',pathname:'/'};
 app.client.auth.resetPasswordForEmail=async()=>{calls++;return {error:{code:'unexpected_failure',status:500,message:'gomail: domain auth.private.test is not verified; private@example.test'}};};
 app.nodes.get('accountForgot').events.click();app.nodes.get('accountEmail').value='fixture@example.test';
 await app.nodes.get('accountForm').events.submit({preventDefault(){}});
 const status=app.nodes.get('accountStatus').textContent;
 assert.match(status,/e-mail de recuperação/);assert.match(status,/serviço do Pluvia/);assert.doesNotMatch(status,/conexão|gomail|private|SMTP/);
 assert.equal(app.nodes.get('accountSubmit').disabled,false);
 app.client.auth.resetPasswordForEmail=async()=>{calls++;return {error:null};};
 await app.nodes.get('accountForm').events.submit({preventDefault(){}});
 assert.equal(calls,2);assert.match(app.nodes.get('accountStatus').textContent,/Se houver/);
});
test('erros do servidor, limite e rede preservam mensagens distintas',async()=>{
 const app=boot({user:null});await settle();app.context.location={origin:'https://pluviaweather.com.br',pathname:'/'};
 app.nodes.get('accountForgot').events.click();app.nodes.get('accountEmail').value='fixture@example.test';
 for(const [error,expected] of [[{status:503},/serviço do Pluvia/],[{code:'over_email_send_rate_limit',status:429},/Muitas tentativas/],[{code:'email_address_not_authorized',status:400},/liberado/],[{name:'AuthRetryableFetchError',status:0},/conexão/]]){
   app.client.auth.resetPasswordForEmail=async()=>({error});await app.nodes.get('accountForm').events.submit({preventDefault(){}});assert.match(app.nodes.get('accountStatus').textContent,expected);
 }
 app.nodes.get('accountSignup').events.click();app.nodes.get('accountName').value='Fixture';app.nodes.get('accountPassword').value='Fixture-password1!';
 app.client.auth.signUp=async()=>({error:{code:'unexpected_failure',status:500}});await app.nodes.get('accountForm').events.submit({preventDefault(){}});
 assert.match(app.nodes.get('accountStatus').textContent,/concluir o cadastro/);assert.doesNotMatch(app.nodes.get('accountStatus').textContent,/conexão/);
});
test('templates usam URL oficial de confirmação, botão e link textual sem rastreio ou nome não escapado',()=>{
 for(const name of ['confirmation','recovery']){const html=fs.readFileSync('supabase/templates/'+name+'.html','utf8');assert.match(html,/lang="pt-BR"/);assert.equal((html.match(/href="{{ \.ConfirmationURL }}"/g)||[]).length,2);assert.match(html,/PLUVIA/);assert.doesNotMatch(html,/<script|{{ \.Data|https?:\/\/[^" ]+\.(png|webp)|tracking/i);}
});

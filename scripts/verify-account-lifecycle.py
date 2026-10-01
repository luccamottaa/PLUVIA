"""Real browser SDK, synthetic sessions and intercepted account mutations only."""
import base64,json,os,shutil,time
from pathlib import Path
from playwright.sync_api import sync_playwright
preview=os.environ.get('PLUVIA_PREVIEW_URL','http://127.0.0.1:4173')
owner='00000000-0000-4000-8000-000000000001'
user={'id':owner,'email':'fixture@example.test','app_metadata':{'provider':'email','providers':['email']},'user_metadata':{'name':'Teste'},'aud':'authenticated','role':'authenticated'}
def encoded(value):return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
token=encoded({'alg':'HS256','typ':'JWT'})+'.'+encoded({'sub':owner,'exp':int(time.time())+3600,'role':'authenticated','amr':[{'method':'otp','timestamp':int(time.time())}]})+'.fixture'
writes=[];recover=[];deletes=[];state={'reauth':True,'recoverError':True};errors=[]
with sync_playwright() as p:
 browser=p.webkit.launch() if os.environ.get('PLUVIA_BROWSER')=='webkit' else p.chromium.launch(args=['--no-sandbox'],**({'executable_path':shutil.which('chromium')} if shutil.which('chromium') else {}))
 context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block')
 def route(r):
  url=r.request.url
  if '/auth/v1/recover' in url:
   recover.append(r.request.post_data_json)
   r.fulfill(status=500 if state['recoverError'] else 200,json={'code':'unexpected_failure','msg':'Error sending recovery email'} if state['recoverError'] else {});return
  if '/auth/v1/user' in url:
   if r.request.method=='PUT':writes.append(r.request.post_data_json)
   r.fulfill(json=user);return
  if '/auth/v1/logout' in url:r.fulfill(status=204,body='');return
  if '/auth/v1/settings' in url:r.fulfill(json={'external':{'email':True,'google':False,'apple':False}});return
  if 'functions/v1/account-preferences' in url:r.fulfill(json={'snapshot':{'displayName':'Teste','favoriteCityIds':[],'primaryCityId':None,'namedPlaces':[]}});return
  if 'functions/v1/account-delete' in url:
   deletes.append(r.request.post_data_json)
   r.fulfill(status=403 if state['reauth'] else 200,json={'code':'reauth_required','error':'Entre novamente.'} if state['reauth'] else {'deleted':True});return
  if '127.0.0.1' in url or 'localhost' in url:r.continue_();return
  r.abort()
 context.route('**/*',route)
 context.add_init_script("sessionStorage.setItem('pluvia-intro-seen','1');Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(s,e){e({code:1})}}});")
 page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(preview,wait_until='domcontentloaded');page.locator('#accountButton').click();page.locator('#accountForgot').click();page.locator('#accountEmail').fill('fixture@example.test');page.locator('#accountSubmit').click()
 page.wait_for_function("document.getElementById('accountStatus').textContent.includes('serviço do Pluvia')")
 assert 'conexão' not in page.locator('#accountStatus').inner_text()
 assert page.locator('#accountSubmit').is_enabled()
 state['recoverError']=False;page.locator('#accountSubmit').click()
 page.wait_for_function("document.getElementById('accountStatus').textContent.includes('Se houver')")
 assert len(recover)==2 and recover[0]['email']=='fixture@example.test'
 assert 'password' not in recover[0]
 page.locator('#accountSubmit').click();assert len(recover)==2
 page.goto(preview+'/?auth_recovery=1#access_token='+token+'&refresh_token=fixture&expires_in=3600&token_type=bearer&type=recovery',wait_until='domcontentloaded')
 page.locator('#accountNewPassword').wait_for(state='visible',timeout=20000)
 assert page.locator('#accountProfile').is_hidden()
 page.locator('#accountNewPassword').fill('Fixture-password1!');page.locator('#accountNewPasswordConfirm').fill('Different-password1!');page.locator('#accountRecoverySave').click()
 assert 'iguais' in page.locator('#accountStatus').inner_text();assert not writes
 page.locator('#accountNewPasswordConfirm').fill('Fixture-password1!');page.locator('#accountRecoverySave').click()
 page.wait_for_function("document.getElementById('accountStatus').textContent.includes('Senha atualizada')")
 assert len(writes)==1 and writes[0].get('password')=='Fixture-password1!',[list(item) for item in writes]
 assert page.locator('#accountNewPassword').input_value()==''
 assert page.locator('#accountProfile').is_visible()
 assert '#' not in page.url and 'auth_recovery' not in page.url
 page.locator('.account-delete summary').click();page.locator('#accountDeleteConfirm').fill('EXCLUIR');page.locator('#accountDelete').click()
 page.wait_for_function("document.getElementById('accountStatus').textContent.includes('entre novamente')")
 assert page.locator('#accountProfile').is_visible()
 state['reauth']=False;page.locator('#accountDelete').click()
 page.wait_for_function("document.getElementById('accountStatus').textContent.includes('foi excluída')")
 assert len(deletes)==2 and all(item=={'ownerId':owner,'confirmation':'EXCLUIR'} for item in deletes)
 assert page.locator('#accountForm').is_visible();assert page.locator('#accountButton').inner_text()=='Entrar / cadastrar'
 assert not errors,errors
 context.close();context=browser.new_context(service_workers='block');context.route('**/*',route)
 page=context.new_page();page.goto(preview+'/?auth_recovery=1#error=access_denied&error_description=private',wait_until='domcontentloaded')
 page.wait_for_function("document.getElementById('accountStatus').textContent.includes('não pôde ser validado')")
 assert page.locator('#accountRecoveryForm').is_hidden();assert '#' not in page.url;assert 'private' not in page.locator('#accountStatus').inner_text()
 print(json.dumps({'passwordResetRequest':True,'recoveryCallbackWithRealSDK':True,'passwordConfirmation':True,'deleteReauthentication':True,'deleteSuccessFixture':True,'expiredLink':True,'realAccountMutations':False,'errors':errors}))
 browser.close()

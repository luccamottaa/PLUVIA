"""Real SDK + intercepted signup/recovery, including a protected preview origin.
No real accounts, email sends, production settings or deployment protections are changed.
"""
import base64,json,os,shutil,time
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parent.parent/'dist'
public='https://pluviaweather.com.br'
preview='https://pluvia-lucca-49c6.vercel.app'
owner='00000000-0000-4000-8000-000000000001'
user={'id':owner,'email':'fixture@example.test','app_metadata':{'provider':'email','providers':['email']},'user_metadata':{'name':'Teste'},'aud':'authenticated','role':'authenticated'}
def encoded(value):return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
token=encoded({'alg':'HS256','typ':'JWT'})+'.'+encoded({'sub':owner,'exp':int(time.time())+3600,'role':'authenticated'})+'.fixture'
signup=[];recovery=[];errors=[]
with sync_playwright() as p:
 browser=p.webkit.launch() if os.environ.get('PLUVIA_BROWSER')=='webkit' else p.chromium.launch(args=['--no-sandbox'],**({'executable_path':shutil.which('chromium')} if shutil.which('chromium') else {}))
 def route(r):
  url=urlparse(r.request.url)
  if url.hostname=='dszyyrcvwrpyiypwyvxe.supabase.co':
   if url.path=='/auth/v1/signup':
    signup.append(parse_qs(url.query).get('redirect_to',[None])[0])
    r.fulfill(json=user);return
   if url.path=='/auth/v1/recover':
    recovery.append(parse_qs(url.query).get('redirect_to',[None])[0])
    r.fulfill(json={});return
   if url.path=='/auth/v1/user':r.fulfill(json=user);return
   if url.path=='/auth/v1/settings':r.fulfill(json={'external':{'email':True,'google':False,'apple':False}});return
   if url.path=='/functions/v1/account-preferences':
    r.fulfill(json={'snapshot':{'displayName':'Teste','favoriteCityIds':[],'primaryCityId':None,'namedPlaces':[]}});return
   r.abort();return
  if url.hostname in ['pluviaweather.com.br','pluvia-lucca-49c6.vercel.app','127.0.0.1'] and r.request.method=='GET':
   file=(root/(url.path.lstrip('/') or 'index.html')).resolve()
   if file.is_relative_to(root) and file.is_file():r.fulfill(path=file);return
  r.abort()
 def context():
  ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block')
  ctx.route('**/*',route)
  ctx.add_init_script("sessionStorage.setItem('pluvia-intro-seen','1');Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(s,e){e({code:1})}}});")
  return ctx
 for source,dest in [(public+'/',public+'/'),(preview+'/index.html?next=https://other.test#agora',public+'/'),('http://127.0.0.1:4173/','http://127.0.0.1:4173/')]:
  ctx=context();page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(source,wait_until='domcontentloaded');page.locator('#accountButton').click();page.locator('#accountSignup').click()
  page.locator('#accountName').fill('Teste');page.locator('#accountEmail').fill('fixture@example.test');page.locator('#accountPassword').fill('Fixture-password1!');page.locator('#accountSubmit').click()
  page.wait_for_function("document.getElementById('accountStatus').textContent.includes('confirmar')")
  assert signup[-1]==dest,(signup[-1],dest)
  assert page.locator('#accountProfile').is_hidden()
  page.locator('#accountLogin').click();page.locator('#accountForgot').click();page.locator('#accountSubmit').click()
  page.wait_for_function("document.getElementById('accountStatus').textContent.includes('Se houver')")
  assert recovery[-1]==dest+'?auth_recovery=1',(recovery[-1],dest)
  ctx.close()
 # Open the confirmation return on another device/session with no signup storage.
 ctx=context();page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(public+'/#access_token='+token+'&refresh_token=fixture&expires_in=3600&token_type=bearer&type=signup',wait_until='domcontentloaded')
 page.wait_for_function("document.getElementById('accountButton').textContent==='Olá, Teste'")
 assert urlparse(page.url).netloc=='pluviaweather.com.br' and not urlparse(page.url).fragment
 page.locator('#accountButton').click();assert page.locator('#accountProfile').is_visible()
 assert not errors,errors
 print(json.dumps({'signupRedirects':signup,'recoveryRedirects':recovery,'confirmationOnAnotherSession':True,'realAccountMutations':False,'errors':errors}))
 ctx.close();browser.close()

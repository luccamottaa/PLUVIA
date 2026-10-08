"""Optional browser QA: real bundled Auth SDK, fake sessions, intercepted services.
All account mutations are in a local Node fixture; production Auth/push is blocked.
"""
import base64,datetime,json,os,shutil,subprocess,time,zoneinfo
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
repo=Path(__file__).resolve().parent.parent
preview=os.environ.get('PLUVIA_PREVIEW_URL','http://127.0.0.1:4173')
fixture=subprocess.Popen(['node','tests/support/account-fixture.cjs'],cwd=repo,stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
def service(body):
 fixture.stdin.write(json.dumps(body)+'\n');fixture.stdin.flush()
 return json.loads(fixture.stdout.readline())
base=json.loads(subprocess.check_output(['node','-e',"process.stdout.write(JSON.stringify(require('./tests/support/forecast.cjs').forecast()))"],cwd=repo,text=True))
owner='00000000-0000-4000-8000-000000000001'
def encoded(value):return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
token=encoded({'alg':'HS256','typ':'JWT'})+'.'+encoded({'sub':owner,'exp':int(time.time())+3600,'role':'authenticated'})+'.fixture'
user={'id':owner,'email':'test@example.test','app_metadata':{'provider':'email','providers':['email']},'user_metadata':{'name':'Teste','favorite_city_ids':['1302603'],'named_places_v1':[{'id':'home','name':'Casa','cityId':'1302603','cityName':'Manaus','uf':'AM','updatedAt':100}]}}
session={'access_token':token,'refresh_token':'fixture','expires_at':int(time.time())+3600,'expires_in':3600,'token_type':'bearer','user':user}
offline={'enabled':False}
def route(r):
 url=r.request.url
 if 'functions/v1/account-preferences' in url:
  body=r.request.post_data_json
  if offline['enabled'] and body['action']=='apply':r.fulfill(status=503,json={'error':'Temporariamente indisponível.','code':'service_unavailable'});return
  result=service(body);status=result.pop('status');r.fulfill(status=status,json=result);return
 if '/auth/v1/user' in url:r.fulfill(json=user);return
 if 'api.open-meteo.com/v1/forecast' in url:
  tz=parse_qs(urlparse(url).query).get('timezone',['America/Manaus'])[0];local=datetime.datetime.now(zoneinfo.ZoneInfo(tz));data=json.loads(json.dumps(base))
  data['timezone']=tz;data['utc_offset_seconds']=int(local.utcoffset().total_seconds());data['current']['time']=local.strftime('%Y-%m-%dT%H:%M')
  for i in range(72):data['hourly']['time'][i]=(local.replace(minute=0,second=0,microsecond=0)+datetime.timedelta(hours=i-1)).strftime('%Y-%m-%dT%H:%M')
  for i in range(8):
   day=(local.date()+datetime.timedelta(days=i)).isoformat();data['daily']['time'][i]=day;data['daily']['sunrise'][i]=day+'T06:00';data['daily']['sunset'][i]=day+'T18:00'
  r.fulfill(json=data);return
 if 'inmet.gov.br' in url:r.fulfill(json={'hoje':[],'amanha':[]});return
 if 'rainviewer.com' in url:r.fulfill(json={'host':'https://radar.test','radar':{'past':[]}});return
 if 'functions/v1/met-forecast' in url:r.fulfill(json={'source':'MET Norway','hourly':[]});return
 if 'functions/v1/' in url:r.fulfill(status=401,json={'error':'Serviço bloqueado no teste.'});return
 if '127.0.0.1' in url or 'localhost' in url:r.continue_();return
 r.abort()
def wait_server(page,expression):
 for _ in range(60):
  state=service({'action':'read'})['snapshot']
  if expression(state):return state
  page.wait_for_timeout(100)
 raise AssertionError('Fixture não recebeu a alteração esperada')
try:
 with sync_playwright() as p:
  browser=p.webkit.launch(headless=True) if os.environ.get('PLUVIA_BROWSER')=='webkit' else p.chromium.launch(headless=True,args=['--no-sandbox'],executable_path=shutil.which('chromium'))
  pages=[];errors=[]
  for _ in range(2):
   context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block')
   context.route('**/*',route)
   context.add_init_script("if(!sessionStorage.getItem('account-fixture-seeded')){localStorage.setItem('sb-dszyyrcvwrpyiypwyvxe-auth-token',"+json.dumps(json.dumps(session))+" );sessionStorage.setItem('account-fixture-seeded','1');}sessionStorage.setItem('pluvia-intro-seen','1');Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,fail){fail({code:1});}}});")
   page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)));page.goto(preview,wait_until='domcontentloaded')
   page.wait_for_function("window.pluviaAccount?.getPreferences()?.namedPlaces?.length===1 && document.getElementById('pluviaIntro').hidden",timeout=20000)
   pages.append(page)
  a,b=pages
  a.evaluate("chooseCity('3550308');toggleFavoriteCity()")
  wait_server(a,lambda state:'3550308' in state['favoriteCityIds'])
  b.evaluate("chooseCity('2611606');toggleFavoriteCity()")
  wait_server(b,lambda state:all(id in state['favoriteCityIds'] for id in ['1302603','3550308','2611606']))
  a.evaluate('pluviaAccount.syncPreferences()');a.wait_for_function('favorites.size===3')
  for page in pages:page.locator('#openCitySearch').click();page.locator('.saved-places summary').click()
  b.locator('#savedPlaceName').fill('Faculdade');b.locator('#savedPlaceSave').click()
  wait_server(b,lambda state:any(place['name']=='Faculdade' for place in state['namedPlaces']))
  a.evaluate('pluviaAccount.syncPreferences()');a.wait_for_function("document.getElementById('savedPlacesList').innerText.includes('Faculdade')")
  a.locator('[data-place-edit="home"]').click();a.locator('#savedPlaceName').fill('Minha Casa')
  b.locator('[data-place-edit="home"]').click();b.locator('#savedPlaceName').fill('Casa B');b.locator('#savedPlaceSave').click()
  wait_server(b,lambda state:any(place['id']=='home' and place['name']=='Casa B' for place in state['namedPlaces']))
  a.evaluate('pluviaAccount.syncPreferences()')
  assert a.locator('#savedPlaceName').input_value()=='Minha Casa'
  a.locator('#savedPlaceSave').click();a.wait_for_function("document.getElementById('savedPlacesStatus').innerText.includes('outro dispositivo')")
  assert 'Casa B' in a.locator('#savedPlacesList').inner_text()
  a.locator('#closeCitySearch').click()
  a.locator('#accountButton').click();a.locator('#profileName').fill('Nome Novo');a.locator('#profileSave').click()
  wait_server(a,lambda state:state['displayName']=='Nome Novo')
  a.wait_for_function("document.getElementById('accountButton').textContent==='Olá, Nome'")
  a.locator('#accountButton').click()
  a.wait_for_function("document.getElementById('profileDisplayName').textContent==='Nome Novo'")
  a.locator('#accountClose').click()
  b.evaluate('pluviaAccount.syncPreferences()')
  b.wait_for_function("document.getElementById('accountButton').textContent==='Olá, Nome'")
  offline['enabled']=True
  a.evaluate("chooseCity('4106902');toggleFavoriteCity()")
  a.wait_for_function("document.getElementById('accountStatus').innerText.includes('reconectar')")
  offline['enabled']=False;a.reload(wait_until='domcontentloaded')
  wait_server(a,lambda state:'4106902' in state['favoriteCityIds'])
  assert not errors,errors
  assert not a.evaluate('document.documentElement.scrollWidth>innerWidth')
  print(json.dumps({'browser':os.environ.get('PLUVIA_BROWSER','chromium'),'twoDevices':True,'favoriteUnion':True,'independentPlaces':True,'samePlaceConflictAfterRefresh':True,'canonicalProfileName':True,'offlineReloadReplay':True,'errors':errors}))
  browser.close()
finally:
 fixture.terminate();fixture.wait()

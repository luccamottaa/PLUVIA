"""Deterministic QA for hourly details, astronomy and alert settings.
Uses the real bundled SDK with fake sessions; never registers or sends Push.
All weather, METAR and Auth requests are intercepted inside this process.
"""
import base64,datetime,json,os,shutil,subprocess,tempfile,time
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright

repo=Path(__file__).resolve().parent.parent
preview=os.environ.get('PLUVIA_PREVIEW_URL','http://127.0.0.1:4173')
output=Path(os.environ.get('PLUVIA_QA_OUTPUT',str(Path(tempfile.gettempdir())/'pluvia-daily-planning')));output.mkdir(parents=True,exist_ok=True)
base=json.loads(subprocess.check_output(['node','-e',"process.stdout.write(JSON.stringify(require('./tests/support/forecast.cjs').forecast('2026-10-04',10)))"],cwd=repo,text=True))
fixed=datetime.datetime(2026,10,4,14,15,tzinfo=datetime.timezone.utc)
owner='00000000-0000-4000-8000-000000000001'
def encoded(value):return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
token=encoded({'alg':'HS256','typ':'JWT'})+'.'+encoded({'sub':owner,'exp':int(fixed.timestamp())+3600,'role':'authenticated'})+'.fixture'
user={'id':owner,'email':'qa@example.test','app_metadata':{'provider':'email','providers':['email']},'user_metadata':{'name':'Teste'}}
session={'access_token':token,'refresh_token':'fixture','expires_at':int(fixed.timestamp())+3600,'expires_in':3600,'token_type':'bearer','user':user}
preferences={'notifications_enabled':True,'minimum_severity':3,'quiet_start':'22:00:00','quiet_end':'06:30:00','timezone':'America/Manaus','daily_summary':False,'storms':False}
saves=[];forbidden=[];mode={'forecast':'normal'}
fixture=subprocess.Popen(['node','tests/support/account-fixture.cjs'],cwd=repo,stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
def service(body):
 fixture.stdin.write(json.dumps(body)+'\n');fixture.stdin.flush();return json.loads(fixture.stdout.readline())
def route(r):
 url=r.request.url
 if 'functions/v1/smart-summary' in url:forbidden.append('removed-smart-summary');r.abort();return
 if '/auth/v1/user' in url:r.fulfill(json=user);return
 if 'functions/v1/account-preferences' in url:
  result=service(r.request.post_data_json);status=result.pop('status');r.fulfill(status=status,json=result);return
 if 'functions/v1/push-subscriptions' in url:
  body=r.request.post_data_json
  if body['action']=='config':r.fulfill(json={'preferences':preferences,'devices':[],'locations':[],'publicKey':'fixture'});return
  if body['action']=='preferences':saves.append(body);preferences.update(body['preferences']);r.fulfill(json={'ok':True});return
  forbidden.append(body['action']);r.abort();return
 if 'push-send' in url or 'push-process' in url:forbidden.append(url);r.abort();return
 if '/auth/v1/settings' in url:r.fulfill(json={'external':{'google':False,'apple':False,'email':True}});return
 if 'api.open-meteo.com/v1/forecast' in url:
  data=json.loads(json.dumps(base));data['timezone']=parse_qs(urlparse(url).query).get('timezone',['America/Manaus'])[0]
  for key,value in [('apparent_temperature',26),('uv_index',2)]:data['hourly'][key]=[value]*72
  if mode['forecast']=='storm':data['hourly']['weather_code']=[95]*72
  r.fulfill(json=data);return
 if 'met-forecast' in url:r.fulfill(json={'source':'MET Norway','hourly':[]});return
 if 'inmet.gov.br' in url:r.fulfill(json={'hoje':[],'amanha':[]});return
 if 'rainviewer.com' in url:r.fulfill(json={'host':'https://radar.test','radar':{'past':[]}});return
 if '127.0.0.1' in url or 'localhost' in url:r.continue_();return
 r.abort()
try:
 with sync_playwright() as p:
  browser=p.webkit.launch() if os.environ.get('PLUVIA_BROWSER')=='webkit' else p.chromium.launch(args=['--no-sandbox'],executable_path=shutil.which('chromium'))
  context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,timezone_id='Asia/Tokyo',service_workers='block',reduced_motion='reduce')
  context.route('**/*',route)
  context.add_init_script("if(!sessionStorage.getItem('daily-fixture')){localStorage.setItem('sb-dszyyrcvwrpyiypwyvxe-auth-token',"+json.dumps(json.dumps(session))+" );sessionStorage.setItem('daily-fixture','1');}sessionStorage.setItem('pluvia-intro-seen','1');Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,fail){fail({code:1});}}});")
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.clock.set_fixed_time(fixed)
  page.goto(preview,wait_until='domcontentloaded');page.wait_for_function("document.getElementById('temperature').textContent==='30' && document.getElementById('pluviaIntro').hidden",timeout=20000)
  assert page.locator('#outdoorPlan').count()==0
  page.locator('#hourlyPeek [data-hour-index]').first.click();assert 'Previsão para' in page.locator('#hourlyDetailTitle').inner_text();page.keyboard.press('Escape')
  page.locator('.astronomy-details summary').click()
  for selector in ['#civilDawn','#civilDusk','#moonrise','#moonset']:assert ':' in page.locator(selector).inner_text(),selector
  assert '4 de outubro' in page.locator('#astronomyDate').inner_text()
  page.locator('#accountButton').click();page.wait_for_function("!document.getElementById('notificationPreferencesSave').disabled")
  assert page.locator('[name=minimum_severity]').input_value()=='3'
  assert page.locator('[name=quiet_enabled]').is_checked();assert page.locator('[name=quiet_start]').input_value()=='22:00'
  page.locator('[name=minimum_severity]').select_option('4');page.locator('[name=quiet_start]').fill('23:15');page.locator('[name=quiet_end]').fill('07:45')
  page.locator('#notificationPreferencesSave').click();page.wait_for_function("document.getElementById('notificationSupportNote').textContent.includes('Preferências salvas')")
  assert len(saves)==1 and saves[-1]['preferences']['quiet_start']=='23:15' and saves[-1]['preferences']['minimum_severity']==4
  page.locator('[name=quiet_enabled]').uncheck();page.locator('#notificationPreferencesSave').click();page.wait_for_function("!document.getElementById('notificationPreferencesSave').disabled")
  assert len(saves)==2 and saves[-1]['preferences']['quiet_start'] is None and saves[-1]['preferences']['quiet_end'] is None
  page.locator('[name=quiet_enabled]').check()
  for width,height in [(320,568),(390,844),(844,390),(1440,900)]:
   page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(100)
   assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),(width,height)
   for selector in ['[name=minimum_severity]','[name=quiet_start]','[name=quiet_end]','[name=timezone]']:
    page.locator(selector).scroll_into_view_if_needed();box=page.locator(selector).bounding_box();assert box and box['width']>50 and box['x']>=0 and box['x']+box['width']<=width+1,(selector,box)
   quiet=page.locator('.notification-time-pair input').evaluate_all("els=>els.map(el=>{const r=el.getBoundingClientRect();return {y:r.y,width:r.width}})")
   assert len(quiet)==2 and abs(quiet[0]['y']-quiet[1]['y'])<=1 and abs(quiet[0]['width']-quiet[1]['width'])<=1,(width,quiet)
   if width==390:page.locator('.notification-timing').screenshot(path=str(output/(os.environ.get('PLUVIA_BROWSER','chromium')+'-notification-settings.png')))
  page.locator('#accountClose').click();page.set_viewport_size({'width':390,'height':844})
  page.locator('#chuva').screenshot(path=str(output/(os.environ.get('PLUVIA_BROWSER','chromium')+'-planning.png')))
  page.locator('.sun-section').screenshot(path=str(output/(os.environ.get('PLUVIA_BROWSER','chromium')+'-astronomy.png')))
  page.evaluate("render(displayedWeather.forecast,displayedWeather.air,true,Date.now()-3600000,{weatherAt:Date.now()-3600000})")
  assert page.locator('#outdoorPlan').count()==0
  mode['forecast']='storm';page.evaluate('refreshAll()');page.wait_for_function("displayedWeather.forecast.hourly.weather_code[0]===95")
  page.evaluate("chooseCity('3550308')");page.wait_for_function("document.getElementById('cityName').textContent.includes('São Paulo') && !document.getElementById('weatherView').classList.contains('initial-loading')")
  assert 'São Paulo' in page.locator('#astronomyDate').inner_text();assert page.locator('#outdoorPlan').count()==0
  assert not errors,errors;assert not forbidden,forbidden
  print(json.dumps({'browser':os.environ.get('PLUVIA_BROWSER','chromium'),'hourlyDetailWithoutPlanner':True,'astronomyCityDay':True,'quietSaveAndClear':True,'severity':True,'staleAndStorm':True,'cityChange':True,'noRealPush':True,'errors':errors}))
  browser.close()
finally:fixture.terminate();fixture.wait()

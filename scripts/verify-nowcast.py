"""Nowcast UI contracts with synthetic fixtures confined to browser routing.
No Auth, Web Push, Xweather or real sensor requests. Screenshots are review artifacts.
"""
import base64,datetime,json,os,shutil,subprocess
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
repo=Path(__file__).resolve().parent.parent
preview=os.environ.get('PLUVIA_PREVIEW_URL','http://127.0.0.1:4173')
output=Path(os.environ.get('PLUVIA_QA_OUTPUT','/tmp/pluvia-nowcast-qa'));output.mkdir(parents=True,exist_ok=True)
fixed=datetime.datetime(2026,10,3,3,tzinfo=datetime.timezone.utc);now=int(fixed.timestamp()*1000)
js="""const {fixture,region}=require('./tests/support/nowcast-fixtures.cjs'),{evaluate}=require('./supabase/functions/_shared/nowcast/engine.js');
const now=Date.UTC(2026,9,3,3),scenarios=['dry','stationary','approaching','away','forming','intensifying','radar-down','stale','discordant'];
const rows=Object.fromEntries(scenarios.map(name=>[name,evaluate({...fixture(name,now,{mock:false}),location:{lat:-3.12,lon:-60.02,reference:'municipality'}},{now})]));
rows.mock=evaluate({...fixture('approaching',now),location:{lat:-3.12,lon:-60.02,reference:'municipality'}},{now,allowMock:true});
process.stdout.write(JSON.stringify({manifest:{schemaVersion:1,regions:[region]},rows,forecast:require('./tests/support/forecast.cjs').forecast()}));"""
fixtures=json.loads(subprocess.check_output(['node','-e',js],cwd=repo,text=True))
mode={'scenario':'approaching','pending':False,'fail':False,'enabled':False};blocked=[];requests=[]
# Pin the existing map SDK; only its download is external, never weather/Auth.
with sync_playwright() as p:
 browser=p.webkit.launch() if os.environ.get('PLUVIA_BROWSER')=='webkit' else p.chromium.launch(args=['--no-sandbox'],**({'executable_path':shutil.which('chromium')} if shutil.which('chromium') else {}))
 context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,timezone_id='Asia/Tokyo',service_workers='block',reduced_motion='reduce')
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  url=r.request.url
  if '/api/nowcast' in url or 'functions/v1/nowcast' in url:
   query=parse_qs(urlparse(url).query);requests.append(url)
   if not query:r.fulfill(headers={'Access-Control-Allow-Origin':'*'},json=fixtures['manifest']);return
   if mode['pending']:blocked.append(r);return
   if mode['fail']:r.abort();return
   row=json.loads(json.dumps(fixtures['rows'][mode['scenario']]));row['location']={'lat':float(query['lat'][0]),'lon':float(query['lon'][0])}
   r.fulfill(headers={'Access-Control-Allow-Origin':'*'},json=row);return
  if 'api.open-meteo.com/v1/forecast' in url:
   data=json.loads(json.dumps(fixtures['forecast']));data['timezone']=parse_qs(urlparse(url).query).get('timezone',['America/Manaus'])[0]
   data['current']['time']='2026-10-02T23:00';data['current']['is_day']=0
   for i in range(72):data['hourly']['time'][i]=(datetime.datetime(2026,10,2,22)+datetime.timedelta(hours=i)).isoformat(timespec='minutes')
   r.fulfill(headers={'Access-Control-Allow-Origin':'*'},json=data);return
  if 'air-quality-api' in url:r.fulfill(headers={'Access-Control-Allow-Origin':'*'},json={});return
  if 'inmet.gov.br' in url:r.fulfill(headers={'Access-Control-Allow-Origin':'*'},json={'hoje':[]});return
  if 'functions/v1/met-forecast' in url:r.fulfill(headers={'Access-Control-Allow-Origin':'*'},json={'source':'MET Norway','hourly':[]});return
  if 'rainviewer' in url:r.fulfill(headers={'Access-Control-Allow-Origin':'*'},json={'host':'https://radar.test','radar':{'past':[]}});return
  if 'tile.openstreetmap.org' in url:r.fulfill(content_type='image/png',body=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII='));return
  if '/auth/v1/settings' in url:r.fulfill(headers={'Access-Control-Allow-Origin':'*'},json={'external':{'email':True}});return
  if urlparse(url).hostname in ['localhost','127.0.0.1']:
   if r.request.resource_type=='document' and mode['enabled']:
    response=r.fetch();html=response.text();assert html.count('data-enabled="false"')==1
    r.fulfill(response=response,body=html.replace('data-enabled="false"','data-enabled="true"'));return
   r.continue_();return
  r.abort()
 context.route('**/*',route)
 context.add_init_script("sessionStorage.setItem('pluvia-intro-seen','1');localStorage.setItem('pluvia-city',JSON.stringify('1302603'));Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,fail){fail({code:1});}}});")
 page.clock.set_fixed_time(fixed)
 # Production stays paused. Only fixture HTML opts in below to retain engine/UI QA.
 page.goto(preview,wait_until='domcontentloaded')
 page.wait_for_function("document.getElementById('temperature').textContent==='30' && document.getElementById('pluviaIntro').hidden")
 assert page.locator('#nowcastCard').is_hidden() and not requests,requests
 mode['enabled']=True
 def open_scenario(name):
  mode.update(scenario=name,pending=False,fail=False);page.goto(preview,wait_until='domcontentloaded')
  page.locator('#nowcastCard').wait_for(state='visible');page.wait_for_function("!document.getElementById('nowcastRetry').disabled")
  page.wait_for_function("!document.documentElement.classList.contains('awaiting-styles') && document.getElementById('pluviaIntro').hidden && !document.getElementById('weatherView').classList.contains('initial-loading')")
  assert 'referência do município' in page.locator('#nowcastReference').inner_text()
  assert not errors,errors
 for name in fixtures['rows']:
  open_scenario(name)
  assert 'OBSERVADO' in page.locator('#nowcastCard').inner_text()
  if name in ['radar-down','stale']:assert 'Dados insuficientes' in page.locator('#nowcastStatus').inner_text()
  if name in ['dry','radar-down','stale','forming','stationary','away','discordant']:
   assert 'Possível chegada' not in page.locator('#nowcastInference').inner_text() or not page.locator('#nowcastInference').is_visible()
  if name in ['approaching','intensifying']:assert 'min' in page.locator('#nowcastArrival').inner_text()
  assert page.locator('#nowcastMock').is_visible()==(name=='mock')
  page.locator('#weatherMap').scroll_into_view_if_needed()
  page.wait_for_function("document.getElementById('weatherFrameTime').textContent==='Indisponível'")
  page.locator('#nowcastCard').scroll_into_view_if_needed();page.screenshot(path=str(output/('nowcast-'+name+'.png')))
 open_scenario('approaching')
 for width,height in [(320,568),(375,667),(390,844),(430,932),(844,390),(768,1024),(1440,900)]:
  page.set_viewport_size({'width':width,'height':height});page.locator('#nowcastCard').scroll_into_view_if_needed()
  if page.evaluate('document.documentElement.scrollWidth>innerWidth'):
   page.screenshot(path=str(output/'overflow.png'),full_page=True)
   raise AssertionError((width,height,page.evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+1 && getComputedStyle(e).overflowX==='visible'}).filter(e=>{for(let p=e.parentElement;p && p!==document.body;p=p.parentElement){if(getComputedStyle(p).overflowX!=='visible')return false}return true}).slice(0,20).map(e=>({tag:e.tagName,id:e.id,cls:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width}))})")))
  for selector in ['#nowcastCard','#nowcastMap','#nowcastRetry']:
   box=page.locator(selector).bounding_box();assert box and box['x']>=-1 and box['x']+box['width']<=width+1,(selector,box)
  assert page.locator('#nowcastRetry').bounding_box()['height']>=44
  page.screenshot(path=str(output/(str(width)+'-nowcast.png')))
 page.set_viewport_size({'width':390,'height':844})
 mode['pending']=True;page.locator('#nowcastRetry').click();page.wait_for_function("document.getElementById('nowcastRetry').disabled")
 assert page.locator('#nowcastObserved').is_visible();assert page.locator('#nowcastArrival').is_visible()
 for r in blocked:r.abort()
 blocked.clear();mode['pending']=False;page.wait_for_function("!document.getElementById('nowcastRetry').disabled")
 assert 'Não foi possível atualizar' in page.locator('#nowcastStatus').inner_text()
 page.clock.set_fixed_time(fixed+datetime.timedelta(minutes=6));page.evaluate("dispatchEvent(new CustomEvent('pluvia:clock-updated'))")
 assert not page.locator('#nowcastInference').is_visible();assert 'expirou' in page.locator('#nowcastStatus').inner_text() or 'atualizar' in page.locator('#nowcastStatus').inner_text()
 page.clock.set_fixed_time(fixed);open_scenario('radar-down')
 assert 'Vento 8 km/h, vindo de L' in page.locator('#nowcastObserved').inner_text()
 assert 'rajadas não informadas' in page.locator('#nowcastObserved').inner_text()
 page.locator('#nowcastMap').click();page.wait_for_function("document.getElementById('weatherLayerName').textContent==='Estação' && document.getElementById('weatherFrameTime').textContent!=='Carregando…'",timeout=20000)
 assert 'NOAA Aviation Weather Center' in page.locator('#weatherSourceNote').inner_text()
 assert page.locator('#weatherPlay').is_disabled();assert page.locator('#weatherStationsLayer').get_attribute('aria-pressed')=='true'
 assert '22:55' in page.locator('#nowcastObserved').inner_text(),page.locator('#nowcastObserved').inner_text()
 before=len(requests);page.evaluate("chooseCity('3550308')")
 page.locator('#nowcastCard').wait_for(state='hidden');page.wait_for_timeout(100)
 assert len(requests)==before,'outside pilot requested observation sources'
 assert not page.locator('#weatherStationsLayer').is_visible()
 page.evaluate("chooseCity('1302603')");page.locator('#nowcastCard').wait_for(state='visible')
 assert not errors,errors
 browser.close()
 print(json.dumps({'browser':os.environ.get('PLUVIA_BROWSER','chromium'),'scenarios':list(fixtures['rows']),'viewports':7,'station_map':True,'municipal_time':True,'expired_eta_suppressed':True,'external_sensor_requests':0,'screenshots':str(output)},ensure_ascii=False))

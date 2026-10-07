"""Real local fonts, failed-font fallback and cached loading during an outage.
Weather is a fixture. Auth, Push and other external requests are blocked.
"""
import datetime,json,os,re,shutil,subprocess,tempfile,threading
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

repo=Path(__file__).resolve().parent.parent
preview=os.environ.get('PLUVIA_PREVIEW_URL','http://127.0.0.1:4173')
output=Path(os.environ.get('PLUVIA_QA_OUTPUT',str(Path(tempfile.gettempdir())/'pluvia-qa')))/'typography'
output.mkdir(parents=True,exist_ok=True)
base=json.loads(subprocess.check_output(['node','-e',"process.stdout.write(JSON.stringify(require('./tests/support/forecast.cjs').forecast('2026-10-04',3)))"],cwd=repo,text=True))
errors=[];forbidden=[];outage_resource_errors=[];outage_failures=[]
fonts=['inter-latin-v20.woff2','nunito-wordmark-v32.woff2']
cache_name=re.search(r'const CACHE = "([^"]+)"', (repo/'dist/sw.js').read_text()).group(1)
viewports=[(320,568),(390,844),(430,932),(844,390),(768,1024),(1366,768),(2560,1080)]

with sync_playwright() as p:
 browser=p.webkit.launch() if os.environ.get('PLUVIA_BROWSER')=='webkit' else p.chromium.launch(args=['--no-sandbox'],**({'executable_path':shutil.which('chromium')} if shutil.which('chromium') else {}))
 def session(fallback=False,workers='block',address=preview):
  context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,timezone_id='Asia/Tokyo',reduced_motion='reduce',color_scheme='dark',service_workers=workers)
  state={'offline':False}
  def route(r):
   url=r.request.url;host=urlparse(url).hostname
   if 'fonts.googleapis.com' in url or 'fonts.gstatic.com' in url:forbidden.append(host);r.abort();return
   if any(path in url for path in ['/functions/v1/push-','/functions/v1/nowcast','/functions/v1/smart-summary']):forbidden.append(urlparse(url).path);r.abort();return
   if host in ['127.0.0.1','localhost']:
    if fallback and urlparse(url).path.endswith('.woff2'):r.abort();return
    r.continue_();return
   if state['offline']:r.abort();return
   if 'api.open-meteo.com/v1/forecast' in url:r.fulfill(json=base);return
   if 'air-quality-api' in url:r.fulfill(json={'current':{'time':'2026-10-04T03:00','us_aqi':35}});return
   if 'inmet.gov.br' in url:r.fulfill(json={'hoje':[],'futuro':[]});return
   if 'met-forecast' in url:r.fulfill(json={'source':'MET Norway','hourly':[]});return
   if '/auth/v1/settings' in url:r.fulfill(json={'external':{'email':True,'google':False,'apple':False}});return
   r.abort()
  context.route('**/*',route)
  context.add_init_script("sessionStorage.setItem('pluvia-intro-seen','1');localStorage.setItem('pluvia-city',JSON.stringify('1302603'));Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,fail){fail({code:1});}}});")
  def page_error(error):
   # WebKit also emits stackless resource-load failures as pageerror. During
   # the deliberate outage, retain these separately; JS exceptions still fail.
   if state['offline'] and not error.stack and str(error) in ['Response served by service worker is an error','Cannot load .']:
    outage_resource_errors.append(str(error))
   else:errors.append(str(error))
  page=context.new_page();page.on('pageerror',page_error)
  page.on('requestfailed',lambda request:outage_failures.append(urlparse(request.url).path) if state['offline'] else None)
  page.clock.set_fixed_time(datetime.datetime(2026,10,4,7,15,tzinfo=datetime.timezone.utc))
  page.goto(address,wait_until='domcontentloaded')
  page.wait_for_function("document.getElementById('temperature').textContent==='30' && document.getElementById('pluviaIntro').hidden && !document.documentElement.classList.contains('awaiting-styles') && !document.getElementById('weatherView').classList.contains('initial-loading')")
  page.evaluate('document.fonts.ready')
  return context,page,state
 def loaded(page):return page.evaluate("[...document.fonts].some(font=>font.family==='Inter' && font.status==='loaded') && [...document.fonts].some(font=>font.family==='Nunito' && font.status==='loaded')")
 def geometry(page,width):
  result=page.evaluate("()=>{const number=document.querySelector('#temperature').getBoundingClientRect(),section=document.querySelector('.weather-main').getBoundingClientRect(),degree=document.querySelector('.temperature .deg').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,readingCenter:(number.x+degree.right)/2,sectionCenter:section.x+section.width/2,degreeRight:degree.right,numberLeft:number.x}}")
  assert not result['overflow'] and result['numberLeft']>=0 and result['degreeRight']<=width,result
  assert abs(result['readingCenter']-result['sectionCenter'])<=1,result
 def resize(page,width,height):
  page.set_viewport_size({'width':width,'height':height})
  page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
 context,page,state=session()
 assert loaded(page)
 assert page.evaluate("getComputedStyle(document.getElementById('temperature')).fontWeight==='300'")
 assert page.evaluate("getComputedStyle(document.getElementById('cityName')).fontWeight==='600'")
 # Measure the font's real digit advances, rather than only checking a CSS rule.
 widths=page.evaluate("()=>{const row=document.createElement('div');row.style.cssText='position:absolute;font:400 20px Inter;font-variant-numeric:tabular-nums;';for(const digit of '0123456789'){const span=document.createElement('span');span.textContent=digit;row.append(span)}document.body.append(row);const widths=[...row.children].map(el=>el.getBoundingClientRect().width);row.remove();return widths}")
 assert max(widths)-min(widths)<.1,widths
 for phase,hour in [('night',7),('day',14)]:
  page.clock.set_fixed_time(datetime.datetime(2026,10,4,hour,15,tzinfo=datetime.timezone.utc));page.evaluate('PLUVIA.sky.update(Date.now(),false)')
  assert page.evaluate('document.documentElement.dataset.phase')==phase
  assert page.evaluate('document.body.dataset.phase')==phase
  for width,height in viewports:
   resize(page,width,height);geometry(page,width)
   if width==390:page.screenshot(path=str(output/(phase+'-inter.png')))
 context.close()
 context,page,state=session(fallback=True)
 assert not loaded(page)
 for width,height in viewports:resize(page,width,height);geometry(page,width)
 context.close()
 # Disconnect an isolated origin so HTTP really fails, without stopping the
 # shared preview. WebKit's Playwright offline flag can bypass its SW entirely.
 class QuietHandler(SimpleHTTPRequestHandler):
  def log_message(self,*args):pass
 server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(repo/'dist')))
 threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  context,page,state=session(workers='allow',address='http://127.0.0.1:'+str(server.server_port))
  page.wait_for_function('navigator.serviceWorker.controller',timeout=30000)
  page.wait_for_function("async ({name,fonts})=>{const cache=await caches.open(name);return (await Promise.all(fonts.map(font=>cache.match(new URL('./assets/fonts/'+font,location.href))))).every(response=>response?.ok)}",arg={'name':cache_name,'fonts':fonts},timeout=30000)
  state['offline']=True;server.shutdown();server.server_close()
  page.reload(wait_until='domcontentloaded')
  try:page.wait_for_function("document.getElementById('temperature').textContent==='30' && document.getElementById('dataStatus').dataset.freshness==='stale' && !document.documentElement.classList.contains('awaiting-styles')")
  except Exception:
   # Diagnóstico do reload offline: mostra em que estado a página parou antes de falhar.
   print(json.dumps(page.evaluate("()=>({temperature:document.getElementById('temperature')?.textContent,freshness:document.getElementById('dataStatus')?.dataset.freshness,status:document.getElementById('statusText')?.textContent,classes:document.documentElement.className,controller:Boolean(navigator.serviceWorker?.controller),sheets:[...document.styleSheets].map(s=>(s.href||'inline').split('/').pop()+':'+s.media.mediaText),saved:Object.keys(localStorage).filter(k=>k.startsWith('pluvia-weather')),loaded:performance.getEntriesByType('resource').filter(e=>/[.](js|css)/.test(e.name)&&!e.transferSize&&!e.decodedBodySize).map(e=>e.name.split('/').pop())})"),ensure_ascii=False))
   raise
  page.evaluate('document.fonts.ready');assert loaded(page);geometry(page,390)
  assert page.locator('#dataStatus').is_visible()
  page.screenshot(path=str(output/'offline-inter.png'))
  context.close()
 finally:server.shutdown();server.server_close()
 browser.close()
assert not errors,errors
assert not forbidden,forbidden
assert not outage_resource_errors or any(path.startswith('/vendor/supabase-') and path.endswith('.js') for path in outage_failures),outage_resource_errors
print(json.dumps({'result':'PASS','browser':os.environ.get('PLUVIA_BROWSER','chromium'),'realLocalFonts':True,'equalDigitWidths':True,'dayAndNightViewports':14,'fallbackViewports':7,'cachedFontsAndSavedForecastDuringOriginOutage':True,'noLiveAuthOrPush':True,'expectedOutageResourceErrors':sorted(set(outage_resource_errors)),'errors':errors}))

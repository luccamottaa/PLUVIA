import json,datetime,zoneinfo,os,subprocess,tempfile,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
# WebKit relata como pageerror (sem stack) a consulta do RainViewer cancelada por navegação/recarga;
# o radar compacto da Home inicia cedo no desktop. Só esta mensagem de rede é ignorada; exceções JS falham.
RAINVIEWER_CANCELLED='/api.rainviewer.com/public/weather-maps.json due to access control checks.'
# Optional QA tool: requires Python Playwright and an installed browser.
# Weather fixtures are confined to this process; external Auth/push is blocked.
repo=Path(__file__).resolve().parent.parent
with tempfile.TemporaryFile(mode='w+') as fixture:
 subprocess.run(['node','-e',"process.stdout.write(JSON.stringify(require('./tests/support/forecast.cjs').forecast()))"],cwd=repo,stdout=fixture,check=True)
 fixture.seek(0);base=json.load(fixture)
preview=os.environ.get('PLUVIA_PREVIEW_URL','http://127.0.0.1:4173')
output=Path(os.environ.get('PLUVIA_QA_OUTPUT',str(Path(tempfile.gettempdir())/'pluvia-qa')))
output.mkdir(parents=True,exist_ok=True)
fixed={'local':None}
def payload(tz):
 local=fixed['local'].astimezone(zoneinfo.ZoneInfo(tz)) if fixed['local'] else datetime.datetime.now(zoneinfo.ZoneInfo(tz))
 data=json.loads(json.dumps(base));day=local.date();hour=local.hour
 data['timezone']=tz;data['current']['time']=local.strftime('%Y-%m-%dT%H:%M');data['utc_offset_seconds']=int(local.utcoffset().total_seconds())
 for i in range(72): data['hourly']['time'][i]=(local.replace(minute=0,second=0,microsecond=0)+datetime.timedelta(hours=i-1)).strftime('%Y-%m-%dT%H:%M')
 for i in range(8):
  value=(day+datetime.timedelta(days=i)).isoformat();data['daily']['time'][i]=value;data['daily']['sunrise'][i]=value+'T06:00';data['daily']['sunset'][i]=value+'T18:00'
 return data
with sync_playwright() as p:
 browser=p.webkit.launch(headless=True) if os.environ.get('PLUVIA_BROWSER')=='webkit' else p.chromium.launch(headless=True,args=['--no-sandbox'],**({'executable_path':shutil.which('chromium')} if shutil.which('chromium') else {}))
 context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,timezone_id='Asia/Tokyo',service_workers='block')
 page=context.new_page();errors=[];disabled_requests=[];mode={'offline':False}
 page.on('pageerror',lambda err: None if str(err).endswith(RAINVIEWER_CANCELLED) else errors.append(str(err)))
 def route(r):
  from urllib.parse import urlparse,parse_qs
  url=r.request.url
  if any(path in url for path in ['/functions/v1/smart-summary','/functions/v1/nowcast','/api/nowcast']):disabled_requests.append(urlparse(url).path);r.abort();return
  if 'api.open-meteo.com/v1/forecast' in url:
   if mode['offline']:r.abort();return
   r.fulfill(json=payload(parse_qs(urlparse(url).query).get('timezone',['America/Manaus'])[0]));return
  if 'air-quality-api' in url:r.fulfill(json={'current':{'time':payload('America/Manaus')['current']['time'],'us_aqi':35,'pm2_5':8,'pm10':15,'ozone':44,'nitrogen_dioxide':10,'carbon_monoxide':180}});return
  if 'functions/v1/met-forecast' in url:r.fulfill(json={'source':'MET Norway','hourly':[]});return
  if 'inmet.gov.br' in url:r.fulfill(json={'hoje':[],'amanha':[]});return
  if 'rainviewer.com' in url:r.fulfill(headers={'Access-Control-Allow-Origin':'*'},json={'host':'https://radar.test','radar':{'past':[]}});return
  if 'localhost' in url or '127.0.0.1' in url:r.continue_();return
  r.abort()
 context.route('**/*',route)
 context.add_init_script("Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(success,error){error({code:1});}}});sessionStorage.setItem('pluvia-intro-seen','1');")
 page.goto(preview,wait_until='domcontentloaded')
 page.wait_for_function("document.getElementById('temperature').textContent==='30'",timeout=20000)
 page.wait_for_function("document.getElementById('pluviaIntro').hidden")
 page.wait_for_function("!document.getElementById('airDetails').hidden && !document.getElementById('shareWeather').disabled")
 assert page.locator('#localClock,#localDate,#cityTimezone,#weatherView .clock-wrap').count()==0
 def verify_brand():
  brand=page.locator('.topbar .brand')
  style=brand.evaluate("el=>({text:getComputedStyle(el.lastElementChild).color,mark:getComputedStyle(el.firstElementChild).backgroundColor,gap:parseFloat(getComputedStyle(el).columnGap)})")
  assert style['text']==style['mark']=='rgb(47, 107, 255)' and style['gap']==2,style
  mark=brand.locator('.brand-mark').bounding_box();name=brand.locator('span').last.bounding_box()
  assert mark and name and 0<=name['x']-mark['x']-mark['width']<=2.1,(mark,name)
  # Equal side tracks keep the brand centered for guests and long greetings.
  account=page.locator('#accountButton');original=account.inner_text()
  try:
   for label in [original,'Olá, Lucca','Olá, '+('Alexandre'*5)[:40]]:
    account.evaluate('(el,text)=>el.textContent=text',label)
    geometry=page.evaluate("['#top','.topbar .brand','#accountButton','.topbar .top-actions'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,right:r.right,width:r.width,height:r.height,centerX:r.x+r.width/2,centerY:r.y+r.height/2}})")
    top,logo,greeting,actions=geometry
    assert abs(logo['centerX']-top['centerX'])<=1,(label,geometry)
    assert abs(greeting['x']-top['x'])<=1,(label,geometry)
    assert greeting['right']<=logo['x'] and logo['right']<=actions['x'],(label,geometry)
    assert actions['right']<=top['right']+1,(label,geometry)
    assert greeting['width']>=44 and greeting['height']>=44,(label,geometry)
    assert max(el['centerY'] for el in [logo,greeting,actions])-min(el['centerY'] for el in [logo,greeting,actions])<=1,(label,geometry)
  finally:account.evaluate('(el,text)=>el.textContent=text',original)
 verify_brand()
 # Browser page double taps do not zoom; pinch remains permitted in this mode.
 page.locator('#temperature').wait_for(state='visible')
 assert page.evaluate("getComputedStyle(document.body).touchAction==='manipulation'")
 viewport_policy=page.locator('meta[name="viewport"]').get_attribute('content')
 assert 'user-scalable=no' not in viewport_policy and 'maximum-scale' not in viewport_policy
 scale=page.evaluate('visualViewport.scale')
 point=page.locator('#temperature').bounding_box()
 for _ in range(2):page.touchscreen.tap(point['x']+point['width']/2,point['y']+point['height']/2)
 assert abs(page.evaluate('visualViewport.scale')-scale)<.01
 page.locator('#openPrivacy').click()
 assert page.locator('#sourcesDialog').evaluate('(el)=>el.open')
 assert not page.locator('#analyticsConsent').is_checked()
 assert page.locator('#analyticsConsent').evaluate('(el)=>document.activeElement===el')
 page.locator('#analyticsConsent').check()
 assert 'ativada' in page.locator('#analyticsChoiceStatus').inner_text()
 page.locator('#analyticsConsent').uncheck()
 assert 'Desativado' in page.locator('#analyticsChoiceStatus').inner_text()
 page.keyboard.press('Escape')
 assert page.locator('#shareWeather').is_visible()
 assert page.locator('#uvScale').is_visible()
 assert page.locator('#uvDayChart').count()==0
 for selector in ['#attentionCard','#heroRainOpen','#outdoorPlan']:
  assert page.locator(selector).count()==0
 assert page.locator('#nowcastCard').is_hidden()
 assert 'pico' not in page.locator('#uvNote').inner_text().lower()
 assert 'Moderado' in page.locator('#uvNote').inner_text()
 page.locator('#airDetails summary').click()
 assert '8,0 µg/m³' in page.locator('#airPollutants').inner_text()
 assert 'Estimativa de' in page.locator('#airDetailsTime').inner_text()
 page.evaluate("Object.defineProperty(navigator,'share',{value:undefined,configurable:true});Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true})")
 page.locator('#shareWeather').click()
 assert page.locator('#shareWeatherDialog').evaluate('(el)=>el.open')
 assert 'Manaus/AM' in page.locator('#shareWeatherText').input_value()
 assert 'Open-Meteo' in page.locator('#shareWeatherText').input_value()
 page.locator('#shareWeatherClose').click()
 page.screenshot(path=str(output/('pluvia-'+os.environ.get('PLUVIA_BROWSER','chromium')+'.png')),full_page=True)
 print(json.dumps({'title':page.title(),'temperature':page.locator('#temperature').inner_text(),'city':page.locator('#cityName').inner_text(),'content':len(page.locator('body').inner_text()),'horizontalOverflow':page.evaluate('document.documentElement.scrollWidth > innerWidth'),'errors':errors}))
 checks=[]
 for width,height in [(320,568),(390,844),(430,932),(844,390),(768,1024),(1366,768),(2560,1440)]:
  page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(150)
  verify_brand()
  overflow=page.evaluate('document.documentElement.scrollWidth > innerWidth');assert not overflow,(width,height)
  page.locator('#top').scroll_into_view_if_needed()
  assert page.locator('#top #shareWeather svg').is_visible()
  assert page.locator('#shareWeather').inner_text()==''
  share_rect=page.locator('#shareWeather').bounding_box()
  assert share_rect['width']>=44 and share_rect['height']>=44,share_rect
  for control in ['.brand','#accountButton','#openCitySearch']:
   other=page.locator(control).bounding_box()
   assert share_rect['x']+share_rect['width']<=other['x']+1 or other['x']+other['width']<=share_rect['x']+1 or share_rect['y']+share_rect['height']<=other['y']+1 or other['y']+other['height']<=share_rect['y']+1,(width,control)

  if width==390: page.locator('#top').screenshot(path=str(output/(os.environ.get('PLUVIA_BROWSER','chromium')+'-header-share.png')))
  # O gráfico de 24 horas saiu da Home: a fileira de Próximas horas leva as 24 horas.
  assert page.locator('#hourlyChartDetails').count()==0 and page.locator('#rainChart').count()==0
  assert page.locator('#hourlyPeek .hourly-peek-item').count()>=6
  assert 'Sensação 34°' in page.locator('#hourlyPeek .hourly-peek-item').first.text_content()
  assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'),(width,'hourly')
  if width==390:
   page.locator('#chuva').screenshot(path=str(output/(os.environ.get('PLUVIA_BROWSER','chromium')+'-hourly.png')))
  page.locator('#openCitySearch').click()
  assert page.locator('#cityDialog').evaluate('(el)=>el.open')
  page.locator('#citySearch').fill('Curitiba');page.wait_for_timeout(200)
  rect=page.locator('#cityDialog').bounding_box();assert rect and rect['width']<=width+1 and rect['height']<=height+1,rect
  if width==390:
   page.evaluate("favorites.add('1302603');favorites.add('4106902');dispatchEvent(new CustomEvent('pluvia:favorites-changed'))")
   page.wait_for_function("document.querySelectorAll('.favorite-city-card').length===2 && [...document.querySelectorAll('.favorite-city-card')].every(el=>el.innerText.includes('Sensação 34'))")
   cards=page.locator('.favorite-city-card').all_inner_texts()
   assert all('Máx. 34°' in text and 'Mín. 24°' in text and 'horário local' in text for text in cards),cards
  page.locator('#closeCitySearch').click();checks.append({'width':width,'height':height,'overflow':overflow})
 page.set_viewport_size({'width':390,'height':844})
 page.evaluate("chooseCity('4106902')")
 page.wait_for_function("document.getElementById('cityName').textContent.includes('Curitiba') && !document.getElementById('weatherView').classList.contains('initial-loading')")
 page.locator('.hourly-peek-item').first.click();assert page.locator('#hourlyDetailDialog').evaluate('(el)=>el.open')
 assert page.locator('#hourlyDetailUv').inner_text()=='4,0'
 assert page.locator('#hourlyDetailDirection').inner_text()=='Vindo de L'
 assert page.locator('#hourlyDetailPressure').inner_text()=='1.010 hPa'
 page.keyboard.press('Escape')
 page.emulate_media(reduced_motion='reduce');assert page.evaluate("matchMedia('(prefers-reduced-motion:reduce)').matches")
 assert not errors,errors
 visual=[]
 for name,hour,minute,code in [('clear-day',12,0,0),('clear-night',22,0,0),('rain',14,0,65),('storm',15,0,95),('cloudy',10,0,3),('sunrise',6,0,1),('sunset',18,0,2)]:
  fixed['local']=datetime.datetime.now(zoneinfo.ZoneInfo('America/Sao_Paulo')).replace(hour=hour,minute=minute,second=0,microsecond=0)
  page.clock.set_fixed_time(fixed['local'])
  page.evaluate('refreshAll()')
  page.evaluate('code=>{const data=structuredClone(displayedWeather.forecast);data.current.weather_code=code;render(data,displayedWeather.air,false,0,{weatherAt:Date.now(),airAt:Date.now(),freshAir:true});}',code)
  assert page.evaluate("document.body.dataset.weather!=='unknown'")
  verify_brand()
  assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
  assert not errors,errors
  page.screenshot(path=str(output/(os.environ.get('PLUVIA_BROWSER','chromium')+'-'+name+'.png')),full_page=True)
  visual.append(name)
 fixed['local']=None
 page.clock.set_fixed_time(datetime.datetime.now(datetime.timezone.utc))
 page.evaluate('refreshAll()')
 print(json.dumps({'visualStates':visual,'errors':errors}))
 mode['offline']=True
 page.evaluate('refreshAll()')
 assert page.locator('#dataStatus').get_attribute('data-freshness')=='stale'
 assert page.locator('#dataStatus').is_visible()
 page.locator('#shareWeather').click()
 assert 'Leitura salva' in page.locator('#shareWeatherText').input_value()
 page.locator('#shareWeatherClose').click()
 page.evaluate("chooseCity('2611606')")
 page.wait_for_function("document.getElementById('condition').textContent==='Tempo indisponível'")
 assert page.locator('#temperature').inner_text()=='--'
 assert page.locator('#shareWeather').is_disabled()
 assert page.locator('#airDetails').is_hidden()
 assert page.locator('#uvDayChart').count()==0
 assert page.locator('#cityName').inner_text()=='Recife'
 assert not errors,errors
 print(json.dumps({'responsive':checks,'doubleTapPageZoom':False,'pinchAllowedByPolicy':True,'cityChange':'Curitiba/Recife','hourlyDialog':True,'savedDataStatusVisible':True,'newCityOfflineDoesNotShowOldTemperature':True,'errors':errors}))
 # Installed modes are emulated only here; this is not a physical iOS gesture.
 installed=[]
 for signal in ['display-mode','apple-standalone']:
  app_context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block')
  app_context.route('**/*',route)
  app_context.add_init_script("Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(success,error){error({code:1});}}});sessionStorage.setItem('pluvia-intro-seen','1');")
  if signal=='apple-standalone':app_context.add_init_script("Object.defineProperty(navigator,'standalone',{value:true});")
  else:app_context.add_init_script("const nativeMatchMedia=window.matchMedia.bind(window);window.matchMedia=q=>{if(q!=='(display-mode: standalone)')return nativeMatchMedia(q);const mode=new EventTarget();mode.matches=true;return mode;};")
  app_page=app_context.new_page();app_page.on('pageerror',lambda err: None if str(err).endswith(RAINVIEWER_CANCELLED) else errors.append(str(err)))
  mode['offline']=False
  app_page.goto(preview,wait_until='domcontentloaded')
  app_page.wait_for_function("document.getElementById('temperature').textContent==='30' && document.getElementById('pluviaIntro').hidden && !document.documentElement.classList.contains('awaiting-styles')")
  assert app_page.evaluate("document.documentElement.hasAttribute('data-pwa-no-zoom') && [document.documentElement,document.body].every(el=>getComputedStyle(el).touchAction==='pan-x pan-y')")
  gestures=app_page.evaluate("""()=>{
    const send=(el,name)=>{const e=new Event(name,{bubbles:true,cancelable:true});el.dispatchEvent(e);return e.defaultPrevented;};
    return ['gesturestart','gesturechange'].map(name=>({page:send(document.body,name),map:send(document.getElementById('weatherMap'),name)}));
  }""")
  assert all(g['page'] and not g['map'] for g in gestures),gestures
  app_page.locator('#openCitySearch').click()
  assert app_page.locator('#cityDialog').evaluate('(el)=>el.open')
  assert float(app_page.locator('#citySearch').evaluate('el=>parseFloat(getComputedStyle(el).fontSize)'))>=16
  assert app_page.evaluate('visualViewport.scale')==1
  assert not app_page.evaluate('document.documentElement.scrollWidth > innerWidth')
  installed.append({'signal':signal,'pagePinchBlockedByPolicy':True,'mapGesturesPreserved':True,'searchUsable':True})
  app_context.close()
 assert not errors,errors
 assert not disabled_requests,disabled_requests
 print(json.dumps({'brandBlueAndCompact':True,'headerDateRemoved':True,'removedPanelsAbsent':True,'pausedProvidersNotQueried':True,'installedApp':installed,'errors':errors}))
 browser.close()

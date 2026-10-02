import json,datetime,zoneinfo,os,subprocess,tempfile,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
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
 page=context.new_page();errors=[];mode={'offline':False}
 page.on('pageerror',lambda err: errors.append(str(err)))
 def route(r):
  from urllib.parse import urlparse,parse_qs
  url=r.request.url
  if 'api.open-meteo.com/v1/forecast' in url:
   if mode['offline']:r.abort();return
   r.fulfill(json=payload(parse_qs(urlparse(url).query).get('timezone',['America/Manaus'])[0]));return
  if 'air-quality-api' in url:r.fulfill(json={'current':{'time':payload('America/Manaus')['current']['time'],'us_aqi':35,'pm2_5':8,'pm10':15,'ozone':44,'nitrogen_dioxide':10,'carbon_monoxide':180}});return
  if 'functions/v1/met-forecast' in url:r.fulfill(json={'source':'MET Norway','hourly':[]});return
  if 'inmet.gov.br' in url:r.fulfill(json={'hoje':[],'amanha':[]});return
  if 'rainviewer.com' in url:r.fulfill(json={'host':'https://radar.test','radar':{'past':[]}});return
  if 'localhost' in url or '127.0.0.1' in url or 'unpkg.com/leaflet' in url:r.continue_();return
  r.abort()
 context.route('**/*',route)
 context.add_init_script("Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(success,error){error({code:1});}}});sessionStorage.setItem('pluvia-intro-seen','1');")
 page.goto(preview,wait_until='domcontentloaded')
 page.wait_for_function("document.getElementById('temperature').textContent==='30'",timeout=20000)
 page.wait_for_function("document.getElementById('pluviaIntro').hidden")
 page.wait_for_function("!document.getElementById('airDetails').hidden && !document.getElementById('shareWeather').disabled")
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
 assert page.locator('#uvDayChart svg').is_visible()
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
  overflow=page.evaluate('document.documentElement.scrollWidth > innerWidth');assert not overflow,(width,height)
  for chart_mode in ['conditions','feels','rain','wind']:
   page.locator('button[data-hourly-mode="'+chart_mode+'"]').click()
   assert page.locator('#rainChart').get_attribute('data-hourly-mode')==chart_mode
   assert page.locator('button[data-hourly-mode="'+chart_mode+'"]').get_attribute('aria-pressed')=='true'
   assert page.locator('#hourlyChartLegend').is_visible()
   assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'),(width,chart_mode)
   if chart_mode=='feels':
    assert '34°' in page.locator('#rainChart').inner_text()
    assert 'Temp. 30°' in page.locator('#rainChart').inner_text()
   if width==390 and chart_mode in ['feels','rain']:
    page.locator('#chuva').screenshot(path=str(output/(os.environ.get('PLUVIA_BROWSER','chromium')+'-hourly-'+chart_mode+'.png')))
   if chart_mode=='rain':
    assert '10% de chance' in page.locator('#rainChart').inner_text()
    assert page.locator('#rainChart .rain-bar').count()==0
  page.locator('button[data-hourly-mode="conditions"]').click()
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
 assert page.locator('#uvDayChart').is_hidden()
 assert page.locator('#cityName').inner_text()=='Recife'
 assert not errors,errors
 print(json.dumps({'responsive':checks,'cityChange':'Curitiba/Recife','hourlyDialog':True,'savedDataStatusVisible':True,'newCityOfflineDoesNotShowOldTemperature':True,'errors':errors}))
 browser.close()

"""Geometry regressions for aligned readings, wrapped text and dialog controls.
Weather is a deterministic fixture; external Auth, Push and sensors are blocked.
No production observations, accounts or styles are changed by this QA script.
"""
import datetime,json,os,shutil,subprocess,tempfile
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright

repo=Path(__file__).resolve().parent.parent
preview=os.environ.get('PLUVIA_PREVIEW_URL','http://127.0.0.1:4173')
output=Path(os.environ.get('PLUVIA_QA_OUTPUT',str(Path(tempfile.gettempdir())/'pluvia-qa')))/'alignment'
output.mkdir(parents=True,exist_ok=True)
base=json.loads(subprocess.check_output(['node','-e',"process.stdout.write(JSON.stringify(require('./tests/support/forecast.cjs').forecast('2026-10-04',3)))"],cwd=repo,text=True))
# Include long conditions, negative temperatures, one/two digit values and rain.
base['daily']['temperature_2m_min']=[24,-12,3,19,8,-4,22,24]
base['daily']['temperature_2m_max']=[34,-2,13,29,18,6,32,34]
base['daily']['weather_code']=[2,95,65,3,63,61,1,2]
base['daily']['precipitation_sum']=[0,30,12,0,6,2,0,0]
base['daily']['precipitation_probability_max']=[10,90,80,10,60,40,10,10]
errors=[];forbidden=[];reports=[]

def route(r):
 url=r.request.url
 if any(path in url for path in ['/functions/v1/smart-summary','/functions/v1/nowcast','/api/nowcast','/functions/v1/push-']):
  forbidden.append(urlparse(url).path);r.abort();return
 if 'api.open-meteo.com/v1/forecast' in url:
  data=json.loads(json.dumps(base))
  if parse_qs(urlparse(url).query).get('timezone')==['America/Sao_Paulo']:data['current']['weather_code']=1
  r.fulfill(json=data);return
 if 'air-quality-api' in url:r.fulfill(json={'current':{'time':'2026-10-04T03:00','us_aqi':35}});return
 if 'inmet.gov.br' in url:r.fulfill(json={'hoje':[],'amanha':[]});return
 if 'met-forecast' in url:r.fulfill(json={'source':'MET Norway','hourly':[]});return
 if 'rainviewer.com' in url:r.fulfill(json={'host':'https://radar.test','radar':{'past':[]}});return
 if '/auth/v1/settings' in url:r.fulfill(json={'external':{'email':True,'google':False,'apple':False}});return
 if urlparse(url).hostname in ['localhost','127.0.0.1']:r.continue_();return
 r.abort()

with sync_playwright() as p:
 browser=p.webkit.launch(headless=True) if os.environ.get('PLUVIA_BROWSER')=='webkit' else p.chromium.launch(headless=True,args=['--no-sandbox'],**({'executable_path':shutil.which('chromium')} if shutil.which('chromium') else {}))
 context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,timezone_id='Asia/Tokyo',service_workers='block',reduced_motion='reduce')
 context.route('**/*',route)
 context.add_init_script("sessionStorage.setItem('pluvia-intro-seen','1');localStorage.setItem('pluvia-city',JSON.stringify('1302603'));Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,fail){fail({code:1});}}});")
 page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.clock.set_fixed_time(datetime.datetime(2026,10,4,7,15,tzinfo=datetime.timezone.utc))
 page.goto(preview,wait_until='domcontentloaded')
 page.wait_for_function("document.getElementById('temperature').textContent==='30' && document.getElementById('pluviaIntro').hidden && !document.documentElement.classList.contains('awaiting-styles')")
 page.wait_for_function("document.getElementById('inmetContent').textContent.includes('Sem alertas')")
 page.evaluate('document.fonts.ready')
 # A real long municipality name with cloned fixture coordinates, only in QA.
 page.evaluate("cityById.set('3305158',{...cityById.get('1302603'),id:'3305158',name:'São José do Vale do Rio Preto',uf:'RJ'});favorites.add('1302603');favorites.add('3305158');dispatchEvent(new CustomEvent('pluvia:favorites-changed'))")

 def boxes(selector):
  return page.locator(selector).evaluate_all("els=>els.filter(el=>el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent.trim().slice(0,70),x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,centerX:r.x+r.width/2,centerY:r.y+r.height/2}})")
 def aligned(selector,key='y',count=None):
  values=boxes(selector)
  assert values and (count is None or len(values)==count),(selector,values)
  assert max(b[key] for b in values)-min(b[key] for b in values)<=1,(selector,key,values)
  return values
 def header(selector):
  aligned(selector+' > *','centerY',2)
 def close():
  page.keyboard.press('Escape');page.evaluate('document.activeElement.blur()')
 def form_edges(selector):
  aligned(selector+' input:visible,'+selector+' button:visible','x')
  aligned(selector+' input:visible,'+selector+' button:visible','right')
 def screenshot(name,selector):
  page.locator(selector).screenshot(path=str(output/(name+'.png')))
 def city_bounds(width):
  scroll=page.locator('#cityDialog .dialog-scroll')
  limits=scroll.evaluate("el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {left:r.x+el.clientLeft+parseFloat(s.paddingLeft),right:r.x+el.clientLeft+el.clientWidth-parseFloat(s.paddingRight),clientWidth:el.clientWidth,scrollWidth:el.scrollWidth}}")
  assert limits['scrollWidth']<=limits['clientWidth']+1,(width,limits)
  for item in boxes('#cityDialog .city-actions > button,#dialogFavorites,#dialogFavoriteList,#cityResults .city-result'):
   assert item['x']>=limits['left']-1 and item['right']<=limits['right']+1,(width,limits,item)
  # Favorites scroll within their own viewport; every card remains reachable.
  carousel=page.locator('#dialogFavoriteList')
  if width>=390:assert carousel.evaluate('el=>el.scrollWidth<=el.clientWidth+1'),(width,'Two favorites fit fully')
  last=carousel.locator('.favorite-city-card').last
  last.scroll_into_view_if_needed()
  card=last.bounding_box();viewport=carousel.bounding_box()
  assert card['x']>=viewport['x']-1 and card['x']+card['width']<=viewport['x']+viewport['width']+1,(width,card,viewport)
  # A partially visible row during scrolling is normal; the last row must be
  # fully accessible without escaping the dialog's scrolling area.
  result=page.locator('#cityResults .city-result').last
  result.evaluate("el=>el.scrollIntoView({block:'end',inline:'nearest',behavior:'instant'})")
  row=result.bounding_box();area=scroll.bounding_box()
  assert row['y']>=area['y']-1 and row['y']+row['height']<=area['y']+area['height']+1,(width,row,area)
  carousel.evaluate('el=>el.scrollLeft=0');scroll.evaluate('el=>el.scrollTop=0')
 def home(width,label):
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),(width,label)
  report={'width':width,'period':label}
  for field in ['.peek-time','.peek-rain','.peek-icon','.hourly-peek-item > strong','.peek-volume:nth-of-type(1)','.peek-volume:nth-of-type(2)']:
   report[field]=aligned(field,count=5)
  report['summaryLabels']=aligned('.quick-metrics > .quick-metric:first-child .metric-head > span:first-child,.hero-temperature-extreme small',count=3)
  report['summaryValues']=aligned('#feelsLike,#todayHigh,#todayLow',count=3)
  aligned('.topbar .brand,.topbar .top-actions','centerY',2)
  aligned('.topbar .top-actions > *','centerY')
  aligned('.weather-player > *','centerY',4)
  aligned('footer .footer-link','centerX',2)
  rows=page.locator('.forecast-row')
  assert rows.count()==7
  for row in rows.all():
   geometry=row.evaluate("el=>Object.fromEntries([...el.children].filter(c=>c.getClientRects().length).map(c=>{const r=c.getBoundingClientRect();return [c.className,{x:r.x,y:r.y,right:r.right,centerY:r.y+r.height/2}]}))")
   if width>720:
    centers=[b['centerY'] for b in geometry.values()]
    assert max(centers)-min(centers)<=1,geometry
   else:
    for a,b in [('forecast-day','temp-range'),('forecast-condition','forecast-rain')]:
     assert abs(geometry[a]['centerY']-geometry[b]['centerY'])<=1,geometry
   condition=row.locator('.forecast-condition').bounding_box();text=row.locator('.forecast-condition > span').bounding_box()
   assert text['x']+text['width']<=condition['x']+condition['width']+1,(width,text,condition)
   if width>720:assert condition['x']+condition['width']<=geometry['temp-range']['x']+1,geometry
  report['tracks']=aligned('.temp-track','x',7)
  aligned('.temp-track','width',7)
  aligned('.sun-times > div > strong',count=2)
  for heading in page.locator('#weatherView .section-heading').all():
   parts=heading.evaluate("el=>[...el.children].filter(c=>c.getClientRects().length).map(c=>{const r=c.getBoundingClientRect();return {y:r.y,bottom:r.bottom,centerY:r.y+r.height/2}})")
   if len(parts)==2:
    if width>720:assert abs(parts[0]['centerY']-parts[1]['centerY'])<=1,parts
    else:assert parts[1]['y']>=parts[0]['bottom']-1,parts
  for metric in page.locator('.metrics .metric:not(.air-metric)').all():
   pair=metric.locator(':scope > .metric-head,:scope > strong,:scope > .wind-reading').evaluate_all("els=>els.map(el=>{const r=el.getBoundingClientRect();return r.y+r.height/2})")
   assert len(pair)==2 and abs(pair[0]-pair[1])<=1,pair
  for mode in ['conditions','feels','rain','wind']:
   page.locator('button[data-hourly-mode="'+mode+'"]').click()
   for field in ['.hour-time','.hour-temp','.hour-icon' if mode!='wind' else '.wind-direction']:
    aligned('#rainChart '+field)
   aligned('#rainChart '+('.rain-mm' if mode=='rain' else '.hour-detail'))
   if width==390 and label=='sunrise':screenshot(str(width)+'-chart-'+mode,'#chuva')
  page.locator('button[data-hourly-mode="conditions"]').click()
  reports.append(report)

 for width,height in [(320,740),(390,844),(430,932),(768,1024),(844,390),(1366,768),(2560,1080)]:
  page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(100)
  home(width,'sunrise')
  assert 'Nascer do sol' in page.locator('#hourlyPeek').inner_text()
  if width in [320,390,768,1366]:
   for name,selector in [('header','#top'),('peek','.hourly-peek'),('quick','.quick-metrics'),('metrics','.metrics'),('forecast','.forecast-section'),('astronomy','.sun-section')]:screenshot(str(width)+'-'+name,selector)
  page.locator('#accountButton').click();page.locator('#accountDialog').wait_for(state='visible');header('#accountDialog .dialog-heading')
  for action in ['#accountLogin','#accountSignup','#accountLogin','#accountForgot']:
   page.locator(action).click();form_edges('#accountForm')
   aligned('#accountTabs > button','centerY',2)
  if width in [320,390,1366]:screenshot(str(width)+'-account','#accountDialog')
  close()
  page.locator('#openCitySearch').click();page.locator('#citySearch').fill('São')
  page.wait_for_function("cityIndexReady && document.getElementById('cityPickerStatus').textContent.includes('resultado') && document.querySelectorAll('#cityResults .city-result').length>1")
  page.wait_for_function("document.querySelectorAll('#dialogFavoriteList .favorite-reading').length===2 && [...document.querySelectorAll('#dialogFavoriteList .favorite-reading')].every(el=>el.textContent==='30°')")
  header('#cityDialog .dialog-heading');aligned('#cityDialog .city-actions > *','centerY',2)
  city_bounds(width)
  for field in ['> strong','.favorite-reading','.favorite-summary:not(.favorite-feels-like)','.favorite-feels-like','.favorite-range','.favorite-local-time','.favorite-updated']:
   aligned('.favorite-city-card '+field,count=2)
  if width in [320,390,1366]:
   screenshot(str(width)+'-search','#cityDialog');screenshot(str(width)+'-favorites','#dialogFavoriteList')
  close()
  page.locator('#hourlyPeek [data-hour-index]').first.click();header('#hourlyDetailDialog .dialog-heading')
  # Values in each pair must stay aligned when their labels wrap on small screens.
  readings=boxes('.hourly-detail-readings > div dd')
  for i in range(0,len(readings)-1,2):assert abs(readings[i]['y']-readings[i+1]['y'])<=1,(width,readings[i:i+2])
  # Exercise a longer label even when this machine's fallback font is narrow.
  page.locator('.hourly-detail-readings > div dt').nth(6).evaluate("el=>el.textContent='Direção de origem do vento'")
  readings=boxes('.hourly-detail-readings > div dd')
  for i in range(0,len(readings)-1,2):assert abs(readings[i]['y']-readings[i+1]['y'])<=1,(width,readings[i:i+2])
  aligned('.hourly-detail-navigation button','centerY',2)
  if width in [320,390,1366]:screenshot(str(width)+'-hour-detail','#hourlyDetailDialog')
  close()
  page.locator('#openSources').click();header('#sourcesDialog .dialog-heading')
  if width in [320,390,1366]:screenshot(str(width)+'-sources','#sourcesDialog')
  close()
  print(json.dumps({'alignedViewport':width,'height':height}),flush=True)

 # The same fields must align around sunset and without a solar event too.
 for hour,label in [(15,'sunset'),(10,'day')]:
  page.clock.set_fixed_time(datetime.datetime(2026,10,4,hour+4,15,tzinfo=datetime.timezone.utc))
  page.evaluate("render(displayedWeather.forecast,displayedWeather.air,false,Date.now())")
  for width,height in [(390,844),(1366,768)]:
   page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(100);home(width,label)
   assert ('Pôr do sol' in page.locator('#hourlyPeek').inner_text())==(label=='sunset')
   screenshot(str(width)+'-peek-'+label,'.hourly-peek')
 # A long selected name also changes reference notes and dialog subtitles.
 page.clock.set_fixed_time(datetime.datetime(2026,10,4,7,15,tzinfo=datetime.timezone.utc))
 page.evaluate("chooseCity('3305158')")
 page.wait_for_function("document.getElementById('cityName').textContent.includes('São José do Vale do Rio Preto') && !document.getElementById('weatherView').classList.contains('initial-loading')")
 for width,height in [(320,740),(768,1024),(1366,768)]:
  page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(100);home(width,'long-city')
  screenshot(str(width)+'-long-city','#agora')
 assert not errors,errors
 assert not forbidden,forbidden
 (output/'geometry.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2))
 print(json.dumps({'browser':os.environ.get('PLUVIA_BROWSER','chromium'),'viewports':7,'homeLayouts':len(reports),'solarEvents':True,'longFavorites':True,'mixedTemperatureWidths':True,'dialogs':True,'errors':errors,'output':str(output)}))
 browser.close()

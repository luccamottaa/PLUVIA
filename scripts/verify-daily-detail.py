"""Daily/hourly navigation with existing forecast fixtures; no live observations or Auth."""
import datetime,json,os,shutil,subprocess
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
# WebKit relata como pageerror (sem stack) a consulta do RainViewer cancelada por navegação/recarga;
# o radar compacto da Home inicia cedo no desktop. Só esta mensagem de rede é ignorada; exceções JS falham.
RAINVIEWER_CANCELLED='/api.rainviewer.com/public/weather-maps.json due to access control checks.'
repo=Path(__file__).resolve().parent.parent
preview=os.environ.get('PLUVIA_PREVIEW_URL','http://127.0.0.1:4173')
output=Path(os.environ.get('PLUVIA_QA_OUTPUT','/tmp/pluvia-qa'))/'daily-detail';output.mkdir(parents=True,exist_ok=True)
base=json.loads(subprocess.check_output(['node','-e',"process.stdout.write(JSON.stringify(require('./tests/support/forecast.cjs').forecast('2026-10-04',10)))"],cwd=repo,text=True))
base['daily']['precipitation_probability_max'][1]=80;base['daily']['precipitation_sum'][1]=12
errors=[];requests=[]
def route(r):
 url=r.request.url;requests.append(url)
 if 'api.open-meteo.com/v1/forecast' in url:r.fulfill(json=base);return
 if 'met-forecast' in url:r.fulfill(json={'source':'MET Norway','hourly':[]});return
 if 'air-quality-api' in url:r.fulfill(json={'current':{'time':'2026-10-04T10:00','us_aqi':35}});return
 if 'inmet.gov.br' in url:r.fulfill(json={'hoje':[]});return
 if 'rainviewer' in url:r.fulfill(headers={'Access-Control-Allow-Origin':'*'},json={'host':'https://radar.test','radar':{'past':[]}});return
 if '/auth/v1/settings' in url:r.fulfill(json={'external':{'email':True}});return
 if urlparse(url).hostname in ['localhost','127.0.0.1']:r.continue_();return
 r.abort()
with sync_playwright() as p:
 browser=p.webkit.launch() if os.environ.get('PLUVIA_BROWSER')=='webkit' else p.chromium.launch(args=['--no-sandbox'],**({'executable_path':shutil.which('chromium')} if shutil.which('chromium') else {}))
 context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,timezone_id='Asia/Tokyo',service_workers='block',reduced_motion='reduce')
 context.route('**/*',route)
 context.add_init_script("sessionStorage.setItem('pluvia-intro-seen','1');localStorage.setItem('pluvia-city',JSON.stringify('1302603'));Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(s,e){e({code:1})}}});")
 page=context.new_page();page.on('pageerror',lambda e: None if str(e).endswith(RAINVIEWER_CANCELLED) else errors.append(str(e)));page.clock.set_fixed_time(datetime.datetime(2026,10,4,14,15,tzinfo=datetime.timezone.utc))
 page.goto(preview,wait_until='domcontentloaded');page.wait_for_function("document.getElementById('temperature').textContent==='30' && document.getElementById('pluviaIntro').hidden")
 report=[]
 for width,height in [(320,740),(390,844),(430,932),(844,390),(768,1024),(1366,768),(2560,1080)]:
  page.set_viewport_size({'width':width,'height':height})
  rows=page.locator('#forecastList [data-day-index]');assert rows.count()==7
  forecast_requests=sum('api.open-meteo.com/v1/forecast' in url for url in requests)
  rows.nth(1).focus();page.keyboard.press('Enter');page.locator('#dailyDetailDialog').wait_for(state='visible')
  assert '5 de outubro' in page.locator('#dailyDetailTitle').inner_text()
  for selector,value in [('#dailyDetailMin','24°'),('#dailyDetailMax','34°'),('#dailyDetailFeelsMax','38°'),('#dailyDetailProbability','80%'),('#dailyDetailRain','12 mm'),('#dailyDetailSunrise','06:00'),('#dailyDetailSunset','18:00')]:
   assert page.locator(selector).inner_text()==value,(selector,page.locator(selector).inner_text())
  assert page.locator('#dailyDetailHours button').count()==24
  limits=page.locator('#dailyDetailDialog').evaluate("el=>{const r=el.getBoundingClientRect(),s=el.querySelector('.dialog-scroll');return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,width:r.width,height:r.height,scrollWidth:s.scrollWidth,clientWidth:s.clientWidth,animation:getComputedStyle(el).animationName}}")
  assert limits['x']>=0 and limits['right']<=width+1 and limits['y']>=0 and limits['bottom']<=height+1,(width,limits)
  assert limits['scrollWidth']<=limits['clientWidth']+1 and limits['animation']=='none',(width,limits)
  controls=page.locator('#dailyDetailDialog .dialog-close,#dailyDetailDialog .hourly-detail-navigation button').evaluate_all("els=>els.map(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height}))")
  assert all(c['w']>=44 and c['h']>=44 for c in controls),controls
  # The end of tomorrow is outside the Home's initial 24-hour horizon.
  hour=page.locator('#dailyDetailHours button').last;hour.click()
  assert '23:00' in page.locator('#hourlyDetailTitle').inner_text();assert page.locator('#hourlyDetailNext').is_disabled()
  assert 'dia seguinte' in page.locator('#hourlyDetailRainInterval').inner_text()
  page.keyboard.press('Escape');page.locator('#hourlyDetailDialog').wait_for(state='hidden')
  assert hour.evaluate('el=>document.activeElement===el')
  # Refresh preserves horizontal position, the real opener node and its focus.
  before=page.locator('#dailyDetailHours').evaluate('el=>el.scrollLeft')
  page.evaluate('render(displayedWeather.forecast,displayedWeather.air,false,Date.now())')
  assert page.locator('#dailyDetailHours button').last.evaluate('el=>document.activeElement===el')
  assert abs(page.locator('#dailyDetailHours').evaluate('el=>el.scrollLeft')-before)<=1
  page.screenshot(path=str(output/(str(width)+'-daily.png')))
  page.locator('#dailyDetailClose').click();page.locator('#dailyDetailDialog').wait_for(state='hidden')
  assert page.locator('#forecastList [data-day-index="1"]').evaluate('el=>document.activeElement===el')
  assert sum('api.open-meteo.com/v1/forecast' in url for url in requests)==forecast_requests,'opening details must reuse the current forecast'
  report.append({'viewport':[width,height],**limits})
 # Partial coverage and absence are stated; daily probability and amount stay separate.
 page.locator('#forecastList [data-day-index="0"]').click();assert 'parciais' in page.locator('#dailyDetailHoursNote').inner_text()
 page.keyboard.press('Escape');page.locator('#dailyDetailDialog').wait_for(state='hidden')
 page.locator('#forecastList [data-day-index="6"]').click();assert 'indisponíveis' in page.locator('#dailyDetailHoursNote').inner_text();assert page.locator('#dailyDetailHours button').count()==0
 page.evaluate("(()=>{const f=structuredClone(displayedWeather.forecast);f.daily.precipitation_sum[6]=null;f.daily.apparent_temperature_max[6]=null;render(f,displayedWeather.air,true,Date.now()-3600000);})()")
 assert page.locator('#dailyDetailRain').inner_text()=='Indisponível';assert page.locator('#dailyDetailFeelsMax').inner_text()=='Indisponível';assert 'Dados salvos' in page.locator('#dailyDetailSource').inner_text()
 page.evaluate("dispatchEvent(new CustomEvent('pluvia:city-changed'))")
 assert not page.locator('#dailyDetailDialog').evaluate('el=>el.open') and not page.locator('#hourlyDetailDialog').evaluate('el=>el.open')
 assert not errors,errors
 assert not any('/functions/v1/nowcast' in url or '/api/nowcast' in url or 'smart-summary' in url for url in requests),requests
 (output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 print(json.dumps({'dailyDetail':True,'viewports':len(report),'timezone':'Asia/Tokyo','sharedHourly':True,'partialAndSavedData':True,'errors':errors}))
 browser.close()

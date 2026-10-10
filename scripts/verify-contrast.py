"""Sampled text contrast over nine deterministic weather backgrounds.
Weather is a deterministic fixture; external Auth, Push and sensors are blocked.
No production observations, accounts or styles are changed by this QA script.
"""
import datetime,json,os,shutil,subprocess,tempfile
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
# WebKit relata como pageerror (sem stack) a consulta do RainViewer cancelada por navegação/recarga;
# o radar compacto da Home inicia cedo no desktop. Só esta mensagem de rede é ignorada; exceções JS falham.
RAINVIEWER_CANCELLED='/api.rainviewer.com/public/weather-maps.json due to access control checks.'

repo=Path(__file__).resolve().parent.parent
preview=os.environ.get('PLUVIA_PREVIEW_URL','http://127.0.0.1:4173')
output=Path(os.environ.get('PLUVIA_QA_OUTPUT',str(Path(tempfile.gettempdir())/'pluvia-qa')))/'contrast'
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
 if 'rainviewer.com' in url:r.fulfill(headers={'Access-Control-Allow-Origin':'*'},json={'host':'https://radar.test','radar':{'past':[]}});return
 if '/auth/v1/settings' in url:r.fulfill(json={'external':{'email':True,'google':False,'apple':False}});return
 if urlparse(url).hostname in ['localhost','127.0.0.1']:r.continue_();return
 r.abort()

with sync_playwright() as p:
 browser=p.webkit.launch(headless=True) if os.environ.get('PLUVIA_BROWSER')=='webkit' else p.chromium.launch(headless=True,args=['--no-sandbox'],**({'executable_path':shutil.which('chromium')} if shutil.which('chromium') else {}))
 context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,timezone_id='Asia/Tokyo',service_workers='block',reduced_motion='reduce')
 context.route('**/*',route)
 context.add_init_script("sessionStorage.setItem('pluvia-intro-seen','1');localStorage.setItem('pluvia-city',JSON.stringify('1302603'));Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,fail){fail({code:1});}}});")
 page=context.new_page();page.on('pageerror',lambda e: None if str(e).endswith(RAINVIEWER_CANCELLED) else errors.append(str(e)))
 page.clock.set_fixed_time(datetime.datetime(2026,10,4,7,15,tzinfo=datetime.timezone.utc))
 page.goto(preview,wait_until='domcontentloaded')
 page.wait_for_function("document.getElementById('temperature').textContent==='30' && document.getElementById('pluviaIntro').hidden && !document.documentElement.classList.contains('awaiting-styles')")
 page.wait_for_function("document.getElementById('inmetContent').textContent.includes('Sem alertas')")
 page.evaluate('document.fonts.ready')
 import base64
 def sample(selector):
  el=page.locator(selector).first;el.scroll_into_view_if_needed();page.evaluate('document.activeElement.blur()');page.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  clip=el.bounding_box();encoded=base64.b64encode(page.screenshot(clip=clip)).decode()
  rgb=el.evaluate("el=>getComputedStyle(el).color.match(/[\\d.]+/g).slice(0,3).map(Number)")
  result=page.evaluate("""async ({encoded,rgb})=>{const i=new Image();i.src='data:image/png;base64,'+encoded;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const ctx=c.getContext('2d');ctx.drawImage(i,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data,channels=[[],[],[]];for(let p=0;p<data.length;p+=4)for(let a=0;a<3;a++)channels[a].push(data[p+a]);const bg=channels.map(v=>v.sort((a,b)=>a-b)[Math.floor(v.length/2)]);const lum=v=>v.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);const a=lum(rgb),b=lum(bg);return {rgb,bg,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}}""",{'encoded':encoded,'rgb':rgb})
  return result
 for hour,code,label in [(12,0,'sun'),(12,2,'partly'),(12,3,'cloud'),(12,51,'drizzle'),(12,61,'light-rain'),(12,63,'moderate-rain'),(12,65,'rain'),(12,95,'storm'),(12,45,'fog'),(6,1,'dawn'),(18,2,'dusk'),(22,0,'night')]:
  page.clock.set_fixed_time(datetime.datetime(2026,10,4,0,0,tzinfo=datetime.timezone.utc)+datetime.timedelta(hours=hour+4))
  page.evaluate("({code})=>{displayedWeather.forecast.current.weather_code=code;render(displayedWeather.forecast,displayedWeather.air,false,Date.now())}",{'code':code})
  page.evaluate("document.getElementById('weatherFrameStatus').textContent='Carregando imagem…'")
  page.set_viewport_size({'width':390,'height':844})
  for selector in ['#accountButton','#condition','#cityName','#hourlyDecision','.quick-metric .metric-head > span:first-child','#humidityNote','#hourlyChartDetails > summary span','#sunPhrase','footer .footer-brand-copy span']:
   result=sample(selector)
   assert result['contrast']>=4.5,{'state':label,'selector':selector,**result}
   reports.append({'state':label,'selector':selector,**result})
  page.evaluate("(()=>{const intro=document.getElementById('pluviaIntro');intro.hidden=false;intro.classList.remove('is-leaving');})()")
  for selector in ['.intro-tagline','.intro-kicker']:
   result=sample(selector)
   assert result['contrast']>=4.5,{'state':label,'selector':selector,**result}
   reports.append({'state':label,'selector':selector,**result})
  page.evaluate("document.getElementById('pluviaIntro').hidden=true")
 (output/'report.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2))
 print(json.dumps({'contrastSamples':len(reports),'minimum':min(r['contrast'] for r in reports),'states':12,'errors':errors}))
 assert not errors,errors
 browser.close()

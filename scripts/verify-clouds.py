"""Cloud rendering, bounded motion and screenshots using weather fixtures only."""
import datetime,json,os,shutil,subprocess
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
base=json.loads(subprocess.check_output(['node','-e',"process.stdout.write(JSON.stringify(require('./tests/support/forecast.cjs').forecast()))"],cwd=root,text=True))
preview=os.environ.get('PLUVIA_PREVIEW_URL','http://127.0.0.1:4173')
output=Path(os.environ.get('PLUVIA_QA_OUTPUT','/tmp/pluvia-clouds'))/'clouds';output.mkdir(parents=True,exist_ok=True)
mode={'code':3,'hour':13};errors=[]
def weather(tz):
 data=json.loads(json.dumps(base));data['timezone']=tz
 data['current'].update(time='2026-10-01T%02d:00'%mode['hour'],weather_code=mode['code'],is_day=int(6<=mode['hour']<18))
 for i in range(72):data['hourly']['time'][i]=(datetime.datetime(2026,10,1,mode['hour'])+datetime.timedelta(hours=i-1)).isoformat(timespec='minutes')
 return data
with sync_playwright() as p:
 browser=p.webkit.launch() if os.environ.get('PLUVIA_BROWSER')=='webkit' else p.chromium.launch(args=['--no-sandbox'],**({'executable_path':shutil.which('chromium')} if shutil.which('chromium') else {}))
 context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,timezone_id='Asia/Tokyo',service_workers='block',reduced_motion='reduce')
 def route(r):
  url=r.request.url
  if 'api.open-meteo.com/v1/forecast' in url:r.fulfill(json=weather(parse_qs(urlparse(url).query).get('timezone',['America/Manaus'])[0]));return
  if 'air-quality-api' in url:r.fulfill(json={'current':{'time':weather('America/Manaus')['current']['time'],'us_aqi':35}});return
  if 'inmet.gov.br' in url:r.fulfill(json={'hoje':[]});return
  if 'functions/v1/met-forecast' in url:r.fulfill(json={'source':'MET Norway','hourly':[]});return
  if 'rainviewer' in url:r.fulfill(json={'host':'https://radar.test','radar':{'past':[]}});return
  if '/auth/v1/settings' in url:r.fulfill(json={'external':{'email':True,'google':False,'apple':False}});return
  if urlparse(url).hostname in ['127.0.0.1','localhost']:r.continue_();return
  r.abort()
 context.route('**/*',route)
 context.add_init_script("sessionStorage.setItem('pluvia-intro-seen','1');localStorage.setItem('pluvia-city',JSON.stringify('1302603'));Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(s,e){e({code:1})}}});")
 page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 report=[]
 for width,height in [(320,740),(390,844),(844,390),(1366,768),(2560,1080)]:
  page.set_viewport_size({'width':width,'height':height})
  for name,hour,code in [('clear',13,0),('partly',13,2),('cloudy',13,3),('rain',14,65),('storm',15,95),('cloudy-night',22,3),('sunrise',6,2),('sunset',18,2)]:
   mode.update(code=code,hour=hour);page.clock.set_fixed_time(datetime.datetime(2026,10,1,hour,tzinfo=datetime.timezone.utc)+datetime.timedelta(hours=4))
   page.goto(preview,wait_until='domcontentloaded');page.wait_for_function("document.getElementById('temperature').textContent==='30' && document.getElementById('pluviaIntro').hidden")
   page.wait_for_function("!document.documentElement.classList.contains('awaiting-styles')")
   page.locator('#temperature').wait_for(state='visible',timeout=20000)
   decoded=page.evaluate("""async()=>Promise.all(['sky-cloud-veil.webp','sky-cloud-volume.webp'].map(async name=>{const i=new Image();i.src='./assets/'+name;await i.decode();return [i.naturalWidth,i.naturalHeight];}))""")
   assert decoded==[[1120,560],[1120,560]],decoded
   page.wait_for_timeout(200)
   assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),(width,name)
   layers=page.locator('.sky-effects > .sky-clouds')
   assert layers.count()==2
   data=layers.evaluate_all("els=>els.map(el=>{const s=getComputedStyle(el);return {opacity:+s.opacity,repeat:s.backgroundRepeat,animation:s.animationName,width:el.offsetWidth,height:el.offsetHeight};})")
   assert all(d['repeat']=='no-repeat' and d['animation']=='none' and d['width']<=width+130 and d['height']<=640 for d in data),(width,name,data)
   assert all(d['opacity']==0 for d in data) if name=='clear' else all(d['opacity']>0 for d in data)
   for selector in ['#temperature','#condition','#accountButton','#openCitySearch']:
    assert page.locator(selector).is_visible(),(width,height,name,selector)
   page.screenshot(path=str(output/(str(width)+'-'+name+'.png')))
   report.append({'viewport':[width,height],'state':name})
 # Native CSS animations remain the same objects across condition updates.
 mode.update(code=3,hour=13);page.clock.set_fixed_time(datetime.datetime(2026,10,1,17,tzinfo=datetime.timezone.utc));page.goto(preview)
 page.wait_for_function("document.body.dataset.weather==='cloud' && document.getElementById('pluviaIntro').hidden")
 page.emulate_media(reduced_motion='no-preference');page.wait_for_function("document.querySelector('.sky-effects').dataset.motion==='running'")
 page.evaluate("window.cloudAnimations=[...document.querySelectorAll('.sky-effects > .sky-clouds')].map(el=>el.getAnimations().find(a=>a.animationName.startsWith('clouds-')))")
 page.evaluate("PLUVIA.sky.apply(2,1,null,{lat:-3.119,lon:-60.022,timezone:'America/Manaus'})")
 assert page.evaluate("[...document.querySelectorAll('.sky-effects > .sky-clouds')].every((el,i)=>el.getAnimations().includes(cloudAnimations[i]))")
 assert page.locator('.sky-effects > .sky-clouds-front').evaluate("el=>getComputedStyle(el).transitionDuration")=='4s'
 page.evaluate("window.scrollTo(0,document.body.scrollHeight)");page.wait_for_function("document.querySelector('.sky-effects').dataset.motion==='paused'")
 assert all(s=='paused' for s in page.locator('.sky-effects > .sky-clouds').evaluate_all("els=>els.map(el=>getComputedStyle(el).animationPlayState)"))
 page.evaluate('window.scrollTo(0,0)');page.wait_for_function("document.querySelector('.sky-effects').dataset.motion==='running'")
 page.evaluate("PLUVIA.sky.apply(0,1,null,{lat:-3.119,lon:-60.022,timezone:'America/Manaus'})")
 assert all(s=='paused' for s in page.locator('.sky-effects > .sky-clouds').evaluate_all("els=>els.map(el=>getComputedStyle(el).animationPlayState)"))
 assert not errors,errors
 print(json.dumps({'screenshots':report,'seamlessBoundedLayers':True,'preservedAnimationObjects':True,'offscreenPause':True,'clearSkyPause':True,'reducedMotion':True,'errors':errors}))
 context.close();browser.close()

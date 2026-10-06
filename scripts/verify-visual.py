"""Automated visual contracts + screenshots, using only deterministic fixtures.
Tests geometry, important readings, sky states, alerts, errors and dialog motion.
No live authentication, API calls or personal data. Pixel screenshots are review
artifacts: no misleading comparison against baselines from another OS/browser.
"""
import re,base64,datetime,json,os,shutil,subprocess
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
base=json.loads(subprocess.check_output(['node','-e',"process.stdout.write(JSON.stringify(require('./tests/support/forecast.cjs').forecast()))"],cwd=root,text=True))
preview=os.environ.get('PLUVIA_PREVIEW_URL','http://127.0.0.1:4173')
public_smoke=os.environ.get('PLUVIA_PUBLIC_SMOKE')=='1'
preview_origin=(urlparse(preview).scheme,urlparse(preview).netloc)
output=Path(os.environ.get('PLUVIA_QA_OUTPUT','/tmp/pluvia-visual'));output.mkdir(parents=True,exist_ok=True)
fixed=datetime.datetime(2026,10,1,16,tzinfo=datetime.timezone.utc)
mode={'name':'clear-day','hour':12,'code':0,'offline':False,'pending':False,'alert':False}
def weather(tz):
 data=json.loads(json.dumps(base));data['timezone']=tz;data['current']['time']='2026-10-01T%02d:00'%mode['hour'];data['current']['weather_code']=mode['code'];data['current']['is_day']=int(6<=mode['hour']<18);data['current']['cloud_cover']=100 if mode['code']==3 else 0
 for i in range(72):data['hourly']['time'][i]=(datetime.datetime(2026,10,1,mode['hour'])+datetime.timedelta(hours=i-1)).isoformat(timespec='minutes')
 return data
with sync_playwright() as p:
 browser=p.webkit.launch() if os.environ.get('PLUVIA_BROWSER')=='webkit' else p.chromium.launch(args=['--no-sandbox'],**({'executable_path':shutil.which('chromium')} if shutil.which('chromium') else {}))
 context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,timezone_id='Asia/Tokyo',service_workers='block',reduced_motion='reduce')
 page=context.new_page();errors=[];requests=[];blocked=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  url=r.request.url;requests.append(url)
  if public_smoke and r.request.method!='GET':r.abort();return
  if 'api.open-meteo.com/v1/forecast' in url:
   if mode['pending']:blocked.append(r);return
   if mode['offline']:r.abort();return
   r.fulfill(json=weather(parse_qs(urlparse(url).query).get('timezone',['America/Manaus'])[0]));return
  if 'air-quality-api' in url:r.fulfill(json={'current':{'time':weather('America/Manaus')['current']['time'],'us_aqi':35,'pm2_5':8,'pm10':15,'ozone':44,'nitrogen_dioxide':10,'carbon_monoxide':180}});return
  if 'inmet.gov.br' in url:r.fulfill(json={'hoje':[{'id':999999,'descricao':'Aviso de teste','geocodes':'1302603','severidade':'Grande Perigo','inicio':'2026-10-01T00:00:00Z','fim':'2026-10-02T00:00:00Z'}] if mode['alert'] else []});return
  if 'functions/v1/met-forecast' in url:r.fulfill(json={'source':'MET Norway','hourly':[]});return
  if 'rainviewer' in url:r.fulfill(json={'host':'https://radar.test','radar':{'past':[]}});return
  if '/auth/v1/settings' in url:r.fulfill(json={'external':{'email':True,'google':False,'apple':False}});return
  if (urlparse(url).scheme,urlparse(url).netloc)==preview_origin:r.continue_();return
  r.abort()
 context.route('**/*',route)
 context.add_init_script("sessionStorage.setItem('pluvia-intro-seen','1');localStorage.setItem('pluvia-city',JSON.stringify('1302603'));Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(success,error){error({code:1});}}});")
 page.clock.set_fixed_time(fixed)
 def goto(**options):
  # The public smoke reaches the real domain: a dropped connection before any
  # response (seen twice after deploys) is retried; app errors still fail.
  for attempt in range(3 if public_smoke else 1):
   try:return page.goto(preview,**options)
   except Exception as error:
    if attempt==2 or not public_smoke or not re.search(r'net::ERR_(CONNECTION_(CLOSED|RESET|REFUSED|TIMED_OUT)|TIMED_OUT|NETWORK_CHANGED)',str(error)):raise
    page.wait_for_timeout(3000*(attempt+1))
 def geometry():
  page.locator('#temperature').wait_for(state='visible',timeout=20000)
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),mode['name']
  for selector in ['#temperature','#condition','#accountButton','#openCitySearch']:
   assert page.locator(selector).is_visible(),(mode['name'],selector)
   rect=page.locator(selector).bounding_box();assert rect and rect['width']>0 and rect['x']>=-1 and rect['x']+rect['width']<=page.viewport_size['width']+1,(selector,rect)
  assert page.locator('#temperature').evaluate('el=>parseFloat(getComputedStyle(el.parentElement).fontSize)')>=48
  assert not errors,errors
 def painted_text(selector):
  # Visibility/geometry can pass when an opaque decorative layer covers text.
  # Check its actual foreground pixels in the viewport, without changing the
  # DOM or relying on WebKit to repaint a second hidden-text screenshot.
  node=page.locator(selector);node.scroll_into_view_if_needed()
  page.evaluate('document.fonts.ready')
  page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  clip=node.bounding_box();assert clip,selector
  encoded=base64.b64encode(page.screenshot(clip=clip)).decode()
  colour=node.evaluate("el=>getComputedStyle(el).color.match(/[\\d.]+/g).slice(0,3).map(Number)")
  sample=page.evaluate("""async ({encoded,colour})=>{
   const im=new Image();im.src='data:image/png;base64,'+encoded;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const samples=ctx.getImageData(0,0,c.width,c.height).data;
   let count=0;const channels=[[],[],[]];for(let i=0;i<samples.length;i+=4){if(Math.max(...colour.map((value,channel)=>Math.abs(samples[i+channel]-value)))<=18)count++;for(let channel=0;channel<3;channel++)channels[channel].push(samples[i+channel]);}
   const background=channels.map(values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)]);
   const luminance=rgb=>rgb.map(value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
   const foregroundLight=luminance(colour),backgroundLight=luminance(background);return {count,contrast:(Math.max(foregroundLight,backgroundLight)+.05)/(Math.min(foregroundLight,backgroundLight)+.05)};
  }""",{'encoded':encoded,'colour':colour})
  painted=sample['count']
  if painted<=100:
   name=str(page.viewport_size['width'])+'-'+mode['name']+'-'+selector.replace(' ','_').replace('#','')
   (output/(name+'-text.png')).write_bytes(base64.b64decode(encoded))
   page.screenshot(path=str(output/(name+'-viewport.png')))
  assert painted>100,{'state':mode['name'],'viewport':page.viewport_size,'selector':selector,'colour':colour,'paintedPixels':painted}
  if selector in ['footer .footer-brand-copy span','#openSources','#openPrivacy']:
   assert sample['contrast']>=4.5,{'state':mode['name'],'selector':selector,'contrast':sample['contrast']}
  return painted
 report=[]
 footer_paint=[]
 if not public_smoke:
  mode.update(name='loading',pending=True)
  goto(wait_until='domcontentloaded')
  page.locator('#condition').wait_for(state='visible')
  assert page.locator('#temperature').inner_text()=='--'
  page.screenshot(path=str(output/'390-loading.png'),full_page=True)
  for request in blocked:request.abort()
  blocked.clear();mode['pending']=False
 for width,height in [(390,844),(1366,768)]:
  page.set_viewport_size({'width':width,'height':height})
  for name,hour,code in [('clear-day',12,0),('clear-night',22,0),('rain',14,65),('storm',15,95),('cloudy',10,3),('sunrise',6,1),('sunset',18,2)]:
   if public_smoke and name not in ['clear-day','clear-night','sunrise','sunset']:continue
   mode.update(name=name,hour=hour,code=code,offline=False,alert=False)
   page.clock.set_fixed_time(fixed+datetime.timedelta(hours=hour-12))
   goto(wait_until='domcontentloaded');page.wait_for_function("document.getElementById('temperature').textContent==='30' && document.getElementById('pluviaIntro').hidden")
   page.wait_for_timeout(120);geometry()
   state=page.evaluate('({phase:document.body.dataset.phase,weather:document.body.dataset.weather,solar:document.body.dataset.solar})')
   expected='storm' if code==95 else 'rain' if code==65 else 'cloud' if code==3 else None
   if expected:assert state['weather']==expected,state
   if name=='clear-day':assert state['phase']=='day',state
   if name=='clear-night':assert state['phase']=='night',state
   page.screenshot(path=str(output/(str(width)+'-'+name+'.png')),full_page=True);report.append({'viewport':width,'state':name,**state})
   if name in ['sunrise','sunset']:
    assert state['solar']==name,state
    painted={selector:painted_text(selector) for selector in ['#temperature','#sunrise','#sunset','footer .footer-brand-copy strong','footer .footer-brand-copy span','#openSources','#openPrivacy']}
    page.screenshot(path=str(output/(str(width)+'-'+name+'-footer.png')))
    footer_paint.append({'viewport':width,'state':name,'paintedPixels':painted})
    page.locator('#openSources').click();page.locator('#sourcesDialog').wait_for(state='visible')
    page.keyboard.press('Escape');page.locator('#sourcesDialog').wait_for(state='hidden')
    page.locator('#openPrivacy').click();page.locator('#sourcesDialog').wait_for(state='visible')
    assert page.locator('#privacyTitle').is_visible()
    page.keyboard.press('Escape');page.locator('#sourcesDialog').wait_for(state='hidden')
  if public_smoke:continue
  mode.update(name='alert',hour=12,code=95,alert=True);page.clock.set_fixed_time(fixed);goto()
  page.wait_for_function("document.getElementById('inmetCard').dataset.severity==='red'")
  page.wait_for_function("document.getElementById('temperature').textContent==='30' && document.getElementById('pluviaIntro').hidden")
  geometry();page.wait_for_function("document.getElementById('inmetContent').textContent.includes('Vigente')")
  page.screenshot(path=str(output/(str(width)+'-alert.png')),full_page=True)
  page.evaluate("favorites.add('1302603');dispatchEvent(new CustomEvent('pluvia:favorites-changed'))")
  page.locator('#openCitySearch').click();page.wait_for_function("document.querySelector('.favorite-alert').innerText.includes('INMET oficial')")
  assert 'Alerta vermelho' in page.locator('.favorite-alert').inner_text()
  page.keyboard.press('Escape')
  page.locator('#cityDialog').wait_for(state='hidden')
  # Verify downward entrance and exit, native modality and immediate reduced-motion close.
  page.emulate_media(reduced_motion='no-preference');page.locator('#accountButton').click()
  assert page.locator('#accountDialog').evaluate("el=>getComputedStyle(el).animationName")=='pluvia-dialog-enter'
  assert page.locator('#accountDialog').evaluate("el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m42")<0
  page.wait_for_timeout(450)
  rect=page.locator('#accountDialog').bounding_box();assert rect and rect['height']<=height and rect['width']<=width
  page.screenshot(path=str(output/(str(width)+'-account.png')))
  # Sample a defined CSS animation frame: slow headless renderers may miss a 280 ms exit.
  exit_frame=page.evaluate("""(()=>{const d=document.getElementById('accountDialog');document.getElementById('accountClose').click();
    const animation=d.getAnimations().find(a=>a.animationName==='pluvia-dialog-exit');
    if(!animation)return {missing:true};animation.pause();animation.currentTime=140;
    return {open:d.open,closing:d.classList.contains('pluvia-dialog-closing'),y:new DOMMatrixReadOnly(getComputedStyle(d).transform).m42,
      backdrop:getComputedStyle(d,'::backdrop').animationName};})()""")
  assert exit_frame.get('open') and exit_frame.get('closing') and exit_frame.get('y',0)>0,exit_frame
  assert exit_frame['backdrop']=='pluvia-backdrop-exit',exit_frame
  page.evaluate("document.getElementById('accountDialog').getAnimations().find(a=>a.animationName==='pluvia-dialog-exit').finish()")
  page.locator('#accountDialog').wait_for(state='hidden')
  assert page.locator('#accountButton').evaluate("el=>document.activeElement===el")
  page.locator('#accountButton').click();page.keyboard.press('Escape')
  page.locator('#accountDialog').wait_for(state='hidden')
  # A data-driven immediate close cancels the old exit even if reopened before its close event.
  page.locator('#accountButton').click()
  page.evaluate("(()=>{const d=document.getElementById('accountDialog');PLUVIA.dialogs.close(d);d.close();d.showModal();})()")
  page.wait_for_timeout(600);assert page.locator('#accountDialog').evaluate('el=>el.open && !el.classList.contains("pluvia-dialog-closing")')
  page.keyboard.press('Escape');page.locator('#accountDialog').wait_for(state='hidden')
  page.emulate_media(reduced_motion='reduce');page.locator('#accountButton').click()
  assert page.locator('#accountDialog').evaluate("el=>getComputedStyle(el).animationName")=='none'
  page.locator('#accountClose').click();assert not page.locator('#accountDialog').evaluate('el=>el.open')
  page.locator('#accountButton').click();page.locator('#accountForgot').click()
  assert page.locator('#accountPassword').is_hidden();assert page.locator('#accountEmail').is_visible();page.keyboard.press('Escape')
  mode.update(name='stale',offline=True,alert=False);page.evaluate('refreshAll()')
  page.wait_for_function("document.getElementById('dataStatus').dataset.freshness==='stale'")
  geometry();page.screenshot(path=str(output/(str(width)+'-stale.png')),full_page=True)
  page.evaluate("localStorage.removeItem('pluvia-weather-1302603')");goto()
  page.wait_for_function("document.getElementById('condition').textContent==='Tempo indisponível'")
  geometry();assert page.locator('#temperature').inner_text()=='--';page.screenshot(path=str(output/(str(width)+'-error.png')),full_page=True)
 print(json.dumps({'publicSmoke':public_smoke,'visualContracts':report,'twilightFooterPaint':footer_paint,'alerts':not public_smoke,'dialogMotion':not public_smoke,'reducedMotion':True,'errors':errors},ensure_ascii=False))
 browser.close()

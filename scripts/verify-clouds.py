"""Sky textures, stars, rain depth, lightning and motion using weather fixtures only."""
import base64,datetime,json,os,shutil,subprocess
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
  for name,hour,code in [('clear',13,0),('clear-night',22,0),('few',13,1),('few-night',22,1),('partly',13,2),('partly-night',22,2),('moon-partly',3,2),('moon-cloudy',3,3),('cloudy',13,3),('drizzle',14,51),('light-rain',14,61),('rain',14,65),('storm',15,95),('storm-night',22,95),('cloudy-night',22,3),('sunrise',6,2),('sunset',18,2)]:
   mode.update(code=code,hour=hour);page.clock.set_fixed_time(datetime.datetime(2026,10,1,hour,tzinfo=datetime.timezone.utc)+datetime.timedelta(hours=4))
   page.goto(preview,wait_until='domcontentloaded');page.wait_for_function("document.getElementById('temperature').textContent==='30' && document.getElementById('pluviaIntro').hidden")
   page.wait_for_function("!document.documentElement.classList.contains('awaiting-styles')")
   page.locator('#temperature').wait_for(state='visible',timeout=20000)
   decoded=page.evaluate("""async()=>Promise.all(['sky-cloud-veil.webp','sky-cloud-volume.webp','rain-near.svg','rain-far.svg','lightning-near.svg','lightning-far.svg','sky-stars.svg','sky-stars-shimmer.svg'].map(async name=>{const i=new Image();i.src='./assets/'+name;await i.decode();return [i.naturalWidth,i.naturalHeight];}))""")
   assert decoded==[[2100,700],[2100,700],[320,480],[480,480],[270,400],[270,400],[1200,700],[1200,700]],decoded
   # Transparência contínua: com 16 níveis as bordas das nuvens viravam degraus visíveis quando esticadas.
   alpha_levels=page.evaluate("""async()=>Promise.all(['sky-cloud-veil.webp','sky-cloud-volume.webp'].map(async name=>{const i=new Image();i.src='./assets/'+name;await i.decode();const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);const d=x.getImageData(0,0,c.width,c.height).data;const seen=new Set();for(let k=3;k<d.length;k+=4)seen.add(d[k]);return seen.size;}))""")
   assert all(levels>=48 for levels in alpha_levels),alpha_levels
   # A camada desliza em repeat-x: a última coluna precisa continuar na primeira, sem degrau.
   seams=page.evaluate("""async()=>Promise.all(['sky-cloud-veil.webp','sky-cloud-volume.webp'].map(async name=>{const i=new Image();i.src='./assets/'+name+'?v=clouds-4';await i.decode();const c=document.createElement('canvas');const w=c.width=i.naturalWidth,h=c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);const d=x.getImageData(0,0,w,h).data;let seam=0,inner=0;for(let y=0;y<h;y++)for(let k=0;k<4;k++){seam+=Math.abs(d[(y*w+w-1)*4+k]-d[(y*w)*4+k]);inner+=Math.abs(d[(y*w+w-2)*4+k]-d[(y*w+w-1)*4+k]);}return [seam,inner];}))""")
   assert all(seam<=2*inner+64 for seam,inner in seams),seams
   page.wait_for_timeout(200)
   assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),(width,name)
   layers=page.locator('.sky-effects > .sky-clouds')
   assert layers.count()==2
   data=layers.evaluate_all("els=>els.map(el=>{const s=getComputedStyle(el);return {opacity:+s.opacity,repeat:s.backgroundRepeat.split(',').map(v=>v.trim()),animation:s.animationName,width:el.offsetWidth,height:el.offsetHeight};})")
   # Uma faixa de largura da tela + um tile 3:1 permite deslizar exatamente um tile sem expor borda.
   assert all(set(d['repeat'])=={'repeat-x'} and d['animation']=='none' and abs(d['width']-(width+3*d['height']))<=1 and 440<=d['height']<=640 for d in data),(width,name,data)
   assert all(d['opacity']==0 for d in data) if code==0 else all(d['opacity']>0 for d in data)
   if code==1:
    assert all(d['opacity']==1 for d in data),'poucas nuvens conservam interiores opacos'
    assert page.evaluate("document.documentElement.dataset.clouds==='few' && document.body.dataset.clouds==='few'")
    assert ('quase limpo' if hour==22 else 'limpo') in page.locator('#condition').inner_text()
   stars=page.locator('.sky-effects > .sky-stars')
   assert stars.count()==1 and page.locator('.intro-sky > .sky-stars').count()==1
   star=stars.evaluate("el=>{const s=getComputedStyle(el);return {opacity:+s.opacity,repeat:s.backgroundRepeat,animation:getComputedStyle(el,'::after').animationName,height:el.offsetHeight,width:el.offsetWidth};}")
   assert star['repeat']=='no-repeat' and star['animation']=='none' and star['height']<=760 and star['width']==width,star
   visible=name in ['clear-night','few-night','partly-night','moon-partly']
   assert (star['opacity']>0)==visible,(width,name,star)
   if name in ['moon-partly','moon-cloudy']:
    assert page.locator('.sky-effects > .sky-moon').evaluate("el=>getComputedStyle(el).display==='block' && +getComputedStyle(el).opacity>0")
   rain=page.locator('.sky-effects > .sky-rain').evaluate_all("els=>els.map(el=>{const s=getComputedStyle(el);return {opacity:+s.opacity,animation:s.animationName,size:s.backgroundSize};})")
   assert len(rain)==2 and all(d['animation']=='none' and d['size'].endswith('480px') for d in rain)
   wet=code in [51,61,65,95]
   assert all(d['opacity']>0 for d in rain) if wet else all(d['opacity']==0 for d in rain)
   assert page.locator('.sky-effects > .sky-lightning').evaluate("el=>getComputedStyle(el).display")=='none'
   assert page.locator('.sky-effects > .sky-lightning').evaluate("el=>['::before','::after'].every(p=>getComputedStyle(el,p).animationName==='none')")
   for selector in ['#temperature','#condition','#accountButton','#openCitySearch']:
    assert page.locator(selector).is_visible(),(width,height,name,selector)
   page.screenshot(path=str(output/(str(width)+'-'+name+'.png')))
   report.append({'viewport':[width,height],'state':name})
 # Measure painted cloud coverage with the real textures/masks, rather than
 # just checking dataset names. Mainly clear must leave most of the sky open
 # on narrow, landscape and wide screens, in both scenes and municipal phases.
 coverage=[]
 for width,height in [(320,740),(390,844),(844,390),(1366,768),(2560,1080)]:
  page.set_viewport_size({'width':width,'height':height})
  for hour in [13,22]:
   mode.update(code=1,hour=hour);page.clock.set_fixed_time(datetime.datetime(2026,10,1,hour,tzinfo=datetime.timezone.utc)+datetime.timedelta(hours=4))
   page.goto(preview);page.wait_for_function("document.body.dataset.clouds==='few' && document.getElementById('pluviaIntro').hidden && !document.documentElement.classList.contains('awaiting-styles')")
   for scene in ['home','intro']:
    page.evaluate("intro=>{document.getElementById('pluviaIntro').hidden=!intro}",scene=='intro')
    decor=page.add_style_tag(content=".night-stage > :not(.sky-effects):not(.sky-twilight-page),.pluvia-intro > :not(.intro-sky){visibility:hidden!important}:is(.sky-effects,.intro-sky) > :is(.sky-sun,.sky-moon,.sky-stars){display:none!important}")
    fractions={}
    for code in [1,2]:
     page.evaluate("code=>PLUVIA.sky.apply(code,null,null,{lat:-3.119,lon:-60.022,timezone:'America/Manaus'})",code)
     clip={'x':0,'y':0,'width':width,'height':min(height,650)}
     painted=base64.b64encode(page.screenshot(clip=clip)).decode()
     hidden=page.add_style_tag(content='.sky-clouds{opacity:0!important}')
     clear=base64.b64encode(page.screenshot(clip=clip)).decode();hidden.evaluate('el=>el.remove()')
     fractions[code]=page.evaluate("""async images=>{
       const data=await Promise.all(images.map(async image=>{const im=new Image();im.src='data:image/png;base64,'+image;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return ctx.getImageData(0,0,c.width,c.height).data;}));
       let painted=0;for(let i=0;i<data[0].length;i+=4)if(Math.abs(data[0][i]-data[1][i])+Math.abs(data[0][i+1]-data[1][i+1])+Math.abs(data[0][i+2]-data[1][i+2])>12)painted++;
       return painted/(data[0].length/4);
     }""",[painted,clear])
    assert 0<fractions[1]<.25 and fractions[1]<fractions[2]*.5,(width,height,hour,scene,fractions)
    coverage.append({'viewport':[width,height],'hour':hour,'scene':scene,'paintedCloudFraction':fractions})
    decor.evaluate('el=>el.remove()')
   page.evaluate("document.getElementById('pluviaIntro').hidden=true")
 # Pixel regression: a moving opaque band with a clear gap substitutes only the
 # test texture. Real CSS, both cloud animations and both celestial disks remain.
 # This catches translucency/z-order failures without relying on an asset's crop.
 page.set_viewport_size({'width':390,'height':844})
 mode.update(code=2,hour=23);page.clock.set_fixed_time(datetime.datetime(2026,10,2,3,tzinfo=datetime.timezone.utc));page.goto(preview)
 page.wait_for_function("document.body.dataset.weather==='partly' && document.getElementById('pluviaIntro').hidden && !document.documentElement.classList.contains('awaiting-styles')")
 page.wait_for_function("(()=>{for(let el=document.getElementById('temperature');el;el=el.parentElement)if(+getComputedStyle(el).opacity<.99)return false;return true;})()")
 page.evaluate("async()=>{const i=new Image();i.src='./assets/sky-sun.svg?v=sun-2';await i.decode();}")
 page.emulate_media(reduced_motion='no-preference')
 page.add_style_tag(content=".night-stage > :not(.sky-effects):not(.sky-twilight-page){visibility:hidden!important}.sky-stars{display:none!important}.sky-effects > :is(.sky-sun,.sky-moon){display:block!important;opacity:1!important;transition:none!important}.sky-effects > .sky-clouds{top:-60px!important;transition:none!important}")
 page.evaluate("""()=>{
   const clouds=[...document.querySelectorAll('.sky-effects > .sky-clouds')];
   const width=clouds[0].offsetWidth,height=clouds[0].offsetHeight;
   const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><path fill="#aac4d6" d="M0 0H${width/2-12}V${height}H0Z M${width/2+12} 0H${width}V${height}H${width/2+12}Z"/></svg>`;
   for(const el of clouds){el.style.backgroundImage=`url("data:image/svg+xml,${encodeURIComponent(svg)}")`;el.style.backgroundSize='100% 100%';el.style.backgroundRepeat='no-repeat';el.style.setProperty('opacity','0','important');}
   for(const el of document.querySelectorAll('.sky-effects > .sky-sun,.sky-effects > .sky-moon')){
     const width=el.offsetWidth;el.style.setProperty('transform',`translate3d(${195-width/2}px,${150-width/2}px,0)`,'important');el.style.setProperty('display','none','important');
   }
 }""")
 clip={'x':191,'y':146,'width':8,'height':8}
 def pixels():
  encoded=base64.b64encode(page.screenshot(clip=clip)).decode()
  return page.evaluate("""async data=>{const im=new Image();im.src='data:image/png;base64,'+data;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return [...ctx.getImageData(0,0,c.width,c.height).data];}""",encoded)
 def difference(a,b):return sum(abs(x-y) for i,(x,y) in enumerate(zip(a,b)) if i%4!=3)
 occlusion=[]
 for body in ['sun','moon']:
  disk=page.locator('.sky-effects > .sky-'+body)
  for layer in ['back','front']:
   page.locator('.sky-effects > .sky-clouds').evaluate_all("els=>els.forEach(el=>el.style.setProperty('opacity','0','important'))")
   disk.evaluate("el=>el.style.setProperty('display','none','important')");base_pixels=pixels()
   disk.evaluate("el=>el.style.setProperty('display','block','important')");clear_energy=difference(pixels(),base_pixels)
   assert clear_energy>100,(body,clear_energy)
   cloud=page.locator('.sky-effects > .sky-clouds-'+layer)
   cloud.evaluate("el=>el.style.removeProperty('opacity')")
   ratios={}
   for state,progress in [('covered',0),('gap',.5)]:
    cloud.evaluate("""(el,p)=>{const a=el.getAnimations().find(a=>a.animationName?.startsWith('clouds-'));const t=a.effect.getTiming();a.pause();a.currentTime=t.delay+t.duration*(2+p);}""",progress)
    disk.evaluate("el=>el.style.setProperty('display','none','important')");without=pixels()
    disk.evaluate("el=>el.style.setProperty('display','block','important')");ratios[state]=difference(pixels(),without)/clear_energy
   assert ratios['covered']<.02 and ratios['gap']>.9,(body,layer,ratios)
   occlusion.append({'body':body,'layer':layer,'visibility':ratios})
  disk.evaluate("el=>el.style.setProperty('display','none','important')")
 # Sparse banks also need opaque interiors, despite their smaller edge masks.
 # A solid QA texture checks that the sparse composition still hides each disk;
 # the real assets and open area were measured above, without this substitution.
 page.evaluate("""()=>{
   PLUVIA.sky.apply(1,0,null,{lat:-3.119,lon:-60.022,timezone:'America/Manaus'});
   const svg='<svg xmlns="http://www.w3.org/2000/svg" width="2100" height="700"><path fill="#aac4d6" d="M0 0H2100V700H0Z"/></svg>';
   for(const el of document.querySelectorAll('.sky-effects > .sky-clouds')){
     el.style.backgroundImage=`url("data:image/svg+xml,${encodeURIComponent(svg)}")`;el.style.removeProperty('background-size');el.style.removeProperty('background-repeat');
     el.style.setProperty('opacity','0','important');
     const a=el.getAnimations().find(a=>a.animationName?.startsWith('clouds-'));const t=a.effect.getTiming();a.pause();a.currentTime=t.delay+t.duration*2.5;
   }
 }""")
 for body in ['sun','moon']:
  disk=page.locator('.sky-effects > .sky-'+body)
  for layer in ['back','front']:
   cloud=page.locator('.sky-effects > .sky-clouds-'+layer)
   # Bancos a cada meio tile (máscara repetida), centrados em 39%/46% e 34% da altura; o vão fica fora da elipse.
   center=cloud.evaluate("""el=>{const r=el.getBoundingClientRect(),front=el.classList.contains('sky-clouds-front'),half=1.5*el.offsetHeight;
     const few=Math.min(Math.max(Math.min(innerWidth,innerHeight)*(front?.56:.58),front?180:200),front?620:680);
     let x=r.left+(front?.46:.39)*half;while(x<few/2)x+=half;
     const gap=x-.75*few>8?x-.75*few:x+.75*few;return {x,gap,y:r.top+.34*el.offsetHeight};}""")
   assert 8<center['gap']<382 and center['x']<382,center
   ratios={}
   for state,x in [('covered',center['x']),('gap',center['gap'])]:
    clip={'x':int(x)-4,'y':int(center['y'])-4,'width':8,'height':8}
    disk.evaluate("el=>el.style.setProperty('display','block','important')")
    disk.evaluate("(el,p)=>el.style.setProperty('transform',`translate3d(${p.x-el.offsetWidth/2}px,${p.y-el.offsetWidth/2}px,0)`,'important')",{'x':int(x),'y':int(center['y'])})
    cloud.evaluate("el=>el.style.setProperty('opacity','0','important')")
    disk.evaluate("el=>el.style.setProperty('display','none','important')");without=pixels()
    disk.evaluate("el=>el.style.setProperty('display','block','important')");clear_energy=difference(pixels(),without)
    assert clear_energy>100,(body,layer,state,clear_energy)
    cloud.evaluate("el=>el.style.removeProperty('opacity')")
    disk.evaluate("el=>el.style.setProperty('display','none','important')");without=pixels()
    disk.evaluate("el=>el.style.setProperty('display','block','important')");ratios[state]=difference(pixels(),without)/clear_energy
   assert ratios['covered']<.02 and ratios['gap']>.9,(body,layer,'few',ratios)
   occlusion.append({'body':body,'layer':layer,'clouds':'few','visibility':ratios})
   cloud.evaluate("el=>el.style.setProperty('opacity','0','important')")
  disk.evaluate("el=>el.style.setProperty('display','none','important')")
 # Native CSS animations remain the same objects across condition updates.
 # Instant QA scrolls reach their destination before the next action. With
 # smooth scrolling, the scene pauses mid-scroll; reversing at that moment
 # can leave WebKit's previous scroll queued instead of returning to the top.
 mode.update(code=3,hour=13);page.clock.set_fixed_time(datetime.datetime(2026,10,1,17,tzinfo=datetime.timezone.utc));page.goto(preview)
 page.wait_for_function("document.body.dataset.weather==='cloud' && document.getElementById('pluviaIntro').hidden")
 page.emulate_media(reduced_motion='no-preference');page.wait_for_function("document.querySelector('.sky-effects').dataset.motion==='running'")
 page.evaluate("window.cloudAnimations=[...document.querySelectorAll('.sky-effects > .sky-clouds')].map(el=>el.getAnimations().find(a=>a.animationName?.startsWith('clouds-')))")
 for code in [1,2,1,3]:
  page.evaluate("code=>PLUVIA.sky.apply(code,1,null,{lat:-3.119,lon:-60.022,timezone:'America/Manaus'})",code)
  assert page.evaluate("[...document.querySelectorAll('.sky-effects > .sky-clouds')].every((el,i)=>el.getAnimations().includes(cloudAnimations[i]))"),code
 assert page.locator('.sky-effects > .sky-clouds-front').evaluate("el=>getComputedStyle(el).transitionDuration")=='4s'
 page.evaluate("window.scrollTo({top:document.body.scrollHeight,behavior:'instant'})");page.wait_for_function("document.querySelector('.sky-effects').dataset.motion==='paused'")
 assert all(s=='paused' for s in page.locator('.sky-effects > .sky-clouds').evaluate_all("els=>els.map(el=>getComputedStyle(el).animationPlayState)"))
 page.evaluate("window.scrollTo({top:0,behavior:'instant'})");page.wait_for_function("scrollY===0 && document.querySelector('.sky-effects').dataset.motion==='running'")
 page.evaluate("PLUVIA.sky.apply(0,1,null,{lat:-3.119,lon:-60.022,timezone:'America/Manaus'})")
 assert all(s=='paused' for s in page.locator('.sky-effects > .sky-clouds').evaluate_all("els=>els.map(el=>getComputedStyle(el).animationPlayState)"))
 # Continuous drift: linear, exactly one 3:1 tile per loop (the seamless texture hides the wrap),
 # and the near layer completes its loop faster than the distant one (parallax).
 drift=page.locator('.sky-effects > .sky-clouds').evaluate_all("""els=>els.map(el=>{const a=el.getAnimations().find(a=>a.animationName?.startsWith('clouds-'));const t=a.effect.getTiming();
   const at=p=>{a.currentTime=t.delay+t.duration*(3+p);return new DOMMatrix(getComputedStyle(el).transform);};
   const quarter=at(.25),half=at(.5);return {tile:3*el.offsetHeight,quarter:quarter.m41,half:half.m41,y:half.m42,duration:t.duration,easing:t.easing};})""")
 assert all(abs(d['quarter']+d['tile']*.25)<=1 and abs(d['half']+d['tile']*.5)<=1 and d['y']==0 and d['easing']=='linear' for d in drift),drift
 assert drift[1]['duration']<drift[0]['duration'],drift
 # A few stars shimmer without drifting; condition updates keep the animation.
 normal_stars=[]
 mode.update(code=0,hour=22);page.clock.set_fixed_time(datetime.datetime(2026,10,2,2,tzinfo=datetime.timezone.utc))
 for width,height in [(390,844),(1366,768)]:
  page.set_viewport_size({'width':width,'height':height});page.goto(preview)
  page.wait_for_function("document.body.dataset.weather==='sun' && document.querySelector('.sky-effects').dataset.motion==='running' && +getComputedStyle(document.querySelector('.sky-effects > .sky-stars')).opacity>.7")
  page.wait_for_function("(()=>{for(let el=document.getElementById('temperature');el;el=el.parentElement)if(+getComputedStyle(el).opacity<.99)return false;return true;})()")
  page.screenshot(path=str(output/(str(width)+'-stars-normal.png')))
  normal_stars.append({'viewport':width,'staticField':True,'sparseShimmer':True})
 star=page.locator('.sky-effects > .sky-stars')
 page.evaluate("window.starAnimation=document.querySelector('.sky-effects > .sky-stars').getAnimations({subtree:true}).find(a=>a.animationName==='sky-star-shimmer');PLUVIA.sky.apply(2,0,null,{lat:-3.119,lon:-60.022,timezone:'America/Manaus'})")
 assert page.evaluate("document.querySelector('.sky-effects > .sky-stars').getAnimations({subtree:true}).includes(starAnimation)")
 assert star.evaluate("el=>getComputedStyle(el).transform==='none' && getComputedStyle(el,'::after').transform==='none'")
 page.evaluate("document.body.classList.add('page-hidden')")
 assert star.evaluate("el=>getComputedStyle(el,'::after').animationPlayState==='paused'")
 assert page.evaluate("starAnimation.playState==='paused'")
 page.evaluate("document.body.classList.remove('page-hidden');window.scrollTo({top:document.body.scrollHeight,behavior:'instant'})")
 page.wait_for_function("document.querySelector('.sky-effects').dataset.motion==='paused'")
 assert star.evaluate("el=>getComputedStyle(el,'::after').animationPlayState==='paused'")
 page.evaluate("window.scrollTo({top:0,behavior:'instant'})");page.wait_for_function("scrollY===0 && document.querySelector('.sky-effects').dataset.motion==='running'")
 page.emulate_media(reduced_motion='reduce')
 assert star.evaluate("el=>getComputedStyle(el,'::after').animationName==='none' && +getComputedStyle(el).opacity>0")
 # Night/weather CSS gates also protect against an old shell retaining brightness.
 page.evaluate("PLUVIA.sky.apply(95,0,null,{lat:-3.119,lon:-60.022,timezone:'America/Manaus'});[document.documentElement,document.body].forEach(el=>el.style.setProperty('--stars-visibility','1'))")
 assert star.evaluate("el=>+getComputedStyle(el).opacity===0")
 page.evaluate("PLUVIA.sky.apply(0,1,null,{lat:-3.119,lon:-60.022,timezone:'America/Manaus'},Date.parse('2026-10-01T16:00Z'));[document.documentElement,document.body].forEach(el=>el.style.setProperty('--stars-visibility','1'))")
 assert star.evaluate("el=>+getComputedStyle(el).opacity===0")
 page.emulate_media(reduced_motion='no-preference')
 # Sample native animation frames; no accelerated/flashing video in artifacts.
 lightning=[]
 for width,height in [(320,740),(390,844),(1366,768)]:
  page.set_viewport_size({'width':width,'height':height})
  for phase,hour in [('day',15),('night',22)]:
   mode.update(code=95,hour=hour);page.clock.set_fixed_time(datetime.datetime(2026,10,1,hour,tzinfo=datetime.timezone.utc)+datetime.timedelta(hours=4))
   page.goto(preview,wait_until='domcontentloaded');page.locator('#temperature').wait_for(state='visible',timeout=20000)
   page.wait_for_function("document.body.dataset.weather==='storm' && document.querySelector('.sky-effects').dataset.motion==='running' && parseFloat(getComputedStyle(document.querySelector('.sky-effects > .sky-rain:not(.sky-rain-back)')).opacity)>.5")
   page.wait_for_function("(()=>{for(let el=document.getElementById('temperature');el;el=el.parentElement)if(+getComputedStyle(el).opacity<.99)return false;return true;})()")
   assert page.locator('.sky-effects > .sky-lightning').evaluate("el=>getComputedStyle(el).display")=='block'
   sample=page.evaluate("""()=>{
     const scene=document.querySelector('.sky-effects');
     window.stormAnimations=scene.getAnimations({subtree:true}).filter(a=>['sky-rain-fall','storm-flash-near','storm-flash-far'].includes(a.animationName));
     for(const a of stormAnimations){const t=a.effect.getTiming();a.pause();a.currentTime=t.delay+t.duration*(1+(a.animationName==='storm-flash-near'?.30:a.animationName==='storm-flash-far'?.5:.55));}
     const l=scene.querySelector('.sky-lightning');
     return {names:stormAnimations.map(a=>a.animationName),near:+getComputedStyle(l,'::before').opacity,far:+getComputedStyle(l,'::after').opacity,
       drops:[...scene.querySelectorAll('.sky-rain')].map(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)};
   }""")
   assert sorted(sample['names'])==['sky-rain-fall','sky-rain-fall','storm-flash-far','storm-flash-near'],sample
   assert 0<sample['near']<=.53 and sample['far']==0 and all(abs(y-264)<1 for y in sample['drops']),sample
   page.screenshot(path=str(output/(str(width)+'-lightning-'+phase+'-near.png')))
   page.evaluate("""()=>{for(const a of stormAnimations){const t=a.effect.getTiming();if(a.animationName.startsWith('storm-flash'))a.currentTime=t.delay+t.duration*(a.animationName==='storm-flash-far'?.67:.5);}}""")
   assert page.locator('.sky-effects > .sky-lightning').evaluate("el=>+getComputedStyle(el,'::after').opacity>0 && +getComputedStyle(el,'::before').opacity===0")
   page.screenshot(path=str(output/(str(width)+'-lightning-'+phase+'-far.png')))
   lightning.append({'viewport':width,'phase':phase,'localizedPeak':sample['near']})
 # Visibility pause includes both pseudo-elements, not just the rain nodes.
 # Reload removes play-state overrides used only to inspect individual frames.
 page.goto(preview,wait_until='domcontentloaded');page.locator('#temperature').wait_for(state='visible',timeout=20000)
 page.wait_for_function("document.body.dataset.weather==='storm' && document.querySelector('.sky-effects').dataset.motion==='running'")
 page.evaluate("window.stormAnimations=document.querySelector('.sky-effects').getAnimations({subtree:true}).filter(a=>['sky-rain-fall','storm-flash-near','storm-flash-far'].includes(a.animationName));document.body.classList.add('page-hidden')")
 assert page.locator('.sky-effects > .sky-lightning').evaluate("el=>['::before','::after'].every(p=>getComputedStyle(el,p).animationPlayState==='paused')")
 assert page.evaluate("stormAnimations.every(a=>a.playState==='paused')")
 page.evaluate("document.body.classList.remove('page-hidden');window.scrollTo({top:document.body.scrollHeight,behavior:'instant'})")
 page.wait_for_function("document.querySelector('.sky-effects').dataset.motion==='paused'")
 assert page.locator('.sky-effects > .sky-lightning').evaluate("el=>['::before','::after'].every(p=>getComputedStyle(el,p).animationPlayState==='paused')")
 page.evaluate("window.scrollTo({top:0,behavior:'instant'})");page.wait_for_function("scrollY===0 && document.querySelector('.sky-effects').dataset.motion==='running'")
 page.evaluate("window.rainAnimations=[...document.querySelectorAll('.sky-effects > .sky-rain')].map(el=>el.getAnimations().find(a=>a.animationName==='sky-rain-fall'));PLUVIA.sky.apply(65,1,null,{lat:-3.119,lon:-60.022,timezone:'America/Manaus'})")
 assert page.evaluate("[...document.querySelectorAll('.sky-effects > .sky-rain')].every((el,i)=>el.getAnimations().includes(rainAnimations[i]))")
 assert page.locator('.sky-effects > .sky-lightning').evaluate("el=>getComputedStyle(el).display")=='none'
 page.evaluate("PLUVIA.sky.apply(null,null,null,{lat:-3.119,lon:-60.022,timezone:'America/Manaus'})")
 assert all(s=='paused' for s in page.locator('.sky-effects > .sky-rain').evaluate_all("els=>els.map(el=>getComputedStyle(el).animationPlayState)"))
 page.emulate_media(reduced_motion='reduce')
 # A legacy writer can retain wet opacity variables; the weather gate still wins.
 page.evaluate("[document.documentElement,document.body].forEach(el=>{el.style.setProperty('--rain-opacity','.8');el.style.setProperty('--rain-back-opacity','.8');})")
 assert all(s==0 for s in page.locator('.sky-effects > .sky-rain').evaluate_all("els=>els.map(el=>+getComputedStyle(el).opacity)"))
 page.evaluate("PLUVIA.sky.apply(95,0,null,{lat:-3.119,lon:-60.022,timezone:'America/Manaus'})")
 assert page.locator('.sky-effects > .sky-lightning').evaluate("el=>getComputedStyle(el).display")=='none'
 assert page.evaluate("document.querySelector('.sky-effects').getAnimations({subtree:true}).length===0")
 assert not errors,errors
 print(json.dumps({'screenshots':report,'cloudCoverage':coverage,'celestialOcclusion':occlusion,'lightning':lightning,'normalStars':normal_stars,'seamlessBoundedLayers':True,'continuousDrift':True,'preservedAnimationObjects':True,'nightStars':True,'starWeatherGate':True,'rainDepth':True,'offscreenPause':True,'backgroundPseudoPause':True,'clearSkyPause':True,'reducedMotion':True,'errors':errors}))
 context.close();browser.close()

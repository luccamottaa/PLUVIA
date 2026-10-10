"""Open-Meteo fora do ar: previsão reduzida do MET Norway, dados salvos e mensagens claras.
Somente fixtures; nenhuma API real é consultada."""
import datetime,json,os,shutil,subprocess
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
# WebKit relata como pageerror (sem stack) a consulta do RainViewer cancelada por navegação/recarga;
# o radar compacto da Home inicia cedo no desktop. Só esta mensagem de rede é ignorada; exceções JS falham.
RAINVIEWER_CANCELLED='/api.rainviewer.com/public/weather-maps.json due to access control checks.'
root=Path(__file__).resolve().parent.parent
base=json.loads(subprocess.check_output(['node','-e',"process.stdout.write(JSON.stringify(require('./tests/support/forecast.cjs').forecast()))"],cwd=root,text=True))
preview=os.environ.get('PLUVIA_PREVIEW_URL','http://127.0.0.1:4173')
output=Path(os.environ.get('PLUVIA_QA_OUTPUT','/tmp/pluvia-resilience'))/'resilience';output.mkdir(parents=True,exist_ok=True)
fixed=datetime.datetime(2026,10,6,18,20,tzinfo=datetime.timezone.utc)
mode={'open_meteo':'down','met':'up','offline':False};calls={'open_meteo':0,'met':0};errors=[]
def weather(tz):
 data=json.loads(json.dumps(base));data['timezone']=tz;local=fixed.astimezone(datetime.timezone(datetime.timedelta(hours=-4)))
 data['current']['time']=local.strftime('%Y-%m-%dT%H:%M')
 for i in range(72):data['hourly']['time'][i]=(local.replace(minute=0,tzinfo=None)+datetime.timedelta(hours=i-1)).isoformat(timespec='minutes')
 for i in range(8):
  day=(local.date()+datetime.timedelta(days=i)).isoformat();data['daily']['time'][i]=day;data['daily']['sunrise'][i]=day+'T05:50';data['daily']['sunset'][i]=day+'T17:55'
 return data
def met():
 start=fixed.replace(minute=0)-datetime.timedelta(hours=1);hourly=[]
 for i in range(60):
  at=start+datetime.timedelta(hours=i)
  hourly.append({'time':at.strftime('%Y-%m-%dT%H:%M:%SZ'),'temperatureC':27.5,'humidity':72,'pressureHpa':1009,'cloudCover':70,'windKmh':11,'gustKmh':24,'windDirection':80,'precipitationNextHourMm':1.2 if 4<=i<=6 else 0,'symbol':'lightrain' if 4<=i<=6 else 'cloudy'})
 return {'source':'MET Norway','time':hourly[1]['time'],'temperatureC':27.5,'windKmh':11,'precipitation':None,'hourly':hourly,'attribution':'Dados do MET Norway · CC BY 4.0'}
with sync_playwright() as p:
 browser=p.webkit.launch() if os.environ.get('PLUVIA_BROWSER')=='webkit' else p.chromium.launch(args=['--no-sandbox'],**({'executable_path':shutil.which('chromium')} if shutil.which('chromium') else {}))
 context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,timezone_id='Asia/Tokyo',service_workers='block',reduced_motion='reduce')
 def route(r):
  url=r.request.url
  # As rotas têm precedência sobre o modo offline do navegador: a queda é simulada aqui também.
  if mode['offline'] and urlparse(url).hostname not in ['127.0.0.1','localhost']:r.abort('internetdisconnected');return
  if 'api.open-meteo.com/v1/forecast' in url:
   calls['open_meteo']+=1
   if mode['open_meteo']=='down':r.fulfill(status=503,body='{}',content_type='application/json');return
   r.fulfill(json=weather(parse_qs(urlparse(url).query).get('timezone',['America/Manaus'])[0]));return
  if 'functions/v1/met-forecast' in url:
   calls['met']+=1
   if mode['met']=='down':r.fulfill(status=502,body='{"error":"provider_unavailable"}',content_type='application/json');return
   r.fulfill(json=met());return
  if 'air-quality-api' in url:r.abort();return
  if 'inmet.gov.br' in url:r.fulfill(json={'hoje':[]});return
  if 'rainviewer' in url:r.fulfill(headers={'Access-Control-Allow-Origin':'*'},json={'host':'https://radar.test','radar':{'past':[]}});return
  if '/auth/v1/settings' in url:r.fulfill(json={'external':{'email':True,'google':False,'apple':False}});return
  if urlparse(url).hostname in ['127.0.0.1','localhost']:r.continue_();return
  r.abort()
 context.route('**/*',route)
 context.add_init_script("sessionStorage.setItem('pluvia-intro-seen','1');localStorage.setItem('pluvia-city',JSON.stringify('1302603'));Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(s,e){e({code:1})}}});")
 page=context.new_page();page.on('pageerror',lambda e: None if str(e).endswith(RAINVIEWER_CANCELLED) else errors.append(str(e)))
 page.clock.install(time=fixed.timestamp())
 report={}
 # 1. Open-Meteo fora do ar, sem dados salvos: previsão reduzida do MET com aviso.
 page.goto(preview,wait_until='domcontentloaded');page.clock.run_for(2000)
 page.wait_for_function("document.getElementById('temperature').textContent==='28'",timeout=30000)
 state=page.evaluate("""()=>({status:document.getElementById('statusText').textContent,toast:document.getElementById('errorMessage').textContent,toastShown:document.getElementById('errorToast').classList.contains('show'),
   condition:document.getElementById('condition').textContent,feels:document.getElementById('heroRange').textContent,uv:document.getElementById('uv').textContent,
   rain:document.getElementById('rainAnswer').textContent,hours:document.querySelectorAll('#hourlyPeek [data-hour-index]').length,days:document.querySelectorAll('#forecastList [data-day-index]').length,cached:localStorage.getItem('pluvia-weather-1302603')})""")
 assert 'Previsão reduzida · MET Norway' in state['status'],state
 assert state['toastShown'] and 'previsão reduzida do MET Norway' in state['toast'],state
 assert 'Sensação' not in state['feels'] and state['uv'].startswith('--'),'campos que o MET não entrega ficam indisponíveis, não zero'
 assert state['rain']=='Leve guarda-chuva: chuva fraca a partir das 17h.',state['rain']
 assert state['hours']>=5 and 1<=state['days']<=3 and state['cached'] is None,state
 assert calls['open_meteo']==3,calls
 page.screenshot(path=str(output/'reduced.png'));report['reduced']=state
 # 2. A fonte principal volta: a nova tentativa automática (1 min) restaura a previsão completa.
 mode['open_meteo']='up';page.clock.run_for(61000)
 page.wait_for_function("document.getElementById('statusText').textContent.startsWith('Atualizado')",timeout=20000)
 assert page.evaluate("document.getElementById('heroRange').textContent.includes('Sensação')")
 report['recovered']=True
 # 3. As duas fontes fora com dado salvo recente: mostra o salvo, uma única mensagem.
 mode.update(open_meteo='down',met='down');page.reload(wait_until='domcontentloaded');page.clock.run_for(2000)
 page.wait_for_function("document.getElementById('dataStatus').dataset.freshness==='stale' && /^Sem confirmação atual · atualizado às \\d\\d:\\d\\d \\(/.test(document.getElementById('statusText').textContent)",timeout=30000)
 assert 'última previsão salva' in page.locator('#errorMessage').text_content()
 page.screenshot(path=str(output/'saved.png'));report['savedFallback']=True
 # 4. Conexão cai com o app aberto: o status mostra na hora o horário da última atualização,
 # e a consulta sem rede não fica repetindo (falha rápida, sem as esperas de 1s/3s).
 mode.update(open_meteo='up',met='up');page.reload(wait_until='domcontentloaded');page.clock.run_for(2000)
 page.wait_for_function("document.getElementById('statusText').textContent.startsWith('Atualizado')",timeout=30000)
 context.set_offline(True);mode['offline']=True
 page.wait_for_function("/^Sem internet · atualizado às \\d\\d:\\d\\d \\(agora\\)$/.test(document.getElementById('statusText').textContent)",timeout=10000)
 before=calls['open_meteo']
 took=page.evaluate("async()=>{const t=performance.now();await refreshAll();return performance.now()-t;}")
 assert took<2500,('sem rede, a consulta falha rápido, sem esperar as novas tentativas',took)
 assert page.evaluate("document.getElementById('temperature').textContent")!='--' and page.locator('#statusText').text_content().startswith('Sem internet · atualizado às'),page.locator('#statusText').text_content()
 page.screenshot(path=str(output/'offline.png'));report['offline']={'status':page.locator('#statusText').text_content(),'refreshMs':round(took)}
 context.set_offline(False);mode['offline']=False
 page.wait_for_function("document.getElementById('statusText').textContent.startsWith('Atualizado')",timeout=20000)
 report['backOnline']=True
 assert not errors,errors
 browser.close()
print(json.dumps({**report,'errors':errors},ensure_ascii=False))

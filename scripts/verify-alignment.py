"""Geometry regressions for aligned readings, wrapped text and dialog controls.
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
 # The loading skeleton also fills the hourly strip: wait for the six rendered hours,
 # and report page errors/markup instead of a bare empty measurement if they never come.
 try:page.wait_for_function("document.querySelectorAll('#hourlyPeek .hourly-peek-item[data-hour-index]').length>=6",timeout=15000)
 except Exception as error:raise AssertionError({'errors':errors,'hourlyPeek':page.evaluate("document.getElementById('hourlyPeek').innerHTML.slice(0,600)"),'loading':page.evaluate("document.getElementById('weatherView').className")}) from error
 page.evaluate('document.fonts.ready')
 # A real long municipality name with cloned fixture coordinates, only in QA.
 page.evaluate("cityById.set('3305158',{...cityById.get('1302603'),id:'3305158',name:'São José do Vale do Rio Preto',uf:'RJ'});favorites.add('1302603');favorites.add('3305158');dispatchEvent(new CustomEvent('pluvia:favorites-changed'))")

 def boxes(selector):
  # Query and measure together: favorite refresh can detach locator handles.
  # Native CSS selectors use the visibility filter below instead of :visible.
  return page.evaluate("selector=>[...document.querySelectorAll(selector)].filter(el=>el.getClientRects().length && getComputedStyle(el).visibility!=='hidden').map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent.trim().slice(0,70),x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,centerX:r.x+r.width/2,centerY:r.y+r.height/2}})",selector.replace(':visible',''))
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
  # Refresh may replace a card while Playwright waits for its old handle to be
  # stable. Resolve and scroll synchronously, then measure the current cards.
  page.evaluate("document.querySelector('#dialogFavoriteList > .favorite-city-card:last-child').scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'})")
  viewport,card=boxes('#dialogFavoriteList,#dialogFavoriteList > .favorite-city-card:last-child')
  assert card['x']>=viewport['x']-1 and card['x']+card['width']<=viewport['x']+viewport['width']+1,(width,card,viewport)
  # A partially visible row during scrolling is normal; the last row must be
  # fully accessible without escaping the dialog's scrolling area.
  page.evaluate("[...document.querySelectorAll('#cityResults .city-result')].at(-1).scrollIntoView({block:'end',inline:'nearest',behavior:'instant'})")
  result_bounds=boxes('#cityDialog .dialog-scroll,#cityResults .city-result')
  assert len(result_bounds)>1,result_bounds
  area,row=result_bounds[0],result_bounds[-1]
  assert row['y']>=area['y']-1 and row['y']+row['height']<=area['y']+area['height']+1,(width,row,area)
  carousel.evaluate('el=>el.scrollLeft=0');scroll.evaluate('el=>el.scrollTop=0')
 def home(width,label):
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),(width,label)
  report={'width':width,'period':label}
  # A linha da chance só existe quando alguma das 24 horas tem >= 20%; aí ela é reservada em todas.
  hours=page.evaluate("document.querySelectorAll('#hourlyPeek .hourly-peek-item[data-hour-index]').length")
  assert 6<=hours<=24,hours
  rain_row=page.evaluate("document.getElementById('hourlyPeek').dataset.rain")
  assert rain_row in ('some','none'),rain_row
  for field in ['.peek-time','.peek-icon','.hourly-peek-item > strong']+(['.peek-rain'] if rain_row=='some' else []):
   report[field]=aligned(field,count=hours)
  if rain_row=='none': assert not boxes('.peek-rain'),(width,label)
  report['summaryLabels']=aligned('.quick-metrics > .quick-metric:first-child .metric-head > span:first-child,.hero-temperature-extreme small',count=3)
  report['summaryValues']=aligned('#feelsLike,#todayHigh,#todayLow',count=3)
  summary_icons='.quick-metrics > .quick-metric:first-child [data-weather-icon-name] svg,.hero-temperature-extreme [data-weather-icon-name] svg'
  report['summaryIcons']=aligned(summary_icons,'centerY',3)
  for icon in report['summaryIcons']:
   assert icon['width']==icon['height']==28,(width,label,icon)
  for selector in ['.quick-metrics > .quick-metric:first-child','.hero-temperature-extreme']:
   for column in page.locator(selector).all():
    geometry=column.evaluate("el=>{const icon=el.querySelector('[data-weather-icon-name] svg'),heading=el.querySelector('.metric-head'),label=heading.firstElementChild,value=el.querySelector('strong');const box=n=>{const r=n.getBoundingClientRect();return {center:r.x+r.width/2,x:r.x,right:r.right,y:r.y,bottom:r.bottom}};return {column:box(el),icon:box(icon),label:box(label),value:box(value),loaded:icon.classList.contains('metric-line-icon')&&icon.querySelector('path')!==null,decorative:icon.getAttribute('aria-hidden')==='true'&&icon.getAttribute('focusable')==='false'};}")
    assert geometry['loaded'] and geometry['decorative'],geometry
    assert max(v['center'] for v in geometry.values() if isinstance(v,dict))-min(v['center'] for v in geometry.values() if isinstance(v,dict))<=1,geometry
    assert geometry['icon']['bottom']<=geometry['label']['y'] and geometry['label']['bottom']<=geometry['value']['y'],geometry
    assert all(geometry['column']['x']-1<=geometry[k]['x'] and geometry[k]['right']<=geometry['column']['right']+1 for k in ['icon','label','value']),geometry
  aligned('.topbar .account-trigger,.topbar .brand,.topbar .top-actions','centerY',3)
  aligned('.topbar .top-actions > *','centerY')
  # Center the whole reading, not only the number while its degree hangs outside.
  # The same axis belongs to the brand, municipality and condition.
  reading=page.locator('#temperature')
  original=reading.inner_text()
  for value in [original,'9','31','-12','100','--']:
   reading.evaluate('(el,value)=>el.textContent=value',value)
   number,degree=boxes('#temperature,.temperature .deg')
   axis=boxes('.weather-main')[0]['centerX']
   assert abs((number['x']+degree['right'])/2-axis)<=1,(width,value,number,degree,axis)
   assert degree['x']>=number['right'] and number['x']>=0 and degree['right']<=width,(width,value,number,degree)
   for item in boxes('.topbar .brand,#cityName,#condition'):
    assert abs(item['centerX']-axis)<=1,(width,item,axis)
  reading.evaluate('(el,value)=>el.textContent=value',original)
  account=page.locator('#accountButton');greeting=account.inner_text()
  for name in [greeting,'Olá, Lucca','Olá, Maria Eduarda Albuquerque']:
   account.evaluate('(el,value)=>el.textContent=value',name)
   button,brand,actions=boxes('#accountButton,.topbar .brand,.topbar .top-actions')
   assert button['right']<=brand['x']-5 and brand['right']<=actions['x']-5,(width,name,button,brand,actions)
   assert button['height']>=44,(width,button)
   aligned('#accountButton,.topbar .brand,.topbar .top-actions','centerY',3)
  account.evaluate('(el,value)=>el.textContent=value',greeting)
  for item in boxes('.topbar .top-actions > button'):
   assert item['width']>=44 and item['height']>=44,(width,item)
  # Every full-width section uses the same page gutters, including the footer.
  edges=boxes('#top,#weatherView,footer')
  assert len(edges)==3 and max(b['x'] for b in edges)-min(b['x'] for b in edges)<=1,(width,edges)
  assert max(b['right'] for b in edges)-min(b['right'] for b in edges)<=1,(width,edges)
  # Measure parent and number in one frame: WebKit can restore scroll position
  # between protocol calls after a viewport change or selected-city refresh.
  wind_row,wind_reading=boxes('.wind-reading,#wind')
  reading_y=wind_reading['centerY']
  assert abs(reading_y-wind_row['centerY'])<=1,(width,reading_y,wind_row)
  wind_parts=page.locator('#wind').evaluate("el=>{const range=document.createRange();range.selectNodeContents(el.firstChild);const number=range.getBoundingClientRect(),unit=el.querySelector('sup').getBoundingClientRect();return {numberTop:number.top,numberBottom:number.bottom,numberRight:number.right,unitLeft:unit.left,unitCenterY:unit.y+unit.height/2}}")
  assert wind_parts['unitLeft']>=wind_parts['numberRight']-1 and wind_parts['numberTop']<=wind_parts['unitCenterY']<=wind_parts['numberBottom'],(width,wind_parts)
  # Radar compacto: na Home só a miniatura (sem player); o player alinhado é medido no radar ampliado.
  assert not boxes('.weather-map-card .weather-player > *'),(width,'player só no radar ampliado')
  # Rodapé compacto: links lado a lado (quebram quando não cabem), cada linha centralizada e sem sobreposição.
  links=boxes('footer .footer-link');assert len(links)==3,links
  center=page.evaluate("(()=>{const r=document.querySelector('footer .footer-details').getBoundingClientRect();return r.x+r.width/2})()")
  for row_y in {round(b['y']) for b in links}:
   row=sorted([b for b in links if round(b['y'])==row_y],key=lambda b:b['x'])
   assert abs((row[0]['x']+row[-1]['right'])/2-center)<=2,(width,row,center)
   assert all(a['right']<=b['x'] for a,b in zip(row,row[1:])),row
  rows=page.evaluate("""()=>[...document.querySelectorAll('.forecast-row')].map(el=>{
   const box=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,centerY:r.y+r.height/2}};
   return {geometry:Object.fromEntries([...el.children].filter(c=>c.getClientRects().length).map(c=>[c.className,box(c)])),condition:box(el.querySelector('.forecast-condition')),text:box(el.querySelector('.forecast-condition > span'))};
  })""")
  assert len(rows)==7
  for row in rows:
   geometry=row['geometry']
   # Uma linha por dia em todas as larguras; a nota opcional (chuva/UV) fica abaixo, e no desktop começa na coluna da condição.
   line={key:value for key,value in geometry.items() if key!='forecast-uv'}
   centers=[b['centerY'] for b in line.values()]
   assert max(centers)-min(centers)<=1,(width,geometry)
   if 'forecast-uv' in geometry:
    note=geometry['forecast-uv']
    assert note['y']>=max(b['y']+b['height'] for b in line.values())-1,(width,geometry)
    if width>720:assert abs(note['x']-geometry['forecast-condition']['x'])<=1,(width,geometry)
   # Sem a quinta coluna vazia: a chuva termina na borda direita da linha.
   if width>720:assert abs(geometry['forecast-rain']['right']-max(b['right'] for b in line.values()))<=1,(width,geometry)
   condition=row['condition'];text=row['text']
   assert text['x']+text['width']<=condition['x']+condition['width']+1,(width,text,condition)
   if width>720:assert condition['x']+condition['width']<=geometry['temp-range']['x']+1,geometry
  report['tracks']=aligned('.temp-track','x',7)
  aligned('.temp-track','width',7)
  # Sol | Lua: nascer e pôr empilhados no bloco do Sol, valores na mesma borda direita.
  aligned('.sun-times > div > strong','right',2)
  headings=page.evaluate("()=>[...document.querySelectorAll('#weatherView .section-heading')].map(el=>[...el.children].filter(c=>c.getClientRects().length).map(c=>{const r=c.getBoundingClientRect();return {y:r.y,bottom:r.bottom,centerY:r.y+r.height/2}}))")
  for parts in headings:
   if len(parts)==2:
    if width>720:assert abs(parts[0]['centerY']-parts[1]['centerY'])<=1,parts
    else:assert parts[1]['y']>=parts[0]['bottom']-1,parts
  metrics=page.evaluate("()=>[...document.querySelectorAll('.metrics .uv-metric')].map(el=>[...el.querySelectorAll(':scope > .metric-head,:scope > strong,:scope > .wind-reading')].map(node=>{const r=node.getBoundingClientRect();return r.y+r.height/2}))")
  for pair in metrics:
   assert len(pair)==2 and abs(pair[0]-pair[1])<=1,pair
  # Leituras em grade: tiles da mesma fileira compartilham as linhas de rótulo, valor e nota, sem sobreposição.
  tiles=page.evaluate("""()=>[...document.querySelectorAll('.metrics .metric-sky')].map(el=>{
   const center=node=>{const r=node.getBoundingClientRect();return r.y+r.height/2};const box=el.getBoundingClientRect();
   return {top:Math.round(box.y),left:box.x,right:box.right,head:center(el.querySelector(':scope > .metric-head')),value:center(el.querySelector(':scope > strong,:scope > .wind-reading')),note:el.querySelector(':scope > small').getBoundingClientRect().y};
  })""")
  assert len(tiles)==4,tiles
  tile_rows={}
  for tile in tiles:tile_rows.setdefault(tile['top'],[]).append(tile)
  assert all(len(group)>=2 for group in tile_rows.values()),(width,tile_rows)
  for group in tile_rows.values():
   for key in ['head','value','note']:assert max(t[key] for t in group)-min(t[key] for t in group)<=1,(width,key,group)
   ordered=sorted(group,key=lambda t:t['left'])
   for a,b in zip(ordered,ordered[1:]):assert a['right']<=b['left']+1,(width,a,b)
  page.evaluate("document.getElementById('hourlyChartDetails').open=true")
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
  header('#cityDialog .dialog-heading');aligned('#cityDialog .city-actions > :not(#compareOpen):not(#brazilOpen)','centerY',2);aligned('#cityDialog .city-actions > :is(#compareOpen,#brazilOpen)','centerY',2)
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
  page.locator('#expandRadar').click();page.wait_for_function("document.getElementById('radarDialog').open")
  aligned('#radarDialog .weather-player > *','centerY',4)
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
   # Com 24 horas o pôr do sol entra na fileira nos dois casos; às 15h ele cai entre os seis primeiros.
   first=page.evaluate("[...document.querySelectorAll('#hourlyPeek .hourly-peek-item')].slice(0,6).map(e=>e.textContent).join(' ')")
   assert 'Pôr do sol' in page.locator('#hourlyPeek').text_content()
   assert ('Pôr do sol' in first)==(label=='sunset'),first
   screenshot(str(width)+'-peek-'+label,'.hourly-peek')
   if width==390 and label=='day':
    screenshot(str(width)+'-quick-day','.quick-metrics')
    screenshot(str(width)+'-metrics-day','.metrics')
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
 print(json.dumps({'browser':os.environ.get('PLUVIA_BROWSER','chromium'),'viewports':7,'homeLayouts':len(reports),'solarEvents':True,'longFavorites':True,'mixedTemperatureWidths':True,'heroReadingAxis':True,'longAccountNames':True,'pageGutters':True,'windUnitInline':True,'dialogs':True,'errors':errors,'output':str(output)}))
 browser.close()

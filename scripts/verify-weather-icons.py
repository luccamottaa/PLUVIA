"""Paint the real local icon catalog in Chromium/WebKit; no meteorological requests."""
import json, os, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

repo = Path(__file__).resolve().parent.parent
preview = os.environ.get('PLUVIA_PREVIEW_URL', 'http://127.0.0.1:4173').rstrip('/') + '/'
output = Path(os.environ.get('PLUVIA_QA_OUTPUT', str(Path(tempfile.gettempdir()) / 'pluvia-qa')))
output.mkdir(parents=True, exist_ok=True)
engine = os.environ.get('PLUVIA_BROWSER', 'chromium')

with sync_playwright() as p:
    browser = p.webkit.launch(headless=True) if engine == 'webkit' else p.chromium.launch(
        headless=True, args=['--no-sandbox'], **({'executable_path': shutil.which('chromium')} if shutil.which('chromium') else {}))
    page = browser.new_page(viewport={'width':1100,'height':900}, service_workers='block')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('**/*', lambda route: route.continue_() if route.request.url.startswith(preview) and route.request.method == 'GET' else route.abort())
    # A JSON asset establishes the preview origin without starting Auth or weather services.
    page.goto(preview + 'assets/weather-icons/catalog.json', wait_until='domcontentloaded')
    page.set_content('<base href="' + preview + '"><style>body{margin:0;font:13px system-ui}section{padding:24px;display:grid;grid-template-columns:repeat(6,1fr);gap:20px 12px}h2{grid-column:1/-1;font-size:18px;margin:0}article{text-align:center}figure{height:80px;margin:0;display:flex;align-items:center;justify-content:center;gap:12px}img{display:block;object-fit:contain}label{display:block;margin-top:8px;font-size:12px}.night{background:#0c162b;color:#fff}.day{background:#bdd6ea;color:#172b45}</style>')
    page.add_script_tag(path=str(repo/'dist/modules/weather-icon-system.js'))
    result = page.evaluate("""async () => {
      const api=PLUVIA.weatherIcons, names=Object.keys(api.ASSETS.conditions), checks=[], groups=[['conditions',[32,72]],['metrics',[24,48]]];
      for(const [category,sizes] of groups) {
      for(const background of ['night','day']) {
        const section=document.createElement('section');section.className=background;
        section.innerHTML='<h2>PLUVIA · '+(category==='metrics'?'Indicadores':'Condições')+' · '+(background==='night'?'Fundo noturno':'Fundo diurno')+' · '+sizes.join(' / ')+' px</h2>';
        document.body.append(section);
        for(const name of Object.keys(api.ASSETS[category])) {
          const article=document.createElement('article');
          article.innerHTML='<figure>'+sizes.map(size=>api.markupName(name,{size,eager:true,decorative:true})).join('')+'</figure><label>'+name+'</label>';
          section.append(article);
          for(const img of article.querySelectorAll('img')) {
            await img.decode();
            if(img.naturalWidth!==128 || img.naturalHeight!==128)throw Error('Invalid intrinsic size: '+name);
            if(img.alt!=='' || img.getAttribute('aria-hidden')!=='true')throw Error('Decorative icon became redundant accessible text');
            const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
            const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,128,128);
            const pixels=ctx.getImageData(0,0,128,128).data;let count=0,minX=128,minY=128,maxX=-1,maxY=-1;
            for(let y=0;y<128;y++)for(let x=0;x<128;x++)if(pixels[(y*128+x)*4+3]>8) {
              count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
            }
            if(count<128*128*.01)throw Error('Empty/unreadable icon: '+name);
            if(minX<2 || minY<2 || maxX>125 || maxY>125)throw Error('Clipped artwork: '+name+' '+[minX,minY,maxX,maxY]);
            const rect=img.getBoundingClientRect();
            if(rect.width!==Number(img.width) || rect.height!==Number(img.height))throw Error('Distorted icon: '+name);
            canvas.width=canvas.height=img.width;ctx.drawImage(img,0,0,img.width,img.height);
            const scaled=ctx.getImageData(0,0,img.width,img.height).data;let smallPainted=0;
            for(let i=3;i<scaled.length;i+=4)if(scaled[i]>8)smallPainted++;
            if(smallPainted<img.width*img.height*.01)throw Error('Icon disappeared at '+img.width+'px: '+name);
            if(getComputedStyle(img).animationName!=='none')throw Error('Unexpected decorative animation');
            checks.push({name,category,background,size:img.width,bounds:[minX,minY,maxX,maxY],painted:count,paintedAtSize:smallPainted});
          }
        }
      }
      }
      const codeMappings=Object.keys(api.CONDITIONS).map(code=>[Number(code),api.icon(Number(code),true).name,api.icon(Number(code),false).name]);
      if(codeMappings.some(([,day,night])=>!names.includes(day)||!names.includes(night)))throw Error('WMO mapping has no artwork');
      return {icons:names.length,metricIcons:Object.keys(api.ASSETS.metrics).length,paintChecks:checks.length,codeMappings,checks};
    }""")
    page.screenshot(path=str(output/(engine+'-weather-icons.png')), full_page=True)
    page.emulate_media(reduced_motion='reduce')
    assert page.locator('img').evaluate_all("images=>images.every(img=>getComputedStyle(img).animationName==='none')")
    assert not errors, errors
    print(json.dumps({'browser':engine,**result,'errors':errors}))
    browser.close()

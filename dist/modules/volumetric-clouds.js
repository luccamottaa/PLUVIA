/* Nuvens volumétricas (1.33: noite; 1.34: dia com o brilho do Sol; 1.35: todos os céus com nuvem, pôr/nascer do
   sol e intro, pedidos do dono). Um <canvas> pequeno desenha nuvens em 3D por raymarching (WebGL 1): ruído
   fractal numa camada de céu, luz de cima com sombra própria e base mais cinza. O canvas tem 50% da resolução da
   tela em CSS px e o navegador o amplia (nuvem é macia; isso deixa o custo pequeno no celular). Fundo
   transparente: o céu, o Sol e a Lua do CSS continuam atrás, e a nuvem cobre os astros.
   O mesmo canvas (um contexto só) fica na intro enquanto ela aparece e passa para .sky-effects quando ela sai.
   Desenha a ~24 quadros por segundo só com a cena rodando (data-motion="running", que para com a página oculta
   e fora da tela). Sem WebGL, com movimento reduzido, contexto perdido ou quadros lentos demais, volta às camadas
   de nuvem do CSS (data-volume sai da raiz) e não tenta de novo nesta sessão.
   É decoração: cobertura e forma não representam medição. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.PLUVIA = root.PLUVIA || {};
    root.PLUVIA.volumeClouds = api;
    if (root.document) api.start(root);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SCALE = .5, FRAME_MS = 41, SLOW_MS = 90, SLOW_SECONDS = 5, OFF_KEY = 'pluvia-volume-off';
  // cap: brilho máximo da nuvem. No nublado de dia o texto branco fica por cima da nuvem: até ~.7 ele continua
  // legível como no deck prateado do CSS (escolha do dono, contraste medido por verify-contrast).
  const PALETTES = {
    'night-few': {lit:'#7a81aa', shade:'#1e2340', cover:.6, dens:2.2, size:.3, edge:2.6, detail:.2, cap:1},
    'night-partly': {lit:'#757ca6', shade:'#1f2442', cover:.53, dens:2.3, size:.3, edge:2.8, detail:.18, cap:1},
    'night-cloud': {lit:'#6c7298', shade:'#232846', cover:.46, dens:2.4, size:.3, edge:3.2, detail:.16, cap:1},
    'night-rain': {lit:'#a2a6ae', shade:'#2b2e34', cover:.4, dens:2.6, size:.22, edge:2.8, detail:.12, cap:1},
    'night-heavy': {lit:'#959aa2', shade:'#24272c', cover:.38, dens:2.8, size:.18, edge:2.6, detail:.1, cap:1},
    'day-few': {lit:'#dfe6f0', shade:'#6a7d9a', cover:.58, dens:2.1, size:.3, edge:2, detail:.28, cap:1},
    'day-partly': {lit:'#dfe6f0', shade:'#667996', cover:.52, dens:2.2, size:.3, edge:2, detail:.28, cap:1},
    'day-cloud': {lit:'#a9b3c2', shade:'#6a7587', cover:.44, dens:2.4, size:.26, edge:2.8, detail:.14, cap:.72},
    'day-rain': {lit:'#99a1ad', shade:'#575f6b', cover:.4, dens:2.6, size:.22, edge:2.6, detail:.12, cap:.66},
    'day-heavy': {lit:'#858c97', shade:'#454b55', cover:.38, dens:2.8, size:.18, edge:2.4, detail:.1, cap:.58},
  };
  // Todo céu com nuvem ganha a nuvem 3D: poucas nuvens, parcial, nublado (e neve), chuva e trovoada, de dia e
  // de noite. Céu limpo não tem nuvem; a neblina continua com a camada própria do CSS.
  function mode(attrs) {
    if (!attrs || (attrs.phase !== 'night' && attrs.phase !== 'day')) return null;
    let name = null;
    if (attrs.weather === 'cloud' || attrs.weather === 'snow') name = 'cloud';
    else if (attrs.weather === 'storm' || (attrs.weather === 'rain' && attrs.rain === 'heavy')) name = 'heavy';
    else if (attrs.weather === 'rain') name = 'rain';
    else if (attrs.weather === 'partly') name = attrs.clouds === 'few' ? 'few' : 'partly';
    return name ? `${attrs.phase}-${name}` : null;
  }
  function hex(value) { return [1,3,5].map(i => parseInt(value.slice(i,i + 2),16) / 255); }

  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = `precision mediump float;
uniform vec2 R,SUNPX;uniform float T,SUNI,TW,SIDE,CAP;uniform vec3 LIT,SHD,SUN;uniform float COVER,DENS,SIZE,EDGE,DETAIL;
vec3 ray(vec2 px){vec2 uv=(px-.5*R)/R.y;return normalize(vec3(uv.x*.9,uv.y*.9+.45,1.));}
float hg(float c,float g){float g2=g*g;return (1.-g2)/(12.566*pow(1.+g2-2.*g*c,1.5));}
float h(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm4(vec3 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*n(p);p=p*2.03+vec3(.1,.2,.3);a*=.5;}return s+.03;}
float fbm3(vec3 p){float a=.5,s=0.;for(int i=0;i<3;i++){s+=a*n(p);p=p*2.03+vec3(.1,.2,.3);a*=.5;}return s+.06;}
// 1.35.1 (pedido do dono: "as nuvens só nascem do lado direito"): o vento empurra devagar e o campo também
// anda na altura, então as nuvens se formam e se desfazem no lugar, em qualquer parte do céu.
vec3 wind(vec3 p){return p*SIZE+vec3(T*.009,T*.011,T*.004);}
float shape(float s,float y){float prof=smoothstep(0.,.12,y)*smoothstep(1.,.45,y);return (s-COVER)*EDGE*prof-(1.-prof)*.3;}
float dens(vec3 p){vec3 q=wind(p);float d=shape(fbm4(q*vec3(1.,.9,1.)),p.y/2.4);
  if(d<=0.)return 0.;d-=(fbm3(q*3.7)-.35)*DETAIL*(1.-clamp(d*2.,0.,1.));return clamp(d*DENS,0.,1.);}
float densLow(vec3 p){float d=shape(fbm3(wind(p)*vec3(1.,.9,1.)),p.y/2.4);return clamp(d*DENS,0.,1.);}
void main(){
  vec3 ro=vec3(0.,-2.2,0.);vec3 rd=ray(gl_FragCoord.xy);
  if(rd.y<=.01){gl_FragColor=vec4(0.);return;}
  // Luz de cima: de dia, o Sol na posição dele na tela (SUNPX) ou o céu claro acima; à noite, a Lua ilustrada.
  // No pôr/nascer do sol (TW) a luz vem baixa, do lado do Sol (SIDE), e pinta a base de laranja e rosa.
  vec3 L=SUNI>0.?ray(SUNPX):SUN;
  L=normalize(mix(L,vec3(SIDE*.9,.12,.45),TW));
  float cosA=dot(rd,L);
  float fwd=(SUNI+TW*.8)*(hg(cosA,.6)*1.4+pow(max(cosA,0.),80.)*2.2);
  vec3 lit=mix(LIT,vec3(1.,.63,.42),TW*.85),shd=mix(SHD,vec3(.34,.27,.42),TW*.7),glow=mix(vec3(1.,.96,.86),vec3(1.,.55,.3),TW);
  float t0=-ro.y/rd.y,t1=min((2.4-ro.y)/rd.y,t0+9.);
  float dt=(t1-t0)/40.;float t=t0+dt*h(vec3(gl_FragCoord.xy,1.));
  vec3 col=vec3(0.);float trans=1.;float depth=0.;
  for(int i=0;i<40;i++){
    if(trans<.02)break;
    vec3 p=ro+rd*t;float d=dens(p);
    if(d>.002){
      vec3 l=p;float s=0.;for(int j=0;j<3;j++){l+=L*.4;s+=densLow(l);}
      float sh=exp(-s*1.1);float powder=1.-exp(-d*4.);float hgt=clamp(p.y/2.4,0.,1.);
      // Topo iluminado e base mais cinza: a luz direta pesa mais no alto da nuvem e o ambiente escurece embaixo.
      float top=.45+.55*smoothstep(.05,.85,hgt);
      vec3 c=mix(shd*.55,shd*1.3,hgt)+lit*sh*powder*1.35*mix(top,1.,TW)+glow*sh*fwd*(1.-powder*.7);
      float a=1.-exp(-d*dt*3.5);col+=c*a*trans;trans*=1.-a;depth+=d*dt;
    }
    t+=dt;
  }
  // Sol escondido atrás da nuvem: o brilho atravessa a parte fina, como na vida real.
  col+=glow*SUNI*pow(max(cosA,0.),90.)*exp(-depth*1.2)*(1.-trans)*1.6;
  float keep=1.-clamp((t0-3.)/14.,0.,1.)*.8;
  // O miolo da nuvem fica opaco (a Lua e o Sol não atravessam), e a cor nunca passa do alfa (pré-multiplicado).
  float A=1.-trans;float A2=min(1.,A*1.4);col*=A>0.?A2/A:0.;
  col=min(col,vec3(A2*CAP));
  gl_FragColor=vec4(col*keep,A2*keep);
}`;

  function start(win) {
    const doc = win.document, html = doc.documentElement;
    let canvas = null, gl = null, uniforms = null, current = null, raf = 0, last = 0, slow = 0, dead = false;
    function off(reason) {
      dead = true; stop();
      try { win.sessionStorage?.setItem(OFF_KEY,reason || '1'); } catch (_) { /* sessão sem storage: só esta página */ }
      delete html.dataset.volume; if (canvas) canvas.remove(); canvas = gl = null;
    }
    function disabledBefore() { try { return !!win.sessionStorage?.getItem(OFF_KEY); } catch (_) { return false; } }
    // A automação de QA (navigator.webdriver) mede as camadas de nuvem do CSS; lá a nuvem volumétrica só liga
    // com pluvia-volume-qa no localStorage.
    function qaBlocked() { try { return !!win.navigator?.webdriver && !win.localStorage?.getItem('pluvia-volume-qa'); } catch (_) { return true; } }
    // Com a chave de QA (WebGL por software na CI) a lentidão não desliga: o QA quer ver o desenho.
    function qaForced() { try { return !!win.localStorage?.getItem('pluvia-volume-qa'); } catch (_) { return false; } }
    function reduced() { return !!win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; }
    function intro() {
      const box = doc.getElementById('pluviaIntro');
      return box && !box.hidden ? box.querySelector('.intro-sky') : null;
    }
    // A cena que está à vista: a da intro enquanto ela aparece, depois a da Home.
    function scene() { return (intro()?.dataset.motion === 'running' && intro()) || doc.querySelector('.sky-effects'); }
    function place() {
      const host = scene(); if (!host || !canvas || canvas.parentNode === host) return;
      const moon = host.querySelector('.sky-moon');
      host.insertBefore(canvas,moon?.nextSibling || null);
      resize(); sunUpdate(win.performance.now());
    }
    function setup() {
      if (!scene()) return false;
      canvas = doc.createElement('canvas'); canvas.className = 'sky-volume'; canvas.setAttribute('aria-hidden','true');
      try { gl = canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,powerPreference:'low-power'}); } catch (_) { gl = null; }
      if (!gl) { canvas = null; return false; }
      const compile = (type, source) => { const s = gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s); if (!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error('shader'); return s; };
      try {
        const program = gl.createProgram();
        gl.attachShader(program,compile(gl.VERTEX_SHADER,VS)); gl.attachShader(program,compile(gl.FRAGMENT_SHADER,FS));
        gl.linkProgram(program); if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error('link');
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
        const at = gl.getAttribLocation(program,'p'); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at,2,gl.FLOAT,false,0,0);
        uniforms = {};
        for (const name of ['R','T','LIT','SHD','SUN','COVER','DENS','SIZE','EDGE','DETAIL','SUNPX','SUNI','TW','SIDE','CAP']) uniforms[name] = gl.getUniformLocation(program,name);
        const sun = [-.5,.75,-.2], len = Math.hypot(...sun); gl.uniform3fv(uniforms.SUN,sun.map(v => v / len));
      } catch (_) { canvas = gl = null; return false; }
      canvas.addEventListener('webglcontextlost',event => { event.preventDefault(); off('lost'); });
      place();
      return true;
    }
    function resize() {
      if (!canvas || !gl) return;
      const w = Math.max(1,Math.round(canvas.clientWidth * SCALE)), h = Math.max(1,Math.round(canvas.clientHeight * SCALE));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0,0,w,h); }
      gl.uniform2f(uniforms.R,w,h);
    }
    function palette(name) {
      const p = PALETTES[name];
      gl.uniform3fv(uniforms.LIT,hex(p.lit)); gl.uniform3fv(uniforms.SHD,hex(p.shade));
      gl.uniform1f(uniforms.COVER,p.cover); gl.uniform1f(uniforms.DENS,p.dens);
      gl.uniform1f(uniforms.SIZE,p.size); gl.uniform1f(uniforms.EDGE,p.edge); gl.uniform1f(uniforms.DETAIL,p.detail);
      gl.uniform1f(uniforms.CAP,p.cap);
    }
    function cssNumber(name) { const value = parseFloat(scene()?.style.getPropertyValue(name)); return Number.isFinite(value) ? value : NaN; }
    function rate() { const value = cssNumber('--cloud-rate'); return value > 0 ? value : 1; }
    // Sol do céu (o mesmo .sky-sun do CSS) em pixels do canvas e luz do crepúsculo, relidos a cada ~2 s: andam
    // pelo relógio de 30 s e a página pode rolar. Sem Sol visível (noite, nublado, chuva), SUNI = 0.
    let sunAt = 0;
    function sunUpdate(now) {
      if (!gl) return;
      sunAt = now || 0;
      const sun = scene()?.querySelector('.sky-sun');
      const visibility = cssNumber('--sun-visibility');
      let intensity = 0;
      if ((current === 'day-few' || current === 'day-partly') && sun && canvas) {
        const box = sun.getBoundingClientRect(), area = canvas.getBoundingClientRect();
        if (box.width > 0 && area.height > 0) {
          const x = (box.left + box.width / 2 - area.left) / area.width * canvas.width;
          const y = (1 - (box.top + box.height / 2 - area.top) / area.height) * canvas.height;
          gl.uniform2f(uniforms.SUNPX,x,y);
          intensity = Number.isFinite(visibility) ? Math.max(0,Math.min(1,visibility)) : 1;
        }
      }
      gl.uniform1f(uniforms.SUNI,intensity);
      // Pôr/nascer do sol: a mesma força da luz do crepúsculo que o CSS usa (--twilight-opacity), do lado do Sol.
      const solar = html.dataset.solar, strength = cssNumber('--twilight-opacity');
      const twilight = (solar === 'sunset' || solar === 'sunrise') && Number.isFinite(strength) ? Math.max(0,Math.min(1,strength)) : 0;
      const sx = cssNumber('--sun-orbit-x');
      gl.uniform1f(uniforms.TW,twilight);
      gl.uniform1f(uniforms.SIDE,Number.isFinite(sx) ? (sx < .5 ? -1 : 1) : (solar === 'sunrise' ? -1 : 1));
    }
    let clock = 0, lastNow = 0;
    function frame() { gl.uniform1f(uniforms.T,20 + clock); gl.drawArrays(gl.TRIANGLES,0,3); }
    function draw(now) {
      raf = win.requestAnimationFrame(draw);
      if (now - last < FRAME_MS) return;
      const gap = now - last; last = now;
      // Quadros lentos por 5 segundos seguidos: o aparelho não aguenta; volta às camadas do CSS.
      if (lastNow && gap > SLOW_MS && !qaForced()) { slow += gap; if (slow > SLOW_SECONDS * 1000) return off('slow'); } else slow = 0;
      clock += lastNow ? Math.min(gap,200) / 1000 * rate() : 0; lastNow = now;
      if (now - sunAt > 2000) sunUpdate(now);
      frame();
    }
    function run() { if (!raf) { last = 0; lastNow = 0; slow = 0; raf = win.requestAnimationFrame(draw); } }
    function stop() { if (raf) win.cancelAnimationFrame(raf); raf = 0; }
    function sync() {
      if (dead) return;
      const next = mode({phase:html.dataset.phase,weather:html.dataset.weather,rain:html.dataset.rain,clouds:html.dataset.clouds});
      if (!next || reduced() || qaBlocked()) { stop(); if (current) { delete html.dataset.volume; current = null; } return; }
      if (!gl && !setup()) return off('unsupported');
      place();
      if (next !== current) { palette(next); current = next; resize(); sunUpdate(win.performance.now()); frame(); }
      else if (html.dataset.solar !== lastSolar) sunUpdate(win.performance.now());
      lastSolar = html.dataset.solar;
      html.dataset.volume = 'on';
      if (scene()?.dataset.motion === 'running') run(); else stop();
    }
    let lastSolar;
    if (disabledBefore()) return {sync() {}};
    const observer = new win.MutationObserver(sync);
    observer.observe(html,{attributes:true,attributeFilter:['data-phase','data-weather','data-rain','data-clouds','data-solar']});
    const watch = () => {
      for (const host of [doc.querySelector('.sky-effects'),doc.querySelector('#pluviaIntro .intro-sky')]) if (host) observer.observe(host,{attributes:true,attributeFilter:['data-motion']});
      const box = doc.getElementById('pluviaIntro'); if (box) observer.observe(box,{attributes:true,attributeFilter:['hidden','class']});
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded',() => { watch(); sync(); },{once:true}); else { watch(); sync(); }
    win.addEventListener('resize',() => { if (gl) { resize(); if (!raf) frame(); } },{passive:true});
    win.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change',sync);
    return {sync};
  }
  return {mode,PALETTES,start,FS};
}));

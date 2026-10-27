/* Nuvens volumétricas da noite (1.33, pedido do dono depois de ver o protótipo: "pode botar no pluvia").
   No nublado, na chuva e na trovoada da noite, um <canvas> pequeno dentro de .sky-effects desenha nuvens em
   3D por raymarching (WebGL): ruído fractal numa camada de céu, luz da Lua de cima com sombra própria e base
   escura. O canvas tem ~35% da resolução da tela em CSS px e o navegador o amplia (nuvem é macia; isso deixa o
   custo pequeno no celular). Fundo transparente: o céu e a Lua do CSS continuam atrás, e a nuvem cobre a Lua.
   Desenha a ~24 quadros por segundo só com a cena rodando (data-motion="running", que já para com a página
   oculta, fora da tela e na intro). Sem WebGL, com movimento reduzido, contexto perdido ou quadros lentos
   demais, volta às camadas de nuvem do CSS (data-volume sai da raiz) e não tenta de novo nesta sessão.
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
  const PALETTES = {
    cloud: {lit:'#6c7298', shade:'#232846', cover:.46, dens:2.4, size:.3, edge:3.2, detail:.16},
    rain: {lit:'#a2a6ae', shade:'#2b2e34', cover:.4, dens:2.6, size:.22, edge:2.8, detail:.12},
    heavy: {lit:'#959aa2', shade:'#24272c', cover:.38, dens:2.8, size:.18, edge:2.6, detail:.1},
    // Dia (1.34, pedido do dono: "se o sol ficar atrás dela podia ter o brilho do sol que nem na vida real").
    'day-few': {lit:'#d3dbe7', shade:'#6c7f9c', cover:.58, dens:2.1, size:.3, edge:2, detail:.28},
    'day-partly': {lit:'#d3dbe7', shade:'#687b98', cover:.52, dens:2.2, size:.3, edge:2, detail:.28},
  };
  // Qual céu ganha a nuvem volumétrica: noite com nublado, chuva ou trovoada; de dia o céu parcial
  // (poucas nuvens ou parcialmente nublado), onde o Sol aparece e pode passar atrás delas.
  function mode(attrs) {
    if (!attrs || (attrs.phase !== 'night' && attrs.phase !== 'day')) return null;
    let name = null;
    if (attrs.weather === 'cloud') name = 'cloud';
    else if (attrs.weather === 'storm' || (attrs.weather === 'rain' && attrs.rain === 'heavy')) name = 'heavy';
    else if (attrs.weather === 'rain') name = 'rain';
    else if (attrs.phase === 'day' && attrs.weather === 'partly') name = attrs.clouds === 'few' ? 'few' : 'partly';
    if (!name) return null;
    // De dia, nublado e chuva continuam com o deck do CSS (o prateado do nublado foi escolha do dono e o texto
    // branco por cima tem contraste medido); só o céu parcial ganha nuvem 3D, onde o Sol pode passar atrás.
    if (attrs.phase === 'day') return name === 'few' || name === 'partly' ? `day-${name}` : null;
    return name;
  }
  function hex(value) { return [1,3,5].map(i => parseInt(value.slice(i,i + 2),16) / 255); }

  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = `precision mediump float;
uniform vec2 R,SUNPX;uniform float T,SUNI;uniform vec3 LIT,SHD,SUN;uniform float COVER,DENS,SIZE,EDGE,DETAIL;
vec3 ray(vec2 px){vec2 uv=(px-.5*R)/R.y;return normalize(vec3(uv.x*.9,uv.y*.9+.45,1.));}
float hg(float c,float g){float g2=g*g;return (1.-g2)/(12.566*pow(1.+g2-2.*g*c,1.5));}
float h(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm4(vec3 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*n(p);p=p*2.03+vec3(.1,.2,.3);a*=.5;}return s+.03;}
float fbm3(vec3 p){float a=.5,s=0.;for(int i=0;i<3;i++){s+=a*n(p);p=p*2.03+vec3(.1,.2,.3);a*=.5;}return s+.06;}
vec3 wind(vec3 p){return p*SIZE+vec3(T*.02,0.,T*.006);}
float shape(float s,float y){float prof=smoothstep(0.,.12,y)*smoothstep(1.,.45,y);return (s-COVER)*EDGE*prof-(1.-prof)*.3;}
float dens(vec3 p){vec3 q=wind(p);float d=shape(fbm4(q*vec3(1.,.9,1.)),p.y/2.4);
  if(d<=0.)return 0.;d-=(fbm3(q*3.7)-.35)*DETAIL*(1.-clamp(d*2.,0.,1.));return clamp(d*DENS,0.,1.);}
float densLow(vec3 p){float d=shape(fbm3(wind(p)*vec3(1.,.9,1.)),p.y/2.4);return clamp(d*DENS,0.,1.);}
void main(){
  vec3 ro=vec3(0.,-2.2,0.);vec3 rd=ray(gl_FragCoord.xy);
  // De dia a luz vem do Sol na posição dele na tela (SUNPX); à noite, da Lua ilustrada (SUN fixo).
  vec3 L=SUNI>0.?ray(SUNPX):SUN;float cosA=dot(rd,L);
  float fwd=SUNI*(hg(cosA,.6)*1.4+pow(max(cosA,0.),80.)*2.2);
  if(rd.y<=.01){gl_FragColor=vec4(0.);return;}
  float t0=-ro.y/rd.y,t1=min((2.4-ro.y)/rd.y,t0+9.);
  float dt=(t1-t0)/40.;float t=t0+dt*h(vec3(gl_FragCoord.xy,1.));
  vec3 col=vec3(0.);float trans=1.;float depth=0.;
  for(int i=0;i<40;i++){
    if(trans<.03)break;
    vec3 p=ro+rd*t;float d=dens(p);
    if(d>.002){
      vec3 l=p;float s=0.;for(int j=0;j<3;j++){l+=L*.4;s+=densLow(l);}
      float sh=exp(-s*1.1);float powder=1.-exp(-d*4.);float hgt=clamp(p.y/2.4,0.,1.);
      // Contraluz: com o Sol atrás, a borda fina se acende (espalhamento para a frente, Henyey-Greenstein).
      vec3 c=mix(SHD*.7,SHD*1.25,hgt)+LIT*sh*powder*1.35+vec3(1.,.96,.86)*sh*fwd*(1.-powder*.7);
      float a=1.-exp(-d*dt*3.5);col+=c*a*trans;trans*=1.-a;depth+=d*dt;
    }
    t+=dt;
  }
  // Sol escondido atrás da nuvem: o brilho atravessa a parte fina, como na vida real.
  col+=vec3(1.,.97,.88)*SUNI*pow(max(cosA,0.),90.)*exp(-depth*1.2)*(1.-trans)*1.6;
  float keep=1.-clamp((t0-3.)/14.,0.,1.)*.8;
  gl_FragColor=vec4(min(col,vec3(1.))*keep,(1.-trans)*keep);
}`;

  function start(win) {
    const doc = win.document, html = doc.documentElement;
    let canvas = null, gl = null, uniforms = null, current = null, raf = 0, last = 0, t0 = 0, slow = 0, dead = false;
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
    function scene() { return doc.querySelector('.sky-effects'); }
    function setup() {
      const host = scene(); if (!host) return false;
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
        uniforms = {}; for (const name of ['R','T','LIT','SHD','SUN','COVER','DENS','SIZE','EDGE','DETAIL','SUNPX','SUNI']) uniforms[name] = gl.getUniformLocation(program,name);
        const sun = [-.5,.75,-.2], len = Math.hypot(...sun); gl.uniform3fv(uniforms.SUN,sun.map(v => v / len));
      } catch (_) { canvas = gl = null; return false; }
      canvas.addEventListener('webglcontextlost',event => { event.preventDefault(); off('lost'); });
      const moon = host.querySelector('.sky-moon');
      host.insertBefore(canvas,moon?.nextSibling || null);
      resize(); t0 = win.performance.now();
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
    }
    function rate() { const value = parseFloat(scene()?.style.getPropertyValue('--cloud-rate')); return Number.isFinite(value) && value > 0 ? value : 1; }
    // Posição do Sol do céu (o mesmo .sky-sun do CSS) em pixels do canvas, relida a cada ~2 s: ele anda pelo
    // relógio de 30 s e a página pode rolar. Sem Sol visível (noite, nublado, chuva), SUNI = 0.
    let sunAt = 0;
    function sunUpdate(now) {
      sunAt = now || 0;
      const sun = scene()?.querySelector('.sky-sun');
      const visibility = parseFloat(scene()?.style.getPropertyValue('--sun-visibility'));
      let intensity = 0;
      // Só no céu parcial o Sol aparece; no nublado e na chuva ele fica escondido (sem brilho atrás).
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
    }
    let clock = 0, lastNow = 0;
    function draw(now) {
      raf = win.requestAnimationFrame(draw);
      if (now - last < FRAME_MS) return;
      const gap = now - last; last = now;
      // Quadros lentos por 5 segundos seguidos: o aparelho não aguenta; volta às camadas do CSS.
      if (lastNow && gap > SLOW_MS && !qaForced()) { slow += gap; if (slow > SLOW_SECONDS * 1000) return off('slow'); } else slow = 0;
      clock += lastNow ? Math.min(gap,200) / 1000 * rate() : 0; lastNow = now;
      if (now - sunAt > 2000) sunUpdate(now);
      gl.uniform1f(uniforms.T,20 + clock); gl.drawArrays(gl.TRIANGLES,0,3);
    }
    function run() { if (!raf) { last = 0; lastNow = 0; slow = 0; raf = win.requestAnimationFrame(draw); } }
    function stop() { if (raf) win.cancelAnimationFrame(raf); raf = 0; }
    function sync() {
      if (dead) return;
      const next = mode({phase:html.dataset.phase,weather:html.dataset.weather,rain:html.dataset.rain,clouds:html.dataset.clouds});
      if (!next || reduced() || qaBlocked()) { stop(); if (current) { delete html.dataset.volume; current = null; } return; }
      if (!gl && !setup()) return off('unsupported');
      if (next !== current) { palette(next); current = next; resize(); sunUpdate(win.performance.now()); gl.uniform1f(uniforms.T,20 + clock); gl.drawArrays(gl.TRIANGLES,0,3); }
      html.dataset.volume = 'on';
      if (scene()?.dataset.motion === 'running') run(); else stop();
    }
    if (disabledBefore()) return {sync() {}};
    const observer = new win.MutationObserver(sync);
    observer.observe(html,{attributes:true,attributeFilter:['data-phase','data-weather','data-rain','data-clouds']});
    const watchScene = () => { const host = scene(); if (host) observer.observe(host,{attributes:true,attributeFilter:['data-motion']}); };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded',() => { watchScene(); sync(); },{once:true}); else { watchScene(); sync(); }
    win.addEventListener('resize',() => { if (gl) { resize(); if (!raf) gl.drawArrays(gl.TRIANGLES,0,3); } },{passive:true});
    win.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change',sync);
    return {sync};
  }
  return {mode,PALETTES,start,FS};
}));

/* Gotas na tela (1.38, pedido do dono depois do protótipo: "pequeninas, bem sutis", "suaveszinhas 3D"). Com chuva no
   céu (data-rain da raiz, que já acompanha a chuva medida) um <canvas class="sky-glass"> fixo na tela desenha gotinhas
   no "vidro": paradas que pousam, crescem e secam, e algumas que escorrem aos trancos. Cada gota é um domo macio com
   brilho largo em cima, reflexo pequeno, luz juntando embaixo e uma sombra suave; tudo em alfa pré-multiplicado
   sobre o céu do CSS (sem amostrar o fundo). Mais gotas quanto mais forte a chuva; a troca é aos poucos.
   Fica atrás do conteúdo, desenha a ~20 quadros por segundo só com a cena rodando, para com a página oculta e some
   com movimento reduzido, sem WebGL, contexto perdido ou 5 s de quadros lentos (não tenta de novo na sessão).
   Com navigator.webdriver só liga com pluvia-glass-qa no localStorage. É decoração: não mede chuva. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.PLUVIA = root.PLUVIA || {};
    root.PLUVIA.rainDrops = api;
    if (root.document) api.start(root);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const FRAME_MS = 50, SLOW_MS = 110, SLOW_SECONDS = 5, OFF_KEY = 'pluvia-glass-off';
  // Quantas gotas paradas (dens) e quantas colunas escorrendo (slide) por intensidade do céu.
  const LEVELS = {
    drizzle: {dens:.35, slide:.12},
    light: {dens:.55, slide:.3},
    moderate: {dens:.78, slide:.5},
    heavy: {dens:.95, slide:.8},
  };
  function level(rain) { return LEVELS[rain] || null; }

  const VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
  const FS = `precision highp float;
varying vec2 v;uniform vec2 R;uniform float T,DENS,SLIDE;
float hash(vec2 p){p=fract(p*vec2(271.13,413.71));p+=dot(p,p+27.61);return fract(p.x*p.y);}
float dome(vec2 d,float r){float q=dot(d,d)/(r*r);return q<1.?pow(1.-q,.85):0.;}
float still(vec2 uv,float scale,float t,float seed){
  vec2 g=uv*scale;vec2 id=floor(g);vec2 f=fract(g)-.5;
  float r0=hash(id+seed),r1=hash(id+seed+3.7),r2=hash(id+seed+9.1);
  if(r2>DENS)return 0.;
  float life=fract(t*.035+r2*7.);float grow=smoothstep(0.,.18,life)*(1.-smoothstep(.88,1.,life));
  float full=mix(.1,.34,r1*r1*r1);float rad=full*grow;
  vec2 c=(vec2(r0,fract(r1*7.3))-.5)*max(0.,1.-2.*full-.04);
  return rad>.01?dome(f-c,rad):0.;
}
vec2 slide(vec2 uv,float cols,float t,float seed){
  float aspect=R.x/R.y;vec2 g=vec2(uv.x*cols*aspect,uv.y);float col=floor(g.x);float fx=fract(g.x)-.5;
  float r0=hash(vec2(col,1.+seed)),r1=hash(vec2(col,2.+seed)),r2=hash(vec2(col,3.+seed));
  if(r2>SLIDE)return vec2(0.);
  float ph=t*(.05+.08*r1)+r0*10.;
  float y=1.-fract(ph)+.02*sin(ph*31.)*(1.-r1);
  float rad=.11+.06*r1;
  float x=clamp((r0-.5)*.45+.04*sin(uv.y*16.+r0*6.),-.48+rad,.48-rad);
  float k=cols*aspect;vec2 d=vec2(fx-x,(uv.y-y)*k);
  float head=dome(d*vec2(1.,.92),rad);
  float behind=uv.y-y;
  vec2 bg=vec2(d.x,behind*k*3.);float bi=floor(bg.y);vec2 bf=vec2(bg.x,fract(bg.y)-.5);
  float br=.045*hash(vec2(bi,col+seed))*(1.-smoothstep(0.,.35,behind))*step(0.,behind);
  float bead=br>.01?dome(bf,br):0.;
  return vec2(max(head,bead),0.);
}
float height(vec2 uv){
  vec2 a=vec2(R.x/R.y,1.);
  vec2 s1=slide(uv,16.,T,0.);vec2 s2=slide(uv+vec2(.31,0.),26.,T*1.1,5.);
  float st=max(max(still(uv*a,44.,T,0.),still(uv*a+.5,72.,T*1.2,2.)),still(uv*a+.25,110.,T*.8,4.)*.8);
  return max(st,max(s1.x,s2.x));
}
void main(){
  float h=height(v);
  float e=1./R.y;
  vec2 n=vec2(height(v+vec2(e,0.))-height(v-vec2(e,0.)),height(v+vec2(0.,e))-height(v-vec2(0.,e)))/(2.*e);
  vec3 N=normalize(vec3(-n*.0035,1.));
  float wet=smoothstep(0.,.18,h);
  float hs=height(v+vec2(-.0015,.0026)*vec2(R.y/R.x,1.));
  float shadow=.1*smoothstep(0.,.6,hs)*(1.-wet);
  float edge=1.-N.z;
  float glow=smoothstep(.15,.85,-N.y)*smoothstep(.2,.7,h)*.2;
  float soft=pow(max(0.,dot(N,normalize(vec3(-.4,.55,1.)))),14.)*.22;
  float spark=pow(max(0.,dot(N,normalize(vec3(-.45,.6,1.)))),140.)*.6;
  // corpo: leve clareada (a gota junta luz) e borda um pouco mais escura; sombra só escurece
  float light=wet*.07+glow+soft+spark;
  float a=clamp(light+wet*.16*smoothstep(.1,.7,edge)+shadow,0.,1.);
  gl_FragColor=vec4(vec3(.88,.92,1.)*min(light,a),a);
}`;

  function start(win) {
    const doc = win.document, html = doc.documentElement;
    let canvas = null, gl = null, U = null, raf = 0, last = 0, slow = 0, clock = 30, dead = false;
    let target = null, shown = {dens:0, slide:0};
    function stored(key, kind) { try { return win[kind]?.getItem(key); } catch (_) { return null; } }
    if (stored(OFF_KEY, 'sessionStorage')) return {sync() {}};
    const qaForced = () => !!stored('pluvia-glass-qa', 'localStorage');
    const qaBlocked = () => !!win.navigator?.webdriver && !qaForced();
    const reduced = () => !!win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const scene = () => doc.querySelector('.sky-effects');
    function off(reason) {
      dead = true; stop(); delete html.dataset.glass;
      try { win.sessionStorage?.setItem(OFF_KEY, reason || '1'); } catch (_) { /* só esta página */ }
      canvas?.remove(); canvas = gl = null;
      try { win.pluviaAnalytics?.track?.('Sky Effect Off', {effect:'glass', reason:reason || 'unsupported'}); } catch (_) { /* telemetria nunca quebra o céu */ }
    }
    function setup() {
      const effects = scene(); if (!effects) return false;
      canvas = doc.createElement('canvas'); canvas.className = 'sky-glass'; canvas.setAttribute('aria-hidden', 'true');
      try { gl = canvas.getContext('webgl', {alpha:true, premultipliedAlpha:true, antialias:false, depth:false, stencil:false, powerPreference:'low-power'}); } catch (_) { gl = null; }
      if (!gl) { canvas = null; return false; }
      const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader'); return s; };
      try {
        const program = gl.createProgram();
        gl.attachShader(program, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('link');
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const at = gl.getAttribLocation(program, 'p'); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
        U = {}; for (const name of ['R', 'T', 'DENS', 'SLIDE']) U[name] = gl.getUniformLocation(program, name);
      } catch (_) { canvas = gl = null; return false; }
      canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); off('lost'); });
      effects.after(canvas);
      resize();
      return true;
    }
    function resize() {
      if (!gl) return;
      const scale = Math.min(win.devicePixelRatio || 1, 2) * .5;
      const w = Math.max(2, Math.round(win.innerWidth * scale)), h = Math.max(2, Math.round(win.innerHeight * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(U.R, w, h);
    }
    function frame() {
      gl.uniform1f(U.T, clock); gl.uniform1f(U.DENS, shown.dens); gl.uniform1f(U.SLIDE, shown.slide);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function draw(now) {
      raf = win.requestAnimationFrame(draw);
      // Com as nuvens 3D ligadas (outro contexto WebGL), as gotas andam num ritmo menor para sobrar GPU para as duas.
      if (now - last < (html.dataset.volume === 'on' ? FRAME_MS * 1.5 : FRAME_MS)) return;
      const gap = last ? now - last : 0; last = now;
      if (gap > SLOW_MS && !qaForced()) { slow += gap; if (slow > SLOW_SECONDS * 1000) return off('slow'); } else slow = 0;
      const dt = Math.min(gap, 200) / 1000;
      clock += dt;
      // a chuva aperta ou passa aos poucos; sem chuva as gotas secam até sumir
      const goal = target || {dens:0, slide:0};
      for (const key of ['dens', 'slide']) shown[key] += (goal[key] - shown[key]) * Math.min(1, dt * .6);
      if (!target && shown.dens < .02 && shown.slide < .02) { stop(); delete html.dataset.glass; return; }
      frame();
    }
    function run() { if (!raf) { last = 0; slow = 0; raf = win.requestAnimationFrame(draw); } }
    function stop() { if (raf) win.cancelAnimationFrame(raf); raf = 0; }
    function sync() {
      if (dead) return;
      target = level(html.dataset.rain);
      if (reduced() || qaBlocked()) { target = null; stop(); delete html.dataset.glass; return; }
      if (!target && !gl) return;
      if (!gl && !setup()) return off('unsupported');
      if (target) html.dataset.glass = 'on';
      if (doc.hidden || scene()?.dataset.motion !== 'running') stop(); else run();
    }
    const observer = new win.MutationObserver(sync);
    observer.observe(html, {attributes:true, attributeFilter:['data-rain']});
    const watch = () => { const host = scene(); if (host) observer.observe(host, {attributes:true, attributeFilter:['data-motion']}); };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => { watch(); sync(); }, {once:true}); else { watch(); sync(); }
    doc.addEventListener('visibilitychange', sync);
    win.addEventListener('resize', () => { if (gl) { resize(); if (!raf) frame(); } }, {passive:true});
    win.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change', sync);
    return {sync};
  }
  return {start, level, LEVELS, FS};
}));

/* Nuvens volumétricas (1.33: noite; 1.34: dia com o brilho do Sol; 1.35: todos os céus com nuvem, pôr/nascer do
   sol e intro, pedidos do dono). Um <canvas> pequeno desenha nuvens em 3D por raymarching (WebGL 1): ruído
   fractal numa camada de céu, luz de cima com sombra própria e base mais cinza. O canvas tem 50% da resolução da
   tela em CSS px e o navegador o amplia (nuvem é macia; isso deixa o custo pequeno no celular). Fundo
   transparente: o céu, o Sol e a Lua do CSS continuam atrás, e a nuvem cobre os astros.
   Desenha a ~24 quadros por segundo só com a cena rodando (data-motion="running", que para com a página oculta
   e fora da tela). Sem WebGL, com movimento reduzido, contexto perdido ou quadros lentos demais, volta às camadas
   de nuvem do CSS (data-volume sai da raiz) e não tenta de novo nesta sessão.
   1.36 (pedido do dono): com trovoada o raio acende a nuvem por dentro, no ponto e na hora do raio do CSS
   (o mesmo ciclo de 39 s de .sky-lightning, lido da animação dele), e a neblina ganha uma névoa 3D baixa.
   1.60 (pedido do dono: "quero chuva 3D no PLUVIA"): com chuva ou trovoada o mesmo shader desenha a chuva em
   quatro profundidades (perto: traços grossos, macios e rápidos; longe: finos, fracos e lentos), inclinada pelo
   vento e na frente das nuvens; enquanto ela aparece (data-rain3d="on"), as camadas de chuva do CSS somem. A
   densidade segue a intensidade que o céu já mostra (data-rain), nunca a probabilidade. Mesmo contexto WebGL das
   nuvens: dois contextos derrubavam o iPhone (1.40.1). Desde a 1.60 a intro não tem mais céu (pedido do dono),
   então o canvas fica só na Home.
   1.62 (pedido do dono, print da Lua "atravessando" a nuvem: "não tá natural"): o disco do Sol e da Lua (CSS) não
   aparece mais nítido e apagado através da nuvem fina. Onde há nuvem sobre o disco, a nuvem o esconde e o shader
   desenha a luz que atravessa: nuvem fina deixa um brilho borrado e forte, nuvem grossa só um clarão fraco, com uma
   coroa suave em volta; numa brecha o disco nítido do CSS aparece. O Sol, numa brecha que vai abrindo, vai
   aparecendo com brilho e raios (a cobertura medida no próprio centro do Sol, AST, a cada quadro).
   É decoração: cobertura, forma e gotas não representam medição. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.PLUVIA = root.PLUVIA || {};
    root.PLUVIA.volumeClouds = api;
    if (root.document) api.start(root);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Chuva 3D: densidade por intensidade (data-rain) e as quatro camadas (colunas por altura da tela e velocidade em
  // alturas de tela por segundo; a camada 0 é a mais perto). O deslocamento de cada camada é calculado aqui em
  // precisão dupla e volta a zero a cada RAIN_WRAP células, para o shader nunca perder precisão com o tempo.
  const RAIN_LEVEL = {drizzle:.2, light:.55, moderate:.85, heavy:1};
  // 1.65 (pedido do dono: "tá caindo muito rápida"): quase metade da velocidade de antes (2,3/1,7/1,25/0,95).
  const RAIN_LAYERS = [{cols:7, speed:1.2}, {cols:16, speed:.95}, {cols:25, speed:.72}, {cols:34, speed:.52}];
  const RAIN_ROWS = .3, RAIN_WRAP = 512;
  function rainLevel(attrs) {
    if (!attrs || (attrs.weather !== 'rain' && attrs.weather !== 'storm')) return 0;
    return RAIN_LEVEL[attrs.rain] || 0;
  }
  function rainOffsets(seconds) {
    return RAIN_LAYERS.map(layer => ((seconds * layer.speed * layer.cols * RAIN_ROWS) % RAIN_WRAP + RAIN_WRAP) % RAIN_WRAP);
  }
  // RAIN_MS: a chuva é composta por cima da nuvem a cada quadro da tela (até ~60/s), não no ritmo da nuvem.
  const RAIN_MS = 15, LOW_RAIN_MS = 30;
  const SCALE = .5, LOW_SCALE = .33, FRAME_MS = 41, LOW_FRAME_MS = 66, SLOW_MS = 90, SLOW_SECONDS = 5, OFF_KEY = 'pluvia-volume-off';
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
    // Neblina: camada quase cheia, borda bem macia e máscara na tela (densa embaixo, some para cima).
    'night-fog': {lit:'#7d8299', shade:'#2c3044', cover:.3, dens:1.5, size:.2, edge:1.3, detail:.3, cap:.9, fog:1},
    'day-fog': {lit:'#e2e5ea', shade:'#a3aab4', cover:.3, dens:1.5, size:.2, edge:1.3, detail:.3, cap:.86, fog:1},
  };
  // Os três raios do ciclo de 39 s do CSS (storm-bolt em sky.css): começo (fração do ciclo), posição na tela e
  // força. O perfil segue os keyframes: sobe em 80 ms, pisca, volta (re-strike) e apaga em ~1,3 s, com um resto
  // de brilho até ~2,2 s dentro da nuvem.
  const CYCLE_MS = 39000;
  const STRIKES = [{at:.12, x:.34, peak:1}, {at:.46, x:.76, peak:.95}, {at:.8, x:.18, peak:.7}];
  const PROFILE = [[0,0],[80,1],[160,.45],[230,1],[450,.75],[900,.25],[1300,.08],[2200,0]];
  function flash(ms) {
    if (!Number.isFinite(ms)) return {k:0, x:.5};
    const at = ((ms % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
    for (const strike of STRIKES) {
      const u = at - strike.at * CYCLE_MS;
      if (u < 0 || u > PROFILE[PROFILE.length - 1][0]) continue;
      for (let i = 1; i < PROFILE.length; i++) {
        const [t0,v0] = PROFILE[i - 1], [t1,v1] = PROFILE[i];
        if (u <= t1) return {k:strike.peak * (v0 + (v1 - v0) * (u - t0) / (t1 - t0)), x:strike.x, u, index:STRIKES.indexOf(strike), cycle:Math.floor(ms / CYCLE_MS)};
      }
    }
    return {k:0, x:.5};
  }
  // Raio 3D (1.64, pedido do dono): o canal é desenhado dentro do próprio céu 3D, nítido abaixo da nuvem e
  // borrado (luz espalhada) onde atravessa a nuvem. Forma sorteada por raio e por ciclo (semente fixa: o mesmo
  // raio do mesmo ciclo tem a mesma forma), por deslocamento do ponto médio, com um galho. Coordenadas em
  // "altura de tela" (x × largura/altura, y de baixo para cima), como no shader. O fim do canal acompanha o CSS:
  // o terceiro raio é menor (só até o meio da tela).
  const BOLT_POINTS = 33, BRANCH_POINTS = 9;
  function seeded(seed) {
    let t = (seed >>> 0) || 1;
    return () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  }
  function boltPath(index, cycle, aspect) {
    const strike = STRIKES[index] || STRIKES[0], rand = seeded((index + 1) * 7919 + (cycle | 0) * 104729);
    const x0 = strike.x * aspect, top = .97, bottom = index === 2 ? .48 : index === 1 ? .26 : .2;
    const pts = [[x0, top], [x0 + (rand() - .5) * .12, bottom]];
    // Deslocamento do ponto médio: 5 níveis = 33 pontos; o desvio cai a cada nível, mais devagar que pela metade
    // (zigue-zague miúdo, como um raio de verdade).
    let amp = .085, line = pts;
    for (let level = 0; level < 5; level++) {
      const next = [];
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, ay] = line[i], [bx, by] = line[i + 1];
        next.push(line[i], [(ax + bx) / 2 + (rand() - .5) * 2 * amp, (ay + by) / 2 + (rand() - .5) * amp * .3]);
      }
      next.push(line[line.length - 1]); line = next; amp *= .58;
    }
    const main = new Float32Array(BOLT_POINTS * 2);
    line.forEach(([x, y], i) => { main[i * 2] = x; main[i * 2 + 1] = y; });
    // Galho: sai de um ponto do terço de cima e desce na diagonal, mais curto e mais fino.
    const from = line[4 + Math.floor(rand() * 4)], side = rand() < .5 ? -1 : 1, length = .16 + rand() * .1;
    const branch = new Float32Array(BRANCH_POINTS * 2);
    for (let i = 0; i < BRANCH_POINTS; i++) {
      const t = i / (BRANCH_POINTS - 1);
      branch[i * 2] = from[0] + side * t * length * .55 + (i && i < BRANCH_POINTS - 1 ? (rand() - .5) * .035 : 0);
      branch[i * 2 + 1] = from[1] - t * length;
    }
    return {main, branch};
  }
  // Todo céu com nuvem ganha a nuvem 3D: poucas nuvens, parcial, nublado (e neve), chuva e trovoada, de dia e
  // de noite, e a neblina (1.36). Céu limpo não tem nuvem.
  function mode(attrs) {
    if (!attrs || (attrs.phase !== 'night' && attrs.phase !== 'day')) return null;
    let name = null;
    if (attrs.weather === 'cloud' || attrs.weather === 'snow') name = 'cloud';
    else if (attrs.weather === 'storm' || (attrs.weather === 'rain' && attrs.rain === 'heavy')) name = 'heavy';
    else if (attrs.weather === 'rain') name = 'rain';
    else if (attrs.weather === 'partly') name = attrs.clouds === 'few' ? 'few' : 'partly';
    else if (attrs.weather === 'fog') name = 'fog';
    return name ? `${attrs.phase}-${name}` : null;
  }
  function hex(value) { return [1,3,5].map(i => parseInt(value.slice(i,i + 2),16) / 255); }

  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = `precision mediump float;
#ifdef GL_FRAGMENT_PRECISION_HIGH
#define HP highp
#else
#define HP mediump
#endif
uniform vec2 R,SUNPX;uniform float T,SUNI,TW,SIDE,CAP;uniform vec3 LIT,SHD,SUN;uniform float COVER,DENS,SIZE,EDGE,DETAIL,FLASH,FLASHX,FOG;
uniform float RAIN,RWIND;uniform vec4 RY;
uniform vec2 AST;uniform float ASTR,ASTI,ASTS;uniform vec3 ASTC,SKYC;
uniform float PY,BOLTK,BOLTG;uniform vec2 BOLT[${BOLT_POINTS}];uniform vec2 BR[${BRANCH_POINTS}];
float hr(HP vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
// Chuva 3D: cada camada é uma grade de células altas; cada célula tem no máximo um traço, em posição sorteada.
// A camada perto tem poucas células grandes (traço comprido, largo e macio, como fora de foco); a longe, muitas
// pequenas. A inclinação (RWIND, x por y na tela) entra no próprio deslocamento, então a gota anda na diagonal.
vec4 rain(vec2 px){
  vec4 acc=vec4(0.);
  if(RAIN<=0.)return acc;
  HP vec2 uv=px/R.y;
  vec3 rc=mix(LIT,vec3(1.),.45);
  for(int i=0;i<4;i++){
    float z=float(i)/3.;
    float cols=7.+27.*z;
    float off=i==0?RY.x:i==1?RY.y:i==2?RY.z:RY.w;
    HP float qy=uv.y*cols*${RAIN_ROWS}+off;
    HP vec2 q=vec2(uv.x*cols+qy*RWIND/${RAIN_ROWS},qy);
    HP vec2 c=floor(q);vec2 f=fract(q);
    c=mod(c,${RAIN_WRAP}.);
    float r=hr(c+float(i)*17.31);
    if(r<1.-RAIN*mix(.55,.85,z))continue;
    float x0=.2+.6*hr(c+vec2(3.1,float(i)));
    float len=mix(.62,.34,z);
    float y0=hr(c+vec2(float(i),7.7))*(1.-len);
    float w=mix(.034,.06,z);
    float yy=(f.y-y0)/len;
    float a=(1.-smoothstep(0.,1.,abs(f.x-x0)/w))*smoothstep(0.,.08,yy)*smoothstep(1.,.2,yy)*(1.-yy*.45);
    a*=mix(.34,.15,z)*(.6+.4*RAIN);
    acc.rgb+=rc*a*(1.-acc.a);acc.a+=a*(1.-acc.a);
  }
  return acc;
}
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
// Quanto de luz do astro passa pela nuvem no centro dele (marcha curta, mesma nuvem em baixa resolução).
float astroVis(){
  vec3 ro=vec3(0.,-2.2,0.),rd=ray(AST+vec2(0.,PY));if(rd.y<=.01)return 1.;
  float a=-ro.y/rd.y,b=min((2.4-ro.y)/rd.y,a+9.),dt=(b-a)/10.,dep=0.;
  for(int i=0;i<10;i++){dep+=densLow(ro+rd*(a+dt*(float(i)+.5)))*dt;}
  return exp(-dep*1.6);
}
float seg(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;float k=clamp(dot(pa,ba)/max(dot(ba,ba),1e-6),0.,1.);return length(pa-ba*k);}
// Distância ao canal (só os segmentos que já "cresceram", BOLTG de 0 a 1 de cima para baixo) e ao galho.
vec2 boltDist(vec2 p){
  float dm=10.,db=10.;
  for(int i=0;i<${BOLT_POINTS - 1};i++){if(float(i)>=BOLTG*${BOLT_POINTS - 1}.)break;dm=min(dm,seg(p,BOLT[i],BOLT[i+1]));}
  if(BOLTG>.6){for(int i=0;i<${BRANCH_POINTS - 1};i++)db=min(db,seg(p,BR[i],BR[i+1]));}
  return vec2(dm,db);
}
void main(){
  // Parallax (sky-parallax): a nuvem, a luz e o raio andam com a rolagem (PY em px do canvas); a chuva não.
  vec2 fc=gl_FragCoord.xy+vec2(0.,PY);
  vec3 ro=vec3(0.,-2.2,0.);vec3 rd=ray(fc);
  if(rd.y<=.01){gl_FragColor=rain(gl_FragCoord.xy);return;}
  // Luz de cima: de dia, o Sol na posição dele na tela (SUNPX) ou o céu claro acima; à noite, a Lua ilustrada.
  // No pôr/nascer do sol (TW) a luz vem baixa, do lado do Sol (SIDE), e pinta a base de laranja e rosa.
  vec3 L=SUNI>0.?ray(SUNPX+vec2(0.,PY)):SUN;
  L=normalize(mix(L,vec3(SIDE*.9,.12,.45),TW));
  float cosA=dot(rd,L);
  float fwd=(SUNI+TW*.8)*(hg(cosA,.6)*1.4+pow(max(cosA,0.),80.)*2.2);
  vec3 lit=mix(LIT,vec3(1.,.63,.42),TW*.85),shd=mix(SHD,vec3(.34,.27,.42),TW*.7),glow=mix(vec3(1.,.96,.86),vec3(1.,.55,.3),TW);
  // Raio: a nuvem acende por dentro numa mancha larga em volta do topo do canal (FLASHX na tela), não numa
  // coluna; só as partes densas brilham (d² abaixo).
  float sy=fc.y/R.y,fx=gl_FragCoord.x/R.x-FLASHX,fy=sy-.66;
  float fl=FLASH*exp(-(fx*fx/.06+fy*fy/.05));
  float t0=-ro.y/rd.y,t1=min((2.4-ro.y)/rd.y,t0+9.);
  float dt=(t1-t0)/40.;float t=t0+dt*h(vec3(fc,1.));
  vec3 col=vec3(0.);float trans=1.;float depth=0.;
  for(int i=0;i<40;i++){
    if(trans<.02)break;
    vec3 p=ro+rd*t;float d=dens(p);
    if(d>.002){
      vec3 l=p;float s=0.;for(int j=0;j<3;j++){l+=L*.4;s+=densLow(l);}
      float sh=exp(-s*1.1);float powder=1.-exp(-d*4.);float hgt=clamp(p.y/2.4,0.,1.);
      // Topo iluminado e base mais cinza: a luz direta pesa mais no alto da nuvem e o ambiente escurece embaixo.
      float top=.45+.55*smoothstep(.05,.85,hgt);
      vec3 c=mix(shd*.55,shd*1.3,hgt)+lit*sh*powder*1.35*mix(top,1.,TW)+glow*sh*fwd*(1.-powder*.7)
        +vec3(.78,.84,1.)*fl*d*d*2.4*exp(-depth*.9);
      float a=1.-exp(-d*dt*3.5);col+=c*a*trans;trans*=1.-a;depth+=d*dt;
    }
    t+=dt;
  }
  // Sol escondido atrás da nuvem: o brilho atravessa a parte fina, como na vida real.
  col+=glow*SUNI*pow(max(cosA,0.),90.)*exp(-depth*1.2)*(1.-trans)*1.6;
  float keep=1.-clamp((t0-3.)/14.,0.,1.)*.8;
  // O miolo da nuvem fica opaco (a Lua e o Sol não atravessam), e a cor nunca passa do alfa (pré-multiplicado).
  float A=1.-trans;float A2=min(1.,A*1.4);col*=A>0.?A2/A:0.;
  // Neblina: densa embaixo da tela, sumindo para cima (FOG = 0 nas outras condições).
  float fm=mix(1.,smoothstep(.95,.18,sy),FOG);A2*=fm;col*=fm;
  col=min(col,vec3(A2*(CAP+FLASH*.2)));
  vec3 base=col*keep;float baseA=A2*keep;
  // Sol e Lua atrás da nuvem (1.62): onde há nuvem sobre o disco, ela esconde o disco nítido do CSS (alfa sobe só
  // ali) e no lugar entra a luz que atravessa a nuvem, borrada (disco largo) e com uma coroa; a força cai com a
  // espessura da nuvem no próprio pixel (tr). Numa brecha (A ~ 0) nada muda e o disco nítido aparece.
  if(ASTI>0.){
    vec2 dv=gl_FragCoord.xy-AST;float ad=length(dv)/max(ASTR,1.);
    // Dentro do disco o que fica atrás do canvas é o próprio astro (não o céu). Qualquer nuvem visível ali (vA) o
    // esconde por inteiro, mantendo a cor real da nuvem (sem escurecer a borda fina); a luz dele volta borrada e
    // conservando a energia: o quanto a nuvem deixaria passar (1 − vA), sem borda nítida. Fora do disco nada muda.
    // Dentro do disco o fundo vira a mesma mistura do entorno (nuvem por cima do céu, SKYC), em vez de deixar o
    // disco nítido aparecer; numa brecha (vA ~ 0) o disco do CSS continua nítido.
    float vA=baseA,c=smoothstep(.0,.06,vA)*(1.-smoothstep(.95,1.12,ad));
    vec3 cu=vA>.0001?clamp(base/vA,0.,1.):vec3(0.);
    base=mix(base,cu*vA+SKYC*(1.-vA),c);baseA=mix(vA,1.,c);
    // Coroa: mesmo atrás de nuvem grossa a nuvem em volta clareia de leve (a luz espalha), sem formar disco.
    float g=ASTI*smoothstep(.0,.06,vA)*(exp(-ad*ad*1.1)*(1.-vA*.75)+exp(-ad*.65)*.2*(1.-vA*.5));
    // Sol numa brecha: brilho e raios que crescem conforme a nuvem sai da frente (vis no centro do Sol), mais
    // fortes no meio do caminho (brecha abrindo) e discretos com o céu todo limpo. Ruído na direção a partir do
    // Sol (sem emenda no ângulo), oscilando devagar.
    if(ASTS>0.){
      float vis=astroVis();vec2 v=dv/R.y;float r=length(v);vec2 dir=r>0.?v/r:vec2(0.,1.);
      float streak=smoothstep(.55,.92,n(vec3(dir*6.,T*.015)))*.7+smoothstep(.62,.95,n(vec3(dir*14.,3.1+T*.02)))*.3;
      float open=vis*(1.+3.*vis*(1.-vis));
      g+=ASTI*(open*streak*exp(-r*5.)*.24*(.4+.6*(1.-vA))+vis*exp(-r*r*90.)*.26);
    }
    g=min(g,.85);
    base+=ASTC*g;baseA=baseA+g*(1.-baseA);
  }
  // Raio 3D: núcleo fino e nítido onde não há nuvem na frente; dentro da nuvem (baseA alto) o núcleo some e a
  // luz se espalha num brilho largo, como o canal visto através da nuvem. Cor somada com o alfa (pré-multiplicado).
  if(BOLTK>0.){
    vec2 bd=boltDist(fc/R.y);
    float core=exp(-bd.x*bd.x/.0000055)+exp(-bd.y*bd.y/.000003)*.6;
    float glow=(exp(-bd.x/.016)*.38+exp(-bd.x/.07)*.14+exp(-bd.y/.012)*.18)*(.55+baseA*1.1);
    float e=min(1.,BOLTK*(core*(1.-baseA*.85)*1.3+glow));
    base+=vec3(.88,.92,1.)*e;baseA=baseA+e*(1.-baseA);
  }
  // A chuva passa na frente da nuvem (pré-multiplicado: chuva por cima, nuvem atrás).
  vec4 rn=rain(gl_FragCoord.xy);
  gl_FragColor=vec4(rn.rgb+base*(1.-rn.a),rn.a+baseA*(1.-rn.a));
}`;
  // Chuva fluida (1.65, pedido do dono: "tá tipo com baixo fps, travada"): com chuva, a nuvem é desenhada numa
  // textura no ritmo dela (~24/s, o raymarch é o caro) e este sombreador leve junta a textura com a chuva a cada
  // quadro da tela. Mesmo contexto WebGL (um só, regra do iPhone). A função rain() é a mesma do FS.
  const RAIN_SRC = FS.slice(FS.indexOf('float hr('), FS.indexOf('vec3 ray('));
  const RS = `precision mediump float;
#ifdef GL_FRAGMENT_PRECISION_HIGH
#define HP highp
#else
#define HP mediump
#endif
uniform vec2 R;uniform vec3 LIT;uniform float RAIN,RWIND;uniform vec4 RY;uniform sampler2D TEX;
${RAIN_SRC}
void main(){
  vec4 base=texture2D(TEX,gl_FragCoord.xy/R);
  vec4 rn=rain(gl_FragCoord.xy);
  gl_FragColor=vec4(rn.rgb+base.rgb*(1.-rn.a),rn.a+base.a*(1.-rn.a));
}`;

  function start(win) {
    const doc = win.document, html = doc.documentElement;
    let canvas = null, gl = null, uniforms = null, current = null, raf = 0, last = 0, slow = 0, dead = false;
    // 1.40.1 (o dono não via as nuvens 3D no iPhone com chuva, quando as gotas da 1.38 também usavam WebGL): lento, antes de
    // desligar, tenta em resolução e ritmo menores; contexto perdido religa uma vez. O motivo do desligamento vai
    // para o PostHog (Sky Effect Off), sem nada além do efeito e do motivo.
    let scale = SCALE, frameMs = FRAME_MS, rainMs = RAIN_MS, lost = 0;
    let cloudProgram = null, rainProgram = null, rainU = null, cloudTex = null, cloudFbo = null, texSize = '', lastRain = 0;
    function off(reason) {
      dead = true; stop();
      try { win.sessionStorage?.setItem(OFF_KEY,reason || '1'); } catch (_) { /* sessão sem storage: só esta página */ }
      delete html.dataset.volume; delete html.dataset.rain3d; delete html.dataset.bolt3d; if (canvas) canvas.remove(); canvas = gl = null;
      try { win.pluviaAnalytics?.track?.('Sky Effect Off',{effect:'volume',reason:reason || 'unsupported'}); } catch (_) { /* telemetria nunca quebra o céu */ }
    }
    function lose() {
      stop(); delete html.dataset.volume; delete html.dataset.rain3d; delete html.dataset.bolt3d; if (canvas) canvas.remove(); canvas = gl = null; current = null;
      if (++lost > 1) return off('lost');
      win.setTimeout(() => { if (!dead) sync(); },3000);
    }
    function disabledBefore() { try { return !!win.sessionStorage?.getItem(OFF_KEY); } catch (_) { return false; } }
    // A automação de QA (navigator.webdriver) mede as camadas de nuvem do CSS; lá a nuvem volumétrica só liga
    // com pluvia-volume-qa no localStorage.
    function qaBlocked() { try { return !!win.navigator?.webdriver && !win.localStorage?.getItem('pluvia-volume-qa'); } catch (_) { return true; } }
    // Com a chave de QA (WebGL por software na CI) a lentidão não desliga: o QA quer ver o desenho.
    function qaForced() { try { return !!win.localStorage?.getItem('pluvia-volume-qa'); } catch (_) { return false; } }
    function reduced() { return !!win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; }
    // Só a Home tem céu (desde a 1.60 a intro tem fundo fixo).
    function scene() { return doc.querySelector('.sky-effects'); }
    function place() {
      const host = scene(); if (!host || !canvas || canvas.parentNode === host) return;
      const moon = host.querySelector('.sky-moon');
      host.insertBefore(canvas,moon?.nextSibling || null); bolt = null; boltLookup = 0;
      resize(); sunUpdate(win.performance.now());
    }
    function setup() {
      if (!scene()) return false;
      canvas = doc.createElement('canvas'); canvas.className = 'sky-volume'; canvas.setAttribute('aria-hidden','true');
      try { gl = canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,powerPreference:'low-power'}); } catch (_) { gl = null; }
      if (!gl) { canvas = null; return false; }
      const compile = (type, source) => { const s = gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s); if (!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error('shader'); return s; };
      try {
        const link = fragment => {
          const p = gl.createProgram();
          gl.attachShader(p,compile(gl.VERTEX_SHADER,VS)); gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fragment));
          gl.bindAttribLocation(p,0,'p');
          gl.linkProgram(p); if (!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error('link');
          return p;
        };
        const program = link(FS);
        rainProgram = link(RS); cloudProgram = program;
        rainU = {}; for (const name of ['R','LIT','RAIN','RWIND','RY','TEX']) rainU[name] = gl.getUniformLocation(rainProgram,name);
        gl.useProgram(rainProgram); gl.uniform1i(rainU.TEX,0);
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
        // Textura da nuvem (só usada com chuva).
        cloudTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,cloudTex);
        for (const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D,k,v);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
        cloudFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,cloudFbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,cloudTex,0);
        gl.bindFramebuffer(gl.FRAMEBUFFER,null); texSize = '';
        uniforms = {};
        for (const name of ['R','T','LIT','SHD','SUN','COVER','DENS','SIZE','EDGE','DETAIL','SUNPX','SUNI','TW','SIDE','CAP','FLASH','FLASHX','FOG','RAIN','RWIND','RY','AST','ASTR','ASTI','ASTS','ASTC','SKYC','PY','BOLTK','BOLTG']) uniforms[name] = gl.getUniformLocation(program,name);
        uniforms.BOLT = gl.getUniformLocation(program,'BOLT[0]'); uniforms.BR = gl.getUniformLocation(program,'BR[0]');
        const sun = [-.5,.75,-.2], len = Math.hypot(...sun); gl.uniform3fv(uniforms.SUN,sun.map(v => v / len));
      } catch (_) { canvas = gl = null; return false; }
      canvas.addEventListener('webglcontextlost',event => { event.preventDefault(); lose(); });
      place();
      return true;
    }
    function resize() {
      if (!canvas || !gl) return;
      const w = Math.max(1,Math.round(canvas.clientWidth * scale)), h = Math.max(1,Math.round(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0,0,w,h); }
      gl.uniform2f(uniforms.R,w,h);
      if (rainProgram) { gl.useProgram(rainProgram); gl.uniform2f(rainU.R,w,h); gl.useProgram(cloudProgram); }
      const size = `${w}x${h}`;
      if (cloudTex && size !== texSize) { texSize = size; gl.bindTexture(gl.TEXTURE_2D,cloudTex); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null); }
    }
    function palette(name) {
      const p = PALETTES[name];
      gl.uniform3fv(uniforms.LIT,hex(p.lit)); gl.uniform3fv(uniforms.SHD,hex(p.shade));
      if (rainProgram) { gl.useProgram(rainProgram); gl.uniform3fv(rainU.LIT,hex(p.lit)); gl.useProgram(cloudProgram); }
      gl.uniform1f(uniforms.COVER,p.cover); gl.uniform1f(uniforms.DENS,p.dens);
      gl.uniform1f(uniforms.SIZE,p.size); gl.uniform1f(uniforms.EDGE,p.edge); gl.uniform1f(uniforms.DETAIL,p.detail);
      gl.uniform1f(uniforms.CAP,p.cap); gl.uniform1f(uniforms.FOG,p.fog || 0);
    }
    // Relógio do raio: a animação do próprio .sky-lightning (procurada só quando a trovoada começa ou a cena
    // muda, porque getAnimations força estilo), lida a cada quadro pelo currentTime.
    let bolt = null, boltLookup = 0, boltKey = '';
    function lightning(now) {
      if (html.dataset.weather !== 'storm') { bolt = null; gl.uniform1f(uniforms.FLASH,0); gl.uniform1f(uniforms.BOLTK,0); delete html.dataset.bolt3d; return; }
      if (html.dataset.bolt3d !== 'on') html.dataset.bolt3d = 'on';
      if ((!bolt || bolt.playState === 'idle') && now - boltLookup > 2000) {
        boltLookup = now;
        try { bolt = scene()?.querySelector('.sky-lightning')?.getAnimations?.({subtree:true}).find(a => a.animationName === 'storm-bolt') || null; } catch (_) { bolt = null; }
      }
      const state = flash(bolt ? Number(bolt.currentTime) : NaN);
      // De dia o clarão aparece menos (a nuvem já está clara), como na vida real.
      gl.uniform1f(uniforms.FLASH,state.k * (html.dataset.phase === 'day' ? .45 : 1)); gl.uniform1f(uniforms.FLASHX,state.x);
      // Canal 3D: cresce de cima para baixo em 80 ms (como o scale do CSS) e some com o clarão.
      if (state.k > 0 && Number.isInteger(state.index)) {
        const key = `${state.index}:${state.cycle}:${canvas.width}x${canvas.height}`;
        if (key !== boltKey) {
          boltKey = key;
          const path = boltPath(state.index, state.cycle, canvas.width / Math.max(1,canvas.height));
          gl.uniform2fv(uniforms.BOLT,path.main); gl.uniform2fv(uniforms.BR,path.branch);
        }
        gl.uniform1f(uniforms.BOLTG,Math.min(1,state.u / 80)); gl.uniform1f(uniforms.BOLTK,Math.min(1,state.k * 1.1));
      } else gl.uniform1f(uniforms.BOLTK,0);
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
          gl.uniform2f(uniforms.SUNPX,x,y); sunMeasured = [x,y];
          intensity = Number.isFinite(visibility) ? Math.max(0,Math.min(1,visibility)) : 1;
        }
      }
      gl.uniform1f(uniforms.SUNI,intensity);
      astroUpdate();
      // Pôr/nascer do sol: a mesma força da luz do crepúsculo que o CSS usa (--twilight-opacity), do lado do Sol.
      const solar = html.dataset.solar, strength = cssNumber('--twilight-opacity');
      const twilight = (solar === 'sunset' || solar === 'sunrise') && Number.isFinite(strength) ? Math.max(0,Math.min(1,strength)) : 0;
      const sx = cssNumber('--sun-orbit-x');
      gl.uniform1f(uniforms.TW,twilight);
      gl.uniform1f(uniforms.SIDE,Number.isFinite(sx) ? (sx < .5 ? -1 : 1) : (solar === 'sunrise' ? -1 : 1));
    }
    // Sol (de dia, quando o CSS o mostra) ou Lua (à noite) em pixels do canvas, para a nuvem cobri-los com luz
    // difusa em vez de deixar o disco nítido aparecer apagado através dela. Raio do disco: no sky-sun.svg o disco tem
    // ~51% da caixa (o resto é halo); no disco da Lua, a caixa inteira. Lido no mesmo ritmo do Sol (~2 s).
    // Cor do céu atrás do astro (--sky-base da raiz), para o disco escondido pela nuvem virar o mesmo céu do entorno.
    function skyColor() {
      const raw = (win.getComputedStyle?.(html).getPropertyValue('--sky-base') || '').trim();
      const hexed = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
      if (hexed) { const h = hexed[1].length === 3 ? hexed[1].split('').map(x => x + x).join('') : hexed[1]; return [0,2,4].map(i => parseInt(h.slice(i,i + 2),16) / 255); }
      const rgb = /rgba?\(([^)]+)\)/i.exec(raw);
      if (rgb) { const parts = rgb[1].split(',').map(Number); if (parts.length >= 3 && parts.slice(0,3).every(Number.isFinite)) return parts.slice(0,3).map(v => v / 255); }
      return html.dataset.phase === 'night' ? [.03,.06,.13] : [.6,.82,.92];
    }
    function astroUpdate() {
      if (!gl || !canvas) return;
      astOffset = win.PLUVIA?.skyParallax?.current?.().astro || 0;
      const night = html.dataset.phase === 'night';
      const node = scene()?.querySelector(night ? '.sky-moon' : '.sky-sun');
      const visibility = cssNumber(night ? '--moon-visibility' : '--sun-visibility');
      const box = node?.getBoundingClientRect?.(), area = canvas.getBoundingClientRect();
      let intensity = 0;
      if (box && box.width > 0 && area.width > 0 && area.height > 0 && Number.isFinite(visibility) && visibility > 0) {
        const sx = canvas.width / area.width, sy = canvas.height / area.height;
        astMeasured = [(box.left + box.width / 2 - area.left) * sx,(1 - (box.top + box.height / 2 - area.top) / area.height) * canvas.height];
        pxScale = sy;
        gl.uniform2f(uniforms.AST,astMeasured[0],astMeasured[1]);
        gl.uniform1f(uniforms.ASTR,box.width * (night ? .5 : .255) * sx);
        // A Lua brilha conforme a parte iluminada (moon-view escreve --moon-light na raiz).
        const lit = parseFloat(html.style.getPropertyValue('--moon-light'));
        intensity = Math.min(1,visibility) * (night ? .35 + .5 * (Number.isFinite(lit) ? Math.max(0,Math.min(1,lit)) : 1) : 1);
        gl.uniform3fv(uniforms.ASTC,night ? [.82,.88,1] : [1,.93,.74]);
        gl.uniform3fv(uniforms.SKYC,skyColor());
      }
      if (intensity <= 0) astMeasured = null;
      if (area.height > 0) pxScale = canvas.height / area.height;
      gl.uniform1f(uniforms.ASTI,intensity);
      gl.uniform1f(uniforms.ASTS,!night && intensity > 0 ? 1 : 0);
    }
    let clock = 0, lastNow = 0, rainClock = 0, raining = 0;
    // Intensidade e inclinação da chuva 3D (data-rain e data-wind do céu). data-rain3d tira a chuva do CSS.
    function rainSet() {
      raining = rainLevel({weather:html.dataset.weather,rain:html.dataset.rain});
      // A nuvem nunca desenha a chuva: ela vem do passo próprio (rainPass), a cada quadro da tela.
      gl.uniform1f(uniforms.RAIN,0);
      if (rainProgram) {
        gl.useProgram(rainProgram);
        gl.uniform1f(rainU.RAIN,raining); gl.uniform1f(rainU.RWIND,html.dataset.wind === 'strong' ? .34 : .1);
        gl.useProgram(cloudProgram);
      }
      if (raining > 0) html.dataset.rain3d = 'on'; else delete html.dataset.rain3d;
    }
    // Parallax: a nuvem 3D anda com a rolagem (PY) e o disco do Sol/Lua medido a cada ~2 s é corrigido pelo
    // quanto o astro andou desde a medida (mesmo número de sky-parallax), sem medir layout a cada quadro.
    let astMeasured = null, astOffset = 0, sunMeasured = null, pxScale = 1;
    function parallax() {
      const off = win.PLUVIA?.skyParallax?.current?.();
      const canvasOff = off ? off.canvas : 0, astroOff = off ? off.astro : 0;
      gl.uniform1f(uniforms.PY,canvasOff * pxScale);
      const drift = -(astroOff - astOffset) * pxScale;
      if (astMeasured) gl.uniform2f(uniforms.AST,astMeasured[0],astMeasured[1] + drift);
      if (sunMeasured) gl.uniform2f(uniforms.SUNPX,sunMeasured[0],sunMeasured[1] + drift);
    }
    function frame() {
      gl.uniform1f(uniforms.T,20 + clock);
      parallax();
      if (raining > 0 && cloudFbo) {
        gl.bindFramebuffer(gl.FRAMEBUFFER,cloudFbo);
        gl.drawArrays(gl.TRIANGLES,0,3);
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);
        rainPass();
      } else gl.drawArrays(gl.TRIANGLES,0,3);
    }
    // Chuva por cima da última nuvem desenhada, com o deslocamento do tempo real.
    function rainPass() {
      gl.useProgram(rainProgram);
      gl.uniform4fv(rainU.RY,rainOffsets(rainClock));
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,cloudTex);
      gl.drawArrays(gl.TRIANGLES,0,3);
      gl.useProgram(cloudProgram);
    }
    function draw(now) {
      raf = win.requestAnimationFrame(draw);
      if (now - last < frameMs) {
        // Entre dois quadros da nuvem, só a chuva anda (a nuvem fica a da textura).
        if (raining > 0 && cloudFbo && last && now - lastRain >= rainMs) {
          rainClock += Math.min(now - lastRain,200) / 1000; lastRain = now;
          rainPass();
        }
        return;
      }
      const gap = now - last; last = now;
      // Quadros lentos por 5 segundos seguidos: o aparelho não aguenta; volta às camadas do CSS.
      if (lastNow && gap > SLOW_MS && !qaForced()) {
        slow += gap;
        if (slow > SLOW_SECONDS * 1000) {
          if (scale === SCALE) { scale = LOW_SCALE; frameMs = LOW_FRAME_MS; rainMs = LOW_RAIN_MS; slow = 0; resize(); }
          else return off('slow');
        }
      } else slow = 0;
      clock += lastNow ? Math.min(gap,200) / 1000 * rate() : 0;
      // A chuva cai no tempo real (o ritmo do vento só mexe nas nuvens).
      rainClock += lastRain ? Math.min(now - lastRain,200) / 1000 : 0; lastRain = now; lastNow = now;
      if (now - sunAt > 2000) sunUpdate(now);
      lightning(now);
      frame();
    }
    function run() { if (!raf) { last = 0; lastNow = 0; lastRain = 0; slow = 0; raf = win.requestAnimationFrame(draw); } }
    function stop() { if (raf) win.cancelAnimationFrame(raf); raf = 0; }
    function sync() {
      if (dead) return;
      const next = mode({phase:html.dataset.phase,weather:html.dataset.weather,rain:html.dataset.rain,clouds:html.dataset.clouds});
      if (!next || reduced() || qaBlocked()) { stop(); if (current) { delete html.dataset.volume; current = null; } delete html.dataset.rain3d; delete html.dataset.bolt3d; return; }
      if (!gl && !setup()) return off('unsupported');
      place();
      rainSet();
      if (next !== current) { palette(next); current = next; resize(); sunUpdate(win.performance.now()); frame(); }
      else if (html.dataset.solar !== lastSolar) sunUpdate(win.performance.now());
      lastSolar = html.dataset.solar;
      html.dataset.volume = 'on';
      if (scene()?.dataset.motion === 'running') run(); else stop();
    }
    let lastSolar;
    if (disabledBefore()) return {sync() {}};
    const observer = new win.MutationObserver(sync);
    observer.observe(html,{attributes:true,attributeFilter:['data-phase','data-weather','data-rain','data-clouds','data-solar','data-wind']});
    const watch = () => {
      const host = doc.querySelector('.sky-effects'); if (host) observer.observe(host,{attributes:true,attributeFilter:['data-motion']});
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded',() => { watch(); sync(); },{once:true}); else { watch(); sync(); }
    win.addEventListener('resize',() => { if (gl) { resize(); if (!raf) frame(); } },{passive:true});
    win.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change',sync);
    return {sync};
  }
  return {mode,PALETTES,start,FS,RS,RAIN_MS,flash,STRIKES,boltPath,BOLT_POINTS,BRANCH_POINTS,rainLevel,rainOffsets,RAIN_LAYERS,RAIN_WRAP};
}));

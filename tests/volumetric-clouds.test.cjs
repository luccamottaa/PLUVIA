const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const volume = require('../dist/modules/volumetric-clouds.js');

// Todo céu com nuvem ganha a nuvem 3D, de dia e de noite, e a neblina (1.36); céu limpo continua no CSS.
assert.equal(volume.mode({phase:'night',weather:'cloud'}),'night-cloud');
assert.equal(volume.mode({phase:'night',weather:'snow'}),'night-cloud');
assert.equal(volume.mode({phase:'night',weather:'rain'}),'night-rain');
assert.equal(volume.mode({phase:'night',weather:'rain',rain:'heavy'}),'night-heavy');
assert.equal(volume.mode({phase:'night',weather:'storm'}),'night-heavy');
assert.equal(volume.mode({phase:'night',weather:'partly'}),'night-partly');
assert.equal(volume.mode({phase:'day',weather:'partly',clouds:'few'}),'day-few');
assert.equal(volume.mode({phase:'day',weather:'cloud'}),'day-cloud');
assert.equal(volume.mode({phase:'day',weather:'rain'}),'day-rain');
assert.equal(volume.mode({phase:'day',weather:'storm'}),'day-heavy');
for (const phase of ['day','night']) for (const weather of ['sun','unknown']) assert.equal(volume.mode({phase,weather}),null,`${phase} ${weather}`);
assert.equal(volume.mode({phase:'day',weather:'fog'}),'day-fog'); assert.equal(volume.mode({phase:'night',weather:'fog'}),'night-fog');
assert.equal(volume.mode(null),null);
for (const name of ['few','partly','cloud','rain','heavy','fog']) for (const phase of ['day','night']) assert.ok(volume.PALETTES[`${phase}-${name}`],`${phase}-${name}`);
// No nublado/chuva de dia o texto branco fica por cima: a nuvem tem teto de brilho.
assert.ok(volume.PALETTES['day-cloud'].cap <= .75 && volume.PALETTES['day-rain'].cap <= .75);
for (const palette of Object.values(volume.PALETTES)) {
  assert.match(palette.lit,/^#[0-9a-f]{6}$/); assert.match(palette.shade,/^#[0-9a-f]{6}$/);
  assert.ok(palette.cover >= .3 && palette.cover <= .6); assert.ok(palette.dens > 0);
}
// O shader é WebGL 1 com laços de tamanho fixo (exigência do GLSL ES 1.0 no Safari).
assert.match(volume.FS,/precision mediump float/);
// Pôr/nascer do sol (TW) pinta a nuvem de laranja/rosa; topo iluminado e base mais cinza.
assert.match(volume.FS,/uniform float T,SUNI,TW,SIDE,CAP/); assert.match(volume.FS,/smoothstep\(\.05,\.85,hgt\)/);
// Contraluz: espalhamento para a frente (Henyey-Greenstein) e o brilho atravessando a parte fina.
assert.match(volume.FS,/float hg\(/); assert.match(volume.FS,/SUNI\*pow\(max\(cosA/);
assert.doesNotMatch(volume.FS,/for\(int i=0;i<[a-zA-Z]/);

const root = path.join(__dirname,'..','dist');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw = fs.readFileSync(path.join(root,'sw.js'),'utf8');
const css = fs.readFileSync(path.join(root,'sky.css'),'utf8');
const src = fs.readFileSync(path.join(root,'modules','volumetric-clouds.js'),'utf8');
const ref = html.match(/modules\/volumetric-clouds\.js\?v=[\w-]+/)[0];
assert.ok(sw.includes(`./${ref}`),'precache acompanha a versão do HTML');
// As camadas do CSS só somem com data-volume="on"; sem ele (sem WebGL, movimento reduzido, quadros lentos) ficam.
assert.match(css,/:root\[data-volume="on"\] :is\(\.sky-effects,\.intro-sky\) > \.sky-clouds \{[^}]*visibility:hidden/);
assert.match(css,/prefers-reduced-motion: reduce\) \{ \.sky-volume \{ display:none/);
// Desiste e volta ao CSS: contexto perdido e quadros lentos.
assert.match(src,/webglcontextlost/); assert.match(src,/off\('slow'\)/);
// A automação de QA mede as camadas do CSS: sem a chave pluvia-volume-qa a nuvem volumétrica não liga.
assert.match(src,/navigator\?\.webdriver/);
// As nuvens também se formam no lugar (o campo anda na altura), não só entram pela direita.
assert.match(volume.FS,/vec3 wind\(vec3 p\)\{return p\*SIZE\+vec3\(T\*[.0-9]+,T\*[.0-9]+,/);
console.log('volumetric-clouds ok');

// Raio dentro da nuvem (1.36): o mesmo ciclo de 39 s do CSS (storm-bolt), três raios nas mesmas posições.
assert.equal(volume.flash(0).k,0);
assert.deepEqual(volume.flash(4680 + 80),{k:1,x:.34,u:80,index:0,cycle:0});
assert.ok(volume.flash(4680 + 160).k < .5,'pisca depois do primeiro clarão');
assert.ok(Math.abs(volume.flash(17940 + 80).k - .95) < 1e-9 && volume.flash(17940 + 80).x === .76);
assert.ok(Math.abs(volume.flash(31200 + 80).k - .7) < 1e-9 && volume.flash(31200 + 80).x === .18);
assert.equal(volume.flash(4680 + 2300).k,0,'apaga em ~2 s');
assert.deepEqual({...volume.flash(39000 + 4760),cycle:0},volume.flash(4760),'ciclo repete (só o número do ciclo muda)');
assert.equal(volume.flash(NaN).k,0);
for (const [share,x] of [[12,34],[46,76],[80,18]]) assert.ok(css.includes(`${share}.205%`) && css.includes(`calc(${x}vw - 50%)`),'posições batem com storm-bolt');
assert.match(volume.FS,/uniform float COVER,DENS,SIZE,EDGE,DETAIL,FLASH,FLASHX,FOG/);
assert.match(src,/animationName === 'storm-bolt'/);

// Lento cai para menos detalhe antes de desligar, contexto perdido religa uma vez e o motivo vai ao PostHog (1.40.1).
{
  const src = fs.readFileSync(path.join(root, 'modules/volumetric-clouds.js'), 'utf8');
  // 1.68.1: a queda passa por níveis de qualidade (teste no fim do arquivo); desligar continua sendo o último recurso.
  assert.match(src, /if \(quality\.level < QUALITY\.length - 1\) \{ quality\.drop\(\); slow = 0; resize\(\); sunUpdate\(now\); \}\s*else return off\('slow'\);/);
  assert.match(src, /if \(\+\+lost > 1\) return off\('lost'\);/);
  assert.match(src, /track\?\.\('Sky Effect Off',\{effect:'volume',reason:reason \|\| 'unsupported'\}\)/);
  const analytics = fs.readFileSync(path.join(root, 'analytics.js'), 'utf8');
  assert.match(analytics, /'Sky Effect Off'/);
  assert.match(analytics, /effect:new Set\(\['volume'\]\)/);
  assert.match(analytics, /'slow','lost'\]/);
  // As gotas na tela saíram (1.40.1, o dono não gostou).
  assert.ok(!fs.existsSync(path.join(root, 'modules/rain-drops.js')));
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /rain-drops|sky-glass/);
  // Nada de borda clara em volta da Lua (recusada pelo dono).
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'sky.css'), 'utf8'), /\.sky-moon::after/);
}

// Chuva 3D (1.60): densidade pela intensidade que o céu já mostra (data-rain), nunca pela probabilidade; só com
// chuva ou trovoada; quatro camadas; deslocamento calculado aqui e reiniciado num período inteiro de células.
assert.equal(volume.rainLevel({weather:'rain',rain:'drizzle'}),.2);
assert.equal(volume.rainLevel({weather:'rain',rain:'heavy'}),1);
assert.equal(volume.rainLevel({weather:'storm',rain:'moderate'}),.85);
assert.equal(volume.rainLevel({weather:'storm',rain:'none'}),0,'trovoada sem chuva não inventa chuva');
assert.equal(volume.rainLevel({weather:'cloud',rain:'heavy'}),0);
assert.equal(volume.rainLevel(null),0);
assert.equal(volume.RAIN_LAYERS.length,4);
assert.deepEqual(volume.RAIN_LAYERS.map(l => l.cols),[7,16,25,34],'mesmas colunas da fórmula do shader (7 + 27z)');
assert.ok(volume.RAIN_LAYERS.every((l,i,a) => !i || l.speed < a[i - 1].speed),'perto cai mais rápido');
for (const t of [0,1,60,3600,86400 * 3]) for (const off of volume.rainOffsets(t)) assert.ok(off >= 0 && off < volume.RAIN_WRAP,`offset ${off} em ${t}s`);
// Em altura de tela, cada camada desce na velocidade dela: offset / (colunas × .3) por segundo.
const [a0] = volume.rainOffsets(1), [b0] = volume.rainOffsets(2);
assert.ok(Math.abs((b0 - a0) / (7 * .3) - volume.RAIN_LAYERS[0].speed) < 1e-9);
assert.match(volume.FS,/vec4 rain\(vec2 px\)/);
assert.match(volume.FS,/uniform float RAIN,RWIND;uniform vec4 RY;/);
assert.match(volume.FS,/#ifdef GL_FRAGMENT_PRECISION_HIGH/,'sem highp o shader ainda compila');
assert.match(volume.FS,/gl_FragColor=vec4\(rn\.rgb\+base\*\(1\.-rn\.a\),rn\.a\+baseA\*\(1\.-rn\.a\)\)/,'chuva na frente da nuvem (e da luz do astro)');
// Com a chuva 3D, a do CSS sai; sem ela (sem WebGL, movimento reduzido), continua.
assert.match(css,/:root\[data-rain3d="on"\] \.sky-effects > \.sky-rain \{ opacity:0;[^}]*visibility:hidden/);
assert.match(src,/delete html\.dataset\.rain3d; delete html\.dataset\.bolt3d; if \(canvas\) canvas\.remove\(\)/,'desligar devolve a chuva e o raio do CSS');
// Desde a 1.60 a intro não tem céu: o canvas fica só na Home.
assert.match(src,/function scene\(\) \{ return doc\.querySelector\('\.sky-effects'\); \}/);
assert.doesNotMatch(src,/querySelector\('\.intro-sky'\)|#pluviaIntro \.intro-sky/);
console.log('chuva 3D ok');

// Sol e Lua atrás da nuvem (1.62): onde há nuvem sobre o disco, o alfa sobe só ali (o disco nítido do CSS some) e a
// luz que atravessa entra borrada, mais forte com nuvem fina; numa brecha (sem nuvem) nada muda. O Sol ganha brilho e
// raios conforme a cobertura no centro dele diminui (astroVis), com laço de tamanho fixo.
assert.match(volume.FS,/uniform vec2 AST;uniform float ASTR,ASTI,ASTS;uniform vec3 ASTC,SKYC;/);
assert.match(volume.FS,/float vA=baseA,c=smoothstep\(\.0,\.06,vA\)\*\(1\.-smoothstep\(\.95,1\.12,ad\)\);/,'só a nuvem visível e só dentro do disco');
assert.match(volume.FS,/base=mix\(base,cu\*vA\+SKYC\*\(1\.-vA\),c\);baseA=mix\(vA,1\.,c\);/,'disco escondido vira a mesma mistura nuvem + céu do entorno');
assert.match(volume.FS,/exp\(-ad\*ad\*1\.1\)\*\(1\.-vA\*\.75\)/,'a luz borrada cai com a nuvem (energia conservada)');
assert.match(volume.FS,/base\+=ASTC\*g;baseA=baseA\+g\*\(1\.-baseA\);/,'luz somada sem a cor passar do alfa (pré-multiplicado)');
assert.match(volume.FS,/float astroVis\(\)\{[\s\S]*?for\(int i=0;i<10;i\+\+\)/);
assert.match(volume.FS,/float open=vis\*\(1\.\+3\.\*vis\*\(1\.-vis\)\);/,'raios mais fortes com a brecha abrindo');
assert.match(src,/querySelector\(night \? '\.sky-moon' : '\.sky-sun'\)/,'Lua à noite, Sol de dia');
assert.match(src,/gl\.uniform1f\(uniforms\.ASTS,!night && intensity > 0 \? 1 : 0\)/,'raios só do Sol');
console.log('astros atrás da nuvem ok');

// Raio 3D (1.64): forma determinística por raio e ciclo, 33 pontos de cima para baixo com zigue-zague e um galho;
// o canal é borrado onde há nuvem (baseA) e o canal chapado do CSS sai com data-bolt3d.
{
  const a = volume.boltPath(0, 4, .46), b = volume.boltPath(0, 4, .46), c = volume.boltPath(0, 5, .46);
  assert.equal(a.main.length, volume.BOLT_POINTS * 2); assert.equal(a.branch.length, volume.BRANCH_POINTS * 2);
  assert.deepEqual(Array.from(a.main), Array.from(b.main), 'mesmo raio, mesma forma');
  assert.notDeepEqual(Array.from(a.main), Array.from(c.main), 'ciclo novo, forma nova');
  assert.ok(Math.abs(a.main[0] - volume.STRIKES[0].x * .46) < 1e-6, 'começa onde o CSS põe o raio');
  for (let i = 1; i < volume.BOLT_POINTS; i++) assert.ok(a.main[i * 2 + 1] <= a.main[(i - 1) * 2 + 1] + .02, 'desce');
  assert.ok(volume.boltPath(2, 0, .46).main[(volume.BOLT_POINTS - 1) * 2 + 1] > .4, 'o terceiro raio é menor');
  for (const value of [...a.main, ...a.branch]) assert.ok(Number.isFinite(value));
  const strike = volume.flash(volume.STRIKES[1].at * 39000 + 40);
  assert.equal(strike.index, 1); assert.equal(strike.u, 40); assert.equal(strike.cycle, 0);
  assert.match(volume.FS, new RegExp(`uniform vec2 BOLT\\[${volume.BOLT_POINTS}\\]`));
  assert.match(volume.FS, /core\*\(1\.-baseA\*\.85\)/, 'núcleo some dentro da nuvem');
  const sky = fs.readFileSync(path.join(__dirname, '../dist/sky.css'), 'utf8');
  assert.match(sky, /:root\[data-bolt3d="on"\] \.sky-effects \.sky-lightning::after \{ visibility:hidden; \}/);
  // Parallax: a nuvem anda pelo PY; a chuva continua presa à tela (gl_FragCoord sem PY).
  assert.match(volume.FS, /vec2 fc=gl_FragCoord\.xy\+vec2\(0\.,PY\);/);
  assert.match(volume.FS, /vec4 rn=rain\(gl_FragCoord\.xy\);/);
}

// Parallax do céu (1.64): cada camada no seu ritmo, preso depois de MAX_SCROLL, zero no topo.
{
  const parallax = require('../dist/modules/sky-parallax.js');
  assert.deepEqual(parallax.offsets(0), {stars:0, astro:0, back:0, canvas:0, front:0});
  const mid = parallax.offsets(1000);
  assert.ok(mid.stars > mid.astro && mid.astro > mid.back && mid.back > mid.canvas && mid.canvas > mid.front, 'mais perto, mais rápido');
  assert.deepEqual(parallax.offsets(99999), parallax.offsets(parallax.MAX_SCROLL));
  assert.deepEqual(parallax.offsets(-50), parallax.offsets(0));
  for (const value of Object.values(parallax.offsets(parallax.MAX_SCROLL))) assert.ok(value >= -160 && value <= 0);
}
console.log('volumetric-clouds 3D ok');

// Chuva fluida (1.65): a nuvem vai para uma textura no ritmo dela e a chuva é composta por cima a cada quadro da
// tela (até ~60/s), no mesmo contexto WebGL; e cai mais devagar que na 1.60.
{
  const src = fs.readFileSync(path.join(__dirname, '../dist/modules/volumetric-clouds.js'), 'utf8');
  assert.ok(volume.RAIN_MS <= 17, 'chuva a ~60 quadros/s');
  assert.match(volume.RS, /uniform sampler2D TEX;/);
  assert.match(volume.RS, /vec4 rain\(vec2 px\)/, 'mesma chuva do FS');
  assert.match(volume.RS, /gl_FragColor=vec4\(rn\.rgb\+base\.rgb\*\(1\.-rn\.a\),rn\.a\+base\.a\*\(1\.-rn\.a\)\)/, 'chuva na frente, pré-multiplicado');
  assert.match(src, /gl\.uniform1f\(uniforms\.RAIN,0\);/, 'a nuvem nunca desenha a chuva');
  assert.match(src, /gl\.bindFramebuffer\(gl\.FRAMEBUFFER,cloudFbo\);\s*gl\.drawArrays/, 'nuvem na textura');
  assert.equal((src.match(/getContext\('webgl'/g) || []).length, 1, 'um contexto WebGL só');
  assert.ok(volume.RAIN_LAYERS[0].speed <= 1.3 && volume.RAIN_LAYERS.every((l, i, a) => !i || l.speed < a[i - 1].speed), 'mais lenta, perto mais rápida que longe');
}
console.log('chuva fluida ok');

// 1.68.1: o brilho do Sol não estoura mais a nuvem que passa na frente dele. Teto com joelho suave (sem corte
// seco), lóbulo de espalhamento largo e baixo e coroa contida.
{
  const { FS } = volume;
  assert.doesNotMatch(FS, /col=min\(col,vec3\(A2\*\(CAP\+FLASH\*\.2\)\)\);/, 'o corte seco chapava a nuvem em branco');
  assert.match(FS, /knee=cap\*\.64/);
  assert.match(FS, /cu0=min\(cu0,vec3\(knee\)\)\+\(cap-knee\)\*\(1\.-exp\(-max\(cu0-knee,0\.\)\/\(cap-knee\)\)\);col=cu0\*A2;/);
  const peak = /hg\(cosA,\.6\)\*([.\d]+)\+pow\(max\(cosA,0\.\),([\d.]+)\)\*([.\d]+)/.exec(FS);
  assert.ok(peak, 'termo de espalhamento presente');
  const hgPeak = (1 - .36) / (12.566 * Math.pow(1 + .36 - 1.2, 1.5));
  assert.ok(hgPeak * Number(peak[1]) + Number(peak[3]) <= 1, 'na direção do Sol a luz somada não passa de 1 (eram ~3,3)');
  assert.ok(Number(peak[2]) <= 40, 'queda larga, sem borda de círculo');
  assert.match(FS, /g=min\(g,\.42\);/);
}

// 1.68.1: saída antecipada do ruído (mesma imagem, menos contas): duas oitavas, limite pelo máximo das restantes.
{
  const { FS } = volume;
  assert.match(FS, /if\(shape\(s\+\.2175,y\)<=0\.\)return 0\.;/);
  assert.equal(.125 + .0625 + .03, .2175);
  assert.match(FS, /float d=shape\(s\+\.03,y\);/);
  assert.match(FS, /if\(shape\(s\+\.185,y\)<=0\.\)return 0\.;/);
  assert.equal(.125 + .06, .185);
  assert.doesNotMatch(FS, /fbm4/);
}

// 1.68.1: teto de pixels por nível, chuva em resolução própria e qualidade adaptativa com histerese.
{
  const { QUALITY, RAIN_PIXELS, GOVERNOR, fit, governor, rainOffsets, RAIN_LAYERS } = volume;
  const pixels = ([w, h]) => w * h;
  // Celular em pé: nada muda (meia resolução). Telas grandes: a nuvem para no teto do nível.
  assert.deepEqual(fit(390, 844, QUALITY[0].pixels), [195, 422]);
  assert.ok(pixels(fit(1366, 768, QUALITY[0].pixels)) <= QUALITY[0].pixels * 1.01);
  assert.ok(pixels(fit(2560, 1440, QUALITY[0].pixels)) <= QUALITY[0].pixels * 1.01, 'antes eram 921 mil pixels');
  const [bw, bh] = fit(2560, 1440, QUALITY[0].pixels);
  assert.ok(Math.abs(bw / bh - 2560 / 1440) < .02, 'mesma proporção da tela');
  assert.deepEqual(fit(0, 0, 1000), [1, 1]);
  assert.ok(QUALITY.every((q, i, a) => !i || (q.pixels < a[i - 1].pixels && q.frameMs >= a[i - 1].frameMs)), 'cada nível é mais barato');
  assert.ok(RAIN_PIXELS > QUALITY[0].pixels, 'a chuva (traço fino) tem mais resolução que a nuvem');

  const feed = (g, delta, ms) => { for (let t = 0; t < ms; t += delta) g.tick(delta); return g.level; };
  // 60 fps estável: fica no melhor nível.
  assert.equal(feed(governor(), 16.7, 20000), 0);
  // Abaixo de 50 fps por 2 s: desce um nível; continuando lento, desce até o último e para.
  let g = governor();
  assert.equal(feed(g, 25, 1500), 0, 'um engasgo curto não muda nada');
  assert.equal(feed(g, 25, 1500), 1);
  assert.equal(feed(g, 25, 30000), QUALITY.length - 1);
  // Histerese: 18,5 ms (entre os dois limites) nem desce nem sobe.
  g = governor(); feed(g, 25, 3000); const held = g.level;
  assert.equal(feed(g, 18.5, 60000), held);
  // Só volta a subir depois de muito tempo rápido…
  assert.equal(feed(g, 16.7, GOVERNOR.upAfterMs - 3000), held);
  assert.equal(feed(g, 16.7, 6000), held - 1);
  // …e se cair de novo logo depois de subir, não sobe mais (sem ficar oscilando).
  feed(g, 25, 3000); const after = g.level;
  assert.equal(after, held);
  assert.equal(feed(g, 16.7, 120000), after, 'travado depois da recaída');
  // Aba que voltou do fundo (um intervalo enorme) não conta como lentidão.
  g = governor(); for (let i = 0; i < 50; i++) g.tick(5000);
  assert.equal(g.level, 0);
  assert.equal(governor().drop(), 1, 'queda forçada quando nem a média consegue medir');
  // 120 Hz também é "rápido".
  assert.equal(feed(governor(), 8.3, 20000), 0);

  // O laço de desenho reaproveita o vetor dos deslocamentos da chuva.
  const out = new Float32Array(RAIN_LAYERS.length);
  assert.equal(rainOffsets(3.2, out), out);
  assert.ok(rainOffsets(3.2).every((v, i) => Math.abs(v - out[i]) < 1e-3));
  const src = fs.readFileSync(path.join(root, 'modules/volumetric-clouds.js'), 'utf8');
  assert.match(src, /rainOffsets\(rainClock,rainY\)/);
  assert.match(src, /gl\.viewport\(0,0,cw,ch\); gl\.bindFramebuffer\(gl\.FRAMEBUFFER,cloudFbo\);/);
  assert.match(src, /if \(lastRaf && !qaForced\(\)\)/, 'com a chave de QA o nível não muda');
}

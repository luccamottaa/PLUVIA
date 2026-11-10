// Intro com fundo fixo (1.60), a gota da marca com ondas e as letras subindo (1.58). As gotas no vidro saíram na
// 1.63 (o dono não gostou): nem na intro, nem nas páginas legais/404, nem no fundo das janelas.
const assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('dist/index.html','utf8');
const style=html.slice(html.indexOf('.pluvia-intro {'),html.indexOf('</style>',html.indexOf('.pluvia-intro {'))).replace(/\/\*[\s\S]*?\*\//g,'');
const sky=fs.readFileSync('dist/sky.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const intro=html.slice(html.indexOf('<div id="pluviaIntro"'),html.indexOf('<p class="intro-copy"'));

// Fundo fixo: nada do céu da cidade dentro da intro, e as cores não dependem da fase.
assert.doesNotMatch(intro,/intro-sky|sky-sun|sky-moon|sky-clouds|sky-rain|sky-stars/);
// Fundo da 1.64: noite amazônica com halo atrás da marca e reflexo do rio (o mesmo no HTML e no sky.css).
const introBg='radial-gradient(130% 60% at 50% 112%,#0f6274 0%,#0b3a5200 62%),radial-gradient(70% 45% at 50% 46%,#1d4a8a73 0%,#1d4a8a00 72%),linear-gradient(180deg,#040a1a 0%,#091634 52%,#0a2a44 100%)';
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
assert.match(style,new RegExp(`\\.pluvia-intro \\{[^}]*background:${esc(introBg)};[^}]*background-color:#080f22;`));
assert.match(sky,new RegExp(`\\.pluvia-intro \\{ background-image:${esc(introBg)}; background-color:#080f22; color:#f3f8ff; \\}`));
assert.doesNotMatch(sky,/\.pluvia-intro[^{]*\{[^}]*var\(--(?:sky-color|sky-base|intro-ink|intro-muted)/,'cores da intro não seguem mais o céu');

// Sem as gotas em lugar nenhum (nem pré-carregadas, nem no precache).
for(const file of ['dist/index.html','dist/sw.js','dist/continuous.css','dist/legal.css','dist/modules/legal-page.js','dist/404.html','dist/termos/index.html','dist/privacidade/index.html'])
  assert.doesNotMatch(fs.readFileSync(file,'utf8'),/intro-glass|sky-glass/,file);
assert.ok(!fs.existsSync('dist/assets/intro-glass.webp'));

// Letras animadas escondidas dos leitores de tela; o nome inteiro continua lá.
assert.match(html,/<span class="intro-name" aria-hidden="true">(?:<span style="--i:\d">[A-Z]<\/span>){6}<\/span><span class="intro-sr">PLUVIA<\/span>/);
assert.match(intro,/<span class="intro-ripple" aria-hidden="true"><\/span>/);

// Só transform/opacity nas animações.
for(const name of ['intro-ripple','intro-letter']){
  const frames=style.match(new RegExp(`@keyframes ${name} \\{([^@]*?)\\}\\s*(?:@|\\.|$)`));
  assert.ok(frames,name);
  const props=[...frames[1].matchAll(/([a-z-]+):/g)].map(m=>m[1]);
  assert.ok(props.every(p=>p==='opacity'||p==='transform'),`${name}: ${props}`);
}
// Movimento reduzido: tudo parado.
const reduced=style.slice(style.indexOf('@media(prefers-reduced-motion:reduce)'));
assert.match(reduced,/\.pluvia-intro \*,\.pluvia-intro::before,\.intro-ripple::before,\.intro-ripple::after \{ animation:none !important; \}/);
console.log('intro-motion ok');

// Intro "chuva no vidro" (1.58) com fundo fixo (1.60): sem céu dinâmico, o vidro é o LCP e entra no primeiro
// desenho; letras para leitores de tela; movimento reduzido sem animação; arte dentro do orçamento.
const assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('dist/index.html','utf8');
const style=html.slice(html.indexOf('.pluvia-intro {'),html.indexOf('</style>',html.indexOf('.pluvia-intro {'))).replace(/\/\*[\s\S]*?\*\//g,'');
const sky=fs.readFileSync('dist/sky.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const intro=html.slice(html.indexOf('<div id="pluviaIntro"'),html.indexOf('<p class="intro-copy"'));

// Fundo fixo: nada do céu da cidade dentro da intro, e as cores não dependem da fase.
assert.doesNotMatch(intro,/intro-sky|sky-sun|sky-moon|sky-clouds|sky-rain|sky-stars/);
assert.match(style,/\.pluvia-intro \{[^}]*background:linear-gradient\(165deg,#10142d,#080f22 85%\);[^}]*background-color:#080f22;/);
assert.match(sky,/\.pluvia-intro \{ background-image:linear-gradient\(165deg,#10142d,#080f22 85%\); background-color:#080f22; color:#f3f8ff; \}/);
assert.doesNotMatch(sky,/\.pluvia-intro[^{]*\{[^}]*var\(--(?:sky-color|sky-base|intro-ink|intro-muted)/,'cores da intro não seguem mais o céu');

// O vidro é o LCP: pré-carregado com prioridade alta e no CSS desde o primeiro desenho, com fade por animação.
assert.match(html,/<link rel="preload" href="\/assets\/intro-glass\.webp\?v=glass-1" as="image" type="image\/webp" fetchpriority="high" \/>/);
assert.match(style,/\.pluvia-intro \.intro-glass \{[^}]*background:url\("\/assets\/intro-glass\.webp\?v=glass-1"\)[^}]*animation:intro-glass-in/);
assert.doesNotMatch(html,/glass\.dataset\.ready|data-ready\]/,'sem carregamento tardio');
assert.match(style,/\.pluvia-intro\.is-leaving \.intro-glass \{ animation:none;/,'a animação de entrada não segura o vidro na saída');

// Letras animadas escondidas dos leitores de tela; o nome inteiro continua lá.
assert.match(html,/<span class="intro-name" aria-hidden="true">(?:<span style="--i:\d">[A-Z]<\/span>){6}<\/span><span class="intro-sr">PLUVIA<\/span>/);
assert.match(intro,/<span class="intro-glass" aria-hidden="true"><\/span>/);
assert.match(intro,/<span class="intro-ripple" aria-hidden="true"><\/span>/);

// Só transform/opacity nas animações novas.
for(const name of ['intro-glass-in','intro-ripple','intro-letter']){
  const frames=style.match(new RegExp(`@keyframes ${name} \\{([^@]*?)\\}\\s*(?:@|\\.|$)`));
  assert.ok(frames,name);
  const props=[...frames[1].matchAll(/([a-z-]+):/g)].map(m=>m[1]);
  assert.ok(props.every(p=>p==='opacity'||p==='transform'),`${name}: ${props}`);
}
// Movimento reduzido: tudo parado.
const reduced=style.slice(style.indexOf('@media(prefers-reduced-motion:reduce)'));
assert.match(reduced,/\.pluvia-intro \*,\.pluvia-intro::before,\.intro-ripple::before,\.intro-ripple::after \{ animation:none !important; \}/);

// Arte gerada por script, dentro do orçamento, com alfa.
assert.ok(fs.existsSync('scripts/generate-intro-glass.py'));
const size=fs.statSync('dist/assets/intro-glass.webp').size;
assert.ok(size<=150*1024,`intro-glass.webp com ${size} bytes`);
const head=fs.readFileSync('dist/assets/intro-glass.webp').subarray(0,16);
assert.equal(head.subarray(12,16).toString(),'VP8X','precisa de canal alfa');
console.log('intro-glass ok');

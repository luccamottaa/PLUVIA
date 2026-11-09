// Intro "chuva no vidro" (1.58): o vidro só entra pronto e depois do primeiro desenho, letras para leitores de tela,
// movimento reduzido sem animação, arte dentro do orçamento.
const assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('dist/index.html','utf8');
const style=html.slice(html.indexOf('.pluvia-intro {'),html.indexOf('</style>',html.indexOf('.pluvia-intro {'))).replace(/\/\*[\s\S]*?\*\//g,'');

// A imagem só aparece no CSS com data-ready: sem ele, nada é baixado pelo CSS no primeiro desenho.
const glassRules=style.match(/[^}]*intro-glass\.webp[^}]*}/g)||[];
assert.equal(glassRules.length,1);
assert.match(glassRules[0],/\.intro-glass\[data-ready\]/);
assert.doesNotMatch(html,/rel="preload"[^>]*intro-glass/,'não pode competir com o LCP');
// O script baixa depois do primeiro quadro e só marca pronto se a intro ainda está na tela.
const script=html.slice(html.indexOf('var glass = intro.querySelector'),html.indexOf('img.src'));
assert.match(script,/requestAnimationFrame/);
assert.match(script,/onload = function \(\) \{ if \(!intro\.dataset\.done\) glass\.dataset\.ready = "1"; \}/);
assert.match(html,/img\.src = "\/assets\/intro-glass\.webp\?v=glass-1"/,'mesma URL do CSS, caminho da raiz (páginas /clima/)');

// Letras animadas escondidas dos leitores de tela; o nome inteiro continua lá.
assert.match(html,/<span class="intro-name" aria-hidden="true">(?:<span style="--i:\d">[A-Z]<\/span>){6}<\/span><span class="intro-sr">PLUVIA<\/span>/);
assert.match(html,/<span class="intro-glass" aria-hidden="true"><\/span>/);
assert.match(html,/<span class="intro-ripple" aria-hidden="true"><\/span>/);

// Só transform/opacity nas animações novas.
for(const name of ['intro-ripple','intro-letter']){
  const frames=style.match(new RegExp(`@keyframes ${name} \\{([^@]*?)\\}\\s*(?:@|\\.|$)`));
  assert.ok(frames,name);
  const props=[...frames[1].matchAll(/([a-z-]+):/g)].map(m=>m[1]);
  assert.ok(props.every(p=>p==='opacity'||p==='transform'),`${name}: ${props}`);
}
// Movimento reduzido: ondas e letras paradas, vidro sem deslizar.
const reduced=style.slice(style.indexOf('@media(prefers-reduced-motion:reduce)'));
assert.match(reduced,/\.intro-ripple::before,\.intro-ripple::after \{ animation:none !important; \}/);
assert.match(reduced,/\.intro-glass \{ transition:none !important; transform:none !important; \}/);

// Arte gerada por script, dentro do orçamento.
assert.ok(fs.existsSync('scripts/generate-intro-glass.py'));
const size=fs.statSync('dist/assets/intro-glass.webp').size;
assert.ok(size<=150*1024,`intro-glass.webp com ${size} bytes`);
const head=fs.readFileSync('dist/assets/intro-glass.webp').subarray(0,30);
assert.equal(head.subarray(0,4).toString(),'RIFF');
assert.equal(head.subarray(12,16).toString(),'VP8X','precisa de canal alfa');
console.log('intro-glass ok');

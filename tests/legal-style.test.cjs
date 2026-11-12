// Páginas fora da Home no visual do app (1.59): céu, cartões, índice, sem as gotas da intro (saíram na 1.63) e 404 com saídas.
const assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('dist/legal.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const legal=require('../dist/modules/legal-page.js');

for(const file of ['dist/privacidade/index.html','dist/termos/index.html']){
  const page=fs.readFileSync(file,'utf8');
  const ids=[...page.matchAll(/<h2 id="([^"]+)">/g)].map(m=>m[1]);
  assert.ok(ids.length>=10,file);
  // Cada seção num cartão, rotulado pelo próprio título.
  assert.equal((page.match(/<section class="card" aria-labelledby="/g)||[]).length,ids.length,file+': uma seção por título');
  for(const id of ids) assert.match(page,new RegExp(`<section class="card" aria-labelledby="${id}">\\s*<h2 id="${id}">`),file+': '+id);
  // O índice aponta para todas as seções, na ordem.
  const toc=page.match(/<nav class="toc" aria-label="Nesta página">([\s\S]*?)<\/nav>/);
  assert.ok(toc,file+': índice');
  assert.deepEqual([...toc[1].matchAll(/href="#([^"]+)"/g)].map(m=>m[1]),ids,file+': índice na ordem das seções');
  assert.doesNotMatch(page,/sky-glass|intro-glass/,file+': sem as gotas (1.63)');
  assert.match(page,/legal\.css\?v=legal-10/);
  assert.match(page,/legal-page\.js\?v=legal-3/);
}

const notFound=fs.readFileSync('dist/404.html','utf8');
assert.match(notFound,/<p class="error-code" aria-hidden="true">404<\/p>\s*<h1>Página não encontrada<\/h1>/);
assert.match(notFound,/<a class="button primary" href="\/">Voltar para a previsão<\/a>/);
assert.match(notFound,/<a class="button" href="\/\?abrir=cidades">Buscar uma cidade<\/a>/,'atalho que o app já entende (pwa-shortcuts)');
assert.match(notFound,/legal\.css\?v=legal-10/);

// Mesmos tokens do app: céu da fase, azul atual da marca por tinta, nada do azul antigo.
assert.doesNotMatch(css,/#2f6bff|#1f56d6/i,'azul aposentado');
assert.match(css,/--sky:linear-gradient\(165deg,#10142d,#080f22 85%\)/,'céu da noite de sky.css');
assert.match(css,/--sky:linear-gradient\(165deg,#57b0e2,#bce7f5 70%,#a7d7ec\)/,'céu do dia de sky.css');
assert.match(css,/:root \{[^}]*--brand:#7cc0ff;/);
assert.match(css,/:root\[data-theme="day"\] \{[^}]*--brand:#0a4cba;/);
// O body não pode ter fundo próprio: ele pintaria por cima do céu (camada fixas com z-index negativo).
assert.doesNotMatch(css.match(/^body \{[^}]*\}/m)[0],/background/);
// Sem as gotas da intro (1.63, o dono não gostou); desfoque só no X, nunca nos cartões.
assert.doesNotMatch(css,/intro-glass|sky-glass|data-glass/);
assert.equal(legal.GLASS,undefined);
const blurred=[...css.matchAll(/([^{}]+)\{[^}]*backdrop-filter:blur/g)].map(m=>m[1].trim());
assert.deepEqual(blurred,['.close'],'blur só no botão pequeno');
assert.match(css,/@media \(prefers-reduced-transparency:reduce\) \{ \.close \{ background:var\(--card\);/);
console.log('legal-style ok');

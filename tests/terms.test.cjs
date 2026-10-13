const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const terms=require('../dist/modules/terms.js');
const store=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),m};};

test('aceite por versão dos Termos: grava neste aparelho, e versão nova pede de novo',()=>{
  const s=store();
  assert.equal(terms.accepted(s),false);
  assert.equal(terms.noticeNeeded(s),true,'primeiro acesso mostra o aviso');
  terms.dismissNotice(s,Date.parse('2026-10-13T00:00:00Z'));
  assert.equal(terms.noticeNeeded(s),false,'fechar o aviso não volta a mostrar');
  assert.equal(terms.accepted(s),false,'fechar o aviso não conta como aceite para avisos ou conta');
  const record=terms.accept('signup',s,Date.parse('2026-10-13T00:00:00Z'));
  assert.deepEqual(record,{version:terms.VERSION,at:'2026-10-13T00:00:00.000Z',via:'signup'});
  assert.equal(terms.accepted(s),true);
  s.setItem(terms.KEY,JSON.stringify({version:'2020-01-01'}));s.setItem(terms.NOTICE_KEY,JSON.stringify({version:'2020-01-01'}));
  assert.equal(terms.accepted(s),false,'Termos atualizados pedem novo aceite');
  assert.equal(terms.noticeNeeded(s),true);
  assert.equal(terms.accept('qualquer',s).via,'push','origem fora da lista vira push');
});

test('versão bate com a data dos Termos publicados',()=>{
  const page=fs.readFileSync('dist/termos/index.html','utf8');
  const months={janeiro:1,fevereiro:2,'março':3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12};
  const m=/Última atualização:\s*(?:<[^>]+>\s*)*(\d{1,2}) de ([a-zç]+) de (\d{4})/i.exec(page);
  assert.ok(m,'data da última atualização');
  assert.equal(terms.VERSION,`${m[3]}-${String(months[m[2].toLowerCase()]).padStart(2,'0')}-${m[1].padStart(2,'0')}`);
  assert.match(page,/<h2 id="privacidade">7\. Privacidade e LGPD<\/h2>/,'link direto para a privacidade');
});

test('caixinha obrigatória ao criar conta e ao ligar avisos; aviso do primeiro acesso não bloqueia',()=>{
  const html=fs.readFileSync('dist/index.html','utf8'),account=fs.readFileSync('dist/account.js','utf8'),push=fs.readFileSync('dist/notifications.js','utf8'),css=fs.readFileSync('dist/continuous.css','utf8');
  assert.match(html,/<label id="accountTermsField" class="terms-check" hidden><input id="accountTerms" type="checkbox"><span>Li e aceito os <a href="\/termos\/"/);
  assert.match(html,/<button id="termsAccept" class="whats-new-ok" type="button" disabled>Aceitar e ligar avisos<\/button>/);
  assert.match(html,/<div class="terms-notice" id="termsNotice" role="region" aria-label="Termos de uso" hidden>/);
  assert.ok(html.indexOf('modules/terms.js')<html.indexOf('account.js?v=')&&html.indexOf('modules/terms.js')<html.indexOf('notifications.js?v='),'carrega antes da conta e dos avisos');
  assert.match(account,/el\('accountTermsField'\)\.hidden = !signup; el\('accountTerms'\)\.required = signup;/);
  assert.match(account,/mode === 'signup' && el\('accountTerms'\) && !el\('accountTerms'\)\.checked/);
  assert.match(account,/terms_version:globalThis\.PLUVIA\?\.terms\?\.VERSION/);
  assert.match(push,/if \(terms\?\.ask && !terms\.accepted\(\)\) \{ terms\.ask\(\(\) => enable\(\)\); return; \}/,'o aceite chama enable() no mesmo toque (permissão do iPhone)');
  assert.match(css,/\.terms-notice \{ position:fixed;/);
});

test('QA semeia o aviso dos Termos com a versão atual (o aviso fixo bloquearia cliques)',()=>{
  const {VERSION}=require('../dist/modules/terms.js');
  for(const file of fs.readdirSync('scripts').filter(name=>/^verify-.*\.py$/.test(name))){
    const source=fs.readFileSync('scripts/'+file,'utf8');
    for(const [,version] of source.matchAll(/pluvia-terms-notice',JSON\.stringify\(\{version:'([^']+)'\}\)/g)) assert.equal(version,VERSION,file);
  }
});

test('páginas legais: X no alto volta ao app, entrada suave e mesmo visual nas duas',()=>{
  const css=fs.readFileSync('dist/legal.css','utf8'),js=fs.readFileSync('dist/modules/legal-page.js','utf8');
  for(const file of ['dist/termos/index.html','dist/privacidade/index.html']){
    const page=fs.readFileSync(file,'utf8');
    assert.match(page,/<body>\s*<header><a class="close" id="\w+" href="\/" aria-label="Fechar e voltar ao PLUVIA" data-leave>/,file+': X antes de .page (fixed fora do elemento animado)');
    assert.match(page,/<link rel="stylesheet" href="\/legal\.css\?v=legal-\d+" \/>\s*<script src="\/modules\/legal-page\.js\?v=legal-\d+"><\/script>/,file+': tema escrito no <head>, antes do primeiro desenho');
    assert.doesNotMatch(page,/<style>/,file+': estilos só em legal.css');
    const m=/Última atualização:\s*(\d{1,2}) de outubro de (\d{4})/.exec(page);
    assert.equal(m&&`${m[2]}-10-${m[1].padStart(2,'0')}`,terms.VERSION,file+': a caixinha aceita as duas páginas, na mesma versão');
  }
  assert.match(css,/\.close \{ position:fixed;[^}]*width:44px; height:44px;/);
  assert.match(css,/\.page, \.close \{ animation:legal-enter [^}]*backwards; \}/,'fill backwards: a saída por transição funciona depois da entrada');
  assert.match(css,/@media \(prefers-reduced-motion:reduce\) \{ \.page, \.close \{ animation:none; \}/);
  assert.match(css,/:root\[data-theme="day"\] \{ color-scheme:light;/);
  assert.match(js,/if \(app && runtime\.history\.length > 1\) \{ runtime\.history\.back\(\); return; \}/,'volta ao app sem recarregar');
});

test('tema das páginas legais: claro com Sol acima do horizonte na cidade aberta, escuro à noite',()=>{
  const legal=require('../dist/modules/legal-page.js');
  const manaus={lat:-3.119,lon:-60.022};
  assert.equal(legal.theme(Date.parse('2026-10-13T12:00:00-04:00'),manaus),'day');
  assert.equal(legal.theme(Date.parse('2026-10-13T05:00:00-04:00'),manaus),'night','antes do nascer');
  assert.equal(legal.theme(Date.parse('2026-10-13T18:40:00-04:00'),manaus),'night','depois do pôr');
  // Porto Alegre às 7h é dia; em Manaus, 7h de Brasília (6h locais) ainda é dia; Tóquio no mesmo instante é noite.
  const at=Date.parse('2026-10-13T07:00:00-03:00');
  assert.equal(legal.theme(at,{lat:-30.03,lon:-51.23}),'day');
  assert.equal(legal.theme(at,{lat:35.68,lon:139.69}),'night');
  const store=values=>({getItem:k=>values[k]??null});
  assert.deepEqual(legal.place(store({'pluvia-city':'"4314902"','pluvia-city-record':'{"id":"4314902","lat":-30.03,"lon":-51.23}'})),{lat:-30.03,lon:-51.23});
  assert.deepEqual(legal.place(store({'pluvia-city':'"1302603"','pluvia-city-record':'{"id":"4314902","lat":-30.03,"lon":-51.23}'})),manaus,'registro de outra cidade não vale');
  assert.deepEqual(legal.place({getItem(){throw new Error('bloqueado');}}),manaus);
});

test('Política de Privacidade cobre o que a LGPD pede (art. 9º) e o app aponta para ela',()=>{
  const page=fs.readFileSync('dist/privacidade/index.html','utf8'),html=fs.readFileSync('dist/index.html','utf8'),termos=fs.readFileSync('dist/termos/index.html','utf8'),sw=fs.readFileSync('dist/sw.js','utf8');
  for(const id of ['controlador','dados','aparelho','compartilhamento','internacional','retencao','direitos','seguranca','criancas','alteracoes']) assert.match(page,new RegExp(`<h2 id="${id}">`),id);
  for(const base of ['art. 7º, V','art. 7º, I','art. 7º, IX','art. 18','art. 19, II','art. 33','art. 48','art. 14, § 1º']) assert.ok(page.includes(base),base);
  assert.match(page,/Respostas ao “Tá chovendo aí\?”:<\/strong> 2 dias/,'mesmo prazo da migration rain_reports');
  assert.match(page,/<strong>Inscrição de avisos desligada:<\/strong> apagada em até 30 dias/,'mesmo prazo do push-process');
  assert.equal((html.match(/href="\/privacidade\/"/g)||[]).length,5,'caixinhas, nota social e seção Privacidade');
  assert.doesNotMatch(html,/termos\/#privacidade/);
  assert.match(termos,/<a href="\/privacidade\/">Política de Privacidade<\/a> explica/);
  assert.match(sw,/termos\|privacidade\)\\\/\?\$/,'SW guarda a página legal na própria URL, nunca como shell');
});

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

test('página dos Termos: X no alto volta ao app, com entrada suave e sem movimento em reduced-motion',()=>{
  const page=fs.readFileSync('dist/termos/index.html','utf8');
  assert.match(page,/<body>\s*<a class="close" id="termsClose" href="\/" aria-label="Fechar e voltar ao PLUVIA" data-leave>/,'X antes de .page (fixed fora do elemento animado)');
  assert.match(page,/\.close \{ position:fixed;[^}]*width:44px; height:44px;/);
  assert.match(page,/\.page, \.close \{ animation:terms-enter [^}]*backwards; \}/,'fill backwards: a saída por transição funciona depois da entrada');
  assert.match(page,/@media \(prefers-reduced-motion:reduce\) \{ \.page, \.close \{ animation:none; \}/);
  assert.match(page,/if \(app && history\.length > 1\) \{ history\.back\(\); return; \}/,'volta ao app sem recarregar');
  assert.equal((page.match(/data-leave/g)||[]).length,4,'X, marca, "Voltar para a previsão" e o seletor do script');
});

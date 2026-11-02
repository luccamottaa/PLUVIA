const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const avatars=require('../dist/modules/avatars.js');
const dist=path.join(__dirname,'..','dist');
function storage(initial={}){const data=new Map(Object.entries(initial));return {data,getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v))};}
test('fotos são as ilustrações da 1.44, existem e são leves',()=>{
 assert.equal(avatars.AVATARS.length,12);
 assert.equal(new Set(avatars.AVATARS.map(a=>a.id)).size,avatars.AVATARS.length);
 for(const a of avatars.AVATARS){
  assert.ok(a.label);
  // Caminho da raiz: as páginas /clima/<cidade>/ resolveriam um caminho relativo dentro delas (404).
  assert.match(a.src,/^\/assets\//);
  const file=path.join(dist,a.src.replace(/\?.*$/,''));
  assert.ok(fs.existsSync(file),a.src);
  assert.match(a.src,/\?v=avatars-\d+$/,'versionada: o arquivo muda com a arte');
  assert.equal(fs.readFileSync(file).toString('ascii',8,12),'WEBP',a.src);
  assert.ok(fs.statSync(file).size<24*1024,'foto leve: '+a.src);
 }
});
test('escolha fica por conta, neste aparelho, e some quando removida',()=>{
 const s=storage();
 assert.equal(avatars.get('u1',s),null);
 assert.equal(avatars.set('u1','sapo',s),true);assert.equal(avatars.get('u1',s).id,'sapo');
 assert.equal(avatars.get('u2',s),null,'outra conta não herda a foto');
 assert.equal(avatars.set('u1',null,s),true);assert.equal(avatars.get('u1',s),null);
 assert.equal(avatars.set('u1','inexistente',s),false);assert.equal(avatars.set('','sapo',s),false);
});
test('guarda só as últimas contas e ignora lixo no storage',()=>{
 const s=storage();
 for(let i=0;i<8;i++) avatars.set('u'+i,'sapo',s);
 assert.deepEqual(Object.keys(JSON.parse(s.data.get(avatars.KEY))),['u3','u4','u5','u6','u7']);
 assert.equal(avatars.get('u1',storage({[avatars.KEY]:'[1,2]'})),null);
 assert.equal(avatars.get('u1',storage({[avatars.KEY]:'{oops'})),null);
 assert.equal(avatars.get('u1',storage({[avatars.KEY]:'{"u1":"x"}'})),null);
 assert.equal(avatars.get('u1',storage({[avatars.KEY]:'{"u1":"sol"}'})),null,'foto antiga (até a 1.43) volta à inicial');
});
test('conta mostra a foto no botão e no perfil, com a inicial como alternativa; escolha é botão nativo',()=>{
 const account=fs.readFileSync(path.join(dist,'account.js'),'utf8'),html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
 assert.match(html,/<fieldset class="avatar-picker"><legend>Foto do perfil<\/legend><div id="avatarOptions"/);
 assert.ok(html.indexOf('modules/avatars.js')<html.indexOf('./account.js'),'módulo antes da conta');
 assert.match(account,/avatars\.paint\(face, avatar\); accountButton\.replaceChildren\(face, text\)/);
 assert.match(account,/button\.setAttribute\('aria-pressed', String\(button\.dataset\.avatarId === selected\)\)/);
 assert.doesNotMatch(account.slice(account.indexOf('function renderAvatarOptions'),account.indexOf('function localFavoriteIds')),/innerHTML/,'nada de HTML montado com dados');
});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const avatars=require('../dist/modules/avatars.js');
const dist=path.join(__dirname,'..','dist');
function storage(initial={}){const data=new Map(Object.entries(initial));return {data,getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v))};}
test('fotos usam desenhos do app que existem e estão no precache',()=>{
 const sw=fs.readFileSync(path.join(dist,'sw.js'),'utf8');
 assert.ok(avatars.AVATARS.length>=6);
 assert.equal(new Set(avatars.AVATARS.map(a=>a.id)).size,avatars.AVATARS.length);
 for(const a of avatars.AVATARS){
  assert.ok(a.label);assert.match(a.bg,/^linear-gradient\(/);
  // Caminho da raiz: as páginas /clima/<cidade>/ resolveriam um caminho relativo dentro delas (404).
  assert.match(a.src,/^\/assets\//);
  assert.ok(fs.existsSync(path.join(dist,a.src.replace(/\?.*$/,''))),a.src);
  assert.ok(sw.includes(`".${a.src}"`),'precache: '+a.src);
 }
});
test('escolha fica por conta, neste aparelho, e some quando removida',()=>{
 const s=storage();
 assert.equal(avatars.get('u1',s),null);
 assert.equal(avatars.set('u1','lua',s),true);assert.equal(avatars.get('u1',s).id,'lua');
 assert.equal(avatars.get('u2',s),null,'outra conta não herda a foto');
 assert.equal(avatars.set('u1',null,s),true);assert.equal(avatars.get('u1',s),null);
 assert.equal(avatars.set('u1','inexistente',s),false);assert.equal(avatars.set('','sol',s),false);
});
test('guarda só as últimas contas e ignora lixo no storage',()=>{
 const s=storage();
 for(let i=0;i<8;i++) avatars.set('u'+i,'sol',s);
 assert.deepEqual(Object.keys(JSON.parse(s.data.get(avatars.KEY))),['u3','u4','u5','u6','u7']);
 assert.equal(avatars.get('u1',storage({[avatars.KEY]:'[1,2]'})),null);
 assert.equal(avatars.get('u1',storage({[avatars.KEY]:'{oops'})),null);
 assert.equal(avatars.get('u1',storage({[avatars.KEY]:'{"u1":"x"}'})),null);
});
test('conta mostra a foto no botão e no perfil, com a inicial como alternativa; escolha é botão nativo',()=>{
 const account=fs.readFileSync(path.join(dist,'account.js'),'utf8'),html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
 assert.match(html,/<fieldset class="avatar-picker"><legend>Foto do perfil<\/legend><div id="avatarOptions"/);
 assert.ok(html.indexOf('modules/avatars.js')<html.indexOf('./account.js'),'módulo antes da conta');
 assert.match(account,/avatars\.paint\(face, avatar\); accountButton\.replaceChildren\(face, text\)/);
 assert.match(account,/button\.setAttribute\('aria-pressed', String\(button\.dataset\.avatarId === selected\)\)/);
 assert.doesNotMatch(account.slice(account.indexOf('function renderAvatarOptions'),account.indexOf('function localFavoriteIds')),/innerHTML/,'nada de HTML montado com dados');
});

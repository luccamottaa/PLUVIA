const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const nodes=new Map();
const get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:false,events:{},setAttribute(){},focus(){},showModal(){this.open=true},close(){this.open=false},addEventListener(k,fn){this.events[k]=fn}});return nodes.get(id)};
let listener,signupArgs,logout=false;
const user={email:'test@example.com',user_metadata:{name:'Lucca Motta'}};
let session=null;
const auth={onAuthStateChange(fn){listener=fn},async getSession(){return {data:{session}}},async signUp(args){signupArgs=args;return {data:{session:null}}},async signInWithPassword(){session={user};listener('SIGNED_IN',session);return {data:{session}}},async updateUser({data}){user.user_metadata=data;return {data:{user}}},async signOut(){logout=true;session=null;listener('SIGNED_OUT',null);return {error:null}}};
const context={document:{getElementById:get,createElement(){return {}},head:{appendChild(s){s.onload()}}},window:{supabase:{createClient(){return {auth}}}},location:{origin:'https://pluviaweather.com.br',pathname:'/',hash:''},localStorage:{getItem(){return null}}};
vm.runInNewContext(fs.readFileSync('dist/account.js','utf8'),context);
(async()=>{
get('accountSignup').events.click();get('accountName').value='Lucca Motta';get('accountEmail').value='test@example.com';get('accountPassword').value='example-password';
await get('accountForm').events.submit({preventDefault(){}});
assert.equal(signupArgs.options.data.name,'Lucca Motta');assert.match(get('accountStatus').textContent,/confirmar/);assert.doesNotMatch(get('accountButton').textContent,/Olá/);
get('accountLogin').events.click();get('accountPassword').value='example-password';await get('accountForm').events.submit({preventDefault(){}});
assert.equal(get('accountButton').textContent,'Olá, Lucca');assert.equal(get('accountPassword').value,'');
user.user_metadata={};listener('SIGNED_IN',{user});assert.match(get('profileNameHint').textContent,/Falta seu nome/);get('profileName').value='Lucca';await get('profileForm').events.submit({preventDefault(){}});assert.equal(get('accountButton').textContent,'Olá, Lucca');
await get('accountLogout').events.click();assert(logout);assert.equal(get('accountButton').textContent,'Entrar / cadastrar');
console.log('PASS signup confirmation, name metadata, login greeting, password clearing and logout');
})().catch(e=>{console.error(e);process.exitCode=1});

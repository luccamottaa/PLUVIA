const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('dist/app.js','utf8');
const start=app.indexOf('function requestLocationIfGranted(');
const source=app.slice(start,app.indexOf('requestLocationIfGranted();',start));
async function opening({state,api=true,cityPage=false,fails=false}={}){
 const calls=[];
 const permissions=api?{query:async descriptor=>{assert.equal(descriptor.name,'geolocation');if(fails)throw Error('unsupported');return {state};}}:undefined;
 const context=vm.createContext({requestLocation:source=>calls.push(source),document:{querySelector:selector=>cityPage&&selector.includes('pluvia-city')?{content:'1501402'}:null},navigator:{permissions}});
 context.globalThis=context;
 vm.runInContext(source+'\nrequestLocationIfGranted();',context);
 await new Promise(resolve=>setImmediate(resolve));
 return calls;
}
test('a abertura usa a posição só quando a permissão já foi concedida, sem abrir pedido',async()=>{
 assert.deepEqual(await opening({state:'granted'}),['automatic']);
 assert.deepEqual(await opening({state:'prompt'}),[],'nunca perguntou: não abre o pedido sozinha');
 assert.deepEqual(await opening({state:'denied'}),[]);
 assert.deepEqual(await opening({api:false}),[],'sem a API não há como saber sem perguntar');
 assert.deepEqual(await opening({state:'granted',fails:true}),[]);
});
test('página de cidade nunca aplica a posição sozinha, mesmo com permissão concedida',async()=>{
 assert.deepEqual(await opening({state:'granted',cityPage:true}),[]);
});
test('o aviso de abertura oferece localização por gesto e trocar cidade',()=>{
 const html=fs.readFileSync('dist/index.html','utf8'),p0=fs.readFileSync('dist/p0.js','utf8');
 assert.match(html,/<button type="button" id="noticeLocate">Usar minha localização<\/button>/);
 assert.match(p0,/getElementById\("noticeLocate"\)\?\.addEventListener\("click", \(\) => requestLocation\('notice'\)\)/);
 assert.doesNotMatch(html+p0,/Localização indisponível/,'não dizer indisponível quando nem foi perguntado');
});

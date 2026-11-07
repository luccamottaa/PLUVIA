'use strict';
// Checks the published bytes, not just HTTP 200. No authentication or weather API calls.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
function manifest(directory) {
 const html=fs.readFileSync(path.join(directory,'index.html'),'utf8');
 const references=[...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)].map(match=>match[1]);
 const sw=fs.readFileSync(path.join(directory,'sw.js'),'utf8');
 references.push(...[...sw.matchAll(/["'](\.\/assets\/weather-icons\/(?:conditions|metrics)\/[^"']+\.svg\?[^"']+)["']/g)].map(match=>match[1]));
 const assets=[{url:'',file:'index.html'},{url:'sw.js',file:'sw.js'}];
 for(const value of new Set(references)) {
  if(/^[a-z]+:|^\/\//i.test(value))continue;
  const file=value.split('?')[0].replace(/^\.\//,'');
  if(file.startsWith('/') || file.split('/').includes('..'))throw new Error('Invalid shell reference');
  assets.push({url:value,file});
 }
 return assets.map(asset=>({...asset,hash:hash(fs.readFileSync(path.join(directory,asset.file)))}));
}
// Arquivos sem ?v= (o HTML e o sw.js) passam pelo cache de borda da Cloudflare com o max-age de 10 min
// do GitHub Pages: logo depois do deploy a borda ainda entregava o sw.js anterior (deploy do #217).
// Um parâmetro próprio do hash esperado vira outra chave de cache na borda; o Pages ignora a query.
function requestUrl(asset,origin) {
 const url=new URL(asset.url,origin);
 if(!url.search && asset.hash)url.searchParams.set('release-check',asset.hash.slice(0,12));
 return url;
}
async function check(asset,origin,fetchImpl=fetch) {
 try {
  const response=await fetchImpl(requestUrl(asset,origin),{signal:AbortSignal.timeout(12000),cache:'no-store',redirect:'error',headers:{'user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36','accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','accept-language':'en-US,en;q=0.9'}});
  if(!response.ok)return {...asset,ok:false,code:'http_'+response.status};
  const ok=hash(Buffer.from(await response.arrayBuffer()))===asset.hash;
  return {...asset,ok,code:ok ? 'matched' : 'content_mismatch'};
 }catch(error){return {...asset,ok:false,code:['TimeoutError','AbortError'].includes(error.name)?'timeout':'network'};}
}
// Few connections at a time: 86 simultaneous requests made the domain drop connections (`network`) after deploys.
async function checkAll(assets,origin,fetchImpl,concurrency) {
 const results=new Array(assets.length);let next=0;
 const worker=async()=>{while(next<assets.length){const index=next++;results[index]=await check(assets[index],origin,fetchImpl);}};
 await Promise.all(Array.from({length:Math.min(concurrency,assets.length)},worker));
 return results;
}
async function verify(assets,origin,{fetchImpl=fetch,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts=4,concurrency=6}={}) {
 const results=new Map();let pending=assets;
 for(let attempt=0;attempt<attempts && pending.length;attempt++) {
  const batch=await checkAll(pending,origin,fetchImpl,concurrency);batch.forEach(result=>results.set(result.url,result));
  pending=batch.filter(result=>!result.ok);if(pending.length && attempt<attempts-1)await pause(5000*(attempt+1));
 }
 return assets.map(asset=>results.get(asset.url));
}
function verifyLocal(assets,directory) {
 const root=path.resolve(directory)+path.sep;
 return assets.map(asset=>{
  const file=path.resolve(directory,asset.file);
  if(!file.startsWith(root))return {...asset,ok:false,code:'invalid_path'};
  try {
   const bytes=fs.readFileSync(file);
   const ok=bytes.length>0 && hash(bytes)===asset.hash;
   return {...asset,ok,code:ok?'local_match':bytes.length?'content_mismatch':'empty_file'};
  } catch { return {...asset,ok:false,code:'missing_file'}; }
 });
}
module.exports={manifest,check,verify,verifyLocal};
if(require.main===module)(()=>{
 const directory=path.resolve(__dirname,'../dist');
 const assets=manifest(directory);
 const results=verifyLocal(assets,directory);
 console.log(JSON.stringify({source:'local-build',checkedAt:new Date().toISOString(),assetCount:results.length,results:results.map(({url,file,ok,code})=>({url,file,ok,code}))},null,2));
 if(results.some(result=>!result.ok))process.exitCode=1;
})();

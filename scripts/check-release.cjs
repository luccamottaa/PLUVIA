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
async function check(asset,origin,fetchImpl=fetch) {
 try {
  const response=await fetchImpl(new URL(asset.url,origin),{signal:AbortSignal.timeout(12000),cache:'no-store',redirect:'error'});
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
module.exports={manifest,check,verify};
if(require.main===module)(async()=>{
 const origin=process.env.PLUVIA_PUBLIC_URL||'https://pluviaweather.com.br/';
 if(new URL(origin).protocol!=='https:')throw new Error('Public check requires HTTPS');
 const assets=manifest(path.resolve(__dirname,'../dist'));
 // Wait for the HTML publication before checking its assets to limit needless requests.
 const shell=await verify(assets.slice(0,1),origin);
 const results=shell[0].ok ? [...shell,...await verify(assets.slice(1),origin)] : shell;
 console.log(JSON.stringify({origin,checkedAt:new Date().toISOString(),results:results.map(({url,ok,code})=>({url,ok,code}))},null,2));
 if(results.some(result=>!result.ok))process.exitCode=1;
})().catch(error=>{console.error(error.message);process.exitCode=1;});

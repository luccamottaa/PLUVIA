(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  root.PLUVIA=root.PLUVIA || {};root.PLUVIA.socialAuth=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  'use strict';
  const PROJECT_URL='https://dszyyrcvwrpyiypwyvxe.supabase.co';
  const PUBLIC_KEY='sb_publishable_SdPTXhk3Q7aD-ra0S9dm_A_rnXSS4Jc';
  const providers=Object.freeze(['google','apple']);
  function redirectTo(location){
    const base=new URL(location.origin+location.pathname);
    if(base.protocol!=='https:' && !(base.protocol==='http:' && ['localhost','127.0.0.1'].includes(base.hostname)))throw new Error('invalid_auth_origin');
    base.search='?auth_return=1';base.hash='';
    return base.href;
  }
  function callback(href){
    const url=new URL(href),returned=url.searchParams.get('auth_return')==='1';
    if(!returned)return {returned:false,error:null};
    const fragment=new URLSearchParams(url.hash.slice(1));
    const error=url.searchParams.get('error_code') || url.searchParams.get('error') || fragment.get('error_code') || fragment.get('error');
    return {returned:true,error:error ? ['access_denied','user_cancelled_authorize','user_cancelled_login'].includes(error) ? 'cancelled' : 'failed' : null};
  }
  function cleanCallback(href){
    const url=new URL(href);
    if(url.searchParams.get('auth_return')!=='1')return url.href;
    for(const key of ['auth_return','code','error','error_code','error_description'])url.searchParams.delete(key);
    const hash=new URLSearchParams(url.hash.slice(1));
    if(['access_token','refresh_token','error','error_code','error_description'].some(key=>hash.has(key)))url.hash='';
    return url.href;
  }
  function authorizeUrl(value,provider){
    if(!providers.includes(provider))throw new Error('unsupported_provider');
    const url=new URL(value);
    if(url.origin!==PROJECT_URL || url.pathname!=='/auth/v1/authorize' || url.username || url.password || url.searchParams.get('provider')!==provider)throw new Error('invalid_authorize_url');
    return url.href;
  }
  function createDiscovery(http,{now=Date.now}={}){
    let cached=null,until=0,flight=null;
    function load(){
      if(cached && now()<until)return Promise.resolve(cached);
      if(flight)return flight;
      const task=Promise.resolve().then(()=>{
        if(!http?.getJson)throw new Error('client_unavailable');
        return http.getJson(PROJECT_URL+'/auth/v1/settings',{headers:{apikey:PUBLIC_KEY},timeoutMs:6000,cache:'no-store'});
      }).then(data=>{
        if(!data?.external || typeof data.external!=='object' || Array.isArray(data.external))throw new Error('invalid_settings');
        cached=Object.freeze({google:data.external.google===true,apple:data.external.apple===true});
        const complete=providers.every(provider=>typeof data.external[provider]==='boolean');
        until=now()+(complete ? 300000 : 10000);return cached;
      }).catch(()=>{cached=Object.freeze({google:false,apple:false});until=now()+10000;return cached;}).finally(()=>{if(flight===task)flight=null;});
      flight=task;return task;
    }
    return Object.freeze({load});
  }
  return Object.freeze({providers,redirectTo,callback,cleanCallback,authorizeUrl,createDiscovery});
});

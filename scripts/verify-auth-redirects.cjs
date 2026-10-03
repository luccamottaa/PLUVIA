// Checks hosted Auth redirect configuration without accounts, emails or valid tokens.
// Node 24; use NODE_USE_ENV_PROXY=1 when the execution environment requires its proxy.
'use strict';
const {redirectTo}=require('../dist/modules/social-auth.js');
const location={origin:'https://pluviaweather.com.br',pathname:'/'};
const site=redirectTo(location,'confirmation');
const probes=[
  ['Site URL',null,site],
  ['Cadastro',site,site],
  ['Recuperação',redirectTo(location,'recovery'),redirectTo(location,'recovery')],
  ['Login social',redirectTo(location),redirectTo(location)],
  ['Destino externo recusado','https://redirect-probe.example.invalid/',site],
];
(async()=>{
  let failed=false;
  for(const [label,requested,expected] of probes){
    const url=new URL('https://dszyyrcvwrpyiypwyvxe.supabase.co/auth/v1/verify');
    url.searchParams.set('token','pluvia-invalid-redirect-diagnostic');
    url.searchParams.set('type','signup');
    if(requested)url.searchParams.set('redirect_to',requested);
    try{
      const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(10000)});
      const header=response.headers.get('location');await response.arrayBuffer();
      if(response.status!==303 || !header)throw new Error('HTTP '+response.status+' sem retorno de verificação');
      const target=new URL(header),fragment=new URLSearchParams(target.hash.slice(1));
      // An invalid token must produce a safe error, never a session. Do not print fragments.
      if(!fragment.has('error') || fragment.has('access_token') || fragment.has('refresh_token'))throw new Error('resposta de diagnóstico inesperada');
      target.hash='';
      const safeTarget=target.origin+target.pathname;
      if(target.href!==expected){
        failed=true;console.log('FAIL '+label+': retorno para '+safeTarget+'; conferir Site URL / Redirect URLs.');
      }else console.log('PASS '+label+': '+safeTarget);
    }catch(error){failed=true;console.log('FAIL '+label+': '+(error.name==='TimeoutError' ? 'timeout' : error.message));}
  }
  if(failed)process.exitCode=1;
})().catch(()=>{console.error('Não foi possível conferir os retornos de autenticação.');process.exitCode=1;});

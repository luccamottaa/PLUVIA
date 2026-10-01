(function(root,factory){
  const api=factory(root);
  if(typeof module==='object' && module.exports) module.exports=api;
  root.PLUVIA=root.PLUVIA || {};root.PLUVIA.accountSync=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(runtime){
  'use strict';
  const ids=value=>[...new Set(Array.isArray(value) ? value.filter(id=>typeof id==='string' && /^\d{7}$/.test(id)) : [])].slice(0,30);
  function difference(before,after){
    const old=new Set(ids(before)),next=new Set(ids(after));
    return [...[...old].filter(id=>!next.has(id)).map(cityId=>({cityId,enabled:false})),...[...next].filter(id=>!old.has(id)).map(cityId=>({cityId,enabled:true}))];
  }
  function create({getClient,getUser,onSnapshot,now=()=>Date.now()}){
    let owner=null,epoch=0,chain=Promise.resolve(),cached=null,loadedAt=0,readTask=null;
    const controllers=new Set();
    const changed=()=>Object.assign(new Error('A conta mudou. Tente novamente.'),{code:'account_changed'});
    function setUser(user){
      if(owner===(user?.id || null)) return;
      owner=user?.id || null;epoch++;cached=null;loadedAt=0;readTask=null;chain=Promise.resolve();
      controllers.forEach(controller=>controller.abort());controllers.clear();
    }
    function enqueue(action,operations,ownerId=owner){
      const revision=epoch;
      const active=()=>ownerId && owner===ownerId && getUser()?.id===ownerId && epoch===revision;
      const task=chain.catch(()=>{}).then(async()=>{
        if(!active()) throw changed();
        const client=await getClient();
        if(!active()) throw changed();
        const controller=new runtime.AbortController();controllers.add(controller);
        try{
          const {data,error}=await client.functions.invoke('account-preferences',{body:{action,ownerId,operations},signal:controller.signal,timeout:15000});
          if(!active()) throw changed();
          let details=data;
          if(error) {try{details=await error.context?.json?.();}catch{}if(!active()) throw changed();}
          if(details?.snapshot){
            const value=details.snapshot;
            if(!Array.isArray(value.favoriteCityIds) || !Array.isArray(value.namedPlaces)) throw Error('Resposta de sincronização inválida.');
            cached={displayName:typeof value.displayName==='string' ? value.displayName : undefined,favoriteCityIds:ids(value.favoriteCityIds),primaryCityId:/^\d{7}$/.test(value.primaryCityId || '') ? value.primaryCityId : null,namedPlaces:value.namedPlaces};
            loadedAt=now();onSnapshot?.({ownerId,snapshot:cached,failed:!!error});
          }
          if(error) throw Object.assign(new Error(details?.error || 'Não foi possível sincronizar agora. Tente novamente.'),{code:details?.code || 'service_unavailable'});
          if(!details?.snapshot) throw Error('Resposta de sincronização inválida.');
          return cached;
        }finally{controllers.delete(controller);}
      });
      chain=task.catch(()=>{});return task;
    }
    function load(force=false){
      if(!owner) return Promise.resolve(null);
      if(readTask) return readTask;
      if(!force && cached && now()-loadedAt<30000) return Promise.resolve(cached);
      const task=enqueue('read');readTask=task;
      task.finally(()=>{if(readTask===task)readTask=null;}).catch(()=>{});
      return task;
    }
    return {setUser,load,apply:(operations,ownerId)=>enqueue('apply',operations,ownerId),getSnapshot:()=>cached};
  }
  return {create,ids,difference};
});

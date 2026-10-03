(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const dialog = el('accountDialog');
  let clientPromise, mode = 'login', currentUser = null, busy = false, preferenceTimer, syncingOwner = null, flushingOwner = null, accountRevision = 0;
  const social = window.PLUVIA.socialAuth;
  const providerDiscovery = social?.createDiscovery(window.PLUVIA.http?.createClient());
  let availableProviders = {google:false,apple:false}, providersLoading = null, returning = null, oauthNavigationTimer = null, oauthNavigationPending = false;
  try { returning=social?.callback(location.href); } catch {}
  const syncModel = window.PLUVIA.accountSync;
  let recoveryActive = false, recoveryReturn = false, recoveryAttempt = false, recoverySentAt = 0;
  try { const url=new URL(location.href); recoveryReturn=url.searchParams.get('auth_recovery')==='1'; } catch {}
  const strongPassword=value=>value.length>=12 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
  let favoriteView = localFavoriteIds();
  const preferenceSync = syncModel.create({getClient,getUser:()=>currentUser,onSnapshot:receivePreferences});
  let pendingPreferences = {}, inFlightPreferences = null;
  const message = text => { el('accountStatus').textContent = text; };
  const track = (name,properties) => window.pluviaAnalytics?.track(name,properties);
  function paint(user) {
    if (currentUser?.id !== user?.id || !user) {
      clearTimeout(preferenceTimer);
      pendingPreferences = {};
    }
    const switched = currentUser?.id !== user?.id;
    currentUser = user;
    if(switched){accountRevision++;syncingOwner=null;flushingOwner=null;inFlightPreferences=null;}
    preferenceSync.setUser(user);
    if(switched && user) {
      restorePending(user.id);
      const marker=storedOwner();
      if(marker && marker!==user.id) refreshFavoriteUI(syncModel.ids(user.user_metadata?.favorite_city_ids));
      favoriteView=localFavoriteIds();
    }
    paintIdentity(user,switched);
    if(!user)recoveryActive=false;
    el('accountProfile').hidden = !user || recoveryActive;
    el('accountForm').hidden = !!user;
    el('accountRecoveryForm').hidden = !user || !recoveryActive;
    el('accountTabs').hidden = !!user;
    el('accountIdentity').textContent = user?.email || '';
    el('accountIntro').hidden = !!user;
    paintProviders();
    window.dispatchEvent?.(new CustomEvent('pluvia:auth-changed',{detail:{user}}));
  }
  function paintIdentity(user,force=false){
    const metadata = user?.user_metadata || {};
    const synced=preferenceSync.getSnapshot()?.displayName;
    const fullName = typeof synced==='string' && synced.trim() ? synced : [metadata.name,metadata.full_name,metadata.display_name].find(value => typeof value === 'string' && value.trim()) || '';
    const name = fullName.trim().split(/\s+/)[0].slice(0,40);
    el('accountButton').textContent = user ? (name ? `Olá, ${name}` : 'Minha conta') : 'Entrar / cadastrar';
    el('accountButton').title = el('accountButton').textContent;
    el('profileAvatar').textContent = (name || 'P').slice(0,1).toUpperCase();
    el('profileDisplayName').textContent = fullName || 'Sua conta';
    if(force || document.activeElement!==el('profileName'))el('profileName').value = fullName;
    el('profileNameHint').textContent = name ? 'Esse nome aparece na saudação do topo.' : 'Falta seu nome. Salve abaixo para aparecer “Olá, seu nome” no topo.';
  }
  function localFavoriteIds() {
    try { return JSON.parse(localStorage.getItem('pluvia-favorites') || '[]').filter(id=>/^\d{7}$/.test(String(id))); } catch { return []; }
  }
  function refreshFavoriteUI(ids) {
    if (typeof favorites === 'undefined') return;
    favorites.clear(); ids.forEach(id=>favorites.add(id));
    try { writePreference('pluvia-favorites',ids); renderCityOptions(); updateCityLabels(); } catch {}
    window.dispatchEvent?.(new CustomEvent('pluvia:favorites-loaded'));
  }
  function storedOwner(){try{return localStorage.getItem('pluvia-favorites-owner');}catch{return null;}}
  function persistPending(){
    if(!currentUser)return;
    try{
      const flight=inFlightPreferences?.ownerId===currentUser.id ? inFlightPreferences.operations : {};
      const value={...pendingPreferences,favoriteChanges:{...Object.fromEntries((flight.favoriteChanges || []).map(item=>[item.cityId,item.enabled])),...pendingPreferences.favoriteChanges}};
      if(!value.primaryCityId && flight.primaryCityId)value.primaryCityId=flight.primaryCityId;
      localStorage.setItem('pluvia-account-pending-'+currentUser.id,JSON.stringify(value));
    }catch{}
  }
  function restorePending(ownerId){
    try{
      const raw=localStorage.getItem('pluvia-account-pending-'+ownerId);
      if(!raw || raw.length>50000)return;
      const value=JSON.parse(raw),changes=value.favoriteChanges || {};
      if(typeof changes!=='object' || Array.isArray(changes) || Object.keys(changes).length>600)return;
      pendingPreferences={favoriteChanges:Object.fromEntries(Object.entries(changes).filter(([id,value])=>/^\d{7}$/.test(id) && typeof value==='boolean'))};
      if(/^\d{7}$/.test(value.primaryCityId || ''))pendingPreferences.primaryCityId=value.primaryCityId;
    }catch{}
  }
  function receivePreferences({ownerId,snapshot,failed}){
    if(currentUser?.id!==ownerId)return;
    const combined=new Set(snapshot.favoriteCityIds);
    const flight=!failed && inFlightPreferences?.ownerId===ownerId ? Object.fromEntries((inFlightPreferences.operations.favoriteChanges || []).map(item=>[item.cityId,item.enabled])) : {};
    for(const [id,enabled] of Object.entries({...flight,...pendingPreferences.favoriteChanges}))enabled ? combined.add(id) : combined.delete(id);
    favoriteView=[...combined].slice(0,30);
    refreshFavoriteUI(favoriteView);paintIdentity(currentUser);
    try{localStorage.setItem('pluvia-favorites-owner',ownerId);}catch{}
    window.dispatchEvent?.(new CustomEvent('pluvia:preferences-loaded',{detail:{ownerId,snapshot}}));
  }
  async function mergeAccountPreferences(user){
    if(!user || currentUser?.id!==user.id || syncingOwner===user.id)return;
    const ownerId=user.id,revision=accountRevision,guest=!storedOwner() ? favoriteView.slice() : [];
    const active=()=>currentUser?.id===ownerId && revision===accountRevision;
    syncingOwner=ownerId;
    if(guest.length){
      pendingPreferences.favoriteChanges={...Object.fromEntries(guest.map(id=>[id,true])),...pendingPreferences.favoriteChanges};
      persistPending();
    }
    try{
      const snapshot=await preferenceSync.load();
      if(!active() || !snapshot)return;
      if(guest.length){
        const merged=[...new Set([...snapshot.favoriteCityIds,...guest])].slice(0,30);
        for(const id of guest)if(!merged.includes(id) && pendingPreferences.favoriteChanges?.[id]===true)delete pendingPreferences.favoriteChanges[id];
        for(const change of syncModel.difference(snapshot.favoriteCityIds,merged)){
          pendingPreferences.favoriteChanges={...pendingPreferences.favoriteChanges,[change.cityId]:change.enabled};
        }
      }
      const localCity=typeof readPreference==='function' ? readPreference('pluvia-city',null) : null;
      if(!localCity && snapshot.primaryCityId && typeof chooseCity==='function')chooseCity(snapshot.primaryCityId);
      persistPending();queueFlush();
    }catch{if(active())message('Preferências disponíveis neste dispositivo. A sincronização será tentada ao reconectar.');}
    finally{if(active())syncingOwner=null;}
  }
  function queueFlush(){
    if(!currentUser)return;
    clearTimeout(preferenceTimer);
    preferenceTimer=setTimeout(flushPreferences,450);
  }
  async function flushPreferences(){
    if(!currentUser || flushingOwner===currentUser.id)return;
    const ownerId=currentUser.id,revision=accountRevision;
    const active=()=>currentUser?.id===ownerId && revision===accountRevision;
    const entries=Object.entries(pendingPreferences.favoriteChanges || {}).slice(0,60);
    const operations={};
    if(entries.length)operations.favoriteChanges=entries.map(([cityId,enabled])=>({cityId,enabled}));
    if(pendingPreferences.primaryCityId)operations.primaryCityId=pendingPreferences.primaryCityId;
    if(!Object.keys(operations).length)return;
    for(const [id] of entries)delete pendingPreferences.favoriteChanges[id];
    delete pendingPreferences.primaryCityId;
    flushingOwner=ownerId;inFlightPreferences={ownerId,operations};
    try{
      await preferenceSync.apply(operations,ownerId);
      if(active()){inFlightPreferences=null;persistPending();if(Object.keys(pendingPreferences.favoriteChanges || {}).length || pendingPreferences.primaryCityId)queueFlush();}
    }catch(error){
      if(!active())return;
      if(!['favorite_limit','place_limit','preference_conflict','invalid_operations','account_changed'].includes(error.code)){
        pendingPreferences.favoriteChanges={...Object.fromEntries(entries),...pendingPreferences.favoriteChanges};
        if(operations.primaryCityId && !pendingPreferences.primaryCityId)pendingPreferences.primaryCityId=operations.primaryCityId;
        message('Preferência salva neste dispositivo. A sincronização será tentada ao reconectar.');
      }else message(error.message);
      inFlightPreferences=null;persistPending();
    }finally{if(active() && flushingOwner===ownerId)flushingOwner=null;}
  }
  function schedulePreferences(patch){
    if(!currentUser)return;
    if(patch.favoriteCityIds){
      const next=syncModel.ids(patch.favoriteCityIds),changes={...pendingPreferences.favoriteChanges};
      for(const change of syncModel.difference(favoriteView,next))changes[change.cityId]=change.enabled;
      if(Object.keys(changes).length>600){refreshFavoriteUI(favoriteView);message('Conecte-se para sincronizar antes de alterar mais favoritos.');return;}
      pendingPreferences.favoriteChanges=changes;favoriteView=next;
    }
    if(patch.primaryCityId)pendingPreferences.primaryCityId=patch.primaryCityId;
    persistPending();queueFlush();
  }
  function setMode(next) {
    if (busy) return;
    mode = next;
    const signup = mode === 'signup', reset = mode === 'reset';
    el('accountPasswordField').hidden=reset;
    el('accountPassword').required=!reset;
    el('accountForgot').hidden=signup || reset;
    el('accountNameField').hidden = !signup;
    el('accountName').required = signup;
    el('accountPassword').minLength = signup ? 12 : 1;
    el('accountPassword').autocomplete = signup ? 'new-password' : 'current-password';
    el('accountPassword').value = '';
    el('accountPasswordHint').hidden = !signup;
    el('accountSubmit').textContent = reset ? 'Enviar link de recuperação' : signup ? 'Criar minha conta' : 'Entrar';
    el('accountSignup').setAttribute('aria-pressed',String(signup));
    el('accountLogin').setAttribute('aria-pressed',String(mode==='login'));
    paintProviders();
    message('');
  }

  function paintProviders(){
    const options=el('accountSocial');
    if(!options)return;
    options.hidden=!!currentUser || mode==='reset' || !social?.providers.some(provider=>availableProviders[provider]===true);
    for(const provider of social?.providers || []){
      const button=el(provider==='google' ? 'accountGoogle' : 'accountApple');
      if(button){button.hidden=!availableProviders[provider];button.disabled=busy || !!currentUser;}
    }
  }
  function setBusy(value){
    busy=value;el('accountSubmit').disabled=value;
    el('accountLogin').disabled=value;el('accountSignup').disabled=value;
    el('accountForgot').disabled=value;
    el('accountRecoverySave').disabled=value;
    el('accountDelete').disabled=value;
    el('accountLogout').disabled=value;
    paintProviders();
  }
  function loadProviders(){
    if(!providerDiscovery)return Promise.resolve();
    if(providersLoading)return providersLoading;
    const task=providerDiscovery.load().then(providers=>{availableProviders=providers;paintProviders();}).finally(()=>{if(providersLoading===task)providersLoading=null;});
    providersLoading=task;return task;
  }
  async function socialSignIn(provider){
    if(busy || recoveryActive || currentUser || !social?.providers.includes(provider) || !availableProviders[provider])return;
    setBusy(true);message('Abrindo '+(provider==='google' ? 'Google' : 'Apple')+'…');
    track('Auth Started',{mode});
    let redirecting=false;
    try{
      const client=await getClient();
      if(currentUser)return;
      const result=await client.auth.signInWithOAuth({provider,options:{redirectTo:social.redirectTo(location),skipBrowserRedirect:true}});
      if(result.error)throw result.error;
      const target=social.authorizeUrl(result.data?.url,provider);
      el('accountPassword').value='';
      location.assign(target);redirecting=true;oauthNavigationPending=true;
      oauthNavigationTimer=setTimeout(()=>{oauthNavigationPending=false;setBusy(false);message('Se a página de acesso não abriu, tente novamente ou entre com e-mail.');},10000);
    }catch(error){message(authError(error));}
    finally{if(!redirecting)setBusy(false);}
  }
  function finishSocialReturn(){
    if(!returning?.returned)return;
    const result=returning;returning=null;
    try{history.replaceState(history.state,'',social.cleanCallback(location.href));}catch{}
    if(currentUser && !result.error){
      track('Auth Completed',{mode:'login'});
      if(!el('profileName').value.trim()){dialog.showModal();message('Sua conta está conectada. Como você quer ser chamado?');el('profileName').focus();}
      return;
    }
    dialog.showModal();el('accountClose').focus();
    message(result.error==='cancelled' ? 'Você cancelou o acesso. Pode tentar novamente ou entrar com e-mail.' : 'Não foi possível concluir o acesso. Tente novamente ou entre com e-mail.');
    loadProviders().catch(()=>{});
  }
  function authError(error, action = 'account') {
    const code = error?.code;
    if(['provider_disabled','unsupported_provider','oauth_provider_not_supported'].includes(code))return 'Essa opção de acesso está indisponível no momento. Use e-mail ou tente novamente mais tarde.';
    if(['access_denied','user_cancelled_authorize','user_cancelled_login'].includes(code))return 'Você cancelou o acesso. Pode tentar novamente ou entrar com e-mail.';
    if (code === 'invalid_credentials') return 'E-mail ou senha incorretos. Confira os dados e tente novamente.';
    if (code === 'email_not_confirmed') return 'Confirme seu e-mail pelo link recebido e depois entre aqui.';
    if (code === 'user_already_exists') return 'Já existe uma conta com esse e-mail. Use Entrar.';
    if (code === 'weak_password') return 'Use uma senha mais forte, com letras, números e símbolos.';
    if (/rate_limit/.test(code || '')) return 'Muitas tentativas. Espere um pouco e tente novamente.';
    if (code === 'email_address_not_authorized') return 'O envio de e-mails ainda precisa ser liberado pelo PLUVIA. Tente novamente mais tarde.';
    if (code === 'unexpected_failure' || error?.status >= 500) {
      if (action === 'reset') return 'Não foi possível enviar o e-mail de recuperação. O serviço do Pluvia está indisponível no momento. Tente novamente mais tarde.';
      if (action === 'signup') return 'Não foi possível concluir o cadastro. O serviço do Pluvia está indisponível no momento. Tente novamente mais tarde.';
      return 'O serviço de contas do Pluvia está indisponível no momento. Tente novamente mais tarde.';
    }
    return 'Não foi possível acessar a conta. Confira a conexão e tente novamente.';
  }
  function getClient() {
    if (clientPromise) return clientPromise;
    clientPromise = new Promise((resolve,reject) => {
      const script = document.createElement('script');
      let completed=false;
      const fail=()=>{if(completed)return;completed=true;clearTimeout(timeout);script.remove?.();reject(new Error('SDK indisponível'));};
      const timeout=setTimeout(fail,12000);
      script.src = './vendor/supabase-2.116.0.js';
      script.onload = () => {
        if(completed)return;completed=true;clearTimeout(timeout);
        try {
          const client = window.supabase.createClient('https://dszyyrcvwrpyiypwyvxe.supabase.co','sb_publishable_SdPTXhk3Q7aD-ra0S9dm_A_rnXSS4Jc', {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
          client.auth.onAuthStateChange((event,session) => {
            const user=session?.user || null;
            if(event==='PASSWORD_RECOVERY' && user) {recoveryActive=true;recoveryAttempt=true;}
            paint(user);
            if(event==='PASSWORD_RECOVERY' && user)setTimeout(()=>{if(recoveryActive && currentUser?.id===user.id){if(!dialog.open)dialog.showModal();message('Defina sua nova senha abaixo.');el('accountNewPassword').focus();}},0);
            if(user && !recoveryActive) setTimeout(()=>mergeAccountPreferences(user),0);
          });
          resolve(client);
        } catch (error) { reject(error); }
      };
      script.onerror = fail;
      document.head.appendChild(script);
    }).catch(error => { clientPromise = null; throw error; });
    return clientPromise;
  }
  async function restoreAccount() {
    const revision=accountRevision;
    try {
      const client = await getClient();
      if(revision!==accountRevision)return;
      const {data,error} = await client.auth.getSession();
      if(revision!==accountRevision)return;
      if (error) throw error;
      paint(data?.session?.user || null);
      if(data?.session?.user && !recoveryActive) await mergeAccountPreferences(data.session.user);
    } catch (_) {
      if(revision===accountRevision)paint(null);
    }
  }
  el('accountButton').addEventListener('click', () => {
    dialog.showModal(); el('accountClose').focus();
    dialog.querySelector?.('.dialog-scroll')?.scrollTo?.(0, 0);
    loadProviders().catch(()=>{});
    restoreAccount().catch(() => {});
  });
  el('accountClose').addEventListener('click', () => globalThis.PLUVIA?.dialogs?.close(dialog) ?? dialog.close());
  dialog.addEventListener('close', () => { el('accountPassword').value = ''; el('accountNewPassword').value='';el('accountNewPasswordConfirm').value='';el('accountDeleteConfirm').value=''; el('accountButton').focus(); });
  el('accountGoogle')?.addEventListener('click',()=>socialSignIn('google'));
  el('accountApple')?.addEventListener('click',()=>socialSignIn('apple'));
  window.addEventListener?.('pageshow',()=>{if(oauthNavigationPending){clearTimeout(oauthNavigationTimer);oauthNavigationPending=false;setBusy(false);message('');}});
  el('accountLogin').addEventListener('click', () => setMode('login'));
  el('accountSignup').addEventListener('click', () => setMode('signup'));
  el('accountForgot').addEventListener('click',()=>{setMode('reset');message('Informe seu e-mail para receber um link de recuperação.');el('accountEmail').focus();});
  el('accountForm').addEventListener('submit', async event => {
    event.preventDefault(); if(busy) return;
    if(mode==='reset') {
      if(Date.now()-recoverySentAt<60000){message('Espere um minuto antes de solicitar outro link.');return;}
      const email=el('accountEmail').value.trim();
      setBusy(true);message('Solicitando link…');
      try {
        const client=await getClient();
        const result=await client.auth.resetPasswordForEmail(email,{redirectTo:social.redirectTo(location,'recovery')});
        if(result.error)throw result.error;
        recoverySentAt=Date.now();message('Se houver uma conta disponível para esse e-mail, você receberá um link. Confira também o spam.');
      } catch(error){message(authError(error,'reset'));}
      finally{setBusy(false);}
      return;
    }
    const name = el('accountName').value.trim();
    if(mode === 'signup' && !name) { message('Informe um nome para exibição.'); return; }
    const email = el('accountEmail').value.trim(), password = el('accountPassword').value;
    if(mode === 'signup' && !strongPassword(password)) {
      message('Crie uma senha com 12 ou mais caracteres, incluindo maiúscula, minúscula, número e símbolo.'); return;
    }
    setBusy(true); message('Só um instante…'); track('Auth Started',{mode});
    try {
      const client = await getClient();
      const result = mode === 'signup'
        ? await client.auth.signUp({email,password,options:{data:{name},emailRedirectTo:social.redirectTo(location,'confirmation')}})
        : await client.auth.signInWithPassword({email,password});
      if(result.error) throw result.error;
      el('accountPassword').value = '';
      if(result.data.session) {
        paint(result.data.session.user); track('Auth Completed',{mode}); window.pluviaAnalytics?.identify(result.data.session.user.id);
        message(''); if(el('profileName').value.trim()) dialog.close();
      } else {
        track('Signup Confirmation Requested');
        message('Confira sua caixa de entrada e o spam. Se o cadastro estiver disponível, você receberá um link para confirmar o e-mail. Depois, volte aqui e toque em Entrar.');
      }
    } catch(error) { message(authError(error,mode)); }
    finally { setBusy(false); }
  });
  el('accountRecoveryForm').addEventListener('submit',async event=>{
    event.preventDefault();if(busy || !recoveryActive || !currentUser)return;
    const password=el('accountNewPassword').value,confirm=el('accountNewPasswordConfirm').value;
    if(!strongPassword(password)){message('Use 12 ou mais caracteres, incluindo maiúscula, minúscula, número e símbolo.');return;}
    if(password!==confirm){message('As duas senhas precisam ser iguais.');return;}
    const owner=currentUser.id,revision=accountRevision;
    setBusy(true);message('Salvando nova senha…');
    try {
      const client=await getClient();if(owner!==currentUser?.id || revision!==accountRevision)return;
      const result=await client.auth.updateUser({password});if(result.error)throw result.error;
      if(owner!==currentUser?.id || revision!==accountRevision)return;
      recoveryActive=false;el('accountNewPassword').value='';el('accountNewPasswordConfirm').value='';paint(currentUser);
      message('Senha atualizada. Sua conta está conectada.');mergeAccountPreferences(currentUser).catch(()=>{});
    } catch(error){if(owner===currentUser?.id && revision===accountRevision)message(authError(error));}
    finally{setBusy(false);}
  });
  el('accountDeleteForm').addEventListener('submit',async event=>{
    event.preventDefault();if(busy || !currentUser)return;
    if(el('accountDeleteConfirm').value!=='EXCLUIR'){message('Digite EXCLUIR para confirmar a exclusão permanente.');return;}
    const owner=currentUser.id,revision=accountRevision;
    setBusy(true);message('Excluindo conta…');
    try {
      const client=await getClient();if(owner!==currentUser?.id || revision!==accountRevision)return;
      const result=await client.functions.invoke('account-delete',{body:{ownerId:owner,confirmation:'EXCLUIR'},signal:AbortSignal.timeout(15000)});
      if(owner!==currentUser?.id || revision!==accountRevision)return;
      if(result.error){
        let code;try{code=(await result.error.context?.json()).code;}catch{}
        if(code==='reauth_required'){message('Por segurança, saia da conta e entre novamente. Depois confirme a exclusão.');return;}
        throw result.error;
      }
      if(result.data?.deleted!==true)throw Error('delete_failed');
      if(owner!==currentUser?.id || revision!==accountRevision)return;
      clearTimeout(preferenceTimer);pendingPreferences={};inFlightPreferences=null;
      try {localStorage.removeItem('pluvia-account-pending-'+owner);localStorage.removeItem('pluvia-favorites-owner');}catch{}
      refreshFavoriteUI([]);favoriteView=[];paint(null);window.pluviaAnalytics?.resetUser();
      // Remove the SDK's local session even though the user no longer exists.
      try{await client.auth.signOut({scope:'local'});}catch{}
      setBusy(false);setMode('login');el('accountDeleteConfirm').value='';message('Sua conta foi excluída. Você pode continuar usando a previsão.');
    } catch {if(owner===currentUser?.id && revision===accountRevision)message('Não foi possível confirmar a exclusão. Confira a conexão e tente novamente.');}
    finally{setBusy(false);}
  });
  el('profileForm').addEventListener('submit', async event => {
    event.preventDefault();if(busy)return;
    const name = el('profileName').value.trim();
    if (!name || !currentUser) { message('Preencha seu nome para continuar.'); return; }
    const ownerId=currentUser.id,revision=accountRevision;
    el('profileSave').disabled = true;
    try {
      await preferenceSync.apply({displayName:name},ownerId);
      if(currentUser?.id!==ownerId || revision!==accountRevision)return;
      paintIdentity(currentUser);track('Profile Name Saved'); message('Nome salvo!'); dialog.close();
    } catch(error) { if(currentUser?.id===ownerId && revision===accountRevision)message(error.message || 'Não foi possível salvar seu nome. Confira a conexão e tente novamente.'); }
    finally { el('profileSave').disabled = false; }
  });
  window.addEventListener?.('pluvia:favorites-changed',event => schedulePreferences({favoriteCityIds:event.detail?.ids || (typeof favorites!=='undefined' ? [...favorites] : localFavoriteIds())}));
  window.addEventListener?.('pluvia:city-changed',event => { if(/^\d{7}$/.test(String(event.detail?.id || ''))) schedulePreferences({primaryCityId:event.detail.id}); });
  el('accountLogout').addEventListener('click', async () => {
    if(busy)return;
    setBusy(true);
    try { await window.pluviaPush?.beforeLogout?.(); const client = await getClient(); const {error} = await client.auth.signOut({scope:'local'}); if(error) throw error; paint(null); window.pluviaAnalytics?.resetUser(); setBusy(false); setMode('login'); message('Você saiu da conta.'); }
    catch(error) { message(authError(error)); }
    finally { setBusy(false); }
  });
  setMode('login');
  window.pluviaAccount = {getClient,getUser:()=>currentUser,getPreferences:()=>preferenceSync.getSnapshot(),syncPreferences:()=>preferenceSync.load(true),applyPreferences:(operations,ownerId)=>preferenceSync.apply(operations,ownerId),open(){ if(!dialog.open) dialog.showModal(); dialog.querySelector?.('.dialog-scroll')?.scrollTo?.(0, 0); el('accountClose').focus(); loadProviders().catch(()=>{}); restoreAccount().catch(()=>{}); }};
  const revalidatePreferences=()=>{if(currentUser)preferenceSync.load().then(()=>queueFlush()).catch(()=>{});};
  window.addEventListener?.('online',()=>{if(currentUser)preferenceSync.load(true).then(()=>queueFlush()).catch(()=>{});});
  document.addEventListener?.('visibilitychange',()=>{if(document.visibilityState==='visible')revalidatePreferences();});
  // Supabase owns session persistence. Restore it on every page load instead of
  // guessing the SDK's storage key, which may change between client versions.
  restoreAccount().finally(()=>{
    finishSocialReturn();
    if(recoveryReturn || recoveryAttempt){
      try {const url=new URL(location.href);url.searchParams.delete('auth_recovery');for(const key of ['error','error_code','error_description'])url.searchParams.delete(key);url.hash='';history.replaceState(history.state,'',url.href);}catch{}
      if(!dialog.open)dialog.showModal();
      if(!recoveryActive)message('O link de recuperação não pôde ser validado. Solicite um novo link em “Esqueci minha senha”.');
    }
  });
})();

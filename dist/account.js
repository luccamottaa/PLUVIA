(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const dialog = el('accountDialog');
  let clientPromise, mode = 'login', currentUser = null, busy = false, preferenceTimer, syncing = false;
  const preferenceNames = ['rain','inmet','storms','civil_defense','heat','air','fires'];
  const message = text => { el('accountStatus').textContent = text; };
  const track = (name,properties) => window.pluviaAnalytics?.track(name,properties);
  function paint(user) {
    currentUser = user;
    const metadata = user?.user_metadata || {};
    const fullName = [metadata.name,metadata.full_name,metadata.display_name].find(value => typeof value === 'string' && value.trim()) || '';
    const name = fullName.trim().split(/\s+/)[0].slice(0,40);
    el('accountButton').textContent = user ? (name ? `Olá, ${name}` : 'Minha conta') : 'Entrar / cadastrar';
    el('accountButton').title = el('accountButton').textContent;
    el('accountProfile').hidden = !user;
    el('accountForm').hidden = !!user;
    el('accountTabs').hidden = !!user;
    el('accountIdentity').textContent = user?.email || '';
    el('profileName').value = fullName;
    el('profileNameHint').textContent = name ? 'Esse nome aparece na saudação do topo.' : 'Falta seu nome. Salve abaixo para aparecer “Olá, seu nome” no topo.';
    const alertPreferences = metadata.alert_preferences || {};
    preferenceNames.forEach(key => { const input=el('alertPreferencesForm')?.elements?.namedItem(key); if(input) input.checked=Boolean(alertPreferences[key]); });
  }
  function localFavoriteIds() {
    try { return JSON.parse(localStorage.getItem('pluvia-favorites') || '[]').filter(id=>/^\d{7}$/.test(String(id))); } catch { return []; }
  }
  function refreshFavoriteUI(ids) {
    if (typeof favorites === 'undefined') return;
    favorites.clear(); ids.forEach(id=>favorites.add(id));
    try { writePreference('pluvia-favorites',ids); renderCityOptions(); updateCityLabels(); } catch {}
  }
  async function mergeAccountPreferences(user) {
    if (!user || syncing) return;
    syncing = true;
    try {
      const client = await getClient(), metadata=user.user_metadata || {};
      const remote = Array.isArray(metadata.favorite_city_ids) ? metadata.favorite_city_ids.filter(id=>/^\d{7}$/.test(String(id))) : [];
      const merged = [...new Set([...remote,...localFavoriteIds()])].slice(0,30);
      refreshFavoriteUI(merged);
      const patch = {};
      if (JSON.stringify(remote) !== JSON.stringify(merged)) patch.favorite_city_ids=merged;
      const localCity = typeof readPreference === 'function' ? readPreference('pluvia-city',null) : null;
      if (!localCity && /^\d{7}$/.test(String(metadata.primary_city_id || '')) && typeof chooseCity === 'function') chooseCity(metadata.primary_city_id);
      if (Object.keys(patch).length) await client.auth.updateUser({data:patch});
    } catch {} finally { syncing=false; }
  }
  function scheduleMetadata(patch) {
    if (!currentUser || syncing) return;
    clearTimeout(preferenceTimer);
    preferenceTimer=setTimeout(async()=>{
      try { const client=await getClient(); const {error}=await client.auth.updateUser({data:patch}); if(error) throw error; }
      catch { message('Preferência salva neste aparelho, mas a sincronização da conta falhou agora.'); }
    },450);
  }
  function setMode(next) {
    if (busy) return;
    mode = next;
    const signup = mode === 'signup';
    el('accountNameField').hidden = !signup;
    el('accountName').required = signup;
    el('accountPassword').minLength = signup ? 8 : 1;
    el('accountPassword').autocomplete = signup ? 'new-password' : 'current-password';
    el('accountPassword').value = '';
    el('accountPasswordHint').hidden = !signup;
    el('accountSubmit').textContent = signup ? 'Criar minha conta' : 'Entrar';
    el('accountSignup').setAttribute('aria-pressed',String(signup));
    el('accountLogin').setAttribute('aria-pressed',String(!signup));
    message('');
  }
  function authError(error) {
    const code = error?.code;
    if (code === 'invalid_credentials') return 'E-mail ou senha incorretos. Confere e tenta de novo.';
    if (code === 'email_not_confirmed') return 'Confirme seu e-mail pelo link recebido e depois entre aqui.';
    if (code === 'user_already_exists') return 'Já existe uma conta com esse e-mail. Use Entrar.';
    if (code === 'weak_password') return 'Use uma senha mais forte, com letras, números e símbolos.';
    if (/rate_limit/.test(code || '')) return 'Muitas tentativas. Espere um pouco e tente novamente.';
    if (code === 'email_address_not_authorized') return 'O envio de e-mails ainda precisa ser liberado pelo PLUVIA. Tente novamente mais tarde.';
    return 'Não consegui acessar sua conta agora. Confira a conexão e tente de novo.';
  }
  function getClient() {
    if (clientPromise) return clientPromise;
    clientPromise = new Promise((resolve,reject) => {
      const script = document.createElement('script');
      script.src = './vendor/supabase-2.116.0.js';
      script.onload = () => {
        try {
          const client = window.supabase.createClient('https://dszyyrcvwrpyiypwyvxe.supabase.co','sb_publishable_SdPTXhk3Q7aD-ra0S9dm_A_rnXSS4Jc', {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
          client.auth.onAuthStateChange((_event,session) => { const user=session?.user || null; paint(user); if(user) Promise.resolve().then(()=>mergeAccountPreferences(user)); });
          resolve(client);
        } catch (error) { reject(error); }
      };
      script.onerror = () => { script.remove(); reject(new Error('SDK indisponível')); };
      document.head.appendChild(script);
    }).catch(error => { clientPromise = null; throw error; });
    return clientPromise;
  }
  async function restoreAccount() {
    try {
      const client = await getClient();
      const {data,error} = await client.auth.getSession();
      if (error) throw error;
      paint(data?.session?.user || null);
      if(data?.session?.user) await mergeAccountPreferences(data.session.user);
    } catch (_) {
      paint(null);
    }
  }
  el('accountButton').addEventListener('click', () => {
    dialog.showModal(); el('accountClose').focus();
    restoreAccount().catch(() => {});
  });
  el('accountClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { el('accountPassword').value = ''; el('accountButton').focus(); });
  el('accountLogin').addEventListener('click', () => setMode('login'));
  el('accountSignup').addEventListener('click', () => setMode('signup'));
  el('accountForm').addEventListener('submit', async event => {
    event.preventDefault(); if(busy) return;
    const name = el('accountName').value.trim();
    if(mode === 'signup' && !name) { message('Conta pra gente como te chamar.'); return; }
    const email = el('accountEmail').value.trim(), password = el('accountPassword').value;
    busy = true; el('accountSubmit').disabled = true; message('Só um instante…'); track('Auth Started',{mode});
    try {
      const client = await getClient();
      const result = mode === 'signup'
        ? await client.auth.signUp({email,password,options:{data:{name},emailRedirectTo:location.origin + location.pathname}})
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
    } catch(error) { message(authError(error)); }
    finally { busy = false; el('accountSubmit').disabled = false; }
  });
  el('profileForm').addEventListener('submit', async event => {
    event.preventDefault();
    const name = el('profileName').value.trim();
    if (!name || !currentUser) { message('Preencha seu nome para continuar.'); return; }
    el('profileSave').disabled = true;
    try {
      const client = await getClient();
      const {data,error} = await client.auth.updateUser({data:{name}});
      if(error) throw error;
      paint(data.user); track('Profile Name Saved'); message('Nome salvo!'); dialog.close();
    } catch(error) { message(authError(error)); }
    finally { el('profileSave').disabled = false; }
  });
  el('alertPreferencesForm').addEventListener('submit', async event => {
    event.preventDefault(); if(!currentUser) return;
    const button=event.submitter, alert_preferences=Object.fromEntries(preferenceNames.map(key=>[key,Boolean(event.currentTarget.elements.namedItem(key)?.checked)]));
    if(button) button.disabled=true;
    try { const client=await getClient(); const {data,error}=await client.auth.updateUser({data:{alert_preferences}}); if(error) throw error; paint(data.user); message('Preferências salvas. O push ainda não está ativo.'); }
    catch(error){ message(authError(error)); }
    finally { if(button) button.disabled=false; }
  });
  window.addEventListener?.('pluvia:favorites-changed',event => scheduleMetadata({favorite_city_ids:(event.detail?.ids || []).filter(id=>/^\d{7}$/.test(String(id))).slice(0,30)}));
  window.addEventListener?.('pluvia:city-changed',event => { if(/^\d{7}$/.test(String(event.detail?.id || ''))) scheduleMetadata({primary_city_id:event.detail.id}); });
  el('accountLogout').addEventListener('click', async () => {
    el('accountLogout').disabled = true;
    try { const client = await getClient(); const {error} = await client.auth.signOut({scope:'local'}); if(error) throw error; paint(null); window.pluviaAnalytics?.resetUser(); setMode('login'); message('Você saiu da conta.'); }
    catch(error) { message(authError(error)); }
    finally { el('accountLogout').disabled = false; }
  });
  setMode('login');
  // Supabase owns session persistence. Restore it on every page load instead of
  // guessing the SDK's storage key, which may change between client versions.
  restoreAccount();
})();

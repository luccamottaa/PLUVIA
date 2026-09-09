(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const dialog = el('accountDialog');
  let clientPromise, mode = 'login', currentUser = null, busy = false;
  const message = text => { el('accountStatus').textContent = text; };
  function paint(user) {
    currentUser = user;
    const name = typeof user?.user_metadata?.name === 'string' ? user.user_metadata.name.trim().split(/\s+/)[0].slice(0,40) : '';
    el('accountButton').textContent = user ? (name ? `Olá, ${name}` : 'Minha conta') : 'Entrar / cadastrar';
    el('accountButton').title = el('accountButton').textContent;
    el('accountProfile').hidden = !user;
    el('accountForm').hidden = !!user;
    el('accountTabs').hidden = !!user;
    el('accountIdentity').textContent = user?.email || '';
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
          client.auth.onAuthStateChange((_event,session) => paint(session?.user || null));
          resolve(client);
        } catch (error) { reject(error); }
      };
      script.onerror = () => { script.remove(); reject(new Error('SDK indisponível')); };
      document.head.appendChild(script);
    }).catch(error => { clientPromise = null; throw error; });
    return clientPromise;
  }
  el('accountButton').addEventListener('click', () => {
    dialog.showModal(); el('accountClose').focus();
    getClient().then(client => client.auth.getSession()).then(({data,error}) => {
      if(error) throw error;
      paint(data.session?.user || null);
    }).catch(error => message(authError(error)));
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
    busy = true; el('accountSubmit').disabled = true; message('Só um instante…');
    try {
      const client = await getClient();
      const result = mode === 'signup'
        ? await client.auth.signUp({email,password,options:{data:{name},emailRedirectTo:location.origin + location.pathname}})
        : await client.auth.signInWithPassword({email,password});
      if(result.error) throw result.error;
      el('accountPassword').value = '';
      if(result.data.session) { paint(result.data.session.user); message(''); dialog.close(); }
      else message('Confira sua caixa de entrada e o spam. Se o cadastro estiver disponível, você receberá um link para confirmar o e-mail. Depois, volte aqui e toque em Entrar.');
    } catch(error) { message(authError(error)); }
    finally { busy = false; el('accountSubmit').disabled = false; }
  });
  el('accountLogout').addEventListener('click', async () => {
    el('accountLogout').disabled = true;
    try { const client = await getClient(); const {error} = await client.auth.signOut({scope:'local'}); if(error) throw error; paint(null); setMode('login'); message('Você saiu da conta.'); }
    catch(error) { message(authError(error)); }
    finally { el('accountLogout').disabled = false; }
  });
  setMode('login');
  // Restore only when a session or an email callback exists; keep first weather paint light.
  let saved = false;
  try { saved = !!localStorage.getItem('sb-dszyyrcvwrpyiypwyvxe-auth-token'); } catch {}
  if(saved || /access_token=|error_description=/.test(location.hash)) {
    getClient().then(client => client.auth.getSession()).then(({data}) => paint(data?.session?.user || null)).catch(() => {});
  }
})();

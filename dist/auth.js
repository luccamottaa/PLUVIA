(() => {
  const SUPABASE_URL = "https://dszyyrcvwrpyiypwyvxe.supabase.co";
  const SUPABASE_KEY = "sb_publishable_SdPTXhk3Q7aD-ra0S9dm_A_rnXSS4Jc";
  const client = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
  const byId = (id) => document.getElementById(id);
  const dialog = byId("authDialog");
  let mode = "login";

  function status(message, error = false) {
    const node = byId("authStatus");
    node.textContent = message;
    node.classList.toggle("error", error);
  }

  function setBusy(busy) {
    byId("authSubmit").disabled = busy;
    byId("authSubmit").textContent = busy ? "Aguarde…" : (mode === "signup" ? "Criar conta" : "Entrar");
  }

  function setMode(next) {
    mode = next;
    const signup = next === "signup";
    byId("authTitle").textContent = signup ? "Criar conta" : "Entrar";
    byId("loginTab").classList.toggle("active", !signup);
    byId("signupTab").classList.toggle("active", signup);
    byId("loginTab").setAttribute("aria-selected", String(!signup));
    byId("signupTab").setAttribute("aria-selected", String(signup));
    byId("authPassword").autocomplete = signup ? "new-password" : "current-password";
    byId("forgotPassword").hidden = signup;
    status("");
    setBusy(false);
  }

  function showDialog() {
    status("");
    if (!dialog.open) dialog.showModal();
    setTimeout(() => byId("authEmail")?.focus(), 0);
  }

  function renderSession(session) {
    const user = session?.user;
    byId("authGuest").hidden = Boolean(user);
    byId("authAccount").hidden = !user;
    byId("newPasswordForm").hidden = true;
    byId("accountEmail").textContent = user?.email || "";
    byId("accountLabel").textContent = user ? "Minha conta" : "Entrar";
    byId("openAuth").classList.toggle("signed-in", Boolean(user));
    byId("openAuth").setAttribute("aria-label", user ? "Abrir minha conta" : "Entrar ou criar conta");
    byId("authTitle").textContent = user ? "Minha conta" : (mode === "signup" ? "Criar conta" : "Entrar");
  }

  function friendlyError(error) {
    const message = String(error?.message || "").toLowerCase();
    if (message.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
    if (message.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
    if (message.includes("user already registered")) return "Este e-mail já tem uma conta. Tente entrar.";
    if (message.includes("password should be")) return "A senha precisa ter pelo menos 6 caracteres.";
    if (message.includes("rate limit")) return "Muitas tentativas. Espere um pouco e tente novamente.";
    return "Não foi possível concluir agora. Confira os dados e tente novamente.";
  }

  byId("openAuth").addEventListener("click", showDialog);
  byId("closeAuth").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  byId("loginTab").addEventListener("click", () => setMode("login"));
  byId("signupTab").addEventListener("click", () => setMode("signup"));

  byId("authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) return status("O acesso à conta não carregou. Atualize a página.", true);
    const email = byId("authEmail").value.trim();
    const password = byId("authPassword").value;
    setBusy(true); status("");
    const result = mode === "signup"
      ? await client.auth.signUp({ email, password, options: { emailRedirectTo: location.href.split("#")[0] } })
      : await client.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) return status(friendlyError(result.error), true);
    if (mode === "signup" && !result.data.session) {
      status("Conta criada! Abra o e-mail de confirmação que o PLUVIA enviou.");
      byId("authForm").reset();
      return;
    }
    status("Pronto, você entrou na sua conta.");
  });

  byId("forgotPassword").addEventListener("click", async () => {
    const email = byId("authEmail").value.trim();
    if (!email) { status("Digite seu e-mail primeiro.", true); byId("authEmail").focus(); return; }
    if (!client) return status("O acesso à conta não carregou. Atualize a página.", true);
    status("Enviando…");
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("#")[0] });
    status(error ? friendlyError(error) : "Enviamos o link para trocar sua senha. Confira o e-mail.", Boolean(error));
  });

  byId("newPasswordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const { error } = await client.auth.updateUser({ password: byId("newPassword").value });
    if (error) return status(friendlyError(error), true);
    status("Senha atualizada. Sua conta está pronta.");
    const { data } = await client.auth.getSession();
    renderSession(data.session);
  });

  byId("signOut").addEventListener("click", async () => {
    const { error } = await client.auth.signOut();
    if (error) return status(friendlyError(error), true);
    status("Você saiu da conta.");
    setMode("login");
  });

  if (!client) {
    status("O acesso à conta não carregou. Atualize a página.", true);
    return;
  }
  client.auth.getSession().then(({ data }) => renderSession(data.session));
  client.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      byId("authGuest").hidden = true;
      byId("authAccount").hidden = true;
      byId("newPasswordForm").hidden = false;
      byId("authTitle").textContent = "Criar nova senha";
      if (!dialog.open) dialog.showModal();
      return;
    }
    renderSession(session);
  });
})();

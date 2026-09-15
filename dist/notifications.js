(() => {
  "use strict";
  const el = id => document.getElementById(id);
  const prompt = el("notificationPrompt"), promptButton = el("notificationPromptButton"), promptText = el("notificationPromptText");
  const toggle = el("notificationToggle"), testButton = el("notificationTest"), statusBadge = el("notificationStatusBadge");
  const supportNote = el("notificationSupportNote"), diagnosticsNode = el("notificationDiagnostics"), form = el("notificationPreferencesForm"), devicesNode = el("notificationDevices"), locationsNode = el("notificationLocations");
  const installDialog = el("installPushDialog"), continueNote = el("notificationContinueNote");
  if (!prompt || !toggle || !form) return;

  const boolFields = ["official_alerts", "rain_approaching", "heavy_rain", "storms", "lightning", "strong_wind", "extreme_heat", "air_quality", "weather_changes", "daily_summary"];
  let config = null, busy = false, pendingEnable = false;
  try { pendingEnable = sessionStorage.getItem("pluvia-push-pending-enable") === "1"; } catch {}
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const supported = window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const track = (name, properties) => window.pluviaAnalytics?.track(name, properties);
  const currentUser = () => window.pluviaAccount?.getUser?.() || null;
  const localSubscriptionId = () => { try { return localStorage.getItem("pluvia-push-subscription-id") || ""; } catch { return ""; } };
  const saveSubscriptionId = value => { try { value ? localStorage.setItem("pluvia-push-subscription-id", value) : localStorage.removeItem("pluvia-push-subscription-id"); } catch {} };

  function message(value) {
    supportNote.textContent = value;
    const accountStatus = el("accountStatus");
    if (accountStatus) accountStatus.textContent = value;
  }

  function status(kind, label) {
    statusBadge.className = `notification-status is-${kind}`;
    statusBadge.textContent = label;
  }

  async function paintDiagnostics() {
    if (!diagnosticsNode) return;
    const checks = [
      [window.isSecureContext, "Conexão segura"],
      ["serviceWorker" in navigator, "Service Worker"],
      ["PushManager" in window && "Notification" in window, "Web Push"],
      [!isIOS || standalone, isIOS ? "PWA instalada" : "Modo de aplicativo compatível"],
    ];
    if (supported) {
      const subscription = await browserSubscription().catch(() => null);
      checks.push([Notification.permission === "granted", `Permissão: ${Notification.permission === "granted" ? "concedida" : Notification.permission === "denied" ? "bloqueada" : "ainda não solicitada"}`]);
      checks.push([Boolean(subscription), "Inscrição neste dispositivo"]);
    }
    diagnosticsNode.replaceChildren(...checks.map(([ok, label]) => {
      const item = document.createElement("li");
      item.className = ok ? "is-ok" : "is-pending";
      item.textContent = `${ok ? "✓" : "○"} ${label}`;
      return item;
    }));
  }

  function setPendingEnable(value) {
    pendingEnable = value;
    try { value ? sessionStorage.setItem("pluvia-push-pending-enable", "1") : sessionStorage.removeItem("pluvia-push-pending-enable"); } catch {}
  }

  function cityLabel() {
    return typeof activeCity !== "undefined" && activeCity ? `${activeCity.name}/${activeCity.uf}` : "a cidade aberta";
  }

  function showInstall() {
    if (!installDialog) {
      message("Para receber notificações no iPhone ou iPad, adicione o PLUVIA à Tela de Início e abra pelo ícone.");
      return;
    }
    if (!installDialog.open) installDialog.showModal();
  }

  function currentLocation() {
    if (typeof activeCity === "undefined" || !activeCity) return null;
    return { cityId: activeCity.id, cityName: activeCity.name, uf: activeCity.uf, latitude: activeCity.lat, longitude: activeCity.lon, timezone: activeCity.timezone, source: Number.isFinite(activeCity.distanceKm) ? "gps_city" : "saved_city" };
  }

  function deviceInfo() {
    const ua = navigator.userAgent;
    const browser = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
    const platform = isIOS ? "iOS/iPadOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Web";
    return { name: isIOS ? `iPhone/iPad · ${browser}` : `${platform} · ${browser}`, platform, browser };
  }

  function publicKeyBytes(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
  }

  async function invoke(name, body) {
    const client = await window.pluviaAccount.getClient();
    const { data, error } = await client.functions.invoke(name, { body });
    if (!error) return data;
    let userMessage = "O serviço de notificações não respondeu agora.";
    try { const details = await error.context?.json?.(); if (details?.error) userMessage = details.error; } catch {}
    throw new Error(userMessage);
  }

  async function browserSubscription() {
    if (!supported) return null;
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  }

  function paintPreferences(preferences) {
    if (!preferences) return;
    for (const field of boolFields) {
      const input = form.elements.namedItem(field);
      if (input) input.checked = Boolean(preferences[field]);
    }
    for (const field of ["minimum_severity", "quiet_start", "quiet_end", "daily_summary_time"]) {
      const input = form.elements.namedItem(field);
      if (input && preferences[field] != null) input.value = field === "minimum_severity" ? String(preferences[field]) : String(preferences[field]).slice(0, 5);
    }
  }

  function paintDevices(devices = []) {
    devicesNode.replaceChildren();
    if (!devices.length) { const empty = document.createElement("p"); empty.textContent = "Nenhum dispositivo registrado."; devicesNode.appendChild(empty); return; }
    for (const device of devices) {
      const row = document.createElement("div"); row.className = "notification-device";
      const copy = document.createElement("div"), name = document.createElement("strong"), seen = document.createElement("small"), remove = document.createElement("button");
      name.textContent = `${device.platform?.includes("iOS") ? "📱" : "💻"} ${device.device_name}`;
      const date = new Date(device.last_seen_at);
      seen.textContent = `${device.enabled ? "Ativo" : "Inativo"} · visto ${Number.isFinite(date.getTime()) ? date.toLocaleDateString("pt-BR") : "recentemente"}`;
      remove.type = "button"; remove.dataset.removeSubscription = device.id; remove.textContent = "Remover"; remove.setAttribute("aria-label", `Remover ${device.device_name}`);
      copy.append(name, seen); row.append(copy, remove); devicesNode.appendChild(row);
    }
  }

  function paintLocations(locations = []) {
    if (!locationsNode) return;
    locationsNode.replaceChildren();
    if (!locations.length) { const empty = document.createElement("p"); empty.textContent = "Nenhuma cidade monitorada."; locationsNode.appendChild(empty); return; }
    for (const location of locations) {
      const row = document.createElement("div"); row.className = "notification-location-row";
      const copy = document.createElement("div"), name = document.createElement("strong"), detail = document.createElement("small"), remove = document.createElement("button");
      name.textContent = `${location.city_name}, ${location.uf}`;
      detail.textContent = location.source === "gps_city" ? "Escolhida a partir da localização" : "Cidade salva";
      remove.type = "button"; remove.dataset.removeLocation = location.id; remove.textContent = "Remover"; remove.setAttribute("aria-label", `Parar de monitorar ${location.city_name}`);
      copy.append(name, detail); row.append(copy, remove); locationsNode.appendChild(row);
    }
  }

  async function paintState() {
    prompt.hidden = false;
    await paintDiagnostics();
    if (continueNote) continueNote.hidden = !(currentUser() && pendingEnable && Notification.permission !== "granted");
    const city = cityLabel();
    if (!supported) {
      status("blocked", "Navegador incompatível"); toggle.disabled = true; testButton.hidden = true;
      message("Este navegador não oferece Web Push completo. O restante do PLUVIA continua funcionando normalmente.");
      promptText.textContent = "As notificações do sistema não são compatíveis com este navegador.";
      return;
    }
    if (isIOS && !standalone) {
      status("off", "Instalação necessária"); toggle.disabled = false; toggle.textContent = "Como instalar no iPhone"; testButton.hidden = true;
      message("Para receber notificações no iPhone ou iPad, adicione o PLUVIA à Tela de Início e abra pelo ícone.");
      promptText.textContent = `No iPhone, adicione o PLUVIA à Tela de Início para avisar chuva e INMET em ${city}.`;
      promptButton.textContent = "Como instalar";
      return;
    }
    if (Notification.permission === "denied") {
      status("blocked", "Permissão bloqueada"); toggle.disabled = true; testButton.hidden = true;
      message("A permissão foi bloqueada. Reative o PLUVIA nas configurações de notificações do navegador ou do sistema.");
      return;
    }
    const subscription = await browserSubscription().catch(() => null);
    const active = Notification.permission === "granted" && Boolean(subscription) && Boolean(localSubscriptionId());
    status(active ? "on" : "off", active ? "Alertas ativos" : "Alertas desativados");
    toggle.disabled = false; toggle.textContent = active ? "Desativar neste dispositivo" : "Ativar alertas";
    testButton.hidden = !active;
    promptButton.textContent = "Ativar alertas";
    promptText.textContent = active
      ? `Alertas ligados para ${city}. O PLUVIA avisa mesmo fechado.`
      : `Avisa alerta oficial e chuva nas próximas horas em ${city}. A permissão só aparece depois do seu toque.`;
    message(active ? "Este dispositivo pode receber Web Push mesmo com o PLUVIA fechado." : pendingEnable && currentUser() ? "Conta conectada. Toque em “Ativar alertas” para o sistema pedir permissão." : "A permissão só será solicitada depois que você tocar em “Ativar alertas”.");
    prompt.hidden = active;
  }

  async function loadConfig() {
    if (!currentUser()) return null;
    config = await invoke("push-subscriptions", { action: "config" });
    paintPreferences(config.preferences);
    paintDevices(config.devices);
    paintLocations(config.locations);
    return config;
  }

  async function register(subscription) {
    config ||= await loadConfig();
    const result = await invoke("push-subscriptions", { action: "register", subscription: subscription.toJSON(), device: deviceInfo(), location: currentLocation() });
    saveSubscriptionId(result.subscriptionId);
    await saveAlertSetup();
    await loadConfig();
  }

  async function saveAlertSetup() {
    const location = currentLocation();
    const existing = config?.preferences;
    const preferences = {
      notifications_enabled: true,
      official_alerts: existing ? Boolean(existing.official_alerts) : true,
      rain_approaching: existing ? Boolean(existing.rain_approaching) : true,
      heavy_rain: existing ? Boolean(existing.heavy_rain) : true,
      storms: existing ? Boolean(existing.storms) : true,
      lightning: false,
      strong_wind: existing ? Boolean(existing.strong_wind) : true,
      extreme_heat: existing ? Boolean(existing.extreme_heat) : true,
      air_quality: Boolean(existing?.air_quality),
      weather_changes: Boolean(existing?.weather_changes),
      daily_summary: Boolean(existing?.daily_summary),
      minimum_severity: Number(existing?.minimum_severity) || 2,
      quiet_start: existing?.quiet_start || form.elements.namedItem("quiet_start")?.value || "22:00",
      quiet_end: existing?.quiet_end || form.elements.namedItem("quiet_end")?.value || "07:00",
      daily_summary_time: existing?.daily_summary_time || "07:00",
      timezone: location?.timezone || existing?.timezone || "America/Manaus"
    };
    await invoke("push-subscriptions", { action: "preferences", preferences, location });
  }

  async function enable() {
    if (busy) return;
    if (isIOS && !standalone) { showInstall(); await paintState(); return; }
    if (!currentUser()) {
      setPendingEnable(true);
      window.pluviaAccount?.open?.();
      message("Entre na sua conta e toque de novo em “Ativar alertas” — o iPhone só pede permissão no seu toque.");
      await paintState();
      return;
    }
    if (!supported) { await paintState(); return; }
    busy = true; toggle.disabled = true; promptButton.disabled = true;
    try {
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      track("Push Permission Result", { permission, standalone });
      if (permission !== "granted") { await paintState(); return; }
      config = await loadConfig();
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKeyBytes(config.publicKey) });
      await register(subscription);
      setPendingEnable(false);
      track("Push Enabled", { platform: deviceInfo().platform, city: currentLocation()?.cityId || "" });
      message(`Alertas ligados para ${cityLabel()}. INMET e chuva nas próximas horas. Envie um teste se quiser conferir.`);
    } catch (error) { message(error.message || "Não foi possível ativar os alertas."); }
    finally { busy = false; promptButton.disabled = false; await paintState(); }
  }

  async function disable() {
    if (busy) return;
    busy = true; toggle.disabled = true;
    try {
      const id = localSubscriptionId(), subscription = await browserSubscription();
      if (id && currentUser()) await invoke("push-subscriptions", { action: "remove", subscriptionId: id }).catch(() => {});
      if (subscription) await subscription.unsubscribe();
      saveSubscriptionId(""); config = null; track("Push Disabled", { platform: deviceInfo().platform });
      message("Alertas desativados neste dispositivo.");
      if (currentUser()) await loadConfig();
    } finally { busy = false; await paintState(); }
  }

  async function toggleNotifications() {
    const active = supported && Notification.permission === "granted" && Boolean(await browserSubscription().catch(() => null));
    return active ? disable() : enable();
  }

  async function beforeLogout() {
    const id = localSubscriptionId(), subscription = await browserSubscription().catch(() => null);
    if (id && currentUser()) await invoke("push-subscriptions", { action: "remove", subscriptionId: id }).catch(() => {});
    if (subscription) await subscription.unsubscribe().catch(() => {});
    saveSubscriptionId(""); config = null;
  }

  promptButton.addEventListener("click", enable);
  toggle.addEventListener("click", toggleNotifications);
  el("installPushClose")?.addEventListener("click", () => installDialog?.close());
  el("installPushReload")?.addEventListener("click", () => location.reload());
  installDialog?.addEventListener("click", event => { if (event.target === installDialog) installDialog.close(); });
  testButton.addEventListener("click", async () => {
    if (busy || !localSubscriptionId()) return;
    busy = true; testButton.disabled = true; message("Enviando um Web Push real…");
    try { const result = await invoke("push-send", { action: "test", subscriptionId: localSubscriptionId() }); if (!result?.accepted) throw new Error("O serviço push não confirmou o envio."); message("Notificação aceita pelo serviço push. Confira a notificação do sistema."); track("Push Test Accepted", { platform: deviceInfo().platform }); }
    catch (error) { message(error.message || "O teste não chegou ao serviço push."); }
    finally { busy = false; testButton.disabled = false; }
  });
  form.addEventListener("submit", async event => {
    event.preventDefault(); if (busy || !currentUser()) return;
    busy = true; const button = el("notificationPreferencesSave"); button.disabled = true;
    const preferences = { notifications_enabled: true };
    for (const field of boolFields) preferences[field] = Boolean(form.elements.namedItem(field)?.checked);
    for (const field of ["minimum_severity", "quiet_start", "quiet_end", "daily_summary_time"]) preferences[field] = form.elements.namedItem(field)?.value || null;
    const location = form.elements.namedItem("monitor_current_city")?.checked ? currentLocation() : null;
    if (location) preferences.timezone = location.timezone;
    try { await invoke("push-subscriptions", { action: "preferences", preferences, location }); await loadConfig(); message(location ? `${location.cityName} está sendo monitorada. Preferências salvas.` : "Preferências salvas. Nenhuma nova cidade foi adicionada."); track("Push Preferences Saved"); }
    catch (error) { message(error.message || "Não foi possível salvar as preferências."); }
    finally { busy = false; button.disabled = false; }
  });
  devicesNode.addEventListener("click", async event => {
    const button = event.target.closest("[data-remove-subscription]"); if (!button || busy) return;
    busy = true; button.disabled = true;
    try { const id = button.dataset.removeSubscription; await invoke("push-subscriptions", { action: "remove", subscriptionId: id }); if (id === localSubscriptionId()) { const subscription = await browserSubscription(); if (subscription) await subscription.unsubscribe(); saveSubscriptionId(""); } await loadConfig(); await paintState(); message("Dispositivo removido."); }
    catch (error) { message(error.message || "Não foi possível remover o dispositivo."); }
    finally { busy = false; }
  });
  locationsNode?.addEventListener("click", async event => {
    const button = event.target.closest("[data-remove-location]"); if (!button || busy) return;
    busy = true; button.disabled = true;
    try { await invoke("push-subscriptions", { action: "remove_location", locationId: button.dataset.removeLocation }); await loadConfig(); message("Cidade removida do monitoramento."); }
    catch (error) { message(error.message || "Não foi possível remover a cidade."); }
    finally { busy = false; }
  });

  window.addEventListener("pluvia:auth-changed", async event => {
    if (!event.detail?.user) { config = null; setPendingEnable(false); paintDevices([]); paintLocations([]); await paintState(); return; }
    try {
      await loadConfig();
      const subscription = Notification.permission === "granted" ? await browserSubscription() : null;
      if (subscription) await register(subscription);
      if (pendingEnable) {
        message("Conta conectada. Toque em “Ativar alertas” para o sistema pedir permissão.");
        el("notificationToggle")?.focus?.();
        el("notificationSettings")?.scrollIntoView?.({ block: "nearest" });
      }
      const deliveryId = new URL(location.href).searchParams.get("push_delivery");
      if (deliveryId) { await invoke("push-subscriptions", { action: "opened", deliveryId }).catch(() => {}); const url = new URL(location.href); url.searchParams.delete("push_delivery"); history.replaceState({}, "", url.pathname + url.search + url.hash); }
    } catch (error) { message(error.message || "As notificações estão temporariamente indisponíveis."); }
    await paintState();
  });
  navigator.serviceWorker?.addEventListener("message", event => { if (event.data?.type === "push-subscription-changed" && currentUser()) loadConfig().then(async () => { const subscription = await browserSubscription(); if (subscription) await register(subscription); }).catch(() => {}); });
  window.addEventListener("pluvia:city-changed", () => { const checkbox = form.elements.namedItem("monitor_current_city"); if (checkbox) checkbox.checked = true; paintState().catch(() => {}); });
  window.pluviaPush = { beforeLogout, enable, disable };
  paintState().catch(() => {});
})();

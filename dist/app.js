const DEFESA_NACIONAL = "https://www.gov.br/mdr/pt-br/assuntos/protecao-e-defesa-civil";
const AUTO_REFRESH_MS = 5 * 60 * 1000;
const $ = (id) => document.getElementById(id);
let cityRevision = 0;
const services = globalThis.PLUVIA?.services;
let lastRefreshAt = 0;
let refreshInFlight = null;
let displayedWeather = null;
let errorTimer;
let lastInmetResponse = null;
let lastInmetReadAt = 0;
let rainPulseTimer = null;
let rainPulseFrames = [];
let rainPulseIndex = 0;
let rainPulsePlaying = false;
let rainMapLocations = null;
let rainMapCityId = null;
let summaryAiInFlight = null;
let summaryAiUnavailableUntil = 0;
const CACHE_MAX_AGE_MS = 36 * 60 * 60 * 1000;

const RequestError = globalThis.PLUVIA?.http?.RequestError;

async function fetchForecast(city = activeCity, revision = cityRevision) {
  try {
    const data = await services.weather.getForecast(city);
    if (!validForecast(data)) throw new RequestError('Previsão incompleta.', {retryable:true});
    return data;
  } catch (error) {
    if (!error?.retryable) throw error;
    if (revision !== cityRevision) throw new Error('Cidade alterada');
    await new Promise(resolve => setTimeout(resolve, 900));
    if (revision !== cityRevision) throw new Error('Cidade alterada');
    const data = await services.weather.getForecast(city, {timeoutMs:12000});
    if (!validForecast(data)) throw new RequestError('Previsão incompleta.', {retryable:false});
    return data;
  }
}

function prefetchForecast(city) {
  if (!city) return;
  try {
    const saved = JSON.parse(localStorage.getItem(`pluvia-weather-${city.id}`) || "null");
    const age = Date.now() - saved?.at;
    if (age >= 0 && age <= CACHE_MAX_AGE_MS && validForecast(saved?.data?.forecast)) return;
  } catch {}
  fetchForecast(city, cityRevision).then(data => {
    try {
      if (localStorage.getItem(`pluvia-weather-${city.id}`)) return;
      localStorage.setItem(`pluvia-weather-${city.id}`, JSON.stringify({at:Date.now(),weatherAt:Date.now(),airAt:null,data:{forecast:data,air:null}}));
    } catch {}
  }).catch(() => {});
}

const weatherIcons = globalThis.PLUVIA?.weatherIcons;
weatherIcons?.hydrate?.(document);
const smartSummary = globalThis.PLUVIA?.smartSummary;
const weatherData = globalThis.PLUVIA?.weatherData;
const weatherInsights = globalThis.PLUVIA?.weatherInsights;
const weather = code => [weatherIcons?.condition(code).label || "Tempo variável"];

function weatherIconType(code) {
  if ([71,73,75,77,85,86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "storm";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if ([3, 45, 48].includes(code)) return "cloud";
  if ([1, 2].includes(code)) return "partly";
  return "sun";
}

function applyWeatherAtmosphere(code, isDay) {
  const type = weatherIconType(code);
  document.body.dataset.weather = type;
  document.body.dataset.phase = isDay ? "day" : "night";
  const theme = isDay ? "#075dff" : "#0a111f";
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => { meta.content = theme; });
}

function weatherIconSvg(code, isDay = true) {
  return weatherIcons?.markup(code, isDay, {className:"weather-visual", eager:true}) || "";
}

const fmt = (value, digits = 0) => Number.isFinite(value) ? value.toFixed(digits).replace(".", ",") : "--";
const shortTime = (iso) => iso?.slice(11, 16) || "--:--";

function windDirection(deg) {
  if (!Number.isFinite(deg)) return "—";
  const dirs = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
  return dirs[Math.round(deg / 45) % 8];
}

function uvLabel(value) {
  if (value < 3) return "Baixo — dá pra sair de boa";
  if (value < 6) return "Moderado — protetor ajuda";
  if (value < 8) return "Alto — boné e protetor agora";
  if (value < 11) return "Muito alto — 10h–15h é fogo";
  return "Extremo — procure sombra";
}

function humidityLabel(value) {
  if (value >= 85) return "Ar bem carregado";
  if (value >= 70) return "Umidade alta";
  if (value >= 50) return "Faixa confortável";
  return "Ar mais seco";
}

function pressureLabel(value) {
  if (value < 1007) return "Tendência instável";
  if (value > 1014) return "Tendência estável";
  return "Dentro do esperado";
}

function aqiLabel(value) {
  if (!Number.isFinite(value)) return ["--", "AQI indisponível"];
  if (value <= 50) return ["Boa", `AQI ${Math.round(value)} · ar limpo`];
  if (value <= 100) return ["Moderada", `AQI ${Math.round(value)} · aceitável`];
  if (value <= 150) return ["Ruim p/ sensíveis", `AQI ${Math.round(value)} · atenção`];
  if (value <= 200) return ["Ruim", `AQI ${Math.round(value)} · evite esforço`];
  return ["Muito ruim", `AQI ${Math.round(value)} · exposição alta`];
}

function airGuidance(value) {
  if (!Number.isFinite(value)) return "Dados de partículas indisponíveis no momento.";
  if (value <= 50) return "Pode respirar de boa: não há restrição indicada para atividades ao ar livre.";
  if (value <= 100) return "Qualidade aceitável; pessoas muito sensíveis podem notar algum incômodo.";
  if (value <= 150) return "O PM2.5 entra fundo no pulmão. Crianças, idosos e quem tem asma devem reduzir esforço ao ar livre.";
  if (value <= 200) return "Ar ruim: evite exercício intenso fora. Crianças, idosos e pessoas com asma precisam de atenção extra.";
  return "Partículas muito altas. Reduza a exposição fora de casa e siga as orientações de saúde e de queimadas da sua região.";
}

function decodeHtml(value = "") {
  const doc = new DOMParser().parseFromString(value, "text/html");
  return doc.documentElement.textContent || "";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>\"']/g, char => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#039;"})[char]);
}

function safeManausUrl(value = "") {
  try { const url = new URL(value); return url.protocol === "https:" && (url.hostname === "manaus.am.gov.br" || url.hostname.endsWith(".manaus.am.gov.br")) ? url.href : "https://www.manaus.am.gov.br/?s=defesa+civil"; }
  catch { return "https://www.manaus.am.gov.br/?s=defesa+civil"; }
}

function firstValue(obj, keys, fallback = "") {
  for (const key of keys) if (obj?.[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  return fallback;
}

function normalizeAlerts(raw) {
  let rows;
  if (Array.isArray(raw)) rows = raw;
  else if (raw && (Object.hasOwn(raw, "hoje") || Object.hasOwn(raw, "futuro"))) {
    // Alert-AS groups current and upcoming notices; neither is an error envelope.
    if (![raw.hoje, raw.futuro].some(Array.isArray) || [raw.hoje, raw.futuro].some(value => value != null && !Array.isArray(value))) throw new Error("Lista INMET inválida");
    rows = [...(raw.hoje || []), ...(raw.futuro || [])];
  } else {
    const key = ["avisos", "alerts", "data", "features", "result"].find(key => Array.isArray(raw?.[key]));
    if (!key) throw new Error("Formato INMET desconhecido");
    rows = raw[key];
  }
  const seen = new Set();
  return rows.map(row => row?.properties || row).filter(alert => {
    if (!alert || typeof alert !== "object" || !firstValue(alert, ["descricao", "evento", "titulo", "tipo"])) throw new Error("Aviso INMET incompleto");
    const id = String(firstValue(alert, ["id_aviso", "id", "identifier"], JSON.stringify(alert)));
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function inmetSeverity(alert) {
  // Do not infer severity from the risk description or undocumented numeric IDs.
  const text = String(firstValue(alert, ["severidade", "severity", "nivel"])).trim().toLowerCase();
  const color = String(firstValue(alert, ["aviso_cor", "cor"])).trim().toLowerCase();
  if (text.includes("grande perigo") || /vermelh|#ff0000|#f00\b/.test(color)) return {className:"red", rank:3, label:"Alerta vermelho", description:"Grande perigo"};
  if (text.includes("potencial")) return {className:"yellow", rank:1, label:"Alerta amarelo", description:"Perigo potencial"};
  if (text === "perigo" || /laranja|#f96602|#ff9900|#ffa500/.test(color)) return {className:"orange", rank:2, label:"Alerta laranja", description:"Perigo"};
  if (/amarel|#ffff00|#ffcc00|#ff0\b/.test(color)) return {className:"yellow", rank:1, label:"Alerta amarelo", description:"Perigo potencial"};
  return {className:"unknown", rank:0, label:"Aviso meteorológico", description:"Severidade a confirmar no INMET"};
}

function inmetArea(alert) {
  const codes = JSON.stringify(alert.geocodes || alert.geocode || "").match(/\b\d{7}\b/g) || [];
  if (codes.length) return codes.includes(activeCity.id) ? activeCity.name : null;
  const contains = (value, name) => new RegExp('(^|[^a-z])' + normalizeName(name) + '([^a-z]|$)').test(normalizeName(JSON.stringify(value || "")));
  const towns = alert.municipios || alert.municipio;
  if (towns && contains(towns, activeCity.name)) {
    const region = normalizeName(JSON.stringify([alert.estados, alert.uf, alert.sigla, alert.area, alert.areaDesc]));
    const ufConfirmed = region.includes(normalizeName(activeCity.uf)) || region.includes(normalizeName(activeCity.state || ""));
    const uniqueConfirmed = municipalitiesReady && CITIES.filter(city => normalizeName(city.name) === normalizeName(activeCity.name)).length === 1;
    return ufConfirmed || uniqueConfirmed ? activeCity.name : null;
  }
  if (towns) return null;
  // State names can equal a capital name (São Paulo/Rio de Janeiro).
  // Only a municipality field or IBGE code confirms a city-level match.
  const region = [alert.estados, alert.uf, alert.sigla, alert.area, alert.areaDesc];
  const stateNames = normalizeName(JSON.stringify(region)).split(/[,;|/"\[\]{}:]/).map(value => value.trim());
  if (stateNames.includes(normalizeName(activeCity.state)) || stateNames.includes(normalizeName(activeCity.uf))) return activeCity.state + " · confirme a área no mapa";
  return null;
}

function inmetTime(alert, type) {
  const date = alert[`data_${type}`]; const time = alert[`hora_${type}`];
  // Separate INMET date/hour fields and timezone-less strings use Brasília.
  if (date && /^\d{2}:\d{2}(?::\d{2})?$/.test(time || "")) return Date.parse(`${String(date).slice(0,10)}T${time}-03:00`);
  const raw = firstValue(alert, type === "inicio" ? ["inicio", "onset", "effective"] : ["fim", "expires", "termino"]);
  if (!raw) return NaN;
  let value = String(raw).trim().replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) value += "-03:00";
  return Date.parse(value);
}

function selectInmetAlerts(raw, now = Date.now()) {
  return normalizeAlerts(raw).flatMap(alert => {
    if ([true, 1, "1", "true"].includes(alert.encerrado) || /cancel/i.test(alert.msgType || "")) return [];
    const area = inmetArea(alert);
    const start = inmetTime(alert, "inicio"); const end = inmetTime(alert, "fim");
    if (!area || (Number.isFinite(end) && end <= now)) return [];
    const stage = start > now ? "future" : Number.isFinite(start) && Number.isFinite(end) ? "active" : "unconfirmed";
    return [{alert, area, start, end, stage, severity:inmetSeverity(alert)}];
  }).sort((a,b) => (a.stage === "active" ? 0 : 1) - (b.stage === "active" ? 0 : 1) || b.severity.rank - a.severity.rank);
}

function renderInmetAlerts(raw, stale = false) {
  globalThis.PLUVIA?.modules.alerts.receive?.(raw, stale);
  const state = $("inmetState"); const content = $("inmetContent");
  const alerts = selectInmetAlerts(raw);
  const activeOfficial = alerts.find(item => item.stage === "active" && item.area === activeCity.name);
  $("inmetCard").dataset.severity = stale ? "unknown" : activeOfficial?.severity.className || "none";
  if (!alerts.length) {
    state.className = "source-state"; state.innerHTML = `<i></i>${stale ? "Consulta indisponível" : "Nenhum aviso identificado"}`;
    content.innerHTML = stale ? "<h3>Confira o mapa do INMET</h3><p>Não foi possível confirmar os avisos atuais. A leitura anterior não confirma a situação de agora.</p>" : `<h3>✓ Sem alertas meteorológicos ativos</h3><p>A consulta oficial não retornou avisos vigentes ou previstos para ${activeCity.name}. Verificação atualizada agora; confira também o mapa oficial.</p>`;
    applyOfficialAlertPriority();
    return;
  }
  state.className = `source-state inmet-${stale ? "unknown" : alerts[0].severity.className}`;
  state.innerHTML = `<i></i>${stale ? "Sem confirmação recente" : alerts.length === 1 ? alerts[0].severity.label : `${alerts.length} avisos na região`}`;
  const format = value => new Intl.DateTimeFormat("pt-BR", {timeZone:activeCity.timezone, day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit"}).format(new Date(value));
  content.innerHTML = (stale ? '<p class="inmet-notice">Consulta indisponível. Os avisos abaixo vêm da leitura anterior; confirme a situação no INMET.</p>' : "") + alerts.map(({alert, area, start, end, stage, severity}, index) => {
    const id = String(firstValue(alert, ["id_aviso", "id"]));
    const url = /^\d+$/.test(id) ? `https://avisos.inmet.gov.br/${id}` : "https://alertas2.inmet.gov.br/";
    const title = firstValue(alert, ["descricao", "evento", "titulo", "tipo"], "Aviso meteorológico");
    const risks = firstValue(alert, ["riscos", "description"], "Consulte os riscos e as orientações no aviso oficial.");
    const riskText = Array.isArray(risks) ? risks.join(" ") : String(risks);
    const timing = stage === "future" ? `Previsto a partir de ${format(start)} (${activeCity.name})` : stage === "active" ? `Vigente até ${format(end)} (${activeCity.name})` : "Vigência a confirmar no aviso oficial";
    return `<article class="inmet-alert inmet-${severity.className}"><span class="inmet-level">${severity.label} · ${severity.description}</span><h3>${escapeHtml(decodeHtml(String(title)))}</h3><p>${escapeHtml(decodeHtml(riskText).slice(0,360))}</p><div class="source-meta"><span>${escapeHtml(area)}</span><span>${escapeHtml(timing)}</span></div><button class="inmet-detail" type="button" data-notice="${index}">Ver detalhes</button><a class="inmet-detail" href="${url}" target="_blank" rel="noreferrer">Ver aviso ${/^\d+$/.test(id) ? id : "oficial"} no INMET ↗</a></article>`;
  }).join("");
  applyOfficialAlertPriority();
}

function updateInmetTimestamp(stale = false) {
  const node = $("inmetUpdated");
  if (!node) return;
  if (!lastInmetReadAt) { node.textContent = "Leitura oficial ainda não concluída"; return; }
  const minutes = Math.max(0, Math.round((Date.now() - lastInmetReadAt) / 60000));
  node.textContent = `${stale ? "Última leitura válida" : "Leitura oficial"}: ${minutes < 1 ? "agora" : minutes === 1 ? "há 1 min" : `há ${minutes} min`}`;
}

function applyOfficialAlertPriority() {
  const severity = $("inmetCard")?.dataset.severity;
  const card = $("attentionCard");
  if (!card?.classList) return;
  if (!['orange','red'].includes(severity)) {
    const wasOfficial = card.classList.contains?.("official-orange") || card.classList.contains?.("official-red");
    card.classList.remove("official-orange", "official-red");
    if (wasOfficial && displayedWeather?.forecast) renderAttention(displayedWeather.forecast, selectCurrentHour(displayedWeather.forecast.hourly.time));
    renderGoOut();
    return;
  }
  card.classList.remove("ok", "warning", "danger", "unavailable", "official-orange", "official-red");
  card.classList.add("danger", `official-${severity}`);
  $("attentionSignal").textContent = severity === "red" ? "INMET · GRANDE PERIGO" : "INMET · PERIGO";
  $("attentionTitle").textContent = severity === "red" ? "Fica em casa se puder" : "Sai de casa preparado";
  $("attentionText").textContent = `Há aviso ${severity === "red" ? "vermelho" : "laranja"} vigente para a região. Abra o aviso e confira área, horário e orientações antes de sair.`;
  $("attentionIcon").innerHTML = weatherIcons?.markup(95, displayedWeather?.forecast?.current?.is_day !== 0, {className:"summary-weather-icon"}) || "";
  $("attentionIcon").setAttribute("aria-label", "Trovoada e alerta oficial");
  $("summaryHighlights").innerHTML = `<li class="danger">Aviso ${severity === "red" ? "vermelho" : "laranja"} do INMET</li><li class="warning">Confira área e validade</li>`;
  $("attentionBasis").textContent = "Prioridade definida pelo aviso oficial do INMET.";
  $("summaryLink").href = "#alertas";
  $("summaryLink").textContent = "Ver aviso oficial e orientações →";
  renderGoOut();
}

function renderGoOut(forecast = displayedWeather?.forecast, air = displayedWeather?.air) {
  const card = $("goOutCard");
  if (!card) return;
  const official = $("inmetCard")?.dataset.severity;
  const sourceStatus = {
    alerts: globalThis.PLUVIA?.sources?.get('alerts')?.status,
    air: globalThis.PLUVIA?.sources?.get('air-quality')?.status,
    weather: globalThis.PLUVIA?.sources?.get('weather')?.status
  };
  const result = globalThis.PLUVIA?.signal?.evaluate({forecast,air,aqi:air?.current?.us_aqi,start:forecast?.hourly?.time?.length ? selectCurrentHour(forecast.hourly.time) : 0,officialSeverity:official,sourceStatus,radar:globalThis.PLUVIA?.radar?.get?.()}) || {level:'unknown',label:'Sem leitura',summary:'Os dados necessários estão temporariamente indisponíveis.',confidence:'low',factors:[],degraded:true};
  card.dataset.level = result.level;
  card.classList?.toggle?.("is-degraded", result.level === "degraded" || result.degraded === true && result.level !== "danger" && result.level !== "wait");
  const title = $("goOutTitle");
  title.textContent = "";
  const code = forecast?.current?.weather_code;
  const isDay = forecast?.current?.is_day !== 0;
  const signalIcon = Number.isFinite(Number(code))
    ? weatherIcons?.markup?.(code, isDay, {className:"signal-weather-icon", size:32})
    : weatherIcons?.markupName?.("weather-unknown", {className:"signal-weather-icon", size:32});
  if (signalIcon) title.insertAdjacentHTML("afterbegin", signalIcon);
  const label = document.createElement("span");
  label.textContent = result.label;
  title.appendChild(label);
  $("goOutReason").textContent = result.summary;
  const degraded = $("goOutDegraded");
  if (degraded) {
    const show = result.level === "degraded";
    degraded.hidden = !show;
    if (show) degraded.textContent = "INMET sem confirmação agora. Isso é monitoramento incompleto, não um alerta amarelo de céu ruim.";
  }
  const list = $("goOutFactors");
  if (list) {
    list.textContent = '';
    result.factors.forEach(factor => { const item=document.createElement('li'); item.textContent=factor; list.appendChild(item); });
  }
  const confidence = {high:'alta',moderate:'moderada',low:'baixa'}[result.confidence] || 'baixa';
  if ($("goOutConfidence")) $("goOutConfidence").textContent = `Confiança desta leitura: ${confidence}. A linguagem é limitada pela resolução das fontes.`;
  const weatherAt = forecast?.current?.time ? cityDate(forecast.current.time).getTime() : NaN;
  if ($("goOutUpdated")) $("goOutUpdated").textContent = Number.isFinite(weatherAt) ? `Dados do modelo: ${formatUpdateTime(weatherAt)} no horário de ${activeCity.name}. Leitura orientativa do município, não da sua rua.` : 'Leitura orientativa do município, não da sua rua.';
}

async function loadInmetAlerts(revision = cityRevision) {
  try {
    const raw = await services.alerts.getActive();
    if (revision !== cityRevision) return;
    lastInmetResponse = raw;
    lastInmetReadAt = Date.now();
    globalThis.PLUVIA?.sources.set("alerts",{status:"ready",checkedAt:lastInmetReadAt,dataAt:null});
    renderInmetAlerts(raw);
    updateInmetTimestamp();
  } catch {
    if (revision !== cityRevision) return;
    globalThis.PLUVIA?.sources.set("alerts",{status:lastInmetResponse ? "stale" : "error"});
    if (lastInmetResponse) { renderInmetAlerts(lastInmetResponse, true); updateInmetTimestamp(true); return; }
    const state = $("inmetState"); const content = $("inmetContent");
    $("inmetCard").dataset.severity = "unknown";
    state.className = "source-state warning"; state.innerHTML = "<i></i>Consulta indisponível";
    content.innerHTML = "<h3>Abra o mapa do INMET</h3><p>A fonte automática não respondeu agora. Use o atalho abaixo para conferir os avisos oficiais diretamente no INMET.</p>";
    applyOfficialAlertPriority();
    updateInmetTimestamp(true);
  }
}

async function loadDefesaAlerts(revision = cityRevision) {
  const state = $("defesaState"); const content = $("defesaContent");
  try {
    if (activeCity.id !== "1302603") {
      globalThis.PLUVIA?.sources.set("disasters",{status:"unsupported"});
      state.className = "source-state"; state.innerHTML = "<i></i>Orientação nacional";
      content.innerHTML = '<h3>Defesa Civil em ' + escapeHtml(activeCity.state || activeCity.uf) + '</h3><p>O PLUVIA ainda não lê o feed estadual desta região. Consulte a <a href="' + DEFESA_NACIONAL + '" target="_blank" rel="noreferrer">Defesa Civil Nacional ↗</a> para chegar aos canais locais.</p>';
      return;
    }
    const posts = await services.civilDefense.getManausRecent();
    if (revision !== cityRevision) return;
    if (!Array.isArray(posts)) throw new Error("Resposta municipal desconhecida");
    const relevant = posts.filter(p => /alerta|chuva|alagamento|deslizamento|temporal|vendaval/i.test(decodeHtml(p.title?.rendered || "")));
    const latest = relevant[0]; const ageHours = latest ? (Date.now() - cityDate(latest.date).getTime()) / 3600000 : Infinity;
    if (!latest || ageHours > 48) {
      globalThis.PLUVIA?.sources.set("disasters",{status:"ready",checkedAt:Date.now(),dataAt:latest ? cityDate(latest.date).getTime() : null});
      state.className = "source-state"; state.innerHTML = "<i></i>Sem comunicado recente";
      const lastLink = latest ? `<a href="${safeManausUrl(latest.link)}" target="_blank" rel="noreferrer">Ver último comunicado oficial ↗</a>` : "";
      content.innerHTML = `<h3>Consulte os canais oficiais</h3><p>A busca não encontrou comunicados nas últimas 48 horas. Isso não confirma ausência de alertas. ${lastLink}</p>`;
      return;
    }
    globalThis.PLUVIA?.sources.set("disasters",{status:"ready",checkedAt:Date.now(),dataAt:cityDate(latest.date).getTime()});
    const title = decodeHtml(latest.title?.rendered || "Comunicado da Defesa Civil"); const summary = decodeHtml(latest.excerpt?.rendered || "Consulte as orientações oficiais da Prefeitura de Manaus.");
    state.className = "source-state warning"; state.innerHTML = "<i></i>Comunicado recente";
    content.innerHTML = `<h3>${escapeHtml(title)}</h3><p>${escapeHtml(summary.slice(0, 210))}</p><div class="source-meta"><span>${new Intl.DateTimeFormat("pt-BR", {dateStyle:"short", timeStyle:"short", timeZone:activeCity.timezone}).format(cityDate(latest.date))}</span><span><a href="${safeManausUrl(latest.link)}" target="_blank" rel="noreferrer">Ler publicação ↗</a></span></div>`;
  } catch {
    if (revision !== cityRevision) return;
    globalThis.PLUVIA?.sources.set("disasters",{status:"error"});
    state.className = "source-state warning"; state.innerHTML = "<i></i>Canal direto";
    content.innerHTML = "<h3>Alertas direto no celular</h3><p>O portal municipal não respondeu. Envie seu CEP por SMS para 40199; alertas extremos também chegam automaticamente em celulares compatíveis.</p>";
  }
}

function updateClock() {
  if (!activeCity) return;
  const now = new Date();
  $("localClock").textContent = new Intl.DateTimeFormat("pt-BR", { timeZone: activeCity.timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  $("localDate").textContent = new Intl.DateTimeFormat("pt-BR", { timeZone: activeCity.timezone, weekday: "long", day: "numeric", month: "long" }).format(now).replace(/^./, c => c.toUpperCase());
}

const dateOffsets = new Map();
function cityDate(value, city = activeCity) {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return new Date(value);
  const base = Date.parse(value + "Z");
  if (!Number.isFinite(base)) return new Date(NaN);
  const key = city.id + ":" + value.slice(0,10);
  if (!dateOffsets.has(key)) dateOffsets.set(key, new Intl.DateTimeFormat("en", {timeZone:city.timezone, timeZoneName:"longOffset"}).formatToParts(new Date(base)).find(part => part.type === "timeZoneName").value);
  const offset = dateOffsets.get(key);
  return new Date(value + (offset === "GMT" ? "Z" : offset.replace("GMT", "")));
}

function selectCurrentHour(times) {
  const now = Date.now();
  const next = times.findIndex(t => cityDate(t).getTime() > now);
  return next < 0 ? times.length - 1 : Math.max(0, next - 1);
}

const SUMMARY_CACHE_MAX_AGE = 45 * 60 * 1000;

function summaryCache(context) {
  try {
    const value = JSON.parse(localStorage.getItem(`pluvia-summary-${activeCity.id}`) || "null");
    return value?.hash === smartSummary.contextHash(context) && Date.now() - value.savedAt <= SUMMARY_CACHE_MAX_AGE ? value.summary : null;
  } catch { return null; }
}

function saveSummary(summary) {
  try { localStorage.setItem(`pluvia-summary-${activeCity.id}`, JSON.stringify({hash:summary.contextHash,savedAt:Date.now(),summary})); } catch {}
}

function paintSummary(summary, data) {
  const card = $("attentionCard");
  const stateClass = summary.status === "calm" ? "ok" : summary.status === "danger" ? "danger" : summary.status === "warning" ? "warning" : "info";
  card.classList.remove("ok", "info", "warning", "danger", "unavailable", "official-orange", "official-red");
  card.classList.add(stateClass);
  $("attentionSignal").textContent = summary.status === "calm" ? "TRANQUILO" : summary.status === "danger" ? "CONDIÇÃO RELEVANTE" : summary.status === "warning" ? "ATENÇÃO" : "INFORMAÇÃO";
  $("attentionTitle").textContent = summary.title;
  $("attentionText").textContent = summary.summary;
  $("attentionIcon").innerHTML = weatherIcons.markup(summary.iconCode, data.current.is_day !== 0, {className:"summary-weather-icon"});
  $("attentionIcon").setAttribute("aria-label", weatherIcons.condition(summary.iconCode).label);
  $("summaryHighlights").innerHTML = summary.highlights.map(item => `<li class="${item.tone}">${escapeHtml(item.label)}</li>`).join("");
  $("attentionBasis").textContent = `${summary.source === "rules" ? "Motor meteorológico verificável" : "Interpretação validada"} · atualizado ${dataAge(Date.parse(summary.generatedAt))}`;
  $("summaryLink").href = summary.status === "danger" ? "#alertas" : "#previsao";
  $("summaryLink").textContent = summary.status === "danger" ? "Ver alertas e detalhes →" : "Ver previsão detalhada →";
}

async function enhanceSummary(context, data) {
  const setStatus = status => {
    const card = $("attentionCard");
    const current = card?.getAttribute("data-ai-status");
    if (status === "cooldown" && current && !["loading", "cooldown"].includes(current)) return;
    card?.setAttribute("data-ai-status", status);
  };
  if (!smartSummary) { setStatus("engine_unavailable"); return; }
  if (Date.now() < summaryAiUnavailableUntil) { setStatus("cooldown"); return; }
  if (summaryAiInFlight === context.contextHash) return;
  const account = globalThis.pluviaAccount;
  if (!account?.getUser?.()) { setStatus("authentication_required"); return; }
  setStatus("loading");
  summaryAiInFlight = context.contextHash;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const client = await account.getClient();
    const {data: response, error} = await client.functions.invoke("smart-summary", {body:{context}, signal:controller.signal});
    if (error || !response?.available) {
      setStatus(response?.reason || "request_failed");
      summaryAiUnavailableUntil = Date.now() + (response?.reason === "rate_limited" ? 60 : 10) * 60_000;
      return;
    }
    const summary = response.summary;
    const currentContext = smartSummary.buildContext(data, displayedWeather?.air, selectCurrentHour(data.hourly.time), activeCity);
    if (context.contextHash !== currentContext.contextHash) { setStatus("stale_context"); return; }
    if (!smartSummary.validate(summary, currentContext)) { setStatus("validation_failed"); return; }
    saveSummary(summary);
    paintSummary(summary, data);
    applyOfficialAlertPriority();
    setStatus("ready");
  } catch {
    setStatus("request_failed");
    summaryAiUnavailableUntil = Date.now() + 10 * 60_000;
  } finally {
    clearTimeout(timeout);
    if (summaryAiInFlight === context.contextHash) summaryAiInFlight = null;
  }
}

function renderAttention(data, start, air = displayedWeather?.air) {
  if (!smartSummary || !weatherIcons) return;
  const context = smartSummary.buildContext(data, air, start, activeCity);
  let summary = summaryCache(context);
  if (!summary || !smartSummary.validate(summary, context)) {
    summary = smartSummary.deterministic(context);
    saveSummary(summary);
  }
  paintSummary(summary, data);
  applyOfficialAlertPriority();
  if (summary.source !== "ai") setTimeout(() => enhanceSummary(context, data), 0);
}

globalThis.addEventListener?.("pluvia:auth-changed", event => {
  if (event.detail?.user && displayedWeather?.forecast) {
    const data = displayedWeather.forecast;
    renderAttention(data, selectCurrentHour(data.hourly.time), displayedWeather.air);
  }
});

function findDryWindow(hourly, start) {
  for (let i = start; i < Math.min(hourly.time.length - 2, start + 36); i++) {
    if (hourly.precipitation_probability[i] < 30 && hourly.precipitation_probability[i + 1] < 30) {
      const day = i === start ? "Agora" : hourly.time[i].slice(0, 10) === hourly.time[start].slice(0, 10) ? "Hoje" : "Amanhã";
      return `${day === "Agora" ? "Agora" : day}, das ${shortTime(hourly.time[i])} às ${shortTime(hourly.time[i + 2])} deve dar uma trégua`;
    }
  }
  return "Sem janela clara em 36h";
}

function forecastIsDay(time, daily) {
  const date = String(time || "").slice(0, 10);
  const dayIndex = daily?.time?.indexOf(date) ?? -1;
  if (dayIndex < 0) return true;
  return weatherIcons.isDayAt(time, daily.sunrise?.[dayIndex], daily.sunset?.[dayIndex]);
}

function renderRain(hourly, start, daily) {
  const scrollLeft = $("rainChart").scrollLeft;
  const indices = Array.from({length: 24}, (_, i) => start + i).filter(i => i < hourly.time.length);
  $("rainChart").innerHTML = indices.map((i, p) => {
    const prob = Math.round(hourly.precipitation_probability[i] || 0);
    const mm = hourly.precipitation[i] || 0;
    const barHeight = mm > 0 ? Math.min(150, 8 + Math.sqrt(mm) * 42) : Math.max(3, prob * .2);
    const temperature = hourly.temperature_2m?.[i];
    const gust = hourly.wind_gusts_10m?.[i];
    return `<div class="hour-column ${p === 0 ? "now" : ""}" title="${shortTime(hourly.time[i])}: ${fmt(temperature)} graus, ${prob}% de chuva, ${fmt(mm, 1)} milímetro${gust >= 45 ? `, rajadas de ${fmt(gust)} quilômetros por hora` : ""}">
      <span class="hour-time">${p === 0 ? "AGORA" : shortTime(hourly.time[i])}</span>
      <span class="hour-temp">${fmt(temperature)}°</span>
      <div class="bar-area"><div class="rain-bar" data-prob="${prob}" style="height:${barHeight}px"></div></div>
      <span class="rain-mm">${fmt(mm, 1)} mm</span><span class="hour-icon">${weatherIcons.markup(hourly.weather_code[i], forecastIsDay(hourly.time[i], daily), {className:"hourly-weather-icon", decorative:false})}</span>
    </div>`;
  }).join("");
  $("rainChart").setAttribute("aria-label", `Chuva prevista por hora em ${activeCity.name}: barras mostram milímetros e os números mostram probabilidade.`);
  $("rainChart").scrollLeft = scrollLeft;
  $("dryWindow").textContent = findDryWindow(hourly, start);
  renderRainSeasonContext(hourly, start);
  renderRainPulse(hourly, start);
}

function rainSeasonPhase(city, month) {
  const wetter = {
    AM:[12,1,2,3,4,5], PA:[12,1,2,3,4,5], AP:[12,1,2,3,4,5],
    RR:[5,6,7,8], AC:[10,11,12,1,2,3,4], RO:[10,11,12,1,2,3,4], TO:[10,11,12,1,2,3,4]
  };
  if (!wetter[city.uf]) return "";
  return wetter[city.uf].includes(month) ? "fase geralmente mais chuvosa" : "fase geralmente menos chuvosa";
}

function renderRainSeasonContext(hourly, start) {
  const date = hourly.time[start]?.slice(0, 10);
  const indices = hourly.time.map((time, index) => time.startsWith(date) ? index : -1).filter(index => index >= 0);
  const untilNow = indices.filter(index => index <= start).reduce((sum, index) => sum + (Number(hourly.precipitation[index]) || 0), 0);
  const wholeDay = indices.reduce((sum, index) => sum + (Number(hourly.precipitation[index]) || 0), 0);
  const month = Number(date?.slice(5, 7));
  const phase = rainSeasonPhase(activeCity, month);
  $("rainSeasonContext").textContent = `O modelo indica ${fmt(untilNow,1)} mm desde 0h e ${fmt(wholeDay,1)} mm no dia.${phase ? ` ${phase.replace(/^./, letter => letter.toUpperCase())} em ${activeCity.state}.` : ""} Volume previsto sozinho não vira alerta.`;
}

function paintRainPulse() {
  const frame = rainPulseFrames[rainPulseIndex];
  if (!frame) return;
  const density = Math.min(1, (frame.mm || 0) / 8 + (frame.prob || 0) / 180);
  $("rainPulseSky").style.setProperty("--rain-density", density.toFixed(2));
  $("rainPulseSky").classList.toggle("is-wet", frame.mm >= .3 || frame.prob >= 50);
  $("rainPulseTime").textContent = shortTime(frame.time);
  $("rainPulseValue").textContent = `${Math.round(frame.prob)}% · ${fmt(frame.mm, 1)} mm`;
  paintRainMap();
}

function paintRainMap() {
  if (!rainMapLocations?.length || rainMapCityId !== activeCity?.id) return;
  const grid = $("rainMapGrid");
  if (!grid.children.length) {
    const cells = Array.from({length:9}, () => {
      const cell = document.createElement("span");
      cell.setAttribute("aria-hidden", "true");
      return cell;
    });
    grid.replaceChildren(...cells);
  }
  const values = rainMapLocations.map(location => ({
    mm:Number(location.hourly?.precipitation?.[rainPulseIndex]) || 0,
    prob:Number(location.hourly?.precipitation_probability?.[rainPulseIndex]) || 0
  }));
  const maxMm = Math.max(...values.map(value => value.mm));
  const maxProb = Math.max(...values.map(value => value.prob));
  [...grid.children].forEach((cell, index) => {
    const value = values[index] || {mm:0,prob:0};
    const intensity = Math.min(1, value.mm / 8 + value.prob / 180);
    cell.style.setProperty("--rain", intensity.toFixed(2));
    cell.title = `${fmt(value.mm,1)} mm · ${Math.round(value.prob)}%`;
    const direction = ["Noroeste", "Norte", "Nordeste", "Oeste", "Município", "Leste", "Sudoeste", "Sul", "Sudeste"][index];
    cell.textContent = `${direction}\n${fmt(value.mm,1)} mm\n${Math.round(value.prob)}%`;
  });
  const time = rainMapLocations[0].hourly?.time?.[rainPulseIndex] || rainPulseFrames[rainPulseIndex]?.time;
  grid.setAttribute("aria-label", `Mapa do modelo às ${shortTime(time)}. Maior ponto: ${fmt(maxMm,1)} milímetro e ${Math.round(maxProb)} por cento.`);
  $("rainMapStatus").textContent = maxMm === 0 ? `${shortTime(time)} · sem volume de chuva previsto nos nove pontos. Maior chance: ${Math.round(maxProb)}%.` : `${shortTime(time)} · maior volume ao redor: ${fmt(maxMm,1)} mm · maior chance: ${Math.round(maxProb)}%`;
}

async function loadRainMap() {
  if (!activeCity) return;
  const revision = cityRevision;
  const cityId = activeCity.id;
  const button = $("rainMapLoad");
  button.disabled = true;
  button.textContent = "Carregando…";
  $("rainMapStatus").textContent = "Comparando nove pontos ao redor do centro municipal…";
  try {
    const raw = await services.weather.getPrecipitationGrid(activeCity, {timeoutMs:10000});
    if (revision !== cityRevision || cityId !== activeCity.id) return;
    const locations = Array.isArray(raw) ? raw : raw?.locations;
    if (!Array.isArray(locations) || locations.length !== 9) throw new Error("grade incompleta");
    if (locations.some(point => !point.hourly?.time?.length || !point.hourly.time.every((_,i) => Number.isFinite(point.hourly.precipitation?.[i]) && Number.isFinite(point.hourly.precipitation_probability?.[i])))) throw new Error("Dados de mapa incompletos");
    rainMapLocations = locations;
    rainMapCityId = cityId;
    $("rainMapGrid").hidden = false;
    button.textContent = "Atualizar mapa";
    paintRainMap();
    globalThis.PLUVIA?.sources.set("map",{status:"ready",checkedAt:Date.now(),dataAt:cityDate(locations[0].hourly.time[0]).getTime()});
  } catch {
    if (revision !== cityRevision) return;
    globalThis.PLUVIA?.sources.set("map",{status:"error"});
    $("rainMapStatus").textContent = "O mapa do modelo falhou agora. A previsão do ponto municipal continua valendo.";
    button.textContent = "Tentar mapa de novo";
  } finally {
    if (revision === cityRevision) button.disabled = false;
  }
}

function setRainPulsePlaying(playing) {
  rainPulsePlaying = Boolean(playing && rainPulseFrames.length > 1);
  clearInterval(rainPulseTimer);
  const button = $("rainPulseToggle");
  button.setAttribute("aria-pressed", String(rainPulsePlaying));
  button.textContent = rainPulsePlaying ? "Pausar" : "Reproduzir";
  if (rainPulsePlaying) rainPulseTimer = setInterval(() => {
    rainPulseIndex = (rainPulseIndex + 1) % rainPulseFrames.length;
    paintRainPulse();
  }, 1400);
}

function renderRainPulse(hourly, start) {
  if (rainMapCityId !== activeCity?.id) {
    rainMapLocations = null;
    rainMapCityId = null;
    $("rainMapGrid").hidden = true;
    $("rainMapGrid").replaceChildren();
    $("rainMapStatus").textContent = "Toque em “Mapa ao redor” para comparar nove pontos próximos sem pesar a abertura.";
    $("rainMapLoad").textContent = "Mapa ao redor";
  }
  rainPulseFrames = Array.from({length: 8}, (_, offset) => start + offset)
    .filter(index => index < hourly.time.length)
    .map(index => ({time:hourly.time[index], prob:Number(hourly.precipitation_probability[index]) || 0, mm:Number(hourly.precipitation[index]) || 0}));
  rainPulseIndex = 0;
  paintRainPulse();
  setRainPulsePlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

function renderForecast(daily) {
  const days = daily.time.slice(0, 7);
  const bestIndex = days.reduce((best, _, i) => {
    const score = (daily.precipitation_probability_max[i] || 0) + (daily.precipitation_sum[i] || 0) * 4;
    const bestScore = (daily.precipitation_probability_max[best] || 0) + (daily.precipitation_sum[best] || 0) * 4;
    return score < bestScore ? i : best;
  }, 0);
  const minAll = Math.min(...daily.temperature_2m_min); const maxAll = Math.max(...daily.temperature_2m_max); const spread = Math.max(1, maxAll - minAll);
  $("forecastList").innerHTML = days.map((date, i) => {
    const d = new Date(`${date}T12:00:00`);
    const day = i === 0 ? "Hoje" : new Intl.DateTimeFormat("pt-BR", {weekday: "long"}).format(d).replace(/^./, c => c.toUpperCase());
    const label = new Intl.DateTimeFormat("pt-BR", {day: "2-digit", month: "short"}).format(d).replace(".", "");
    const [cond] = weather(daily.weather_code[i]); const min = daily.temperature_2m_min[i]; const max = daily.temperature_2m_max[i];
    const width = Math.max(25, ((max - min) / spread) * 100);
    const rainProb = Math.round(daily.precipitation_probability_max[i] || 0); const rainMm = daily.precipitation_sum[i] || 0;
    const weekend = [0,6].includes(d.getDay());
    const reading = rainMm >= 20 ? "Dia bem molhado" : rainMm >= 8 ? "Pancadas fortes ao longo do dia" : rainProb >= 55 ? "Pode chover, mas sem volume grande" : rainProb >= 30 ? "Chuva isolada" : "Boa janela pra sair";
    return `<div class="forecast-row ${i === bestIndex ? "best-day" : ""}">
      <div class="forecast-day"><strong>${day}${weekend ? " · fim de semana" : ""}</strong><span>${label}${i === bestIndex ? " · melhor dia pra rolê" : ""}</span></div>
      <div class="forecast-condition"><i>${weatherIcons.markup(daily.weather_code[i], true, {className:"forecast-weather-icon"})}</i><span>${cond}</span></div>
      <div class="temp-range" aria-label="Mínima ${fmt(min)} graus, máxima ${fmt(max)} graus"><strong>${fmt(min)}°</strong><div class="temp-track"><span style="width:${width}%"></span></div><strong>${fmt(max)}°</strong></div>
      <div class="forecast-rain"><span>${weatherIcons.markupName("rain-probability", {className:"rain-metric-icon"})}</span><span>${rainProb}% · ${fmt(rainMm, 1)} mm</span></div>
      <div class="forecast-uv">${reading} · UV ${fmt(daily.uv_index_max[i], 0)}</div>
    </div>`;
  }).join("");
}

function renderSun(daily) {
  const rise = cityDate(daily.sunrise[0]); const set = cityDate(daily.sunset[0]); const minutes = Math.round((set - rise) / 60000);
  $("sunrise").textContent = shortTime(daily.sunrise[0]); $("sunset").textContent = shortTime(daily.sunset[0]);
  $("daylight").textContent = `${Math.floor(minutes / 60)}h ${minutes % 60}min de luz`;
  const now = new Date(); const progress = Math.min(1, Math.max(0, (now - rise) / (set - rise)));
  document.querySelector(".sun-section")?.classList.toggle("is-night", now < rise || now > set);
  $("sunDot").style.left = `${3 + progress * 91}%`; $("sunDot").style.top = `${74 - Math.sin(progress * Math.PI) * 58}px`;
  $("sunPhrase").textContent = now < rise ? "O sol ainda não nasceu." : now > set ? `O sol já se pôs em ${activeCity.name}.` : `Restam cerca de ${Math.max(0, Math.round((set - now) / 3600000))}h de claridade.`;
}

function cache(data, metadata = {}) { try { localStorage.setItem(`pluvia-weather-${activeCity.id}`, JSON.stringify({at: Date.now(),weatherAt:metadata.weatherAt || Date.now(),airAt:metadata.airAt || null,data})); } catch {} }
function validForecast(data) {
  return weatherData?.validateForecast?.(data).valid === true;
}
function cached() {
  if (!activeCity) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(`pluvia-weather-${activeCity.id}`) || "null");
    const age = Date.now() - saved?.at;
    return age >= 0 && age <= CACHE_MAX_AGE_MS && validForecast(saved?.data?.forecast) ? saved : null;
  } catch { return null; }
}

function setDataStatus(text, stale = false) {
  $("statusText").textContent = text;
  $("dataStatus").classList.toggle("stale", stale);
  $("dataStatus").dataset.freshness = stale ? "stale" : "current";
}

function formatUpdateTime(at) {
  if (!Number.isFinite(at)) return 'horário não informado';
  return new Intl.DateTimeFormat('pt-BR',{timeZone:activeCity?.timezone || 'UTC',hour:'2-digit',minute:'2-digit'}).format(at);
}


function clearWeatherInsights() {
  ["yesterdayComparison","feelsLikeNote","uvNote","rainPhraseMeta"].forEach(id => {
    const node = $(id);
    if (node) node.textContent = "";
  });
  const highlights = $("contextHighlights");
  if (highlights) highlights.textContent = "";
  const explanation = $("weatherExplanation");
  if (explanation) explanation.hidden = true;
  const reasons = $("weatherExplanationList");
  if (reasons) reasons.textContent = "";
}

function renderWeatherInsights(data, air, start) {
  if (!weatherInsights?.build) return;
  const insight = weatherInsights.build({forecast:data, air, start, timezone:activeCity?.timezone});
  const comparison = $("yesterdayComparison");
  if (comparison) {
    comparison.textContent = insight.comparison || "";
    comparison.hidden = !insight.comparison;
  }
  if ($("feelsLikeNote") && insight.feelsLike) $("feelsLikeNote").textContent = insight.feelsLike;
  if ($("uvNote") && insight.uv?.label) $("uvNote").textContent = insight.uv.label;
  const highlights = $("contextHighlights");
  if (highlights) {
    highlights.textContent = "";
    const summaryLabels = Array.from($("summaryHighlights")?.children || [], item => item.textContent || "");
    weatherInsights.uniqueHighlights(insight.highlights, summaryLabels, 3).forEach(label => {
      const item = document.createElement("li");
      item.textContent = label;
      highlights.appendChild(item);
    });
  }
  const explanation = $("weatherExplanation");
  const reasons = $("weatherExplanationList");
  if (explanation && reasons) {
    reasons.textContent = "";
    (insight.reasons || []).forEach(reason => {
      const item = document.createElement("li");
      item.textContent = reason;
      reasons.appendChild(item);
    });
    explanation.hidden = !reasons.childElementCount;
  }
  if ($("rainPhraseMeta") && insight.rain?.meta) $("rainPhraseMeta").textContent = insight.rain.meta;
}

function markWeatherUnavailable(hasSavedData) {
  setDataStatus(hasSavedData ? "Dados salvos · sem confirmação atual" : "Conexão indisponível", true);
  if (hasSavedData) {
    renderGoOut();
    return;
  }
  $("attentionCard").classList.remove("ok", "warning", "danger");
  $("attentionCard").classList.add("unavailable");
  $("attentionSignal").textContent = "SEM LEITURA";
  $("attentionTitle").textContent = "Aguardando conexão";
  $("attentionText").textContent = "A leitura local volta automaticamente quando a consulta estiver disponível.";
  $("attentionIcon").innerHTML = weatherIcons?.markup(3, true, {className:"summary-weather-icon"}) || "";
  $("attentionIcon").setAttribute("aria-label", "Sem leitura");
  $("summaryHighlights").innerHTML = '<li class="info">Dados temporariamente indisponíveis</li>';
  $("summaryLink").href = "#previsao";
  $("summaryLink").textContent = "Tentar novamente na previsão →";
  $("windCompass").style.setProperty("--wind-deg", "0deg");
  $("windCompass").setAttribute("aria-label", "Direção do vento indisponível");
  clearWeatherInsights();
}

function dataAge(at) {
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `há ${hours}h`;
}

function render(data, air, fromCache = false, cacheAt = 0) {
  try {
    weatherData?.ingestOpenMeteo(data, air, activeCity, {
      checkedAt: cacheAt || Date.now(), freshness: fromCache ? "stale" : "current"
    });
  } catch {
    // A camada de interpretação nunca pode impedir a previsão principal.
  }
  const current = data.current; const day = data.daily; const start = selectCurrentHour(data.hourly.time); const [condition] = weather(current.weather_code);
  $("temperature").textContent = fmt(current.temperature_2m); $("feelsLike").textContent = `${fmt(current.apparent_temperature)}°`;
  const heatGap = current.apparent_temperature - current.temperature_2m;
  const localCondition = current.is_day === 0 && current.weather_code === 1 ? "Céu quase limpo" : condition;
  applyWeatherAtmosphere(current.weather_code, current.is_day !== 0);
  $("condition").textContent = heatGap >= 4 && current.relative_humidity_2m >= 70 ? `${localCondition} · ar abafado` : localCondition; $("weatherGlyph").innerHTML = weatherIconSvg(current.weather_code, current.is_day !== 0); $("highLow").textContent = `${fmt(day.temperature_2m_max[0])}° / ${fmt(day.temperature_2m_min[0])}°`;
  const next2Prob = Math.max(...data.hourly.precipitation_probability.slice(start, start + 2));
  $("rainNowLabel").textContent = current.precipitation <= .05 && next2Prob >= 55 ? "Ainda seco, mas pode vir" : "Chuva agora";
  $("rainNow").textContent = `${fmt(current.precipitation, 1)} mm`; $("humidity").innerHTML = `${fmt(current.relative_humidity_2m)}<sup>%</sup>`; $("humidityNote").textContent = humidityLabel(current.relative_humidity_2m);
  $("wind").innerHTML = `${fmt(current.wind_speed_10m)}<sup> km/h</sup>`; $("windNote").textContent = `${windDirection(current.wind_direction_10m)} · rajadas ${fmt(current.wind_gusts_10m)} km/h`;
  $("windCompass").style.setProperty("--wind-deg", `${Number.isFinite(current.wind_direction_10m) ? current.wind_direction_10m : 0}deg`);
  $("windCompass").setAttribute("aria-label", `Vento de ${windDirection(current.wind_direction_10m)}, ${fmt(current.wind_speed_10m)} quilômetros por hora, rajadas de ${fmt(current.wind_gusts_10m)} quilômetros por hora`);
  $("pressure").innerHTML = `${fmt(current.pressure_msl ?? current.surface_pressure)}<sup> hPa</sup>`;
  const pressureNow = data.hourly.pressure_msl?.[start];
  const pressurePast = start >= 3 ? data.hourly.pressure_msl?.[start - 3] : null;
  const pressureDelta = Number.isFinite(pressureNow) && Number.isFinite(pressurePast) ? pressureNow - pressurePast : null;
  $("pressureNote").textContent = Number.isFinite(pressureDelta) ? Math.abs(pressureDelta) < .8 ? "Estável nas últimas 3h" : pressureDelta > 0 ? `Subindo ${fmt(pressureDelta,1)} hPa em 3h` : `Caindo ${fmt(Math.abs(pressureDelta),1)} hPa em 3h` : "Tendência indisponível";
  const uvNow = data.hourly.uv_index[start]; $("uv").textContent = fmt(uvNow, 1); $("uvNote").textContent = uvLabel(uvNow);
  const [airName, airText] = aqiLabel(air?.current?.us_aqi); $("airQuality").textContent = airName; $("airNote").textContent = airText;
  const airIndex = air?.current?.us_aqi; $("airScore").textContent = Number.isFinite(airIndex) ? Math.round(airIndex) : "--"; $("airCardQuality").textContent = airName;
  $("airScore").dataset.quality = Number.isFinite(airIndex) ? airIndex <= 50 ? "good" : airIndex <= 100 ? "moderate" : airIndex <= 150 ? "sensitive" : "poor" : "unknown";
  $("pm25").textContent = fmt(air?.current?.pm2_5, 1); $("pm10").textContent = fmt(air?.current?.pm10, 1); $("ozone").textContent = fmt(air?.current?.ozone, 1); $("airGuidance").textContent = airGuidance(airIndex);
  const observedAt = current.time ? cityDate(current.time).getTime() : Date.now();
  setDataStatus(fromCache ? `Última atualização ${formatUpdateTime(observedAt)} · dados salvos de ${dataAge(cacheAt || Date.now())}` : `Atualizado ${formatUpdateTime(observedAt)} · ${activeCity.name}`, fromCache);
  renderAttention(data, start, air); renderRain(data.hourly, start, day);
  try { renderWeatherInsights(data, air, start); } catch { clearWeatherInsights(); }
  renderForecast(day); renderSun(day); renderGoOut(data,air);
}

async function loadWeather(revision = cityRevision) {
  const city = activeCity;
  $("weatherView")?.setAttribute('aria-busy','true');
  try {
    const [forecastResult, airResult] = await Promise.allSettled([fetchForecast(city, revision), services.airQuality.getCurrent(city)]);
    if (revision !== cityRevision) return false;
    if (forecastResult.status !== "fulfilled") throw forecastResult.reason;
    const data = forecastResult.value;
    const previous = cached();
    const freshAir = airResult.status === "fulfilled" && weatherData?.validateAirQuality?.(airResult.value).valid === true;
    const air = freshAir ? airResult.value : previous?.data?.air || null;
    render(data, air); displayedWeather = {forecast: data, air};
    cache(displayedWeather,{weatherAt:Date.now(),airAt:freshAir ? Date.now() : previous?.airAt || null});
    globalThis.PLUVIA?.sources.set("weather",{status:"ready",checkedAt:Date.now(),dataAt:cityDate(data.current.time,city).getTime()});
    globalThis.PLUVIA?.sources.set("air-quality",{status:freshAir ? "ready" : air ? "stale" : "error",checkedAt:freshAir ? Date.now() : previous?.airAt || null,dataAt:air?.current?.time ? cityDate(air.current.time,city).getTime() : null});
    if (!freshAir && air) {
      $("airNote").textContent += ' · leitura anterior';
      $("airGuidance").textContent = 'Última leitura disponível, sem confirmação atual. ' + $("airGuidance").textContent;
    }
    renderGoOut(data,air);
    clearTimeout(errorTimer); $("errorToast").classList.remove("show"); $("errorToast").setAttribute("aria-hidden", "true");
    globalThis.PLUVIA?.radar?.probe?.(city);
    return true;
  } catch (error) {
    if (revision !== cityRevision) return false;
    const saved = cached();
    if (saved) { render(saved.data.forecast, saved.data.air, true, saved.at); displayedWeather = saved.data; }
    markWeatherUnavailable(Boolean(displayedWeather));
    globalThis.PLUVIA?.sources.set("weather",{status:displayedWeather ? "stale" : "error"});
    globalThis.PLUVIA?.sources.set("air-quality",{status:displayedWeather?.air ? "stale" : "error"});
    if (!displayedWeather) {
      $("condition").textContent = "Tempo indisponível";
      $("rainChart").innerHTML = '<p class="chart-loading">Previsão indisponível. Tentaremos novamente.</p>';
      $("forecastList").innerHTML = '<p class="forecast-loading">Previsão indisponível. Tentaremos novamente.</p>';
      $("rainPulseValue").textContent = "Dados temporariamente indisponíveis.";
      $("rainSeasonContext").textContent = "Dados temporariamente indisponíveis.";
      $("dryWindow").textContent = "Sem dados";
      $("sunPhrase").textContent = "Ciclo solar indisponível.";
      $("airCardQuality").textContent = "Indisponível";
      $("airGuidance").textContent = "Dados de partículas indisponíveis no momento.";
      $("errorMessage").textContent = "Confira a conexão e puxe para atualizar.";
      $("errorToast").setAttribute("aria-hidden", "false");
      $("errorToast").classList.add("show");
      clearTimeout(errorTimer);
      errorTimer = setTimeout(() => {
        $("errorToast").classList.remove("show");
        $("errorToast").setAttribute("aria-hidden", "true");
      }, 4500);
    }
    return false;
  } finally {
    if (revision === cityRevision) {
      $("weatherView")?.setAttribute('aria-busy','false');
      $("weatherView")?.classList.remove('initial-loading');
    }
  }
}

async function refreshAll() {
  if (!activeCity) return false;
  if (refreshInFlight) return refreshInFlight;
  const revision = cityRevision;
  refreshInFlight = Promise.allSettled([loadWeather(revision), loadInmetAlerts(revision), loadDefesaAlerts(revision)]).then(results => {
    const success = results[0].status === "fulfilled" && results[0].value === true;
    if (success && revision === cityRevision) lastRefreshAt = Date.now();
    return success;
  }).finally(() => {
    if (revision === cityRevision) refreshInFlight = null;
  });
  return refreshInFlight;
}

function refreshIfStale() {
  if (!document.hidden && Date.now() - lastRefreshAt >= AUTO_REFRESH_MS) refreshAll();
}

function setupPullToRefresh() {
  // Unsupported browsers retain their native pull-to-refresh. Only a downward,
  // single-finger gesture starting at the top is handled by this page.
  if (!("ontouchstart" in window || navigator.maxTouchPoints > 0) || !window.CSS?.supports("overscroll-behavior-y", "contain")) return;
  const indicator = $("pullRefresh");
  const label = $("pullRefreshText");
  const threshold = 88;
  let gesture = null;
  let loading = false;
  let hideTimer;

  function reset() {
    gesture = null;
    if (!loading) { indicator.hidden = true; label.textContent = ""; }
  }

  document.addEventListener("touchstart", event => {
    if (loading || !activeCity) return;
    clearTimeout(hideTimer);
    reset();
    if (event.touches.length !== 1 || window.scrollY > 0 || (window.visualViewport?.scale || 1) > 1 ||
      event.target.closest?.("a, button, input, select, textarea, [contenteditable], .rain-chart")) return;
    const touch = event.touches[0];
    gesture = {id: touch.identifier, x: touch.clientX, y: touch.clientY, distance: 0};
  }, {passive: true});

  document.addEventListener("touchmove", event => {
    if (!gesture || loading) return;
    const touch = event.touches[0];
    if (event.touches.length !== 1 || touch.identifier !== gesture.id || window.scrollY > 0 ||
      (window.visualViewport?.scale || 1) > 1) { reset(); return; }
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    if (dy < 0 || Math.abs(dx) > Math.max(10, dy)) { reset(); return; }
    gesture.distance = dy;
    if (dy < 4) { indicator.hidden = true; return; }
    if (!event.cancelable) { reset(); return; }
    event.preventDefault();
    indicator.hidden = false;
    indicator.style.setProperty("--pull-offset", `${Math.min(64, dy * .4)}px`);
    const message = dy >= threshold ? "Solte para atualizar" : "Puxe para atualizar";
    if (label.textContent !== message) label.textContent = message;
  }, {passive: false});

  document.addEventListener("touchend", async event => {
    if (!gesture || loading) return;
    const ready = gesture.distance >= threshold && event.touches.length === 0;
    gesture = null;
    if (!ready) { reset(); return; }
    loading = true;
    indicator.classList.add("loading");
    label.textContent = "Consultando o tempo…";
    try {
      const success = await refreshAll();
      label.textContent = success ? "Pronto" : "Sem conexão no momento";
      if (!success) {
        $("errorMessage").textContent = displayedWeather ? "Dados anteriores mantidos. Tentaremos novamente." : "Confira a conexão e tente novamente.";
        $("errorToast").setAttribute("aria-hidden", "false");
        $("errorToast").classList.add("show");
        clearTimeout(errorTimer);
        errorTimer = setTimeout(() => {
          $("errorToast").classList.remove("show");
          $("errorToast").setAttribute("aria-hidden", "true");
        }, 4500);
      }
    } finally {
      loading = false;
      indicator.classList.remove("loading");
      hideTimer = setTimeout(reset, 1200);
    }
  }, {passive: true});
  document.addEventListener("touchcancel", reset, {passive: true});
  document.documentElement.classList.add("has-pull-refresh");
}

document.querySelectorAll("nav a").forEach(link => link.addEventListener("click", () => { document.querySelectorAll("nav a").forEach(a => a.classList.remove("active")); link.classList.add("active"); }));

function setupScrollAnimations() {
  const skipLargeAnimations = window.matchMedia("(max-width: 720px), (prefers-reduced-motion: reduce)").matches;
  if (skipLargeAnimations || !("IntersectionObserver" in window)) return;
  const targets = document.querySelectorAll(".section-block, .sun-section, footer");
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("revealed");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -48px" });
  targets.forEach((target) => {
    target.classList.add("reveal-on-scroll");
    observer.observe(target);
  });
}


const cityResetIds = ["temperature","feelsLike","feelsLikeNote","condition","weatherGlyph","highLow","rainNow","humidity","humidityNote","wind","windNote","pressure","pressureNote","uv","uvNote","airQuality","airNote","airScore","airCardQuality","pm25","pm10","ozone","airGuidance","attentionSignal","attentionTitle","attentionText","attentionIcon","rainChart","forecastList","dryWindow","daylight","sunPhrase","sunrise","sunset"];
let emptyCityContent;
function updateCityLabels() {
  $("favoriteCity").disabled = !activeCity;
  if (!activeCity) return;
  $("selectedCityLabel").textContent = activeCity.name + " · " + activeCity.uf;
  $("cityName").textContent = activeCity.name;
  document.title = "PLUVIA — " + activeCity.name + " agora";
  $("alertsCityLabel").textContent = "Fontes oficiais e leitura ambiental para " + activeCity.name;
  $("forecastCityLabel").textContent = "Previsão diária para a área urbana de " + activeCity.name;
  $("cityTimezone").textContent = activeCity.uf + " · " + new Intl.DateTimeFormat("pt-BR", {timeZone:activeCity.timezone,timeZoneName:"longOffset"}).formatToParts(new Date()).find(part => part.type === "timeZoneName").value.replace("GMT","UTC");
  const starred = favorites.has(activeCity.id);
  $("favoriteCity").textContent = starred ? "★ Favorita" : "☆ Favoritar";
  $("favoriteCity").setAttribute("aria-pressed", String(starred));
  $("favoriteCity").setAttribute("aria-label", (starred ? "Remover dos favoritos: " : "Favoritar: ") + activeCity.name);
  updateClock();
}
function renderCityOptions() {
  const query = normalizeName($("citySearch").value || "").trim();
  const uf = $("stateSelect").value || "";
  const browsing = !query && !uf;
  const matches = browsing ? [...new Map([activeCity,...[...favorites].map(id=>cityById.get(id)),...CAPITALS].filter(Boolean).map(city=>[city.id,city])).values()] : searchCities(query,uf);
  const shown = matches.slice(0,60);
  $("citySelect").innerHTML = '<option value="">Selecione uma cidade</option>' + shown.map(city => '<option value="' + city.id + '">' + (favorites.has(city.id) ? "★ " : "") + escapeHtml(city.name) + " · " + city.uf + "</option>").join("");
  $("citySelect").value = shown.some(city => city.id === activeCity?.id) ? activeCity.id : "";
  $("cityPickerStatus").textContent = browsing ? "Busque pelo nome para encontrar cidades do interior. Favoritas e capitais aparecem na lista inicial." : !matches.length ? "Nenhuma cidade encontrada. Confira o nome ou o estado." : matches.length > 60 ? "Mostrando 60 de " + matches.length + " cidades. Digite mais do nome para refinar." : matches.length + " cidades encontradas. Escolha na lista.";
}
function chooseCity(id, locatedCity = null) {
  const city = locatedCity || cityById.get(id);
  if (!city) return;
  if (city.needsDetails) {
    const choice = ++cityChoiceAttempt;
    $("cityPickerStatus").textContent = `Abrindo ${city.name}/${city.uf}…`;
    ensureCityDetails(city.id).then(fullCity => {
      if (choice === cityChoiceAttempt && fullCity) chooseCity(fullCity.id, fullCity);
    }).catch(() => { $("cityPickerStatus").textContent = "Não consegui abrir essa cidade agora. Tenta de novo."; });
    return;
  }
  cityChoiceAttempt++;
  // A successful explicit selection supersedes the bootstrap fallback notice.
  const notice = $("locationNotice");
  if (notice) { notice.hidden = true; notice.textContent = ""; }
  if (city.id === activeCity?.id && !Number.isFinite(locatedCity?.distanceKm)) { closeCitySearch(); return; }
  locationAttempt++;
  locationPending = false;
  locationButtons(false);
  $("locationWelcome").hidden = true;
  $("weatherView").hidden = false;
  $("siteNav").hidden = false;
  closeCitySearch();
  cityRevision++;
  services?.abortAll();
  refreshInFlight = null;
  activeCity = city; displayedWeather = null; lastRefreshAt = 0;
  globalThis.pluviaAnalytics?.track('City Selected',{city:city.name,uf:city.uf,source:Number.isFinite(locatedCity?.distanceKm) ? 'location' : 'picker_or_saved'});
  globalThis.PLUVIA?.sources.reset(city.id);
  globalThis.PLUVIA?.radar?.reset?.(city.id);
  globalThis.PLUVIA?.modules.location.reset?.();
  rainMapLocations = null; rainMapCityId = null;
  $("rainMapGrid").hidden = true;
  $("rainMapGrid").textContent = "";
  $("rainMapStatus").textContent = "Toque em “Mapa ao redor” para comparar nove pontos próximos sem pesar a abertura.";
  $("rainSeasonContext").textContent = "Calculando o contexto da chuva de hoje…";
  $("rainMapLoad").textContent = "Mapa ao redor";
  $("rainMapLoad").disabled = false;
  writePreference("pluvia-city", city.id);
  writePreference("pluvia-city-record", {id:city.id,name:city.name,uf:city.uf,state:city.state,lat:city.lat,lon:city.lon,timezone:city.timezone});
  globalThis.dispatchEvent?.(new CustomEvent('pluvia:city-changed',{detail:{id:city.id}}));
  clearTimeout(errorTimer);
  $("errorToast").classList.remove("show");
  $("errorToast").setAttribute("aria-hidden","true");
  const saved = cached();
  if (!saved) {
    cityResetIds.forEach(id => { $(id).innerHTML = emptyCityContent.get(id); });
    $("attentionCard").classList.remove("ok","warning","danger","unavailable");
    $("summaryHighlights").innerHTML = "";
    clearWeatherInsights();
    $("sunDot").style.left = "3%";
    $("sunDot").style.top = "74px";
    $("condition").textContent = "Buscando o céu de " + city.name + "…";
  }
  ["inmet","defesa"].forEach(source => {
    $(source + "State").className = "source-state";
    $(source + "State").innerHTML = "<i></i>Consultando";
    $(source + "Content").innerHTML = "<h3>Consultando " + escapeHtml(city.name) + "</h3><p>Buscando informações para a cidade selecionada.</p>";
  });
  $("inmetCard").dataset.severity = "unknown";
  $("citySearch").value = "";
  $("stateSelect").value = "";
  renderCityOptions(); updateCityLabels();
  $("weatherView")?.classList.toggle('initial-loading', !saved);
  if (saved) {
    render(saved.data.forecast,saved.data.air,true,saved.at);
    displayedWeather = saved.data;
    setDataStatus(`Atualizando… · leitura salva de ${dataAge(saved.at)}`, true);
  } else {
    setDataStatus("Consultando o tempo em " + city.name);
  }
  refreshAll();
}
function setupCityPicker() {
  emptyCityContent = new Map(cityResetIds.map(id => [id,$(id).innerHTML]));
  $("stateSelect").innerHTML = '<option value="">Todos os estados</option>' + [...stateNames].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')).map(([uf,name])=>'<option value="'+uf+'">'+escapeHtml(name)+' · '+uf+'</option>').join('');
  renderCityOptions(); updateCityLabels();

  let searchTimer;
  $("citySearch").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderCityOptions,120); });
  $("stateSelect").addEventListener("change", renderCityOptions);
  $("citySelect").addEventListener("change", event => chooseCity(event.target.value));
  $("favoriteCity").addEventListener("click", () => {
    if (!activeCity) return;
    if (favorites.has(activeCity.id)) favorites.delete(activeCity.id); else favorites.add(activeCity.id);
    writePreference("pluvia-favorites", [...favorites]);
    globalThis.dispatchEvent?.(new CustomEvent('pluvia:favorites-changed',{detail:{ids:[...favorites]}}));
    renderCityOptions(); updateCityLabels();
  });
  $("locateCity").addEventListener("click", () => requestLocation('city_picker'));
  $("welcomeLocate").addEventListener("click", () => requestLocation('welcome'));
  $("openCitySearch").addEventListener("click", openCitySearch);
  $("welcomeSearch").addEventListener("click", openCitySearch);
  $("closeCitySearch").addEventListener("click", closeCitySearch);
  $("cityDialog").addEventListener("close", () => $("openCitySearch").focus());
  $("cityDialog").addEventListener("click", event => {
    if (event.target !== $("cityDialog")) return;
    const box = $("cityDialog").getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeCitySearch();
  });
}


let locationAttempt = 0;
let locationPending = false;
let cityChoiceAttempt = 0;
function locationMessage(text) {
  $("locationStatus").textContent = text;
  $("cityPickerStatus").textContent = text;
}
function locationButtons(disabled) {
  $("welcomeLocate").disabled = disabled;
  $("locateCity").disabled = disabled;
}
function openCitySearch() {
  // Choosing manually takes precedence over a late location callback.
  locationAttempt++;
  locationPending = false;
  locationButtons(false);
  renderCityOptions();
  const dialog = $("cityDialog");
  if (!dialog.open) dialog.showModal();
  $("closeCitySearch").focus();
  if (!cityIndexReady) {
    $("cityPickerStatus").textContent = "Carregando cidades do Brasil…";
    ensureCityIndex().then(() => renderCityOptions()).catch(() => { $("cityPickerStatus").textContent = "O índice não carregou. Capitais continuam disponíveis."; });
  }
}
function closeCitySearch() {
  const dialog = $("cityDialog");
  if (dialog.open) dialog.close();
}
function requestLocation(source = 'automatic') {
  if (locationPending) return;
  globalThis.pluviaAnalytics?.track('Location Requested',{source});
  if (!navigator.geolocation) {
    globalThis.pluviaAnalytics?.track('Location Unavailable',{reason:'unsupported'});
    locationMessage("Seu navegador não disponibilizou a localização. Escolha uma cidade pelo nome.");
    return;
  }
  const attempt = ++locationAttempt;
  locationPending = true;
  locationButtons(true);
  locationMessage("Autorize a localização no navegador para encontrar o clima perto de você.");
  navigator.geolocation.getCurrentPosition(position => {
    if (attempt !== locationAttempt) return;
    const applyLocation = () => {
      if (attempt !== locationAttempt) return;
      const city = nearestCity(position.coords.latitude, position.coords.longitude);
      locationPending = false; locationButtons(false);
      globalThis.pluviaAnalytics?.track('Location Authorized',{city:city.name,uf:city.uf});
      chooseCity(city.id, city);
      locationMessage("Referência do município: cerca de " + Math.round(city.distanceKm) + " km do centro de " + city.name + ". Não é a sua rua.");
    };
    const failLocation = () => {
      if (attempt !== locationAttempt) return;
      locationPending = false; locationButtons(false);
      locationMessage("Não foi possível identificar a cidade. Escolha pelo nome.");
    };
    if (municipalitiesReady) applyLocation();
    else ensureMunicipalities().then(applyLocation).catch(failLocation);
  }, error => {
    if (attempt !== locationAttempt) return;
    locationPending = false; locationButtons(false);
    globalThis.pluviaAnalytics?.track(error.code === 1 ? 'Location Denied' : 'Location Unavailable',{reason:error.code === 1 ? 'permission' : error.code === 3 ? 'timeout' : 'position'});
    locationMessage(error.code === 1 ? "Localização não autorizada. Você pode escolher a cidade sem compartilhar sua posição." : "Não conseguimos obter sua localização agora. Tente novamente ou escolha uma cidade.");
  }, {enableHighAccuracy:false,timeout:4000,maximumAge:60000});
}

setupCityPicker();
setupScrollAnimations();
setupPullToRefresh();
$("rainPulseToggle").addEventListener("click", () => setRainPulsePlaying(!rainPulsePlaying));
$("rainMapLoad").addEventListener("click", loadRainMap);
updateClock();
setInterval(updateClock, 30000);
requestLocation();
setInterval(() => { if (!document.hidden) refreshAll(); }, AUTO_REFRESH_MS);
document.addEventListener("visibilitychange", refreshIfStale);
window.addEventListener("pageshow", refreshIfStale);
window.addEventListener("online", () => refreshAll());
document.addEventListener("visibilitychange", () => document.body.classList.toggle("page-hidden", document.hidden));

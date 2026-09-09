const FORECAST_TEMPLATE = "https://api.open-meteo.com/v1/forecast?latitude=-3.119&longitude=-60.022&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,rain,weather_code,cloud_cover,visibility,wind_speed_10m,wind_gusts_10m,relative_humidity_2m,pressure_msl,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,rain_sum,precipitation_probability_max,uv_index_max,sunrise,sunset&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm&timezone=America%2FManaus&forecast_days=8";
const AIR_TEMPLATE = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=-3.119&longitude=-60.022&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,us_aqi&timezone=America%2FManaus&forecast_days=3";
const INMET_API = "https://apiprevmet3.inmet.gov.br/avisos/ativos";
const DEFESA_API = "https://www.manaus.am.gov.br/wp-json/wp/v2/posts?search=Defesa%20Civil%20alerta&per_page=8&_fields=date,link,title,excerpt";
const DEFESA_NACIONAL = "https://www.gov.br/mdr/pt-br/assuntos/protecao-e-defesa-civil";
const AUTO_REFRESH_MS = 5 * 60 * 1000;
const $ = (id) => document.getElementById(id);
let cityRevision = 0;
const pendingRequests = new Set();
function cityApi(template, city = activeCity) {
  const url = new URL(template);
  url.searchParams.set("latitude", city.lat);
  url.searchParams.set("longitude", city.lon);
  url.searchParams.set("timezone", city.timezone);
  return url.href;
}
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
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  pendingRequests.add(controller);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "default", signal: controller.signal });
    if (!response.ok) throw new Error(`request failed: ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
    pendingRequests.delete(controller);
  }
}

async function fetchForecast(city = activeCity, revision = cityRevision) {
  try {
    const data = await fetchJson(cityApi(FORECAST_TEMPLATE, city));
    if (!validForecast(data)) throw new Error("Previsão incompleta");
    return data;
  } catch {
    if (revision !== cityRevision) throw new Error('Cidade alterada');
    await new Promise(resolve => setTimeout(resolve, 800));
    if (revision !== cityRevision) throw new Error('Cidade alterada');
    const data = await fetchJson(cityApi(FORECAST_TEMPLATE, city), 12000);
    if (!validForecast(data)) throw new Error("Previsão incompleta");
    return data;
  }
}

const weatherMap = {
  0: ["Céu limpo", "☀"], 1: ["Predomínio de sol", "◒"], 2: ["Parcialmente nublado", "◑"], 3: ["Céu encoberto", "☁"],
  45: ["Neblina", "≋"], 48: ["Neblina com depósito", "≋"], 51: ["Garoa fraca", "⌇"], 53: ["Garoa", "⌇"], 55: ["Garoa intensa", "⌇"],
  61: ["Chuva fraca", "☂"], 63: ["Chuva moderada", "☂"], 65: ["Chuva forte", "☂"], 80: ["Pancadas fracas", "☔"], 81: ["Pancadas de chuva", "☔"], 82: ["Pancadas fortes", "☔"],
  95: ["Trovoadas", "ϟ"], 96: ["Trovoadas com granizo", "ϟ"], 99: ["Trovoadas fortes", "ϟ"]
};
Object.assign(weatherMap, {
  56:["Garoa congelante fraca","☂"],57:["Garoa congelante intensa","☂"],
  66:["Chuva congelante fraca","☂"],67:["Chuva congelante forte","☂"],
  71:["Neve fraca","❄"],73:["Neve moderada","❄"],75:["Neve forte","❄"],
  77:["Grãos de neve","❄"],85:["Pancadas de neve","❄"],86:["Pancadas fortes de neve","❄"]
});
const weather = (code) => weatherMap[code] || ["Tempo variável", "◒"];

function weatherIconType(code) {
  if ([71,73,75,77,85,86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "storm";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if ([3, 45, 48].includes(code)) return "cloud";
  if ([1, 2].includes(code)) return "partly";
  return "sun";
}

function weatherIconSvg(code, isDay = true) {
  const type = weatherIconType(code);
  if (type === "snow") return '<svg class="weather-visual" viewBox="0 0 112 108" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"><path d="M56 14v80M21 34l70 40M21 74l70-40M44 22l12 12 12-12M44 86l12-12 12 12M22 48l16-4-4-16M78 80l-4-16 16-4M34 80l4-16-16-4M90 48l-16-4 4-16"/></g></svg>';
  const sun = `<g class="wx-sun">
    <g class="wx-sun-rays">
      <path d="M52 5v10M52 69v10M15 42H5M99 42H89M26 16l7 7M78 61l7 7M26 68l7-7M78 23l7-7" />
    </g>
    <circle class="wx-sun-core" cx="52" cy="42" r="20" />
    <circle class="wx-sun-glass" cx="46" cy="36" r="7" />
  </g>`;
  const moon = `<g class="wx-moon">
    <path class="wx-moon-core" d="M67 8c-4 5-6 12-6 19 0 15 12 27 27 27 4 0 8-1 12-3-4 15-17 26-33 26-19 0-34-15-34-34C33 25 48 10 67 8Z" />
    <circle class="wx-moon-crater wx-moon-crater-a" cx="53" cy="29" r="4" />
    <circle class="wx-moon-crater wx-moon-crater-b" cx="47" cy="46" r="2.8" />
  </g>`;
  const cloudBack = `<g class="wx-cloud-back"><path d="M28 62c-9 0-15-6-15-14 0-7 5-13 12-14 3-10 12-16 23-16 13 0 23 9 24 22 9 1 15 7 15 15 0 9-7 16-17 16H28z" /></g>`;
  const cloud = `<g class="wx-cloud-main">
    <path class="wx-cloud-shadow" d="M27 74C15 74 7 66 7 56c0-10 8-18 18-19 4-14 16-23 31-23 17 0 30 12 31 29 12 1 21 10 21 22 0 13-10 23-24 23H27z" />
    <path class="wx-cloud-body" d="M25 69C14 69 8 62 8 54c0-9 7-16 17-17 4-13 15-21 29-21 16 0 28 11 29 27 11 1 19 9 19 19 0 12-9 21-22 21H25z" />
    <path class="wx-cloud-shine" d="M24 44c4-1 8 0 11 2 4-13 14-20 27-20 7 0 13 2 18 7-5-9-14-15-26-15-14 0-25 8-29 21-8 1-14 5-17 11 4-3 9-5 16-6z" />
  </g>`;
  const rain = `<g class="wx-rain">
    <path class="wx-drop wx-drop-1" d="M34 82l-5 10" />
    <path class="wx-drop wx-drop-2" d="M58 84l-5 10" />
    <path class="wx-drop wx-drop-3" d="M82 82l-5 10" />
  </g>`;
  const lightning = `<path class="wx-lightning" d="M59 75H47l-5 14h10l-4 18 20-25H57z" />`;

  if (!isDay) {
    if (type === "sun") return `<svg class="weather-visual weather-night weather-moon" viewBox="0 0 112 108" aria-hidden="true">${moon}</svg>`;
    if (type === "partly") return `<svg class="weather-visual weather-night weather-night-partly" viewBox="0 0 112 108" aria-hidden="true">${moon}${cloud}</svg>`;
    if (type === "cloud") return `<svg class="weather-visual weather-night weather-cloud weather-night-cloud" viewBox="0 0 112 108" aria-hidden="true">${moon}${cloudBack}${cloud}</svg>`;
    if (type === "storm") return `<svg class="weather-visual weather-night weather-storm weather-night-storm" viewBox="0 0 112 108" aria-hidden="true">${moon}${cloud}${rain}${lightning}</svg>`;
    return `<svg class="weather-visual weather-night weather-rain weather-night-rain" viewBox="0 0 112 108" aria-hidden="true">${moon}${cloud}${rain}</svg>`;
  }

  if (type === "sun") return `<svg class="weather-visual weather-sun" viewBox="0 0 112 108" aria-hidden="true">${sun}</svg>`;
  if (type === "partly") return `<svg class="weather-visual weather-partly" viewBox="0 0 112 108" aria-hidden="true">${sun}${cloud}</svg>`;
  if (type === "cloud") return `<svg class="weather-visual weather-cloud" viewBox="0 0 112 108" aria-hidden="true">${cloudBack}${cloud}</svg>`;
  if (type === "storm") return `<svg class="weather-visual weather-storm" viewBox="0 0 112 108" aria-hidden="true">${cloud}${rain}${lightning}</svg>`;
  return `<svg class="weather-visual weather-rain" viewBox="0 0 112 108" aria-hidden="true">${cloud}${rain}</svg>`;
}

const fmt = (value, digits = 0) => Number.isFinite(value) ? value.toFixed(digits).replace(".", ",") : "--";
const shortTime = (iso) => iso?.slice(11, 16) || "--:--";

function windDirection(deg) {
  const dirs = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
  return dirs[Math.round((deg || 0) / 45) % 8];
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
  const state = $("inmetState"); const content = $("inmetContent");
  const alerts = selectInmetAlerts(raw);
  const activeOfficial = alerts.find(item => item.stage === "active");
  $("inmetCard").dataset.severity = stale ? "unknown" : activeOfficial?.severity.className || "none";
  if (!alerts.length) {
    state.className = "source-state"; state.innerHTML = `<i></i>${stale ? "Consulta indisponível" : "Nenhum aviso identificado"}`;
    content.innerHTML = stale ? "<h3>Confira o mapa do INMET</h3><p>Não foi possível confirmar os avisos atuais. A leitura anterior não confirma a situação de agora.</p>" : `<h3>Nenhum aviso identificado para ${activeCity.name}</h3><p>A consulta não retornou avisos vigentes ou previstos para a região. Confira também o mapa oficial.</p>`;
    applyOfficialAlertPriority();
    return;
  }
  state.className = `source-state inmet-${stale ? "unknown" : alerts[0].severity.className}`;
  state.innerHTML = `<i></i>${stale ? "Sem confirmação recente" : alerts.length === 1 ? alerts[0].severity.label : `${alerts.length} avisos na região`}`;
  const format = value => new Intl.DateTimeFormat("pt-BR", {timeZone:activeCity.timezone, day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit"}).format(new Date(value));
  content.innerHTML = (stale ? '<p class="inmet-notice">Consulta indisponível. Os avisos abaixo vêm da leitura anterior; confirme a situação no INMET.</p>' : "") + alerts.map(({alert, area, start, end, stage, severity}) => {
    const id = String(firstValue(alert, ["id_aviso", "id"]));
    const url = /^\d+$/.test(id) ? `https://avisos.inmet.gov.br/${id}` : "https://alertas2.inmet.gov.br/";
    const title = firstValue(alert, ["descricao", "evento", "titulo", "tipo"], "Aviso meteorológico");
    const risks = firstValue(alert, ["riscos", "description"], "Consulte os riscos e as orientações no aviso oficial.");
    const riskText = Array.isArray(risks) ? risks.join(" ") : String(risks);
    const timing = stage === "future" ? `Previsto a partir de ${format(start)} (${activeCity.name})` : stage === "active" ? `Vigente até ${format(end)} (${activeCity.name})` : "Vigência a confirmar no aviso oficial";
    return `<article class="inmet-alert inmet-${severity.className}"><span class="inmet-level">${severity.label} · ${severity.description}</span><h3>${escapeHtml(decodeHtml(String(title)))}</h3><p>${escapeHtml(decodeHtml(riskText).slice(0,360))}</p><div class="source-meta"><span>${escapeHtml(area)}</span><span>${escapeHtml(timing)}</span></div><a class="inmet-detail" href="${url}" target="_blank" rel="noreferrer">Ver aviso ${/^\d+$/.test(id) ? id : "oficial"} no INMET ↗</a></article>`;
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
    return;
  }
  card.classList.remove("ok", "warning", "danger", "unavailable");
  card.classList.add("danger", `official-${severity}`);
  $("attentionSignal").textContent = severity === "red" ? "INMET · GRANDE PERIGO" : "INMET · PERIGO";
  $("attentionTitle").textContent = severity === "red" ? "Fica em casa se puder" : "Sai de casa preparado";
  $("attentionText").textContent = `Há aviso ${severity === "red" ? "vermelho" : "laranja"} vigente para a região. Abra o aviso e confira área, horário e orientações antes de sair.`;
  $("attentionIcon").innerHTML = attentionIconSvg("severe");
  $("attentionLevel").style.width = severity === "red" ? "100%" : "90%";
  $("attentionBasis").textContent = "Prioridade definida pelo aviso oficial do INMET.";
}

async function loadInmetAlerts(revision = cityRevision) {
  try {
    const raw = await fetchJson(INMET_API);
    if (revision !== cityRevision) return;
    renderInmetAlerts(raw);
    lastInmetResponse = raw;
    lastInmetReadAt = Date.now();
    updateInmetTimestamp();
  } catch {
    if (revision !== cityRevision) return;
    if (lastInmetResponse) { renderInmetAlerts(lastInmetResponse, true); updateInmetTimestamp(true); return; }
    const state = $("inmetState"); const content = $("inmetContent");
    $("inmetCard").dataset.severity = "unknown";
    state.className = "source-state warning"; state.innerHTML = "<i></i>Consulta indisponível";
    content.innerHTML = "<h3>Abra o mapa do INMET</h3><p>A fonte automática não respondeu agora. Use o atalho abaixo para conferir os avisos oficiais diretamente no INMET.</p>";
    updateInmetTimestamp(true);
  }
}

async function loadDefesaAlerts(revision = cityRevision) {
  const state = $("defesaState"); const content = $("defesaContent");
  try {
    if (activeCity.id !== "1302603") {
      state.className = "source-state"; state.innerHTML = "<i></i>Orientação nacional";
      content.innerHTML = '<h3>Defesa Civil em ' + escapeHtml(activeCity.state || activeCity.uf) + '</h3><p>O PLUVIA ainda não lê o feed estadual desta região. Consulte a <a href="' + DEFESA_NACIONAL + '" target="_blank" rel="noreferrer">Defesa Civil Nacional ↗</a> para chegar aos canais locais.</p>';
      return;
    }
    const posts = await fetchJson(DEFESA_API);
    if (revision !== cityRevision) return;
    if (!Array.isArray(posts)) throw new Error("Resposta municipal desconhecida");
    const relevant = posts.filter(p => /alerta|chuva|alagamento|deslizamento|temporal|vendaval/i.test(decodeHtml(p.title?.rendered || "")));
    const latest = relevant[0]; const ageHours = latest ? (Date.now() - cityDate(latest.date).getTime()) / 3600000 : Infinity;
    if (!latest || ageHours > 48) {
      state.className = "source-state"; state.innerHTML = "<i></i>Sem comunicado recente";
      const lastLink = latest ? `<a href="${safeManausUrl(latest.link)}" target="_blank" rel="noreferrer">Ver último comunicado oficial ↗</a>` : "";
      content.innerHTML = `<h3>Consulte os canais oficiais</h3><p>A busca não encontrou comunicados nas últimas 48 horas. Isso não confirma ausência de alertas. ${lastLink}</p>`;
      return;
    }
    const title = decodeHtml(latest.title?.rendered || "Comunicado da Defesa Civil"); const summary = decodeHtml(latest.excerpt?.rendered || "Consulte as orientações oficiais da Prefeitura de Manaus.");
    state.className = "source-state warning"; state.innerHTML = "<i></i>Comunicado recente";
    content.innerHTML = `<h3>${escapeHtml(title)}</h3><p>${escapeHtml(summary.slice(0, 210))}</p><div class="source-meta"><span>${new Intl.DateTimeFormat("pt-BR", {dateStyle:"short", timeStyle:"short", timeZone:activeCity.timezone}).format(cityDate(latest.date))}</span><span><a href="${safeManausUrl(latest.link)}" target="_blank" rel="noreferrer">Ler publicação ↗</a></span></div>`;
  } catch {
    if (revision !== cityRevision) return;
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

function attentionIconSvg(type) {
  const icons = {
    normal: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m8 12.3 2.5 2.5L16.4 9"/></svg>',
    rain: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 15.5h9.5a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 7.4 10 2.8 2.8 0 0 0 7 15.5Z"/><path d="m8 18-1 2m5-2-1 2m5-2-1 2"/></svg>',
    severe: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 8.5v5.2M12 17h.01"/></svg>',
    heat: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.8"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4m10.6 10.6 1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/></svg>',
    humidity: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2S6.5 9.5 6.5 14a5.5 5.5 0 0 0 11 0C17.5 9.5 12 3.2 12 3.2Z"/><path d="M9.5 15.2c.4 1.1 1.3 1.7 2.5 1.7"/></svg>'
  };
  return icons[type] || icons.normal;
}

function renderAttention(data, start) {
  const next3Prob = Math.max(...data.hourly.precipitation_probability.slice(start, start + 3));
  const next3Rain = data.hourly.precipitation.slice(start, start + 3).reduce((a, b) => a + b, 0);
  const next6Rain = data.hourly.precipitation.slice(start, start + 6).reduce((a, b) => a + b, 0);
  const next3Gust = Math.max(data.current.wind_gusts_10m || 0, ...(data.hourly.wind_gusts_10m || []).slice(start, start + 3));
  const next3Codes = data.hourly.weather_code.slice(start, start + 3);
  const stormExpected = next3Codes.some(code => [95, 96, 99].includes(code));
  const feels = data.current.apparent_temperature;
  const humidity = data.current.relative_humidity_2m;
  const card = $("attentionCard");
  card.classList.remove("ok", "warning", "danger", "unavailable", "official-orange", "official-red");
  let state = "ok", signal = "SOSSEGO", title = "Dá pra sair de boa", text = `Sem sinal forte de chuva ou vento para ${activeCity.name} nas próximas 3 horas.`, icon = "normal", level = 28;
  if (stormExpected && next3Prob >= 60) {
    state = "danger"; signal = "SAI PREPARADO"; title = "Trovoada no caminho"; text = `${Math.round(next3Prob)}% de chance nas próximas 3h, com sinal de raios. Evite área aberta e não conte só com guarda-chuva.`; icon = "severe"; level = 96;
  } else if ((next3Prob >= 80 && next3Rain >= 8) || next6Rain >= 20) {
    state = "danger"; signal = "SAI PREPARADO"; title = "Pode cair muita água"; text = `Previsão de ${fmt(next6Rain, 1)} mm em 6h e pico de ${Math.round(next3Prob)}%. Em área que alaga, muda a rota antes de sair.`; icon = "severe"; level = 92;
  } else if (next3Gust >= 55) {
    state = "warning"; signal = "ATENÇÃO"; title = "Rajada forte por perto"; text = `O vento pode chegar a ${fmt(next3Gust)} km/h nas próximas 3h. Cuidado com galhos, placas e cobertura solta.`; icon = "severe"; level = 78;
  } else if (next3Prob >= 60 && next3Rain >= .5) {
    state = "warning"; signal = "ATENÇÃO"; title = "Leva o guarda-chuva"; text = `A chance chega a ${Math.round(next3Prob)}% e o modelo indica ${fmt(next3Rain, 1)} mm nas próximas 3h.`; icon = "rain"; level = 70;
  } else if (feels >= 40) {
    state = "warning"; signal = "ATENÇÃO"; title = "Sensação de calor pesada"; text = `O corpo sente cerca de ${fmt(feels)} °C agora. Água e sombra não são frescura.`; icon = "heat"; level = 78;
  } else if (humidity >= 88) {
    state = "warning"; signal = "ATENÇÃO"; title = "Umidade lá em cima"; text = `O ar está com ${Math.round(humidity)}% de umidade — abafamento e suor evaporando devagar.`; icon = "humidity"; level = 58;
  }
  card.classList.add(state);
  $("attentionSignal").textContent = signal;
  $("attentionTitle").textContent = title;
  $("attentionText").textContent = text;
  $("attentionIcon").innerHTML = attentionIconSvg(icon);
  $("attentionIcon").setAttribute("aria-label", signal);
  $("attentionLevel").style.width = `${level}%`;
  $("attentionBasis").textContent = `Próximas 3h: ${Math.round(next3Prob)}% · ${fmt(next3Rain,1)} mm. Em 6h: ${fmt(next6Rain,1)} mm.`;
  applyOfficialAlertPriority();
}

function findDryWindow(hourly, start) {
  for (let i = start; i < Math.min(hourly.time.length - 2, start + 36); i++) {
    if (hourly.precipitation_probability[i] < 30 && hourly.precipitation_probability[i + 1] < 30) {
      const day = i === start ? "Agora" : hourly.time[i].slice(0, 10) === hourly.time[start].slice(0, 10) ? "Hoje" : "Amanhã";
      return `${day === "Agora" ? "Agora" : day}, das ${shortTime(hourly.time[i])} às ${shortTime(hourly.time[i + 2])} deve dar uma trégua`;
    }
  }
  return "Sem janela clara em 36h";
}

function renderRain(hourly, start) {
  const scrollLeft = $("rainChart").scrollLeft;
  const indices = Array.from({length: 24}, (_, i) => start + i).filter(i => i < hourly.time.length);
  $("rainChart").innerHTML = indices.map((i, p) => {
    const prob = Math.round(hourly.precipitation_probability[i] || 0);
    const mm = hourly.precipitation[i] || 0;
    const barHeight = mm > 0 ? Math.min(150, 8 + Math.sqrt(mm) * 42) : Math.max(3, prob * .2);
    return `<div class="hour-column ${p === 0 ? "now" : ""}">
      <span class="hour-time">${p === 0 ? "AGORA" : shortTime(hourly.time[i])}</span>
      <div class="bar-area"><div class="rain-bar" data-prob="${prob}" style="height:${barHeight}px"></div></div>
      <span class="rain-mm">${fmt(mm, 1)} mm</span><span class="hour-icon">${weather(hourly.weather_code[i])[1]}</span>
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

function rainMapUrl(city) {
  const latStep = .12;
  const lonStep = .12 / Math.max(.4, Math.cos(city.lat * Math.PI / 180));
  const points = [];
  for (const y of [1,0,-1]) for (const x of [-1,0,1]) points.push([city.lat + y * latStep, city.lon + x * lonStep]);
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", points.map(point => point[0].toFixed(4)).join(","));
  url.searchParams.set("longitude", points.map(point => point[1].toFixed(4)).join(","));
  url.searchParams.set("hourly", "precipitation,precipitation_probability");
  url.searchParams.set("forecast_hours", "8");
  url.searchParams.set("precipitation_unit", "mm");
  url.searchParams.set("timezone", city.timezone);
  return url.href;
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
    const raw = await fetchJson(rainMapUrl(activeCity), 10000);
    if (revision !== cityRevision || cityId !== activeCity.id) return;
    const locations = Array.isArray(raw) ? raw : raw?.locations;
    if (!Array.isArray(locations) || locations.length !== 9) throw new Error("grade incompleta");
    rainMapLocations = locations;
    rainMapCityId = cityId;
    $("rainMapGrid").hidden = false;
    button.textContent = "Atualizar mapa";
    paintRainMap();
  } catch {
    if (revision !== cityRevision) return;
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
    const [cond, icon] = weather(daily.weather_code[i]); const min = daily.temperature_2m_min[i]; const max = daily.temperature_2m_max[i];
    const width = Math.max(25, ((max - min) / spread) * 100);
    const rainProb = Math.round(daily.precipitation_probability_max[i] || 0); const rainMm = daily.precipitation_sum[i] || 0;
    const weekend = [0,6].includes(d.getDay());
    const reading = rainMm >= 20 ? "Dia bem molhado" : rainMm >= 8 ? "Pancadas fortes ao longo do dia" : rainProb >= 55 ? "Pode chover, mas sem volume grande" : rainProb >= 30 ? "Chuva isolada" : "Boa janela pra sair";
    return `<div class="forecast-row ${i === bestIndex ? "best-day" : ""}">
      <div class="forecast-day"><strong>${day}${weekend ? " · fim de semana" : ""}</strong><span>${label}${i === bestIndex ? " · melhor dia pra rolê" : ""}</span></div>
      <div class="forecast-condition"><i aria-hidden="true">${icon}</i><span>${cond}</span></div>
      <div class="temp-range" aria-label="Mínima ${fmt(min)} graus, máxima ${fmt(max)} graus"><strong>${fmt(min)}°</strong><div class="temp-track"><span style="width:${width}%"></span></div><strong>${fmt(max)}°</strong></div>
      <div class="forecast-rain"><span>☂</span><span>${rainProb}% · ${fmt(rainMm, 1)} mm</span></div>
      <div class="forecast-uv">${reading} · UV ${fmt(daily.uv_index_max[i], 0)}</div>
    </div>`;
  }).join("");
}

function renderSun(daily) {
  const rise = cityDate(daily.sunrise[0]); const set = cityDate(daily.sunset[0]); const minutes = Math.round((set - rise) / 60000);
  $("sunrise").textContent = shortTime(daily.sunrise[0]); $("sunset").textContent = shortTime(daily.sunset[0]);
  $("daylight").textContent = `${Math.floor(minutes / 60)}h ${minutes % 60}min de luz`;
  const now = new Date(); const progress = Math.min(1, Math.max(0, (now - rise) / (set - rise)));
  $("sunDot").style.left = `${3 + progress * 91}%`; $("sunDot").style.top = `${74 - Math.sin(progress * Math.PI) * 58}px`;
  $("sunPhrase").textContent = now < rise ? "O sol ainda não nasceu." : now > set ? `O sol já se pôs em ${activeCity.name}.` : `Restam cerca de ${Math.max(0, Math.round((set - now) / 3600000))}h de claridade.`;
}

function cache(data) { try { localStorage.setItem(`pluvia-weather-${activeCity.id}`, JSON.stringify({at: Date.now(), data})); } catch {} }
function validForecast(data) {
  const hourlyFields = ["time", "precipitation_probability", "precipitation", "weather_code", "uv_index"];
  const dailyFields = ["time", "temperature_2m_min", "temperature_2m_max", "weather_code", "precipitation_probability_max", "precipitation_sum", "uv_index_max", "sunrise", "sunset"];
  return Number.isFinite(data?.current?.temperature_2m) && Number.isFinite(cityDate(data.current.time).getTime()) &&
    hourlyFields.every(key => Array.isArray(data?.hourly?.[key]) && data.hourly[key].length >= 3) &&
    dailyFields.every(key => Array.isArray(data?.daily?.[key]) && data.daily[key].length >= 1);
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
}

function markWeatherUnavailable(hasSavedData) {
  setDataStatus(hasSavedData ? "Dados salvos · conexão indisponível" : "Conexão indisponível", true);
  $("attentionCard").classList.remove("ok", "warning", "danger");
  $("attentionCard").classList.add("unavailable");
  $("attentionSignal").textContent = "SEM LEITURA";
  $("attentionTitle").textContent = "Aguardando conexão";
  $("attentionText").textContent = "A leitura local volta automaticamente quando a consulta estiver disponível.";
  $("attentionIcon").innerHTML = attentionIconSvg("severe");
  $("attentionIcon").setAttribute("aria-label", "Sem leitura");
  $("attentionLevel").style.width = "0%";
}

function dataAge(at) {
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `há ${hours}h`;
}

function render(data, air, fromCache = false, cacheAt = 0) {
  const current = data.current; const day = data.daily; const start = selectCurrentHour(data.hourly.time); const [condition] = weather(current.weather_code);
  $("temperature").textContent = fmt(current.temperature_2m); $("feelsLike").textContent = `${fmt(current.apparent_temperature)}°`;
  const heatGap = current.apparent_temperature - current.temperature_2m;
  const localCondition = current.is_day === 0 && current.weather_code === 1 ? "Céu quase limpo" : condition;
  $("condition").textContent = heatGap >= 4 && current.relative_humidity_2m >= 70 ? `${localCondition} · ar abafado` : localCondition; $("weatherGlyph").innerHTML = weatherIconSvg(current.weather_code, current.is_day !== 0); $("highLow").textContent = `${fmt(day.temperature_2m_max[0])}° / ${fmt(day.temperature_2m_min[0])}°`;
  const next2Prob = Math.max(...data.hourly.precipitation_probability.slice(start, start + 2));
  $("rainNowLabel").textContent = current.precipitation <= .05 && next2Prob >= 55 ? "Ainda seco, mas pode vir" : "Chuva agora";
  $("rainNow").textContent = `${fmt(current.precipitation, 1)} mm`; $("humidity").innerHTML = `${fmt(current.relative_humidity_2m)}<sup>%</sup>`; $("humidityNote").textContent = humidityLabel(current.relative_humidity_2m);
  $("wind").innerHTML = `${fmt(current.wind_speed_10m)}<sup> km/h</sup>`; $("windNote").textContent = `${windDirection(current.wind_direction_10m)} · rajadas ${fmt(current.wind_gusts_10m)} km/h`;
  $("pressure").innerHTML = `${fmt(current.pressure_msl ?? current.surface_pressure)}<sup> hPa</sup>`;
  const pressureNow = data.hourly.pressure_msl?.[start]; const pressurePast = data.hourly.pressure_msl?.[Math.max(0,start - 3)]; const pressureDelta = pressureNow - pressurePast;
  $("pressureNote").textContent = Number.isFinite(pressureDelta) ? Math.abs(pressureDelta) < .8 ? "Estável nas últimas 3h" : pressureDelta > 0 ? `Subindo ${fmt(pressureDelta,1)} hPa em 3h` : `Caindo ${fmt(Math.abs(pressureDelta),1)} hPa em 3h` : "Tendência indisponível";
  const uvNow = data.hourly.uv_index[start]; $("uv").textContent = fmt(uvNow, 1); $("uvNote").textContent = uvLabel(uvNow);
  const [airName, airText] = aqiLabel(air?.current?.us_aqi); $("airQuality").textContent = airName; $("airNote").textContent = airText;
  const airIndex = air?.current?.us_aqi; $("airScore").textContent = Number.isFinite(airIndex) ? Math.round(airIndex) : "--"; $("airCardQuality").textContent = airName;
  $("pm25").textContent = fmt(air?.current?.pm2_5, 1); $("pm10").textContent = fmt(air?.current?.pm10, 1); $("airGuidance").textContent = airGuidance(airIndex);
  setDataStatus(fromCache ? `Dados salvos de ${dataAge(cacheAt || Date.now())} · tentando atualizar` : `Tempo em ${activeCity.name}`, fromCache);
  renderAttention(data, start); renderRain(data.hourly, start); renderForecast(day); renderSun(day);
}

async function loadWeather(revision = cityRevision) {
  const city = activeCity;
  try {
    const [forecastResult, airResult] = await Promise.allSettled([fetchForecast(city, revision), fetchJson(cityApi(AIR_TEMPLATE, city))]);
    if (revision !== cityRevision) return false;
    if (forecastResult.status !== "fulfilled") throw forecastResult.reason;
    const data = forecastResult.value;
    const air = airResult.status === "fulfilled" ? airResult.value : null;
    render(data, air); displayedWeather = {forecast: data, air}; cache(displayedWeather);
    clearTimeout(errorTimer); $("errorToast").classList.remove("show"); $("errorToast").setAttribute("aria-hidden", "true");
    return true;
  } catch (error) {
    if (revision !== cityRevision) return false;
    const saved = cached();
    if (!displayedWeather && saved) { render(saved.data.forecast, saved.data.air, true, saved.at); displayedWeather = saved.data; }
    markWeatherUnavailable(Boolean(displayedWeather));
    if (!displayedWeather) {
      $("condition").textContent = "Tempo indisponível";
      $("rainChart").innerHTML = '<p class="chart-loading">Previsão indisponível. Tentaremos novamente.</p>';
      $("forecastList").innerHTML = '<p class="forecast-loading">Previsão indisponível. Tentaremos novamente.</p>';
      $("dryWindow").textContent = "Sem dados";
      $("sunPhrase").textContent = "Ciclo solar indisponível.";
      $("airCardQuality").textContent = "Indisponível";
      $("airGuidance").textContent = "Dados de partículas indisponíveis no momento.";
    }
    return false;
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


const cityResetIds = ["temperature","feelsLike","condition","weatherGlyph","highLow","rainNow","humidity","humidityNote","wind","windNote","pressure","pressureNote","uv","uvNote","airQuality","airNote","airScore","airCardQuality","pm25","pm10","airGuidance","attentionSignal","attentionTitle","attentionText","attentionIcon","rainChart","forecastList","dryWindow","daylight","sunPhrase","sunrise","sunset"];
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
  if (city.id === activeCity?.id && !Number.isFinite(locatedCity?.distanceKm)) { closeCitySearch(); return; }
  locationAttempt++;
  locationPending = false;
  locationButtons(false);
  $("locationWelcome").hidden = true;
  $("weatherView").hidden = false;
  $("siteNav").hidden = false;
  closeCitySearch();
  cityRevision++;
  pendingRequests.forEach(controller => controller.abort());
  pendingRequests.clear();
  refreshInFlight = null;
  activeCity = city; displayedWeather = null; lastRefreshAt = 0;
  rainMapLocations = null; rainMapCityId = null;
  $("rainMapGrid").hidden = true;
  $("rainMapGrid").textContent = "";
  $("rainMapStatus").textContent = "Toque em “Mapa ao redor” para comparar nove pontos próximos sem pesar a abertura.";
  $("rainSeasonContext").textContent = "Calculando o contexto da chuva de hoje…";
  $("rainMapLoad").textContent = "Mapa ao redor";
  $("rainMapLoad").disabled = false;
  writePreference("pluvia-city", city.id);
  writePreference("pluvia-city-record", {id:city.id,name:city.name,uf:city.uf,state:city.state,lat:city.lat,lon:city.lon,timezone:city.timezone});
  clearTimeout(errorTimer);
  $("errorToast").classList.remove("show");
  $("errorToast").setAttribute("aria-hidden","true");
  cityResetIds.forEach(id => { $(id).innerHTML = emptyCityContent.get(id); });
  $("attentionCard").classList.remove("ok","warning","danger","unavailable");
  $("attentionLevel").style.width = "0%";
  $("sunDot").style.left = "3%";
  $("sunDot").style.top = "74px";
  $("condition").textContent = "Buscando o céu de " + city.name + "…";
  ["inmet","defesa"].forEach(source => {
    $(source + "State").className = "source-state";
    $(source + "State").innerHTML = "<i></i>Consultando";
    $(source + "Content").innerHTML = "<h3>Consultando " + escapeHtml(city.name) + "</h3><p>Buscando informações para a cidade selecionada.</p>";
  });
  $("inmetCard").dataset.severity = "unknown";
  $("citySearch").value = "";
  $("stateSelect").value = "";
  renderCityOptions(); updateCityLabels();
  setDataStatus("Consultando o tempo em " + city.name);
  const saved = cached();
  if (saved) { render(saved.data.forecast,saved.data.air,true,saved.at); displayedWeather = saved.data; }
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
    renderCityOptions(); updateCityLabels();
  });
  $("locateCity").addEventListener("click", requestLocation);
  $("welcomeLocate").addEventListener("click", requestLocation);
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
function requestLocation() {
  if (locationPending) return;
  if (!navigator.geolocation) {
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

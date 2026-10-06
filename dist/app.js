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
let lastInmetAvailable = false;
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
const weatherData = globalThis.PLUVIA?.weatherData;
const weatherInsights = globalThis.PLUVIA?.weatherInsights;
const weather = code => [weatherIcons?.condition(code).label || "Tempo variável"];

// The opening and forecast share the selected city's solar clock.
function updateSolarAtmosphere(now = Date.now()) {
  return globalThis.PLUVIA?.sky?.update(now);
}
function applyWeatherAtmosphere(code, isDay, daily = null, wind = null) {
  return globalThis.PLUVIA?.sky?.apply(code, isDay, daily, activeCity, undefined, wind);
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
  if (!Number.isFinite(value) || value < 0) return "UV indisponível";
  if (value < 3) return "Baixo";
  if (value < 6) return "Moderado — considere proteção solar";
  if (value < 8) return "Alto — use proteção solar";
  if (value < 11) return "Muito alto — evite exposição prolongada";
  return "Extremo — evite exposição direta";
}

function humidityLabel(value) {
  return weatherInsights?.humidityLevel?.(value)?.label || "Umidade indisponível";
}

function pressureLabel(value) {
  if (value < 1007) return "Tendência instável";
  if (value > 1014) return "Tendência estável";
  return "Dentro do esperado";
}

function aqiLabel(value) {
  if (!Number.isFinite(value) || value < 0) return ["--", "AQI indisponível"];
  if (value <= 50) return ["Boa", `AQI ${Math.round(value)} · ar limpo`];
  if (value <= 100) return ["Moderada", `AQI ${Math.round(value)} · aceitável`];
  if (value <= 150) return ["Ruim para grupos sensíveis", `AQI ${Math.round(value)} · atenção para grupos sensíveis`];
  if (value <= 200) return ["Ruim", `AQI ${Math.round(value)} · evite esforço`];
  if (value <= 300) return ["Muito ruim", `AQI ${Math.round(value)} · exposição alta`];
  return ["Perigosa", `AQI ${Math.round(value)} · risco elevado`];
}

function renderAirQuality(value) {
  const [label, note] = aqiLabel(value);
  const card = $("airQualityCard");
  if (!Number.isFinite(value) && $("airDetails")) $("airDetails").hidden = true;
  const level = !Number.isFinite(value) || value < 0 ? null
    : value <= 50 ? "good" : value <= 100 ? "moderate" : value <= 150 ? "sensitive"
    : value <= 200 ? "poor" : value <= 300 ? "very-poor" : "hazardous";
  if (level) card.dataset.aqiLevel = level;
  else delete card.dataset.aqiLevel;
  $("airQuality").textContent = label;
  $("airNote").textContent = note;
  if ($("airValue")) $("airValue").textContent = level ? Math.round(value) : '--';
  if ($("airScale")) $("airScale").hidden = !level;
  if ($("airScaleMarker")) $("airScaleMarker").style.left = Math.min(100,Math.max(0,value)/500*100) + '%';
}

function decodeHtml(value = "") {
  const doc = new DOMParser().parseFromString(value, "text/html");
  return doc.documentElement.textContent || "";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>\"']/g, char => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#039;"})[char]);
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

function inmetArea(alert, city = activeCity) {
  const codes = JSON.stringify(alert.geocodes || alert.geocode || "").match(/\b\d{7}\b/g) || [];
  if (codes.length) return codes.includes(city.id) ? city.name : null;
  const entries = value => normalizeName(JSON.stringify(value || "")).split(/[,;|/"\[\]{}:]/)
    .map(value=>value.trim().replace(/\s*(?:-\s*[a-z]{2}|\([a-z]{2}\))$/, '').trim());
  const contains = (value, name) => entries(value).includes(normalizeName(name));
  const towns = alert.municipios || alert.municipio;
  if (towns && contains(towns, city.name)) {
    const region = entries([alert.estados, alert.uf, alert.sigla, alert.area, alert.areaDesc]);
    const ufConfirmed = region.includes(normalizeName(city.uf)) || Boolean(city.state && region.includes(normalizeName(city.state)));
    const regionProvided = [alert.estados,alert.uf,alert.sigla,alert.area,alert.areaDesc].some(value=>value != null && String(value).trim()!=='');
    const uniqueConfirmed = !regionProvided && municipalitiesReady && CITIES.filter(candidate => normalizeName(candidate.name) === normalizeName(city.name)).length === 1;
    return ufConfirmed || uniqueConfirmed ? city.name : null;
  }
  if (towns) return null;
  // State names can equal a capital name (São Paulo/Rio de Janeiro).
  // Only a municipality field or IBGE code confirms a city-level match.
  const region = [alert.estados, alert.uf, alert.sigla, alert.area, alert.areaDesc];
  const stateNames = normalizeName(JSON.stringify(region)).split(/[,;|/"\[\]{}:]/).map(value => value.trim());
  if (stateNames.includes(normalizeName(city.state)) || stateNames.includes(normalizeName(city.uf))) return city.state + " · confirme a área no mapa";
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

function selectInmetAlerts(raw, now = Date.now(), city = activeCity) {
  return normalizeAlerts(raw).flatMap(alert => {
    if ([true, 1, "1", "true"].includes(alert.encerrado) || /cancel/i.test(alert.msgType || "")) return [];
    const area = inmetArea(alert, city);
    const start = inmetTime(alert, "inicio"); const end = inmetTime(alert, "fim");
    if (!area || (Number.isFinite(end) && end <= now)) return [];
    const stage = start > now ? "future" : Number.isFinite(start) && Number.isFinite(end) ? "active" : "unconfirmed";
    return [{alert, area, start, end, stage, severity:inmetSeverity(alert)}];
  }).sort((a,b) => (a.stage === "active" ? 0 : 1) - (b.stage === "active" ? 0 : 1) || b.severity.rank - a.severity.rank);
}

function setAlertState(state) {
  const section = $("alertas");
  if (section?.dataset) section.dataset.alertState = state;
}

function renderInmetAlerts(raw, stale = false) {
  globalThis.PLUVIA?.modules.alerts.receive?.(raw, stale);
  const state = $("inmetState"); const content = $("inmetContent");
  const alerts = selectInmetAlerts(raw);
  const activeOfficial = alerts.find(item => item.stage === "active" && item.area === activeCity.name);
  $("inmetCard").dataset.severity = stale ? "unknown" : activeOfficial?.severity.className || "none";
  // Sem aviso, a seção vira uma linha discreta abaixo do topo; com aviso, ganha destaque no mesmo lugar.
  setAlertState(stale ? "unavailable" : alerts.length ? "alerts" : "clear");
  if (!alerts.length) {
    state.className = "source-state"; state.innerHTML = `<i></i>${stale ? "Consulta indisponível" : "Nenhum aviso identificado"}`;
    content.innerHTML = stale ? "<h3>Confira o mapa do INMET</h3><p>Não foi possível confirmar os avisos atuais. A leitura anterior não confirma a situação de agora.</p>" : `<h3>✓ Sem alertas meteorológicos ativos</h3><p>A consulta oficial não retornou avisos vigentes ou previstos para ${activeCity.name}. Verificação atualizada agora; confira também o mapa oficial.</p>`;
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
    const stageLabel = stale ? "Leitura anterior" : stage === "active" ? "Vigente" : stage === "future" ? "Previsto" : "A confirmar";
    const safeTitle = escapeHtml(decodeHtml(String(title)));
    return `<article class="inmet-alert inmet-${severity.className}" data-stage="${stale ? "stale" : stage}">
      <div class="inmet-alert-heading"><span class="inmet-alert-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5m0 3h.01"/></svg></span><div class="inmet-alert-title"><div class="inmet-alert-status"><span class="inmet-level">${severity.label}</span><span class="inmet-stage">${stageLabel}</span></div><h3>${safeTitle}</h3><small class="inmet-severity-note">${severity.description}</small></div></div>
      <p class="inmet-alert-risk">${escapeHtml(decodeHtml(riskText).slice(0,360))}</p>
      <dl class="inmet-alert-meta"><div><dt>Área do aviso</dt><dd>${escapeHtml(area)}</dd></div><div><dt>Validade · horário local</dt><dd>${escapeHtml(timing)}</dd></div></dl>
      <div class="inmet-alert-actions"><button class="inmet-detail" type="button" data-notice="${index}" aria-label="Ver detalhes: ${safeTitle}">Ver detalhes <span aria-hidden="true">›</span></button><a class="inmet-detail inmet-official" href="${url}" target="_blank" rel="noreferrer" aria-label="Abrir aviso de ${safeTitle} no INMET">Ver no INMET <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></a></div>
    </article>`;
  }).join("");
}

function updateInmetTimestamp(stale = false) {
  const node = $("inmetUpdated");
  if (!node) return;
  if (!lastInmetReadAt) { node.textContent = "Leitura oficial ainda não concluída"; return; }
  const minutes = Math.max(0, Math.round((Date.now() - lastInmetReadAt) / 60000));
  node.textContent = `${stale ? "Última leitura válida" : "Leitura oficial"}: ${minutes < 1 ? "agora" : minutes === 1 ? "há 1 min" : `há ${minutes} min`}`;
}

function favoriteCityAlerts(city, now = Date.now()) {
  if (!city || !lastInmetAvailable || !lastInmetResponse || now < lastInmetReadAt || now-lastInmetReadAt > 600000) return {status:"unavailable",alerts:[]};
  return {status:"ready",alerts:selectInmetAlerts(lastInmetResponse,now,city).filter(item=>item.stage==="active" && item.area===city.name)};
}

async function loadInmetAlerts(revision = cityRevision) {
  try {
    const raw = await services.alerts.getActive();
    if (revision !== cityRevision) return;
    lastInmetResponse = raw;
    lastInmetReadAt = Date.now();
    lastInmetAvailable = true;
    globalThis.dispatchEvent?.(new CustomEvent("pluvia:alerts-updated"));
    globalThis.PLUVIA?.sources.set("alerts",{status:"ready",checkedAt:lastInmetReadAt,dataAt:null});
    renderInmetAlerts(raw);
    updateInmetTimestamp();
  } catch {
    if (revision !== cityRevision) return;
    globalThis.PLUVIA?.sources.set("alerts",{status:lastInmetResponse ? "stale" : "error"});
    lastInmetAvailable = false;
    globalThis.dispatchEvent?.(new CustomEvent("pluvia:alerts-updated"));
    if (lastInmetResponse) { renderInmetAlerts(lastInmetResponse, true); updateInmetTimestamp(true); return; }
    const state = $("inmetState"); const content = $("inmetContent");
    $("inmetCard").dataset.severity = "unknown";
    setAlertState("unavailable");
    state.className = "source-state warning"; state.innerHTML = "<i></i>Consulta indisponível";
    content.innerHTML = "<h3>Abra o mapa do INMET</h3><p>A fonte automática não respondeu agora. Use o atalho abaixo para conferir os avisos oficiais diretamente no INMET.</p>";
    updateInmetTimestamp(true);
  }
}

function updateClock() {
  if (!activeCity || document.hidden) return;
  const now = new Date();
  globalThis.dispatchEvent?.(new CustomEvent("pluvia:clock-updated"));
  const atmosphere = updateSolarAtmosphere(now.getTime());
  if (displayedWeather?.forecast?.daily) {
    const saved = displayedWeather;
    const hour = selectCurrentHour(saved.forecast.hourly.time);
    const day = globalThis.PLUVIA.time.dayKey(now.getTime(),activeCity);
    const air = weatherData.cachedAir({data:{air:saved.air},airAt:saved.airAt},now.getTime()).air;
    if (hour !== saved.hour || day !== saved.day || air !== saved.air || atmosphere?.phase && atmosphere.phase !== saved.phase) render(saved.forecast,air,saved.fromCache,saved.cacheAt,{weatherAt:saved.weatherAt,airAt:saved.airAt,freshAir:saved.freshAir});
    else renderSun(saved.forecast.daily,now.getTime());
  }
}

function cityDate(value, city = activeCity) {
  return new Date(globalThis.PLUVIA.time.parse(value,city));
}

function selectCurrentHour(times) {
  return globalThis.PLUVIA.time.hourIndex(times,activeCity);
}

function findDryWindow(hourly, start) {
  const consecutive = (a,b) => Date.parse(a?.slice(0,16)+'Z') + 3600000 === Date.parse(b?.slice(0,16)+'Z');
  let knownPairs = 0;
  for (let i = start + 1; i < Math.min(hourly.time.length - 1, start + 37); i++) {
    const pair = [hourly.precipitation_probability?.[i],hourly.precipitation_probability?.[i+1]];
    if (!consecutive(hourly.time[i-1],hourly.time[i]) || !consecutive(hourly.time[i],hourly.time[i+1]) || !pair.every(value => Number.isFinite(value) && value >= 0 && value <= 100)) continue;
    knownPairs++;
    if (pair.every(value => value < 30)) {
      const day = i === start + 1 ? "Agora" : hourly.time[i - 1].slice(0, 10) === hourly.time[start].slice(0, 10) ? "Hoje" : "Amanhã";
      return `${day === "Agora" ? "A partir de agora" : day}, das ${shortTime(hourly.time[i - 1])} às ${shortTime(hourly.time[i + 1])}: menor probabilidade de chuva`;
    }
  }
  return knownPairs ? "Sem período com baixa probabilidade de chuva nos horários disponíveis" : "Janela de baixa chance de chuva indisponível";
}

function forecastIsDay(time, daily) {
  const date = String(time || "").slice(0, 10);
  const dayIndex = daily?.time?.indexOf(date) ?? -1;
  if (dayIndex < 0) return true;
  const at = cityDate(time).getTime(), rise = cityDate(daily.sunrise?.[dayIndex]).getTime(), set = cityDate(daily.sunset?.[dayIndex]).getTime();
  return Number.isFinite(at) && Number.isFinite(rise) && Number.isFinite(set) ? at >= rise && at < set : true;
}

let hourlyMode = "conditions";
function hourlySolarEvents(value, next) {
  const at = cityDate(value).getTime(), end = cityDate(next).getTime();
  if (!Number.isFinite(at) || !Number.isFinite(end) || end-at !== 3600000) return '';
  const solar = globalThis.PLUVIA?.sky?.dayAt(at);
  return [['Nascer do sol',solar?.rise],['Pôr do sol',solar?.set]]
    .filter(([,stamp]) => Number.isFinite(stamp) && stamp >= at && stamp < end)
    .map(([label,stamp]) => `<small class="hour-solar-event">${label} ${formatUpdateTime(stamp)}</small>`).join('');
}
function renderHourly(hourly, start, daily) {
  const chart = $("rainChart");
  const scrollLeft = chart.scrollLeft;
  const readings = new Map(Array.from({length:24}, (_, i) => start + i).filter(i => i < hourly.time.length)
    .map(i => [i, PLUVIA.hourlyDetail.detail(hourly, i)]).filter(([, reading]) => reading));
  const indices = [...readings.keys()];
  const peek = $("hourlyPeek");
  if (peek) {
    peek.innerHTML = indices.slice(0, 5).map((i, p) => {
      const time = p === 0 ? "Agora" : shortTime(hourly.time[i]);
      const temperature = readings.get(i).temperature;
      const probability = readings.get(i).probability;
      const icon = weatherIcons.markup(hourly.weather_code?.[i], forecastIsDay(hourly.time[i], daily), {className:"hourly-weather-icon", decorative:true});
      const mm = readings.get(i).mm;
      const volume = Number.isFinite(mm) && mm >= 0 ? `${fmt(mm, 1)} mm` : "Volume indisponível";
      const rain = Number.isFinite(probability) ? `${Math.round(probability)}%` : "—";
      return `<button type="button" class="hourly-peek-item ${p === 0 ? "is-now" : ""}" data-hour-index="${i}" aria-haspopup="dialog" aria-controls="hourlyDetailDialog" aria-label="${time}: ${fmt(temperature)} graus, sensação ${fmt(readings.get(i).feelsLike)} graus, ${rain} de chance de chuva, ${volume}. Ver detalhes"><span class="peek-time">${time}</span><span class="peek-icon">${icon}</span><span class="peek-rain">${weatherIcons.markupName("rain-probability", {className:"rain-metric-icon"})}${rain}</span><strong>${fmt(temperature)}°</strong><small class="peek-volume">Sens. ${fmt(readings.get(i).feelsLike)}°</small><small class="peek-volume">${volume}</small>${hourlySolarEvents(hourly.time[i],hourly.time[i+1])}</button>`;
    }).join("") || '<p>Previsão por hora indisponível.</p>';
  }
  const decision = $("hourlyDecision");
  if (decision) decision.textContent=indices.length ? 'Toque em um horário para ver sensação, chuva e rajadas.' : 'Previsão por hora indisponível.';
  const descriptions = {
    conditions:"barras mostram a temperatura; a sensação aparece abaixo",
    feels:"barras mostram a sensação térmica; a temperatura aparece abaixo",
    rain:"barras mostram o volume previsto em mm por hora; a chance aparece separadamente em %",
    wind:"barras mostram a velocidade em km/h, com rajadas e direção quando disponíveis"
  };
  const legend = $("hourlyChartLegend");
  if (legend) legend.textContent = descriptions[hourlyMode] + '. Horários locais da cidade; toque para ver detalhes.';
  const temperatures = indices.map(i => hourlyMode === "feels" ? readings.get(i).feelsLike : readings.get(i).temperature).filter(Number.isFinite);
  const minTemp = temperatures.length ? Math.min(...temperatures) : 0;
  const tempSpread = temperatures.length ? Math.max(1, Math.max(...temperatures) - minTemp) : 1;
  const windValues = indices.map(i => readings.get(i).wind).filter(Number.isFinite);
  const maxWind = Math.max(10, ...windValues);
  const maxRain = Math.max(1, ...indices.map(i => readings.get(i).mm).filter(Number.isFinite));
  chart.dataset.hourlyMode = hourlyMode;
  if ((hourlyMode === "wind" && !windValues.length) || (hourlyMode === "feels" && !temperatures.length)) {
    const unavailable = hourlyMode === "feels" ? "Sensação térmica por hora indisponível" : "Vento por hora indisponível";
    chart.innerHTML = `<p class="chart-loading">${unavailable}.</p>`;
    chart.setAttribute("aria-label", `${unavailable} em ${activeCity.name}.`);
    $("dryWindow").textContent = findDryWindow(hourly, start);
    return;
  }
  chart.innerHTML = indices.map((i, p) => {
    const time = p === 0 ? "AGORA" : shortTime(hourly.time[i]);
    const temperature = readings.get(i).temperature;
    const solarEvent = hourlySolarEvents(hourly.time[i],hourly.time[i+1]);
    const icon = weatherIcons.markup(hourly.weather_code[i], forecastIsDay(hourly.time[i], daily), {className:"hourly-weather-icon", decorative:false});
    if (hourlyMode === "conditions" || hourlyMode === "feels") {
      const plotted = hourlyMode === "feels" ? readings.get(i).feelsLike : temperature;
      const secondary = hourlyMode === "feels" ? `Temp. ${fmt(temperature)}°` : `Sens. ${fmt(readings.get(i).feelsLike)}°`;
      const bar = Number.isFinite(plotted) ? `<div class="temp-bar" style="height:${(24 + (plotted - minTemp) / tempSpread * 111).toFixed(0)}px"></div>` : '';
      return `<button type="button" class="hour-column ${p === 0 ? "now" : ""}" data-hour-index="${i}" aria-haspopup="dialog" aria-controls="hourlyDetailDialog" aria-label="Ver detalhes de ${shortTime(hourly.time[i])}" title="${shortTime(hourly.time[i])}: ${fmt(temperature)} graus, ${weather(hourly.weather_code[i])[0]}">
        <span class="hour-time">${time}</span><span class="hour-temp">${fmt(plotted)}°<small>${secondary}</small></span>
        <div class="bar-area">${bar}</div>
        <span class="hour-detail">${Number.isFinite(readings.get(i).probability) ? Math.round(readings.get(i).probability) + "%" : "—"} de chuva<small>${fmt(readings.get(i).mm,1)} mm</small></span><span class="hour-icon">${icon}</span>${solarEvent}</button>`;
    }
    if (hourlyMode === "wind") {
      const speed = readings.get(i).wind;
      const gust = readings.get(i).gust;
      const direction = readings.get(i).direction;
      const validDirection = Number.isFinite(speed) && speed > 0 && Number.isFinite(direction) && direction >= 0 && direction <= 360;
      const arrow = validDirection ? `<span style="transform:rotate(${direction}deg)">↑</span>` : "—";
      const bar = Number.isFinite(speed) ? `<div class="wind-bar" style="height:${(16 + Math.max(0, speed) / maxWind * 125).toFixed(0)}px"></div>` : "";
      return `<button type="button" class="hour-column ${p === 0 ? "now" : ""}" data-hour-index="${i}" aria-haspopup="dialog" aria-controls="hourlyDetailDialog" aria-label="Ver detalhes de ${shortTime(hourly.time[i])}" title="${shortTime(hourly.time[i])}: vento ${fmt(speed)} km/h, rajadas ${fmt(gust)} km/h${validDirection ? `, vindo de ${windDirection(direction)}` : ""}">
        <span class="hour-time">${time}</span><span class="hour-temp">${fmt(speed)}</span>
        <div class="bar-area">${bar}</div><span class="hour-detail">km/h<small>Raj. ${fmt(gust)}</small></span>
        <span class="wind-direction" aria-hidden="true">${arrow}</span>${solarEvent}</button>`;
    }
    const probability = readings.get(i).probability;
    const prob = Number.isFinite(probability) ? Math.round(probability) : null;
    const mm = readings.get(i).mm;
    const bar = mm > 0 ? `<div class="rain-bar" style="height:${(mm / maxRain * 150).toFixed(1)}px"></div>` : '';
    const gust = readings.get(i).gust;
    return `<button type="button" class="hour-column ${p === 0 ? "now" : ""}" data-hour-index="${i}" aria-haspopup="dialog" aria-controls="hourlyDetailDialog" aria-label="Ver detalhes de ${shortTime(hourly.time[i])}" title="${shortTime(hourly.time[i])}: ${fmt(temperature)} graus, ${prob ?? "—"}% de chuva, ${fmt(mm, 1)} milímetro${gust >= 45 ? `, rajadas de ${fmt(gust)} quilômetros por hora` : ""}">
      <span class="hour-time">${time}</span>
      <span class="hour-temp"><span class="rain-chance">${prob === null ? "Chance —" : `${prob}% de chance`}</span></span>
      <div class="bar-area">${bar}</div>
      <span class="rain-mm">${fmt(mm, 1)} mm</span><span class="hour-icon">${icon}</span>${solarEvent}
    </button>`;
  }).join("") || '<p class="chart-loading">Previsão por hora indisponível.</p>';
  chart.setAttribute("aria-label", `Previsão por hora em ${activeCity.name}: ${descriptions[hourlyMode]}.`);
  chart.scrollLeft = scrollLeft;
  $("dryWindow").textContent = findDryWindow(hourly, start);
}

function renderForecast(daily, currentTemperature, at = Date.now()) {
  const today = globalThis.PLUVIA.time.dayKey(at,activeCity);
  const start = daily.time.findIndex(day => day >= today);
  if (start < 0) { $("forecastList").innerHTML = '<p class="forecast-loading">Previsão diária salva sem próximos dias disponíveis.</p>'; return; }
  const indices = Array.from({length:Math.min(7,daily.time.length-start)},(_,i)=>start+i)
    .filter(i=>Number.isFinite(daily.temperature_2m_min[i]) && Number.isFinite(daily.temperature_2m_max[i]));
  if (!indices.length) { $("forecastList").innerHTML = '<p class="forecast-loading">Previsão diária incompleta para os próximos dias.</p>'; return; }
  const days = indices.map(i=>daily.time[i]);
  const bestIndex = indices.reduce((best, i) => {
    const score = (daily.precipitation_probability_max[i] || 0) + (daily.precipitation_sum[i] || 0) * 4;
    const bestScore = (daily.precipitation_probability_max[best] || 0) + (daily.precipitation_sum[best] || 0) * 4;
    return score < bestScore ? i : best;
  }, start);
  const minAll = Math.min(...indices.map(i=>daily.temperature_2m_min[i]).filter(Number.isFinite));
  const maxAll = Math.max(...indices.map(i=>daily.temperature_2m_max[i]).filter(Number.isFinite));
  const spread = Math.max(1, maxAll - minAll);
  $("forecastList").innerHTML = days.map((date, offset) => {
    const i = indices[offset];
    const d = new Date(`${date}T12:00:00Z`);
    const day = date === today ? "Hoje" : new Intl.DateTimeFormat("pt-BR", {timeZone:"UTC",weekday: "long"}).format(d).replace(/-feira$/, "").replace(/^./, c => c.toUpperCase());
    const label = new Intl.DateTimeFormat("pt-BR", {timeZone:"UTC",day: "2-digit", month: "short"}).format(d).replace(".", "");
    const [cond] = weather(daily.weather_code[i]); const min = daily.temperature_2m_min[i]; const max = daily.temperature_2m_max[i];
    const left = Math.max(0, Math.min(98, (min - minAll) / spread * 100));
    const width = Math.max(2, (max - min) / spread * 100);
    const currentPosition = date === today && Number.isFinite(currentTemperature) && currentTemperature >= min && currentTemperature <= max
      ? Math.max(0, Math.min(100, (currentTemperature - minAll) / spread * 100)) : null;
    const rainProb = Number.isFinite(daily.precipitation_probability_max[i]) ? Math.round(daily.precipitation_probability_max[i]) : null;
    const rainMm = daily.precipitation_sum[i];
    const weekend = [0,6].includes(d.getUTCDay());
    const reading = !Number.isFinite(rainProb) || !Number.isFinite(rainMm) ? "Previsão de chuva indisponível" : rainMm >= 20 ? "Acumulado de chuva elevado" : rainMm >= 8 ? "Chuva ao longo do dia" : rainProb >= 55 ? "Chuva provável, com baixo acumulado" : rainProb >= 30 ? "Chuva isolada" : "Baixa probabilidade de chuva";
    const uvMax = daily.uv_index_max?.[i];
    // A linha mostra só o que acrescenta: chuva relevante ou UV muito alto. O restante fica no detalhe do dia.
    const notes = [reading !== "Baixa probabilidade de chuva" && reading, Number.isFinite(uvMax) && uvMax >= 8 && `UV ${fmt(uvMax, 0)} · ${uvMax >= 11 ? "extremo" : "muito alto"}`].filter(Boolean);
    return `<button type="button" class="forecast-row ${i === bestIndex ? "best-day" : ""}" data-day-index="${i}" aria-haspopup="dialog" aria-controls="dailyDetailDialog" aria-label="${day}, ${label}: ${cond}, mínima ${fmt(min)} graus, máxima ${fmt(max)} graus, chance de chuva ${rainProb ?? 'indisponível'}${rainProb===null ? '' : '%'}, ${fmt(rainMm,1)} mm. Ver detalhes.">
      <span class="forecast-day"><strong>${day}${weekend ? '<span class="weekend-note"> · fim de semana</span>' : ""}</strong><span>${label} <span aria-hidden="true">›</span></span></span>
      <span class="forecast-condition"><i>${weatherIcons.markup(daily.weather_code[i], true, {className:"forecast-weather-icon"})}</i><span>${cond}</span></span>
      <span class="temp-range" role="img" aria-label="Mínima ${fmt(min)} graus, máxima ${fmt(max)} graus${currentPosition === null ? "" : `, temperatura atual ${fmt(currentTemperature)} graus`}"><strong aria-hidden="true">${fmt(min)}°</strong><span class="temp-track" aria-hidden="true"><span class="temp-fill" style="left:${left.toFixed(1)}%;width:${Math.min(width, 100 - left).toFixed(1)}%"></span>${currentPosition === null ? "" : `<span class="temp-now" style="left:${currentPosition.toFixed(1)}%"></span>`}</span><strong aria-hidden="true">${fmt(max)}°</strong></span>
      <span class="forecast-rain"><span>${weatherIcons.markupName("rain-probability", {className:"rain-metric-icon"})}</span><span class="forecast-rain-values"><span class="forecast-rain-chance">${rainProb ?? '—'}%</span><span class="forecast-rain-volume">${fmt(rainMm, 1)} mm</span></span></span>
      <span class="forecast-uv"${notes.length ? "" : " hidden"}>${notes.join(" · ")}</span>
    </button>`;
  }).join("");
}

function solarArcPoint(progress) {
  const t = Math.min(1, Math.max(0, progress));
  // Mesma curva quadrática do caminho SVG: M9 115 Q50 -65 91 115.
  return { left: 9 + 82 * t, top: 115 - 360 * t * (1 - t) };
}

function renderSun(daily, at = Date.now()) {
  const astronomy=globalThis.PLUVIA?.sky?.astronomyAt?.(at);
  const astronomyFields={civilDawn:astronomy?.dawn,civilDusk:astronomy?.dusk,moonrise:astronomy?.moonRise,moonset:astronomy?.moonSet};
  for(const [id,stamp] of Object.entries(astronomyFields)) {
    const field=$(id);if(field) field.textContent=Number.isFinite(stamp) ? formatUpdateTime(stamp) : id.startsWith('moon') && astronomy?.moonAvailable ? 'Sem evento hoje' : 'Indisponível';
  }
  if($('astronomyDate')) $('astronomyDate').textContent='Dia '+new Intl.DateTimeFormat('pt-BR',{timeZone:activeCity.timezone,day:'numeric',month:'long'}).format(at)+' · horário de '+activeCity.name+' · estimativa astronômica';
  const today = globalThis.PLUVIA.time.dayKey(at,activeCity);
  const index = daily.time?.indexOf(today) ?? -1;
  const solar = globalThis.PLUVIA?.sky?.dayAt(at);
  const rise = solar?.rise ?? cityDate(daily.sunrise?.[index]).getTime();
  const set = solar?.set ?? cityDate(daily.sunset?.[index]).getTime();
  const available = Number.isFinite(rise) && Number.isFinite(set) && set > rise;
  const isNight = !available || at < rise || at >= set;
  document.querySelector(".sun-section")?.classList.toggle("is-night",isNight);
  $("sunDot").hidden = isNight;
  // À noite, a Lua (mesmo disco/fase de moon-view) percorre o arco entre o pôr e o próximo nascer,
  // como a ilustração do fundo; horários reais da Lua continuam no detalhe astronômico.
  const moonDot = $("moonDot");
  if (moonDot) {
    const nightStart = at >= set ? set : globalThis.PLUVIA?.sky?.dayAt?.(at - 86400000)?.set;
    const nightEnd = at >= set ? globalThis.PLUVIA?.sky?.dayAt?.(at + 86400000)?.rise : rise;
    const night = available && isNight && Number.isFinite(nightStart) && Number.isFinite(nightEnd) && nightEnd > nightStart && at >= nightStart && at <= nightEnd;
    moonDot.hidden = !night;
    if (night) {
      const moonPoint = solarArcPoint((at - nightStart) / (nightEnd - nightStart));
      moonDot.style.left = `${moonPoint.left}%`; moonDot.style.top = `${moonPoint.top}px`;
    }
  }
  if (!available) {
    $("sunrise").textContent = "--:--"; $("sunset").textContent = "--:--";
    $("daylight").textContent = "Ciclo solar indisponível";
    $("sunPhrase").textContent = "Horários solares indisponíveis para hoje.";
    $("sunshineNote").textContent = "Duração prevista de sol indisponível.";
    return;
  }
  const minutes = Math.round((set - rise) / 60000);
  $("sunrise").textContent = formatUpdateTime(rise); $("sunset").textContent = formatUpdateTime(set);
  $("daylight").textContent = `${Math.floor(minutes / 60)}h ${minutes % 60}min de luz`;
  const point = solarArcPoint((at - rise) / (set - rise));
  $("sunDot").style.left = `${point.left}%`; $("sunDot").style.top = `${point.top}px`;
  const remainingMinutes = Math.max(1, Math.ceil((set - at) / 60000));
  const remainingTime = remainingMinutes < 60 ? `${remainingMinutes} min` : `${Math.floor(remainingMinutes / 60)} h ${remainingMinutes % 60} min`;
  const duration = ms => { const total = Math.max(1, Math.ceil(ms / 60000)); return total < 60 ? `${total} min` : `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}min`; };
  const nextRise = at < rise ? rise : globalThis.PLUVIA?.sky?.dayAt?.(at + 86400000)?.rise;
  const untilRise = Number.isFinite(nextRise) && nextRise > at ? ` Nasce em ${duration(nextRise - at)}, às ${formatUpdateTime(nextRise)}.` : "";
  $("sunPhrase").textContent = at < rise ? `O sol ainda não nasceu.${untilRise}` : at >= set ? `O sol já se pôs em ${activeCity.name}.${untilRise}` : `Restam cerca de ${remainingTime} de luz natural.`;
  const sunshine = daily.sunshine_duration?.[index], daylight = daily.daylight_duration?.[index];
  const sunshineMinutes = Math.round(sunshine / 60), daylightMinutes = Math.round(daylight / 60);
  $("sunshineNote").textContent = Number.isFinite(sunshine) && Number.isFinite(daylight)
    ? `Sol previsto hoje: ${Math.floor(sunshineMinutes / 60)}h ${sunshineMinutes % 60}min · Luz do dia: ${Math.floor(daylightMinutes / 60)}h ${daylightMinutes % 60}min. A previsão de sol considera as nuvens.`
    : "Duração prevista de sol indisponível.";
}

function renderVisibility(value, fromCache = false) {
  const available = Number.isFinite(value) && value >= 0;
  const reduced = available && value < 5000;
  $("visibilityValue").textContent = !available ? "--" : value < 1000 ? `${fmt(value)} m` : `${fmt(value / 1000, value < 10000 ? 1 : 0)} km`;
  $("visibilityNote").textContent = !available ? "Visibilidade indisponível para esta hora."
    : `${value < 1000 ? "Visibilidade baixa" : reduced ? "Visibilidade reduzida" : "Boa visibilidade"} · ${fromCache ? "previsão salva" : "estimativa regional"}`;
  $("visibilityBadge").hidden = !reduced;
  $("visibilityBadge").textContent = !reduced ? "" : value < 1000 ? "Visibilidade baixa" : "Visibilidade reduzida";
  $("visibilityBadge").dataset.level = value < 1000 ? "low" : "reduced";
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
  ["feelsLikeNote","uvNote","rainPhraseMeta"].forEach(id => {
    const node = $(id);
    if (node) node.textContent = "";
  });
  if ($("rainPhrase")) $("rainPhrase").textContent = "Previsão de chuva indisponível.";
}

function renderAirParticles(air) {
  const reading = weatherInsights?.particles?.(air?.pm25Mean24h);
  if ($("airParticles")) {
    $("airParticles").hidden = !reading;
    $("airParticles").textContent = reading ? `PM2,5 média de 24h: ${fmt(reading.value,1)} µg/m³ · ${reading.label} (15 µg/m³).` : '';
  }
  if ($("airParticlesNote")) {
    $("airParticlesNote").hidden = !reading?.notable;
    $("airParticlesNote").textContent = reading?.notable ? `${reading.label} · PM2,5 24h ${fmt(reading.value,0)} µg/m³` : '';
  }
}

function renderAirDetails(snapshot) {
  const details = $("airDetails");
  if (!details) return;
  const air = snapshot?.airQuality;
  details.hidden = !air;
  renderAirParticles(air);
  if (!air) return;
  const fields = [['pm25','PM2,5'],['pm10','PM10'],['ozone','Ozônio'],['nitrogenDioxide','NO₂'],['carbonMonoxide','CO']];
  const readings = fields.filter(([key]) => Number.isFinite(air[key]) && air[key]>=0).map(([key,label]) => {
    const row = document.createElement('div'), name = document.createElement('dt'), value = document.createElement('dd');
    name.textContent = label; value.textContent = fmt(air[key],1)+' µg/m³'; row.append(name,value); return row;
  });
  $("airPollutants").replaceChildren(...readings);
  const at = globalThis.PLUVIA.time.parse(air.time,activeCity);
  const stamp = Number.isFinite(at) ? new Intl.DateTimeFormat('pt-BR',{timeZone:activeCity.timezone,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(at) : 'horário indisponível';
  $("airDetailsTime").textContent = `${snapshot.airSource.freshness==='current' ? 'Estimativa de' : 'Leitura anterior de'} ${stamp} · horário de ${activeCity.name}.`;
}

function renderWeatherInsights(data, air, start) {
  const thermal = weatherInsights?.feelsLike?.(data.current);
  const rain = weatherInsights?.rain?.(data.hourly, start);
  if ($("feelsLikeNote") && thermal) $("feelsLikeNote").textContent = thermal.label;
  if ($("rainPhrase")) {
    $("rainPhrase").textContent = !rain ? "Previsão de chuva indisponível."
      : rain.chance >= 60 && rain.volume >= 5 ? "Chuva significativa prevista nas próximas 12 horas."
      : rain.chance >= 35 && rain.window ? `Possibilidade de chuva entre ${rain.window}.`
      : rain.chance >= 35 ? "Possibilidade de chuva nas próximas 12 horas."
      : "Baixa probabilidade de chuva nas próximas 12 horas.";
  }
  if ($("rainPhraseMeta")) $("rainPhraseMeta").textContent = rain?.meta ? rain.meta + (data.pluviaSources?.metNorway?.includes('hourly.precipitation') ? ' · volume: MET Norway; probabilidade: Open-Meteo' : ' · Open-Meteo') : '';
}

function markWeatherUnavailable(hasSavedData) {
  setDataStatus(hasSavedData ? "Dados salvos · sem confirmação atual" : "Conexão indisponível", true);
  if (hasSavedData) {
    weatherData?.markStale?.(activeCity.id);
    globalThis.dispatchEvent?.(new CustomEvent('pluvia:weather-updated',{detail:{cityId:activeCity.id}}));
    return;
  }
  $("windCompass").style.setProperty("--wind-deg", "0deg");
  $("windCompass").style.setProperty("--wind-visible", "0");
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

function render(data, air, fromCache = false, cacheAt = 0, metadata = {}) {
  try {
    weatherData?.ingestOpenMeteo(data, air, activeCity, {
      checkedAt: metadata.weatherAt || cacheAt || Date.now(), freshness: fromCache ? "stale" : "current",
      airCheckedAt:metadata.airAt,airFreshness:metadata.freshAir ? "current" : "stale"
    });
  } catch {
    // A camada de interpretação nunca pode impedir a previsão principal.
  }
  const current = data.current; const day = data.daily; const start = selectCurrentHour(data.hourly.time); const [condition] = weather(current.weather_code);
  $("temperature").textContent = fmt(current.temperature_2m); $("feelsLike").textContent = `${fmt(current.apparent_temperature)}°`;
  const heatGap = current.apparent_temperature - current.temperature_2m;
  const atmosphere = applyWeatherAtmosphere(current.weather_code, current.is_day, day, current.wind_speed_10m);
  const isDay = atmosphere?.phase === "night" ? false : atmosphere?.phase === "day" ? true : current.is_day !== 0;
  const localCondition = !isDay && current.weather_code === 1 ? "Céu quase limpo" : condition;
  $("condition").textContent = heatGap >= 4 && current.relative_humidity_2m >= 70 ? `${localCondition} · ar abafado` : localCondition;
  const dayIndex = day.time.indexOf(globalThis.PLUVIA.time.dayKey(Date.now(),activeCity));
  $("todayHigh").textContent = `${fmt(day.temperature_2m_max[dayIndex])}°`;
  $("todayLow").textContent = `${fmt(day.temperature_2m_min[dayIndex])}°`;
  $("humidity").innerHTML = `${fmt(current.relative_humidity_2m)}<sup>%</sup>`; const humidityReading = weatherInsights?.humidity?.(data.hourly,start,current);
  $("humidityNote").textContent = humidityReading?.note || humidityLabel(current.relative_humidity_2m);
  $("humidity").closest?.(".metric")?.setAttribute("data-humidity-level",humidityReading?.level || "unknown");
  $("wind").innerHTML = `${fmt(current.wind_speed_10m)}<sup> km/h</sup>`; $("windNote").textContent = `De ${windDirection(current.wind_direction_10m)} · rajadas ${fmt(current.wind_gusts_10m)} km/h`;
  $("windCompass").style.setProperty("--wind-deg", `${Number.isFinite(current.wind_direction_10m) ? current.wind_direction_10m : 0}deg`);
  $("windCompass").style.setProperty("--wind-visible", Number.isFinite(current.wind_direction_10m) ? "1" : "0");
  $("windCompass").setAttribute("aria-label", `Vento de ${windDirection(current.wind_direction_10m)}, ${fmt(current.wind_speed_10m)} quilômetros por hora, rajadas de ${fmt(current.wind_gusts_10m)} quilômetros por hora`);
  $("pressure").innerHTML = `${fmt(current.pressure_msl ?? current.surface_pressure)}<sup> hPa</sup>`;
  const pressureTrend = weatherInsights.pressure?.(data.hourly,start,activeCity);
  $("pressureNote").textContent = pressureTrend ? (pressureTrend.trend==='stable' ? 'Estável nas últimas 3h' : `${pressureTrend.trend==='rising' ? 'Subindo' : 'Caindo'} ${fmt(Math.abs(pressureTrend.delta),1)} hPa em 3h`)+' · estimativa' : 'Tendência indisponível';
  const uvNow = data.hourly.uv_index?.[start]; $("uv").textContent = fmt(uvNow, 1); $("uvNote").textContent = uvLabel(uvNow);
  $("uvScale").hidden = !Number.isFinite(uvNow);
  if (Number.isFinite(uvNow)) $("uvScale").style.setProperty("--uv-position", `${Math.max(0, Math.min(100, uvNow / 11 * 100))}%`);
  renderAirQuality(air?.current?.us_aqi);
  renderAirDetails(weatherData?.get(activeCity.id));
  if (air && !metadata.freshAir) $("airNote").textContent += ' · leitura anterior';
  const observedAt = current.time ? cityDate(current.time).getTime() : Date.now();
  setDataStatus(fromCache ? `Última atualização ${formatUpdateTime(observedAt)} · dados salvos de ${dataAge(cacheAt || Date.now())}` : `Atualizado ${formatUpdateTime(observedAt)}`, fromCache);
  renderVisibility(data.hourly.visibility?.[start], fromCache);
  renderHourly(data.hourly, start, day);
  globalThis.PLUVIA?.hourlyDetail?.update?.({hourly:data.hourly,daily:day,start,city:activeCity,fromCache,cacheAt,isDayAt:time=>forecastIsDay(time,day)});
  globalThis.PLUVIA?.dailyDetail?.update?.({hourly:data.hourly,daily:day,city:activeCity,fromCache,cacheAt,at:Date.now(),isDayAt:time=>forecastIsDay(time,day),dayAt:stamp=>globalThis.PLUVIA.sky.dayAt(stamp)});
  try { renderWeatherInsights(data, air, start); } catch { clearWeatherInsights(); }
  renderForecast(day, current.temperature_2m); renderSun(day);
  displayedWeather = {forecast:data,air,fromCache,cacheAt,weatherAt:metadata.weatherAt || cacheAt || Date.now(),hour:start,phase:atmosphere?.phase,day:globalThis.PLUVIA.time.dayKey(Date.now(),activeCity),airAt:metadata.airAt,freshAir:metadata.freshAir === true};
  globalThis.dispatchEvent?.(new CustomEvent("pluvia:weather-updated",{detail:{cityId:activeCity.id}}));
}

async function loadWeather(revision = cityRevision) {
  const city = activeCity;
  $("weatherView")?.setAttribute('aria-busy','true');
  try {
    const optional = Promise.allSettled([
      Promise.resolve().then(() => services.airQuality.getCurrent(city)),
      Promise.resolve().then(() => services.metNorway.getForecast(city))
    ]);
    const original = await fetchForecast(city,revision);
    if (revision !== cityRevision) return false;
    // Optional sources must not hold the first usable forecast behind their timeout.
    if (!displayedWeather || displayedWeather.fromCache) {
      const savedAir = weatherData.cachedAir(cached());
      render(original,savedAir.air,false,0,{airAt:savedAir.at});
      cache({forecast:original,air:savedAir.air},{weatherAt:Date.now(),airAt:savedAir.at});
      globalThis.PLUVIA?.sources.set('weather',{status:'ready',checkedAt:Date.now(),dataAt:cityDate(original.current.time,city).getTime()});
      $("weatherView")?.classList.remove('initial-loading');
      $("weatherView")?.setAttribute('aria-busy','false');
    }
    const [airResult,metResult] = await optional;
    if (revision !== cityRevision) return false;
    let merged = null;
    try { if (metResult.status === 'fulfilled') merged = globalThis.PLUVIA?.metMerge?.merge(original,metResult.value,city.timezone); } catch { /* Uma fonte não deve ocultar a outra. */ }
    const data = merged?.used && validForecast(merged.forecast) ? merged.forecast : original;
    const usingMet = data !== original;
    const previous = cached();
    const freshAir = airResult.status === "fulfilled" && weatherData?.validateAirQuality?.(airResult.value).valid === true;
    const savedAir = weatherData?.cachedAir(previous) || {air:null,at:null};
    const air = freshAir ? airResult.value : savedAir.air;
    const airAt = freshAir ? Date.now() : savedAir.at;
    render(data,air,false,0,{airAt,freshAir});
    cache({forecast:data,air},{weatherAt:Date.now(),airAt});
    globalThis.PLUVIA?.sources.set("weather",{status:"ready",checkedAt:Date.now(),dataAt:cityDate(data.current.time,city).getTime()});
    globalThis.PLUVIA?.sources.set('met-norway',{status:usingMet ? 'ready' : 'error',checkedAt:usingMet ? Date.now() : null,dataAt:usingMet ? Date.parse(merged.time) : null});
    globalThis.PLUVIA?.sources.set("air-quality",{status:freshAir ? "ready" : air ? "stale" : "error",checkedAt:freshAir ? Date.now() : airAt,dataAt:air?.current?.time ? cityDate(air.current.time,city).getTime() : null});
    clearTimeout(errorTimer); $("errorToast").classList.remove("show"); $("errorToast").setAttribute("aria-hidden", "true");
    globalThis.PLUVIA?.radar?.probe?.(city);
    return true;
  } catch (error) {
    if (revision !== cityRevision) return false;
    const saved = cached();
    if (saved) { render(saved.data.forecast, weatherData?.cachedAir(saved)?.air, true, saved.weatherAt || saved.at,{airAt:weatherData?.cachedAir(saved)?.at}); }
    markWeatherUnavailable(Boolean(displayedWeather));
    globalThis.PLUVIA?.sources.set("weather",{status:displayedWeather ? "stale" : "error"});
    globalThis.PLUVIA?.sources.set("air-quality",{status:displayedWeather?.air ? "stale" : "error"});
    if (!displayedWeather) {
      $("condition").textContent = "Tempo indisponível";
      renderVisibility(null);
      $("rainChart").innerHTML = '<p class="chart-loading">Previsão indisponível. Tentaremos novamente.</p>';
      $("hourlyPeek").innerHTML = '<p>Previsão por hora indisponível.</p>';
      $("hourlyDecision").textContent = "Sem dados recentes para as próximas horas.";
      $("forecastList").innerHTML = '<p class="forecast-loading">Previsão indisponível. Tentaremos novamente.</p>';
      $("dryWindow").textContent = "Sem dados";
      $("sunPhrase").textContent = "Ciclo solar indisponível.";
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
  globalThis.PLUVIA?.nowcast?.refresh(activeCity);
  if (refreshInFlight) return refreshInFlight;
  const revision = cityRevision;
  refreshInFlight = Promise.allSettled([loadWeather(revision), loadInmetAlerts(revision)]).then(results => {
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
  const revealThreshold = 28;
  let gesture = null;
  let loading = false;
  let hideTimer;

  function reset() {
    gesture = null;
    document.removeEventListener("touchmove", handlePullMove);
    if (!loading) { indicator.hidden = true; label.textContent = ""; }
  }

  document.addEventListener("touchstart", event => {
    if (loading || !activeCity) return;
    clearTimeout(hideTimer);
    reset();
    if (event.touches.length !== 1 || window.scrollY > 0 || (window.visualViewport?.scale || 1) > 1 ||
      event.target.closest?.("a, button, input, select, textarea, [contenteditable], .rain-chart, .hourly-peek-list, dialog, .leaflet-container")) return;
    const touch = event.touches[0];
    gesture = {id: touch.identifier, x: touch.clientX, y: touch.clientY, distance: 0};
    // Normal scrolling has no blocking touchmove listener. Only a pull from
    // the top temporarily opts in, and an upward/horizontal gesture removes it.
    document.addEventListener("touchmove", handlePullMove, {passive: false});
  }, {passive: true});

  function handlePullMove(event) {
    if (!gesture || loading) return;
    const touch = event.touches[0];
    if (event.touches.length !== 1 || touch.identifier !== gesture.id || window.scrollY > 0 ||
      (window.visualViewport?.scale || 1) > 1) { reset(); return; }
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    if (dy < 0 || Math.abs(dx) > Math.max(10, dy)) { reset(); return; }
    gesture.distance = dy;
    // Small scroll corrections must not flash the refresh chip on iOS.
    if (dy < revealThreshold) { indicator.hidden = true; return; }
    if (!event.cancelable) { reset(); return; }
    event.preventDefault();
    indicator.hidden = false;
    indicator.style.setProperty("--pull-offset", `${Math.min(64, dy * .4)}px`);
    const message = dy >= threshold ? "Solte para atualizar" : "Puxe para atualizar";
    if (label.textContent !== message) label.textContent = message;
  }

  document.addEventListener("touchend", async event => {
    if (!gesture || loading) return;
    const ready = gesture.distance >= threshold && event.touches.length === 0;
    gesture = null;
    document.removeEventListener("touchmove", handlePullMove);
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


const cityResetIds = ["temperature","feelsLike","feelsLikeNote","condition","todayHigh","todayLow","humidity","humidityNote","wind","windNote","pressure","pressureNote","uv","uvNote","airQuality","airNote","visibilityValue","visibilityNote","hourlyPeek","hourlyDecision","rainChart","forecastList","dryWindow","daylight","sunPhrase","sunrise","sunset","sunshineNote","civilDawn","civilDusk","moonrise","moonset","astronomyDate"].filter(id=>$(id));
let emptyCityContent;
function updateCityLabels() {
  $("favoriteCity").disabled = !activeCity;
  if (!activeCity) return;
  $("cityName").textContent = activeCity.name;
  $("alertsCityLabel").textContent = "Fontes oficiais e leitura ambiental para " + activeCity.name;
  $("forecastCityLabel").textContent = "Previsão para o ponto de referência de " + activeCity.name + ", não para um endereço específico.";
  const distance = $("cityDistance");
  if (distance) {
    distance.hidden = !(activeCity.distanceKm >= 2);
    if (activeCity.distanceKm >= 2) distance.textContent = "a " + Math.round(activeCity.distanceKm) + " km de " + activeCity.name + " · " + activeCity.uf;
  }
  globalThis.PLUVIA?.modules?.['weather-layers']?.cityChanged?.(activeCity);
  const starred = favorites.has(activeCity.id);
  $("favoriteCity").textContent = starred ? "★ Favorita" : "☆ Favoritar";
  $("favoriteCity").setAttribute("aria-pressed", String(starred));
  $("favoriteCity").setAttribute("aria-label", (starred ? "Remover dos favoritos: " : "Favoritar: ") + activeCity.name);
  updateClock();
}
let activeResultIndex = -1;
function renderCityOptions() {
  const query = normalizeName(document.getElementById("citySearch").value || "").trim();
  const initial = [...new Map([
    ...[...favorites].map(id => cityById.get(id)),
    activeCity,
    ...CAPITALS
  ].filter(Boolean).map(city => [city.id, city])).values()];
  const matches = query ? searchCities(query) : initial;
  const shown = query ? matches.slice(0, 12) : matches;
  const list = document.getElementById("cityResults");
  activeResultIndex = -1;
  list.innerHTML = shown.map(city => {
    const capital = CAPITALS.some(item => item.id === city.id);
    return `<li><button class="city-result" type="button" role="option" aria-selected="false" data-current="${city.id === activeCity?.id}" data-id="${city.id}"><span>${favorites.has(city.id) ? "★ " : ""}${escapeHtml(city.name)}/${city.uf}</span><small>${escapeHtml(city.state || city.uf)}${capital ? " · capital" : ""}</small></button></li>`;
  }).join("");
  document.getElementById("cityPickerStatus").textContent = !cityIndexReady ? "Capitais disponíveis. Digite para carregar o índice de municípios." : !shown.length ? "Cidade não encontrada. Digite o nome sem acentos ou confira a grafia." : query ? `${matches.length} resultado${matches.length === 1 ? "" : "s"}` : "Cidades favoritas e capitais.";
}
function chooseCity(id, locatedCity = null) {
  const city = locatedCity || cityById.get(id);
  if (!city) return;
  if (city.needsDetails) {
    locationAttempt++; locationPending = false; locationButtons(false);
    const choice = ++cityChoiceAttempt;
    $("cityPickerStatus").textContent = `Abrindo ${city.name}/${city.uf}…`;
    ensureCityDetails(city.id).then(fullCity => {
      if (choice === cityChoiceAttempt && fullCity) chooseCity(fullCity.id, fullCity);
    }).catch(() => { if (choice === cityChoiceAttempt) $("cityPickerStatus").textContent = "Não foi possível abrir esta cidade. Tente novamente."; });
    return;
  }
  cityChoiceAttempt++;
  // A successful explicit selection supersedes the bootstrap fallback notice.
  const notice = $("locationNotice");
  if (notice) { notice.hidden = true; notice.textContent = ""; }
  if (city.id === activeCity?.id && !Number.isFinite(locatedCity?.distanceKm)) {
    locationAttempt++; locationPending = false; locationButtons(false);
    closeCitySearch(); return;
  }
  locationAttempt++;
  locationPending = false;
  locationButtons(false);
  $("locationWelcome").hidden = true;
  $("weatherView").hidden = false;
  closeCitySearch();
  $("alertDetail")?.close?.();
  cityRevision++;
  services?.abortAll();
  refreshInFlight = null;
  activeCity = city; displayedWeather = null; lastRefreshAt = 0;
  lastInmetResponse = null; lastInmetReadAt = 0;
  applyWeatherAtmosphere(null, null);
  globalThis.pluviaAnalytics?.track('City Selected',{city:city.name,uf:city.uf,source:Number.isFinite(locatedCity?.distanceKm) ? 'location' : 'picker_or_saved'});
  globalThis.PLUVIA?.sources.reset(city.id);
  globalThis.PLUVIA?.radar?.reset?.(city.id);
  globalThis.PLUVIA?.modules.location.reset?.();
  writePreference("pluvia-city", city.id);
  writePreference("pluvia-city-record", {id:city.id,name:city.name,uf:city.uf,state:city.state,lat:city.lat,lon:city.lon,timezone:city.timezone});
  globalThis.dispatchEvent?.(new CustomEvent('pluvia:city-changed',{detail:{id:city.id}}));
  clearTimeout(errorTimer);
  $("errorToast").classList.remove("show");
  $("errorToast").setAttribute("aria-hidden","true");
  const saved = cached();
  if (!saved) {
    cityResetIds.forEach(id => { $(id).innerHTML = emptyCityContent.get(id); });
    delete $("airQualityCard").dataset.aqiLevel;
    $("humidity").closest?.(".metric")?.removeAttribute("data-humidity-level");
    renderAirQuality(null);
    renderAirParticles(null);
    $("uvScale").hidden = true;
    $("visibilityBadge").hidden = true;
    $("windCompass").style.setProperty?.("--wind-visible","0");
    clearWeatherInsights();
    $("sunDot").hidden = true;
    if ($("moonDot")) $("moonDot").hidden = true;
    $("condition").textContent = "Consultando as condições em " + city.name + "…";
  }
  ["inmet"].forEach(source => {
    $(source + "State").className = "source-state";
    $(source + "State").innerHTML = "<i></i>Consultando";
    $(source + "Content").innerHTML = "<h3>Consultando " + escapeHtml(city.name) + "</h3><p>Buscando informações para a cidade selecionada.</p>";
  });
  $("inmetCard").dataset.severity = "unknown";
  setAlertState("loading");
  $("citySearch").value = "";
  renderCityOptions(); updateCityLabels();
  $("weatherView")?.classList.toggle('initial-loading', !saved);
  if (saved) {
    const savedAir = weatherData?.cachedAir(saved);
    render(saved.data.forecast,savedAir?.air,true,saved.weatherAt || saved.at,{airAt:savedAir?.at});
    setDataStatus(`Atualizando… · leitura salva de ${dataAge(saved.at)}`, true);
  } else {
    setDataStatus("Consultando o tempo em " + city.name);
  }
  refreshAll();
}
function toggleFavoriteCity() {
  if (!activeCity) return false;
  if (favorites.has(activeCity.id)) favorites.delete(activeCity.id);
  else { if (favorites.size >= 30) { $("cityPickerStatus").textContent = "Você pode favoritar até 30 cidades."; return false; } favorites.add(activeCity.id); }
  writePreference("pluvia-favorites", [...favorites]);
  renderCityOptions(); updateCityLabels();
  globalThis.dispatchEvent?.(new CustomEvent('pluvia:favorites-changed',{detail:{ids:[...favorites]}}));
  return true;
}
function setupCityPicker() {
  emptyCityContent = new Map(cityResetIds.map(id => [id,$(id).innerHTML]));
  renderCityOptions(); updateCityLabels();

  let searchTimer;
  $("citySearch").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderCityOptions,120); });
  $("favoriteCity").addEventListener("click", toggleFavoriteCity);
  $("locateCity").addEventListener("click", () => requestLocation('city_picker'));
  $("welcomeLocate").addEventListener("click", () => requestLocation('welcome'));
  $("openCitySearch").addEventListener("click", openCitySearch);
  $("welcomeSearch").addEventListener("click", openCitySearch);
  $("closeCitySearch").addEventListener("click", () => closeCitySearch(true));
  $("cityDialog").addEventListener("close", () => $("openCitySearch").focus());
  $("cityDialog").addEventListener("click", event => {
    if (event.target !== $("cityDialog")) return;
    const box = $("cityDialog").getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeCitySearch(true);
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
  cityChoiceAttempt++;
  // Choosing manually takes precedence over a late location callback.
  locationAttempt++;
  locationPending = false;
  locationButtons(false);
  const examples = [...CAPITALS];
  for (let i = 0; i < Math.min(3, examples.length); i++) {
    const j = i + Math.floor(Math.random() * (examples.length - i));
    [examples[i], examples[j]] = [examples[j], examples[i]];
  }
  $("citySearch").placeholder = "Ex.: " + examples.slice(0, 3).map(city => city.name).join(", ");
  renderCityOptions();
  const dialog = $("cityDialog");
  if (!dialog.open) dialog.showModal();
  dialog.querySelector?.(".dialog-scroll")?.scrollTo?.(0, 0);
  $("closeCitySearch").focus();
  if (!cityIndexReady) {
    $("cityPickerStatus").textContent = "Carregando cidades do Brasil…";
    ensureCityIndex().then(() => renderCityOptions()).catch(() => { $("cityPickerStatus").textContent = "O índice não carregou. Capitais continuam disponíveis."; });
  }
}
function closeCitySearch(animate = false) {
  const dialog = $("cityDialog");
  // O foco volta para a busca só quando o diálogo estava aberto; a escolha automática
  // da cidade (fallback sem localização) não pode roubar o foco ao abrir a página.
  if (!dialog.open) return;
  if (animate && globalThis.PLUVIA?.dialogs) { globalThis.PLUVIA.dialogs.close(dialog); return; }
  dialog.close();
  $("openCitySearch").focus();
}
function requestLocation(source = 'automatic') {
  if (locationPending) return;
  cityChoiceAttempt++;
  globalThis.pluviaAnalytics?.track('Location Requested',{source});
  if (!navigator.geolocation) {
    globalThis.pluviaAnalytics?.track('Location Unavailable',{reason:'unsupported'});
    locationMessage("A localização não está disponível neste navegador. Selecione uma cidade pelo nome.");
    return;
  }
  const attempt = ++locationAttempt;
  locationPending = true;
  locationButtons(true);
  locationMessage("Autorize o acesso à localização para consultar as condições meteorológicas da sua região.");
  navigator.geolocation.getCurrentPosition(position => {
    if (attempt !== locationAttempt) return;
    const applyLocation = () => {
      if (attempt !== locationAttempt) return;
      const city = nearestCity(position.coords.latitude, position.coords.longitude);
      locationPending = false; locationButtons(false);
      globalThis.pluviaAnalytics?.track('Location Authorized',{city:city.name,uf:city.uf});
      chooseCity(city.id, city);
      locationMessage("A previsão usa um ponto de referência a cerca de " + Math.round(city.distanceKm) + " km do centro de " + city.name + ", não o endereço exato.");
    };
    const failLocation = () => {
      if (attempt !== locationAttempt) return;
      locationPending = false; locationButtons(false);
      locationMessage("Não foi possível identificar a cidade. Selecione-a pelo nome.");
    };
    if (municipalitiesReady) applyLocation();
    else ensureMunicipalities().then(applyLocation).catch(failLocation);
  }, error => {
    if (attempt !== locationAttempt) return;
    locationPending = false; locationButtons(false);
    globalThis.pluviaAnalytics?.track(error.code === 1 ? 'Location Denied' : 'Location Unavailable',{reason:error.code === 1 ? 'permission' : error.code === 3 ? 'timeout' : 'position'});
    locationMessage(error.code === 1 ? "Localização não autorizada. Selecione uma cidade sem compartilhar sua posição." : "Não foi possível obter a localização. Tente novamente ou selecione uma cidade.");
  }, {enableHighAccuracy:false,timeout:4000,maximumAge:60000});
}

setupCityPicker();
document.querySelector(".hourly-modes")?.addEventListener("click", event => {
  const button = event.target.closest("button[data-hourly-mode]");
  if (!button || !event.currentTarget.contains(button)) return;
  hourlyMode = button.dataset.hourlyMode;
  event.currentTarget.querySelectorAll("button[data-hourly-mode]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
  const forecast = displayedWeather?.forecast;
  if (forecast) renderHourly(forecast.hourly, selectCurrentHour(forecast.hourly.time), forecast.daily);
});
// "Ver previsão" abre o gráfico por hora, que fica recolhido para não repetir a faixa das próximas horas.
document.querySelector(".hourly-peek-heading a")?.addEventListener("click", () => {
  const details = $("hourlyChartDetails");
  if (details) details.open = true;
});
setupScrollAnimations();
setupPullToRefresh();
updateClock();
setInterval(updateClock, 30000);
requestLocation();
setInterval(() => { if (!document.hidden) refreshAll(); }, AUTO_REFRESH_MS);
document.addEventListener("visibilitychange", () => { if (!document.hidden) updateClock(); refreshIfStale(); });
window.addEventListener("pageshow", () => { updateClock(); refreshIfStale(); });
window.addEventListener("online", () => refreshAll());
document.addEventListener("visibilitychange", () => document.body.classList.toggle("page-hidden", document.hidden));

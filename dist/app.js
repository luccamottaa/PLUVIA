const API = "https://api.open-meteo.com/v1/forecast?latitude=-3.119&longitude=-60.022&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,rain,weather_code,cloud_cover,visibility,wind_speed_10m,relative_humidity_2m,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,rain_sum,precipitation_probability_max,uv_index_max,sunrise,sunset&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm&timezone=America%2FManaus&forecast_days=8";
const AIR_API = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=-3.119&longitude=-60.022&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,us_aqi&timezone=America%2FManaus&forecast_days=3";
const INMET_API = "https://apiprevmet3.inmet.gov.br/avisos/ativos";
const DEFESA_API = "https://www.manaus.am.gov.br/wp-json/wp/v2/posts?search=Defesa%20Civil%20alerta&per_page=8&_fields=date,link,title,excerpt";
const AUTO_REFRESH_MS = 5 * 60 * 1000;
const $ = (id) => document.getElementById(id);
let lastRefreshAt = 0;
let refreshInFlight = null;

const weatherMap = {
  0: ["Céu limpo", "☀"], 1: ["Predomínio de sol", "◒"], 2: ["Parcialmente nublado", "◑"], 3: ["Céu encoberto", "☁"],
  45: ["Neblina", "≋"], 48: ["Neblina com depósito", "≋"], 51: ["Garoa fraca", "⌇"], 53: ["Garoa", "⌇"], 55: ["Garoa intensa", "⌇"],
  61: ["Chuva fraca", "☂"], 63: ["Chuva moderada", "☂"], 65: ["Chuva forte", "☂"], 80: ["Pancadas fracas", "☔"], 81: ["Pancadas de chuva", "☔"], 82: ["Pancadas fortes", "☔"],
  95: ["Trovoadas", "ϟ"], 96: ["Trovoadas com granizo", "ϟ"], 99: ["Trovoadas fortes", "ϟ"]
};
const weather = (code) => weatherMap[code] || ["Tempo variável", "◒"];

function weatherIconType(code) {
  if ([95, 96, 99].includes(code)) return "storm";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "rain";
  if ([3, 45, 48].includes(code)) return "cloud";
  if ([1, 2].includes(code)) return "partly";
  return "sun";
}

function weatherIconSvg(code) {
  const type = weatherIconType(code);
  const sun = `<g class="wx-sun">
    <g class="wx-sun-rays">
      <path d="M52 5v10M52 69v10M15 42H5M99 42H89M26 16l7 7M78 61l7 7M26 68l7-7M78 23l7-7" />
    </g>
    <circle class="wx-sun-core" cx="52" cy="42" r="20" />
    <circle class="wx-sun-glass" cx="46" cy="36" r="7" />
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
  if (value < 3) return "Baixo";
  if (value < 6) return "Moderado";
  if (value < 8) return "Alto — proteção";
  if (value < 11) return "Muito alto";
  return "Extremo";
}

function humidityLabel(value) {
  if (value >= 85) return "Ar bem carregado";
  if (value >= 70) return "Alta, padrão Manaus";
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
  if (value <= 150) return "Grupos sensíveis devem reduzir esforço prolongado ao ar livre.";
  if (value <= 200) return "Evite exercício intenso ao ar livre e mantenha atenção a sintomas respiratórios.";
  return "Reduza a exposição externa e siga orientações das autoridades de saúde.";
}

function decodeHtml(value = "") {
  const doc = new DOMParser().parseFromString(value, "text/html");
  return doc.documentElement.textContent || "";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>\"']/g, char => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#039;"})[char]);
}

function safeManausUrl(value = "") {
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname.endsWith("manaus.am.gov.br") ? url.href : "https://www.manaus.am.gov.br/?s=defesa+civil"; }
  catch { return "https://www.manaus.am.gov.br/?s=defesa+civil"; }
}

function firstValue(obj, keys, fallback = "") {
  for (const key of keys) if (obj?.[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  return fallback;
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw)) return raw;
  for (const key of ["avisos", "alerts", "data", "features", "result"]) if (Array.isArray(raw?.[key])) return raw[key].map(v => v?.properties || v);
  return [];
}

function severityClass(alert) {
  const text = JSON.stringify(alert).toLowerCase();
  if (text.includes("grande perigo") || text.includes("vermelh")) return "danger";
  if ((text.includes("perigo") && !text.includes("potencial")) || text.includes("laranja")) return "warning";
  return "ok";
}

function alertCoversManaus(alert) {
  const text = JSON.stringify(alert).toLowerCase();
  return text.includes("manaus") || text.includes("amazonas") || /\"uf\"\s*:\s*\"am\"/.test(text) || /\"sigla\"\s*:\s*\"am\"/.test(text);
}

async function loadInmetAlerts() {
  const state = $("inmetState"); const content = $("inmetContent");
  try {
    const response = await fetch(INMET_API); if (!response.ok) throw new Error("INMET indisponível");
    const alerts = normalizeAlerts(await response.json()).filter(alertCoversManaus);
    if (!alerts.length) {
      state.className = "source-state ok"; state.innerHTML = "<i></i>Sem aviso ativo";
      content.innerHTML = "<h3>Nenhum aviso para Manaus</h3><p>O INMET não lista aviso meteorológico ativo abrangendo Manaus ou o Amazonas neste momento.</p>";
      return;
    }
    const alert = alerts.sort((a,b) => severityClass(a) === "danger" ? -1 : severityClass(b) === "danger" ? 1 : 0)[0];
    const klass = severityClass(alert); const title = firstValue(alert, ["evento", "tipo", "titulo", "aviso", "descricao"], "Aviso meteorológico");
    const severity = firstValue(alert, ["severidade", "nivel", "severity", "aviso_cor"], klass === "danger" ? "Grande perigo" : klass === "warning" ? "Perigo" : "Perigo potencial");
    const end = firstValue(alert, ["data_fim", "fim", "expires", "termino"], ""); const risks = firstValue(alert, ["riscos", "instrucao", "descricao"], "Consulte os detalhes e as orientações no mapa oficial do INMET.");
    state.className = `source-state ${klass}`; state.innerHTML = `<i></i>${alerts.length} aviso${alerts.length > 1 ? "s" : ""} ativo${alerts.length > 1 ? "s" : ""}`;
    content.innerHTML = `<h3>${escapeHtml(decodeHtml(String(title)))}</h3><p>${escapeHtml(decodeHtml(String(risks)).slice(0, 220))}</p><div class="source-meta"><span>${escapeHtml(decodeHtml(String(severity)))}</span>${end ? `<span>Até ${escapeHtml(String(end).slice(0,16).replace("T", " "))}</span>` : ""}</div>`;
  } catch {
    state.className = "source-state warning"; state.innerHTML = "<i></i>Consulta indisponível";
    content.innerHTML = "<h3>Abra o mapa do INMET</h3><p>A fonte automática não respondeu agora. Use o atalho abaixo para conferir os avisos oficiais diretamente no INMET.</p>";
  }
}

async function loadDefesaAlerts() {
  const state = $("defesaState"); const content = $("defesaContent");
  try {
    const response = await fetch(DEFESA_API); if (!response.ok) throw new Error("Defesa Civil indisponível");
    const posts = await response.json();
    const relevant = posts.filter(p => /alerta|chuva|alagamento|deslizamento|temporal|vendaval/i.test(decodeHtml(p.title?.rendered || "")));
    const latest = relevant[0]; const ageHours = latest ? (Date.now() - new Date(latest.date).getTime()) / 3600000 : Infinity;
    if (!latest || ageHours > 48) {
      state.className = "source-state ok"; state.innerHTML = "<i></i>Sem alerta recente";
      const lastLink = latest ? `<a href="${safeManausUrl(latest.link)}" target="_blank" rel="noreferrer">Ver último comunicado oficial ↗</a>` : "";
      content.innerHTML = `<h3>Nenhum comunicado ativo</h3><p>Não há publicação de alerta da Defesa Civil de Manaus nas últimas 48 horas. ${lastLink}</p>`;
      return;
    }
    const title = decodeHtml(latest.title?.rendered || "Comunicado da Defesa Civil"); const summary = decodeHtml(latest.excerpt?.rendered || "Consulte as orientações oficiais da Prefeitura de Manaus.");
    state.className = "source-state danger"; state.innerHTML = "<i></i>Comunicado recente";
    content.innerHTML = `<h3>${escapeHtml(title)}</h3><p>${escapeHtml(summary.slice(0, 210))}</p><div class="source-meta"><span>${new Intl.DateTimeFormat("pt-BR", {dateStyle:"short", timeStyle:"short", timeZone:"America/Manaus"}).format(new Date(latest.date))}</span><span><a href="${safeManausUrl(latest.link)}" target="_blank" rel="noreferrer">Ler publicação ↗</a></span></div>`;
  } catch {
    state.className = "source-state warning"; state.innerHTML = "<i></i>Canal direto";
    content.innerHTML = "<h3>Alertas direto no celular</h3><p>O portal municipal não respondeu. Envie seu CEP por SMS para 40199; alertas extremos também chegam automaticamente em celulares compatíveis.</p>";
  }
}

function updateClock() {
  const now = new Date();
  $("localClock").textContent = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Manaus", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  $("localDate").textContent = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Manaus", weekday: "long", day: "numeric", month: "long" }).format(now).replace(/^./, c => c.toUpperCase());
}

function selectCurrentHour(times) {
  const local = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Manaus", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" }).format(new Date()).replace(" ", "T");
  let index = times.findIndex(t => t.startsWith(local));
  if (index < 0) index = times.findIndex(t => new Date(t) >= new Date());
  return Math.max(0, index);
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
  const next3Prob = Math.max(...data.hourly.precipitation_probability.slice(start, start + 4));
  const next3Rain = data.hourly.precipitation.slice(start, start + 4).reduce((a, b) => a + b, 0);
  const next3Codes = data.hourly.weather_code.slice(start, start + 4);
  const stormExpected = next3Codes.some(code => [95, 96, 99].includes(code));
  const feels = data.current.apparent_temperature;
  const humidity = data.current.relative_humidity_2m;
  const card = $("attentionCard");
  card.classList.remove("ok", "warning", "danger");
  let state = "ok", signal = "NORMAL", title = "Condições dentro do normal", text = "Nenhum sinal crítico para Manaus nas próximas horas.", icon = "normal", level = 28;
  if (stormExpected && next3Prob >= 60) {
    state = "danger"; signal = "ALERTA SEVERO"; title = "Alerta de tempestade"; text = `Há indicação de trovoadas e ${Math.round(next3Prob)}% de chance de chuva nas próximas horas.`; icon = "severe"; level = 96;
  } else if (next3Prob >= 80 && next3Rain >= 8) {
    state = "danger"; signal = "ALERTA SEVERO"; title = "Alerta de chuva severa"; text = `${Math.round(next3Prob)}% de chance e cerca de ${fmt(next3Rain, 1)} mm previstos nas próximas 3 horas.`; icon = "severe"; level = 92;
  } else if (next3Prob >= 65) {
    state = "warning"; signal = "ATENÇÃO"; title = "Chuva pode apertar"; text = `A chance chega a ${Math.round(next3Prob)}% nas próximas horas. Melhor não confiar naquele céu quietinho.`; icon = "rain"; level = 70;
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
}

function findDryWindow(hourly, start) {
  for (let i = start; i < Math.min(hourly.time.length - 2, start + 36); i++) {
    if (hourly.precipitation_probability[i] < 30 && hourly.precipitation_probability[i + 1] < 30) {
      const day = i < start + 24 ? (i === start ? "Agora" : (i < start + 12 ? "Hoje" : "Mais tarde")) : "Amanhã";
      return `${day}, ${shortTime(hourly.time[i])}–${shortTime(hourly.time[i + 2])}`;
    }
  }
  return "Sem janela clara em 36h";
}

function renderRain(hourly, start) {
  const indices = Array.from({length: 14}, (_, i) => start + i).filter(i => i < hourly.time.length);
  $("rainChart").innerHTML = indices.map((i, p) => {
    const prob = Math.round(hourly.precipitation_probability[i] || 0);
    const mm = hourly.precipitation[i] || 0;
    return `<div class="hour-column ${p === 0 ? "now" : ""}">
      <span class="hour-time">${p === 0 ? "AGORA" : shortTime(hourly.time[i])}</span>
      <div class="bar-area"><div class="rain-bar" data-prob="${prob}" style="height:${Math.max(3, prob * 1.28)}px"></div></div>
      <span class="rain-mm">${fmt(mm, 1)} mm</span><span class="hour-icon">${weather(hourly.weather_code[i])[1]}</span>
    </div>`;
  }).join("");
  $("dryWindow").textContent = findDryWindow(hourly, start);
}

function renderForecast(daily) {
  const days = daily.time.slice(0, 7);
  const minAll = Math.min(...daily.temperature_2m_min); const maxAll = Math.max(...daily.temperature_2m_max); const spread = Math.max(1, maxAll - minAll);
  $("forecastList").innerHTML = days.map((date, i) => {
    const d = new Date(`${date}T12:00:00`);
    const day = i === 0 ? "Hoje" : new Intl.DateTimeFormat("pt-BR", {weekday: "long"}).format(d).replace(/^./, c => c.toUpperCase());
    const label = new Intl.DateTimeFormat("pt-BR", {day: "2-digit", month: "short"}).format(d).replace(".", "");
    const [cond, icon] = weather(daily.weather_code[i]); const min = daily.temperature_2m_min[i]; const max = daily.temperature_2m_max[i];
    const width = Math.max(25, ((max - min) / spread) * 100);
    return `<div class="forecast-row">
      <div class="forecast-day"><strong>${day}</strong><span>${label}</span></div>
      <div class="forecast-condition"><i>${icon}</i><span>${cond}</span></div>
      <div class="temp-range"><strong>${Math.round(min)}°</strong><div class="temp-track"><span style="width:${width}%"></span></div><strong>${Math.round(max)}°</strong></div>
      <div class="forecast-rain"><span>☂</span><span>${Math.round(daily.precipitation_probability_max[i] || 0)}% · ${fmt(daily.precipitation_sum[i] || 0, 1)} mm</span></div>
      <div class="forecast-uv">UV máx. ${fmt(daily.uv_index_max[i], 0)}</div>
    </div>`;
  }).join("");
}

function renderSun(daily) {
  const rise = new Date(daily.sunrise[0]); const set = new Date(daily.sunset[0]); const minutes = Math.round((set - rise) / 60000);
  $("sunrise").textContent = shortTime(daily.sunrise[0]); $("sunset").textContent = shortTime(daily.sunset[0]);
  $("daylight").textContent = `${Math.floor(minutes / 60)}h ${minutes % 60}min de luz`;
  const now = new Date(); const progress = Math.min(1, Math.max(0, (now - rise) / (set - rise)));
  $("sunDot").style.left = `${3 + progress * 91}%`; $("sunDot").style.top = `${74 - Math.sin(progress * Math.PI) * 58}px`;
  $("sunPhrase").textContent = now < rise ? "O sol ainda não nasceu." : now > set ? "O sol já se pôs em Manaus." : `Restam cerca de ${Math.max(0, Math.round((set - now) / 3600000))}h de claridade.`;
}

function cache(data) { try { localStorage.setItem("manaus-clima-cache", JSON.stringify({at: Date.now(), data})); } catch {} }
function cached() { try { return JSON.parse(localStorage.getItem("manaus-clima-cache") || "null"); } catch { return null; } }

function render(data, air, fromCache = false) {
  const current = data.current; const day = data.daily; const start = selectCurrentHour(data.hourly.time); const [condition] = weather(current.weather_code);
  $("temperature").textContent = fmt(current.temperature_2m); $("feelsLike").textContent = `${fmt(current.apparent_temperature)}°`;
  $("condition").textContent = condition; $("weatherGlyph").innerHTML = weatherIconSvg(current.weather_code); $("highLow").textContent = `${fmt(day.temperature_2m_max[0])}° / ${fmt(day.temperature_2m_min[0])}°`;
  $("rainNow").textContent = `${fmt(current.precipitation, 1)} mm`; $("humidity").innerHTML = `${fmt(current.relative_humidity_2m)}<sup>%</sup>`; $("humidityNote").textContent = humidityLabel(current.relative_humidity_2m);
  $("wind").innerHTML = `${fmt(current.wind_speed_10m)}<sup> km/h</sup>`; $("windNote").textContent = `${windDirection(current.wind_direction_10m)} · rajadas ${fmt(current.wind_gusts_10m)} km/h`;
  $("pressure").innerHTML = `${fmt(current.surface_pressure)}<sup> hPa</sup>`; $("pressureNote").textContent = pressureLabel(current.surface_pressure);
  const uvNow = data.hourly.uv_index[start]; $("uv").textContent = fmt(uvNow, 1); $("uvNote").textContent = uvLabel(uvNow);
  const [airName, airText] = aqiLabel(air?.current?.us_aqi); $("airQuality").textContent = airName; $("airNote").textContent = airText;
  const airIndex = air?.current?.us_aqi; $("airScore").textContent = Number.isFinite(airIndex) ? Math.round(airIndex) : "--"; $("airCardQuality").textContent = airName;
  $("pm25").textContent = fmt(air?.current?.pm2_5, 1); $("pm10").textContent = fmt(air?.current?.pm10, 1); $("airGuidance").textContent = airGuidance(airIndex);
  $("updatedAt").textContent = fromCache ? "ÚLTIMO REGISTRO" : `ATUALIZADO ${shortTime(current.time)}`; $("statusText").textContent = fromCache ? "Dados salvos neste aparelho" : "Dados meteorológicos ao vivo";
  $("footerUpdate").textContent = `Última atualização: ${shortTime(current.time)} AMT`;
  renderAttention(data, start); renderRain(data.hourly, start); renderForecast(day); renderSun(day);
}

async function loadWeather(showSpinner = true) {
  if (showSpinner) $("refreshBtn").classList.add("loading");
  try {
    const [forecastResponse, airResponse] = await Promise.all([fetch(API), fetch(AIR_API)]);
    if (!forecastResponse.ok) throw new Error("forecast unavailable");
    const data = await forecastResponse.json(); const air = airResponse.ok ? await airResponse.json() : null;
    render(data, air); cache({forecast: data, air});
  } catch (error) {
    const saved = cached(); if (saved?.data?.forecast) render(saved.data.forecast, saved.data.air, true);
    $("statusText").textContent = saved ? "Usando a última atualização salva" : "Conexão indisponível";
    $("errorToast").classList.add("show"); setTimeout(() => $("errorToast").classList.remove("show"), 5000);
  } finally { $("refreshBtn").classList.remove("loading"); }
}

async function refreshAll(showSpinner = false) {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = Promise.allSettled([
    loadWeather(showSpinner),
    loadInmetAlerts(),
    loadDefesaAlerts()
  ]);

  try {
    await refreshInFlight;
    lastRefreshAt = Date.now();
  } finally {
    refreshInFlight = null;
  }
}

function refreshIfStale() {
  if (!document.hidden && Date.now() - lastRefreshAt >= 60 * 1000) refreshAll(false);
}

$("refreshBtn").addEventListener("click", () => refreshAll(true));
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

setupScrollAnimations();
updateClock();
setInterval(updateClock, 30000);
refreshAll(true);
setInterval(() => { if (!document.hidden) refreshAll(false); }, AUTO_REFRESH_MS);
document.addEventListener("visibilitychange", refreshIfStale);
window.addEventListener("online", () => refreshAll(false));

// Placar de acerto da previsão: funções puras usadas por forecast-verify (e pelos testes).
// Capitais: id IBGE, nome, latitude e longitude de referência (as mesmas de dist/capitals.js).
export const CAPITALS = [
  ["2800308","Aracaju",-10.911,-37.071],["1501402","Belém",-1.456,-48.504],["3106200","Belo Horizonte",-19.92,-43.938],
  ["1400100","Boa Vista",2.824,-60.675],["5300108","Brasília",-15.794,-47.883],["5002704","Campo Grande",-20.443,-54.646],
  ["5103403","Cuiabá",-15.601,-56.097],["4106902","Curitiba",-25.429,-49.272],["4205407","Florianópolis",-27.595,-48.548],
  ["2304400","Fortaleza",-3.732,-38.527],["5208707","Goiânia",-16.686,-49.264],["2507507","João Pessoa",-7.115,-34.864],
  ["1600303","Macapá",0.035,-51.07],["2704302","Maceió",-9.665,-35.735],["1302603","Manaus",-3.119,-60.022],
  ["2408102","Natal",-5.795,-35.209],["1721000","Palmas",-10.185,-48.334],["4314902","Porto Alegre",-30.034,-51.23],
  ["1100205","Porto Velho",-8.761,-63.9],["2611606","Recife",-8.054,-34.881],["1200401","Rio Branco",-9.975,-67.825],
  ["3304557","Rio de Janeiro",-22.907,-43.173],["2927408","Salvador",-12.971,-38.501],["2111300","São Luís",-2.53,-44.306],
  ["3550308","São Paulo",-23.551,-46.633],["2211001","Teresina",-5.092,-42.803],["3205309","Vitória",-20.316,-40.312],
].map(([id, name, lat, lon]) => ({id, name, lat, lon}));

// best_match é o que o PLUVIA mostra hoje; os outros são os candidatos a substituí-lo.
export const MODELS = ["best_match", "ecmwf_ifs025", "gfs_seamless", "icon_seamless"];
export const LEADS = [6, 24];
const HOUR = 3600_000;

export function forecastUrl(cities = CAPITALS) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", cities.map(city => city.lat).join(","));
  url.searchParams.set("longitude", cities.map(city => city.lon).join(","));
  url.searchParams.set("hourly", "temperature_2m,precipitation");
  url.searchParams.set("models", MODELS.join(","));
  url.searchParams.set("forecast_days", "3");
  url.searchParams.set("timezone", "GMT");
  url.searchParams.set("timeformat", "unixtime");
  // Vírgulas literais: o Open-Meteo não aceita %2C na lista de coordenadas.
  return url.href.replace(/%2C/g, ",");
}

const finite = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;

// Para cada cidade, modelo e antecedência, a previsão para a hora cheia `lead` horas à frente. Chuva
// do Open-Meteo é o acumulado da hora que termina no horário, o mesmo período da estação do INMET.
export function buildSamples(payload, cities = CAPITALS, now = Date.now()) {
  const list = Array.isArray(payload) ? payload : [payload];
  if (list.length !== cities.length) throw new Error("invalid_provider_data");
  const base = Math.floor(now / HOUR) * HOUR;
  const samples = [];
  list.forEach((entry, index) => {
    const times = entry?.hourly?.time;
    if (!Array.isArray(times)) return;
    for (const lead of LEADS) {
      const target = base + lead * HOUR, at = times.indexOf(target / 1000);
      if (at < 0) continue;
      for (const model of MODELS) {
        const temp = finite(entry.hourly[`temperature_2m_${model}`]?.[at], -40, 60);
        const precip = finite(entry.hourly[`precipitation_${model}`]?.[at], 0, 300);
        if (temp === null && precip === null) continue;
        samples.push({city_id:cities[index].id, model, lead_hours:lead, target_at:new Date(target).toISOString(), temp_c:temp, precip_mm:precip});
      }
    }
  });
  return samples;
}

// Leitura da estação (normalizeStation) → observação na hora cheia que ela fecha.
export function observationFrom(city, reading) {
  if (!reading?.station || typeof reading.time !== "string") return null;
  const at = Date.parse(reading.time);
  if (!Number.isFinite(at) || at % HOUR !== 0) return null;
  const temp = finite(reading.temperatureC, -40, 60), precip = finite(reading.rainMm, 0, 300);
  if (temp === null && precip === null) return null;
  return {city_id:city.id, observed_at:new Date(at).toISOString(), temp_c:temp, precip_mm:precip,
    station_ibge:reading.station.ibge || null, distance_km:finite(reading.station.distanceKm, 0, 60)};
}

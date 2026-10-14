/* Chuva observada (pedido do usuário, outubro/2026): os modelos globais erram o horário e o lugar das
   pancadas na Amazônia. Em Manaus, em 13/10/2026, a estação do INMET mediu 5,2 mm à 1h e 10,2 mm entre
   11h e 13h, e os aeroportos relataram trovoada (TS/TSRA) de madrugada, enquanto a previsão dizia nublado
   ou garoa de 0,1 mm. Quando uma observação recente mostra chuva na cidade, o topo, o céu e o "Vai chover?"
   passam a dizer chuva, com a fonte e o horário.
   Fontes, pela ordem: trovoada relatada pelo aeroporto mais próximo (METAR/SPECI), chuva medida pela
   estação do INMET, chuva relatada pelo aeroporto, eco do radar. Trovoada: confirmada pelo aeroporto (no
   local ou nas proximidades, com chuva observada) ou inferida pelo CAPE ≥ 1.500 J/kg da hora (o modelo
   quase nunca dá o código 95 em Manaus); o texto diz qual dos dois.
   Só eleva: estação sem chuva, aeroporto sem tempo significativo ou radar sem eco nunca viram "tempo seco".
   Funções puras; app.js faz a pintura. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).observedRain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // A leitura da estação cobre a hora que termina em `at`; depois de 45 min ela já não diz nada sobre agora.
  const STATION_MAX_AGE_MS = 45 * 60_000;
  // Pluviômetro de báscula: 0,2 mm é o menor registro.
  const STATION_MIN_MM = 0.2;
  // METAR sai de hora em hora (SPECI quando o tempo muda): um boletim com mais de 75 min não é "agora".
  const AIRPORT_MAX_AGE_MS = 75 * 60_000;
  // A imagem de radar sai a cada 10 min; mais velha que 20 min não é "agora".
  const RADAR_MAX_AGE_MS = 20 * 60_000;
  const FUTURE_MS = 15 * 60_000;
  const STORM_CAPE = 1500;

  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const fresh = (at, now, max) => finite(at) && now - at <= max && at - now <= FUTURE_MS;
  // Mesmos limites de intensidade do "Vai chover?" (mm/h): fraca < 2,5, moderada < 7,5, forte.
  const codeFor = mm => mm < 2.5 ? 61 : mm < 7.5 ? 63 : 65;
  const RANK = {51:1, 53:2, 55:3, 56:2, 57:3, 61:2, 63:4, 65:6, 66:2, 67:4, 80:2, 81:4, 82:6, 95:8};
  const wet = code => finite(code) && code >= 51;
  const RAIN_CODES = {light:61, moderate:63, heavy:65};
  const SHOWER_CODES = {light:80, moderate:81, heavy:82};

  function fromStation(reading, now = Date.now()) {
    if (!reading || !finite(reading.rainMm) || !fresh(reading.at, now, STATION_MAX_AGE_MS) || reading.rainMm < STATION_MIN_MM) return null;
    return {source:'station', at:reading.at, mm:reading.rainMm, code:codeFor(reading.rainMm)};
  }
  const airportInfo = airport => ({icao:airport.icao, distanceKm:finite(airport.distanceKm) ? airport.distanceKm : null, at:airport.at});
  // Tempo presente no aeroporto (não "nas proximidades").
  function fromAirport(airport, now = Date.now()) {
    const weather = airport?.weather;
    if (!weather || !fresh(airport.at, now, AIRPORT_MAX_AGE_MS)) return null;
    const base = {source:'airport', at:airport.at, mm:null, airport:airportInfo(airport), rain:weather.rain || null, showers:weather.showers === true};
    if (weather.thunder === true) return {...base, code:95, storm:true, stormSource:'airport'};
    if (RAIN_CODES[weather.rain]) return {...base, code:(weather.showers ? SHOWER_CODES : RAIN_CODES)[weather.rain]};
    if (weather.drizzle === true) return {...base, code:51, drizzle:true};
    return null;
  }
  function fromRadar(snapshot, now = Date.now()) {
    if (snapshot?.status !== 'ready' || snapshot.precipitating !== true || !fresh(snapshot.frameAt, now, RADAR_MAX_AGE_MS)) return null;
    // O radar não diz a intensidade com segurança (paleta pública sem dBZ): só "chuva".
    return {source:'radar', at:snapshot.frameAt, mm:null, code:61};
  }
  // Chuva ou trovoada nas proximidades do aeroporto (VCSH/VCTS), sem tempo significativo no próprio aeroporto.
  function nearby({airport = null, now = Date.now()} = {}) {
    const weather = airport?.weather;
    if (!weather || !fresh(airport.at, now, AIRPORT_MAX_AGE_MS) || weather.thunder || weather.rain || weather.drizzle) return null;
    if (!weather.nearbyThunder && !weather.nearbyShowers) return null;
    return {...airportInfo(airport), thunder:weather.nearbyThunder === true};
  }
  function pick({station = null, airport = null, radar = null, now = Date.now()} = {}) {
    const atAirport = fromAirport(airport, now);
    if (atAirport?.storm) return atAirport;
    const observed = fromStation(station, now) || atAirport || fromRadar(radar, now);
    if (!observed) return null;
    // Chuva observada com trovoada relatada nas proximidades: tempestade confirmada.
    const close = airport?.weather?.nearbyThunder === true && fresh(airport.at, now, AIRPORT_MAX_AGE_MS);
    return close ? {...observed, code:95, storm:true, stormSource:'nearby', airport:airportInfo(airport)} : observed;
  }
  // CAPE da hora atual (modelo): com chuva observada e ar muito instável, a chuva é de trovoada.
  function withStorm(observed, cape) {
    if (!observed || observed.storm || !finite(cape) || cape < STORM_CAPE) return observed;
    return {...observed, code:95, storm:true, stormSource:'cape'};
  }

  // Código mostrado: trovoada do modelo continua trovoada; chuva do modelo igual ou mais forte continua.
  function merge(modelCode, observed) {
    if (!observed) return modelCode;
    if (finite(modelCode) && modelCode >= 95) return modelCode;
    if (wet(modelCode) && (RANK[modelCode] ?? 0) >= (RANK[observed.code] ?? 0)) return modelCode;
    return observed.code;
  }

  const where = (airport, {number}) => `o aeroporto mais próximo (${airport.icao}${finite(airport.distanceKm) ? `, a ${number(airport.distanceKm, 0)} km` : ''})`;
  const rainName = observed => observed.drizzle ? 'garoa' : `${observed.showers ? 'pancadas de chuva' : 'chuva'}${{light:' fraca', heavy:' forte'}[observed.rain] || ''}`;
  // Frase do "Vai chover?" com a fonte e o horário. `time` formata um instante no fuso da cidade e
  // `number(valor, casas)` formata números.
  function answer(observed, helpers) {
    if (!observed) return null;
    const {time, number} = helpers;
    const tone = observed.storm ? 'storm' : 'rain';
    let storm = '';
    if (observed.stormSource === 'cape') storm = ' Ar muito instável: trovoada provável.';
    else if (observed.stormSource === 'nearby') storm = ` ${where(observed.airport, helpers).replace(/^o/, 'O')} relatou trovoada nas proximidades às ${time(observed.airport.at)}.`;
    let text;
    if (observed.source === 'airport' && observed.stormSource === 'airport') {
      text = `Trovoada${observed.rain ? ' com chuva' : ''} agora, segundo ${where(observed.airport, helpers)}, às ${time(observed.at)}.`;
    } else if (observed.source === 'airport') {
      const name = rainName(observed);
      text = `${name[0].toUpperCase()}${name.slice(1)} agora, segundo ${where(observed.airport, helpers)}, às ${time(observed.at)}.${storm}`;
    } else if (observed.source === 'station') {
      text = `Chuva na última hora: ${number(observed.mm, 1)} mm medidos pela estação do INMET (${time(observed.at - 3600_000)}–${time(observed.at)}).${storm}`;
    } else {
      text = `Chuva no radar agora, em cima da cidade (imagem das ${time(observed.at)}).${storm}`;
    }
    return {tone, observed:true, text};
  }
  function nearbyAnswer(item, helpers) {
    if (!item) return null;
    const what = item.thunder ? 'Trovoada' : 'Pancadas de chuva';
    return {tone:'maybe', observed:true, text:`${what} nas proximidades: ${where(item, helpers)} relatou às ${helpers.time(item.at)}. A chuva pode chegar.`};
  }
  // Nome curto da condição: trovoada relatada sem chuva é "Trovoada"; radar, só "Chuva".
  function label(observed, weatherLabel) {
    if (observed?.storm) return observed.source === 'airport' && observed.stormSource === 'airport' && !observed.rain ? 'Trovoada' : 'Chuva com trovoada';
    return observed?.source === 'radar' ? 'Chuva' : weatherLabel;
  }
  // Igualdade para não repintar à toa quando a mesma leitura chega de novo.
  const key = observed => observed ? `${observed.source}:${observed.at}:${observed.code}:${observed.stormSource || ''}` : '';

  return {STATION_MAX_AGE_MS, STATION_MIN_MM, AIRPORT_MAX_AGE_MS, RADAR_MAX_AGE_MS, STORM_CAPE, codeFor,
    fromStation, fromAirport, fromRadar, nearby, pick, withStorm, merge, answer, nearbyAnswer, label, key};
});

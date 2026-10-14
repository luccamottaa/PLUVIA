/* Chuva observada (pedido do usuário, outubro/2026): os modelos globais erram o horário e o lugar das
   pancadas na Amazônia. Em Manaus, em 13/10/2026, a estação do INMET mediu 5,2 mm à 1h e 10,2 mm entre
   11h e 13h, enquanto a previsão dizia nublado ou garoa de 0,1 mm. Quando uma medição recente mostra chuva
   na cidade, o topo, o céu e o "Vai chover?" passam a dizer chuva, com a fonte e o horário.
   Só eleva: estação sem chuva ou radar sem eco nunca viram "tempo seco" (ausência de eco não prova céu
   seco, e a estação mede um ponto). Funções puras; app.js faz a pintura.
   Trovoada: o modelo quase nunca dá o código 95 em Manaus, mas o ar fica com CAPE de 1.700 a 4.600 J/kg
   nesses dias. Chuva medida com CAPE ≥ 1.500 J/kg na hora (instabilidade forte) vira "trovoada provável"
   e liga os raios do céu; o texto diz que é inferência, não detecção de raios. */
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
  // A imagem de radar sai a cada 10 min; mais velha que 20 min não é "agora".
  const RADAR_MAX_AGE_MS = 20 * 60_000;
  const FUTURE_MS = 15 * 60_000;
  const STORM_CAPE = 1500;

  const finite = value => typeof value === 'number' && Number.isFinite(value);
  // Mesmos limites de intensidade do "Vai chover?" (mm/h): fraca < 2,5, moderada < 7,5, forte.
  const codeFor = mm => mm < 2.5 ? 61 : mm < 7.5 ? 63 : 65;
  const RANK = {51:1, 53:2, 55:3, 56:2, 57:3, 61:2, 63:4, 65:6, 66:2, 67:4, 80:2, 81:4, 82:6, 95:8};
  const wet = code => finite(code) && code >= 51;

  function fromStation(reading, now = Date.now()) {
    if (!reading || !finite(reading.at) || !finite(reading.rainMm)) return null;
    const age = now - reading.at;
    if (age > STATION_MAX_AGE_MS || age < -FUTURE_MS || reading.rainMm < STATION_MIN_MM) return null;
    return {source:'station', at:reading.at, mm:reading.rainMm, code:codeFor(reading.rainMm)};
  }
  function fromRadar(snapshot, now = Date.now()) {
    if (snapshot?.status !== 'ready' || snapshot.precipitating !== true || !finite(snapshot.frameAt)) return null;
    const age = now - snapshot.frameAt;
    if (age > RADAR_MAX_AGE_MS || age < -FUTURE_MS) return null;
    // O radar não diz a intensidade com segurança (paleta pública sem dBZ): só "chuva".
    return {source:'radar', at:snapshot.frameAt, mm:null, code:61};
  }
  // A estação mede no chão e dá a intensidade; o radar fica de reserva.
  const pick = ({station = null, radar = null, now = Date.now()} = {}) => fromStation(station, now) || fromRadar(radar, now);
  // CAPE da hora atual (modelo): com chuva medida e ar muito instável, a chuva é de trovoada.
  function withStorm(observed, cape) {
    if (!observed || !finite(cape) || cape < STORM_CAPE) return observed;
    return {...observed, code:95, storm:true};
  }

  // Código mostrado: trovoada do modelo continua trovoada; chuva do modelo igual ou mais forte continua.
  function merge(modelCode, observed) {
    if (!observed) return modelCode;
    if (finite(modelCode) && modelCode >= 95) return modelCode;
    if (wet(modelCode) && (RANK[modelCode] ?? 0) >= (RANK[observed.code] ?? 0)) return modelCode;
    return observed.code;
  }

  // Frase do "Vai chover?" com a fonte e o horário. `time` formata um instante no fuso da cidade e
  // `number` formata milímetros com uma casa.
  function answer(observed, {time, number}) {
    if (!observed) return null;
    const tone = observed.storm ? 'storm' : 'rain', storm = observed.storm ? ' Ar muito instável: trovoada provável.' : '';
    if (observed.source === 'station') {
      return {tone, observed:true,
        text:`Chuva na última hora: ${number(observed.mm)} mm medidos pela estação do INMET (${time(observed.at - 3600_000)}–${time(observed.at)}).${storm}`};
    }
    return {tone, observed:true, text:`Chuva no radar agora, em cima da cidade (imagem das ${time(observed.at)}).${storm}`};
  }
  // Nome curto da condição: a estação dá a intensidade; o radar, só "Chuva".
  const label = (observed, weatherLabel) => observed?.storm ? 'Chuva com trovoada' : observed?.source === 'radar' ? 'Chuva' : weatherLabel;
  // Igualdade para não repintar à toa quando a mesma leitura chega de novo.
  const key = observed => observed ? `${observed.source}:${observed.at}:${observed.code}` : '';

  return {STATION_MAX_AGE_MS, STATION_MIN_MM, RADAR_MAX_AGE_MS, STORM_CAPE, codeFor, fromStation, fromRadar, pick, withStorm, merge, answer, label, key};
});

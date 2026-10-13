/* Chuva observada (pedido do usuário, outubro/2026): os modelos globais erram o horário e o lugar das
   pancadas na Amazônia. Em Manaus, em 13/10/2026, a estação do INMET mediu 5,2 mm à 1h e 10,2 mm entre
   11h e 13h, enquanto a previsão dizia nublado ou garoa de 0,1 mm. Quando uma medição recente mostra chuva
   na cidade, o topo, o céu e o "Vai chover?" passam a dizer chuva, com a fonte e o horário.
   Só eleva: estação sem chuva ou radar sem eco nunca viram "tempo seco" (ausência de eco não prova céu
   seco, e a estação mede um ponto). Funções puras; app.js faz a pintura. */
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

  const finite = value => typeof value === 'number' && Number.isFinite(value);
  // Mesmos limites de intensidade do "Vai chover?" (mm/h): fraca < 2,5, moderada < 7,5, forte.
  const codeFor = mm => mm < 2.5 ? 61 : mm < 7.5 ? 63 : 65;
  const RANK = {51:1, 53:2, 55:3, 56:2, 57:3, 61:2, 63:4, 65:6, 66:2, 67:4, 80:2, 81:4, 82:6};
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
    if (observed.source === 'station') {
      return {tone:'rain', observed:true,
        text:`Chuva na última hora: ${number(observed.mm)} mm medidos pela estação do INMET (${time(observed.at - 3600_000)}–${time(observed.at)}).`};
    }
    return {tone:'rain', observed:true, text:`Chuva no radar agora, em cima da cidade (imagem das ${time(observed.at)}).`};
  }
  // Nome curto da condição: a estação dá a intensidade; o radar, só "Chuva".
  const label = (observed, weatherLabel) => observed?.source === 'radar' ? 'Chuva' : weatherLabel;
  // Igualdade para não repintar à toa quando a mesma leitura chega de novo.
  const key = observed => observed ? `${observed.source}:${observed.at}:${observed.code}` : '';

  return {STATION_MAX_AGE_MS, STATION_MIN_MM, RADAR_MAX_AGE_MS, codeFor, fromStation, fromRadar, pick, merge, answer, label, key};
});

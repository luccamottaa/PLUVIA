/* Próximos eventos no céu: lua cheia/nova (algoritmo de Meeus) e a
   próxima chuva de meteoros visível da latitude do município. Estimativa astronômica, sem fetch,
   timer ou DOM próprio: app.js chama no relógio central e formata no fuso da cidade. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).skyEvents = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Calendários IMO 2026 e 2027 (picos e taxas ideais ZHR) e declinação do radiante. `night` é a
  // data da noite do pico no Brasil (a madrugada seguinte faz parte dela): um pico às 05h UT do dia 4
  // cai na madrugada do dia 4 aqui, noite do dia 3. Nos anos depois da tabela, o pico é calculado
  // pela longitude solar da IMO (PEAKS): bate com 15 das 18 noites de 2026–2027; as outras 3 são
  // picos de dia no Brasil, que caem uma noite antes ou depois. Ao publicar um calendário IMO novo,
  // vale acrescentá-lo aqui (ZHR do ano e o desempate dos picos diurnos).
  const SHOWERS = [
    {id:'QUA', name:'Quadrântidas', night:'2026-01-03', zhr:80, dec:49},
    {id:'LYR', name:'Líridas', night:'2026-04-22', zhr:18, dec:33},
    {id:'ETA', name:'Eta Aquáridas', night:'2026-05-05', zhr:50, dec:-1},
    {id:'SDA', name:'Delta Aquáridas do Sul', night:'2026-07-30', zhr:25, dec:-16},
    {id:'PER', name:'Perseidas', night:'2026-08-12', zhr:100, dec:58},
    {id:'ORI', name:'Oriônidas', night:'2026-10-21', zhr:20, dec:16},
    {id:'LEO', name:'Leônidas', night:'2026-11-17', zhr:15, dec:22},
    {id:'GEM', name:'Geminídeas', night:'2026-12-13', zhr:150, dec:33},
    {id:'URS', name:'Ursídeas', night:'2026-12-22', zhr:10, dec:75},
    {id:'QUA', name:'Quadrântidas', night:'2027-01-03', zhr:80, dec:49},
    {id:'LYR', name:'Líridas', night:'2027-04-22', zhr:18, dec:33},
    {id:'ETA', name:'Eta Aquáridas', night:'2027-05-05', zhr:50, dec:-1},
    {id:'SDA', name:'Delta Aquáridas do Sul', night:'2027-07-30', zhr:25, dec:-16},
    {id:'PER', name:'Perseidas', night:'2027-08-12', zhr:110, dec:58},
    {id:'ORI', name:'Oriônidas', night:'2027-10-21', zhr:20, dec:16},
    {id:'LEO', name:'Leônidas', night:'2027-11-17', zhr:15, dec:22},
    {id:'GEM', name:'Geminídeas', night:'2027-12-13', zhr:150, dec:33},
    {id:'URS', name:'Ursídeas', night:'2027-12-22', zhr:10, dec:75}
  ];
  // Longitude solar do pico (J2000, calendário IMO) e taxa típica de cada chuva, para os anos sem tabela.
  const PEAKS = {QUA:283.15, LYR:32.32, ETA:45.5, SDA:127, PER:140.0, ORI:208, LEO:235.27, GEM:262.2, URS:270.7};
  const LAST_TABLE_YEAR = Math.max(...SHOWERS.map(shower => +shower.night.slice(0, 4)));
  // Radiante abaixo disso na sua altura máxima: poucos meteoros visíveis daquela latitude.
  const MIN_RADIANT_ALTITUDE = 20;

  // Fases principais da Lua pelo algoritmo de Meeus (Astronomical Algorithms, cap. 49), com os
  // termos periódicos principais: erro de poucos minutos, sem depender da fase aproximada do SunCalc
  // (que pode errar horas e trocar o dia perto da meia-noite). Resultado em UT (ms).
  const rad = Math.PI / 180;
  const NEW_TERMS = [[-.40720,0,0,1,0],[.17241,1,1,0,0],[.01608,0,0,2,0],[.01039,0,0,0,2],[.00739,1,-1,1,0],[-.00514,1,1,1,0],[.00208,2,2,0,0],[-.00111,0,0,1,-2],[-.00057,0,0,1,2],[.00056,1,1,2,0],[-.00042,0,0,3,0],[.00042,1,1,0,2],[.00038,1,1,0,-2],[-.00024,1,-1,2,0],[-.00007,0,2,1,0],[.00004,0,0,2,-2],[.00004,0,3,0,0],[.00003,0,1,1,-2],[.00003,0,0,2,2],[-.00003,0,1,1,2],[.00003,0,-1,1,2],[-.00002,0,-1,1,-2],[-.00002,0,1,3,0],[.00002,0,0,4,0]];
  const FULL_TERMS = [[-.40614,0,0,1,0],[.17302,1,1,0,0],[.01614,0,0,2,0],[.01043,0,0,0,2],[.00734,1,-1,1,0],[-.00515,1,1,1,0],[.00209,2,2,0,0],[-.00111,0,0,1,-2],[-.00057,0,0,1,2],[.00056,1,1,2,0],[-.00042,0,0,3,0],[.00042,1,1,0,2],[.00038,1,1,0,-2],[-.00024,1,-1,2,0],[-.00007,0,2,1,0],[.00004,0,0,2,-2],[.00004,0,3,0,0],[.00003,0,1,1,-2],[.00003,0,0,2,2],[-.00003,0,1,1,2],[.00003,0,-1,1,2],[-.00002,0,-1,1,-2],[-.00002,0,1,3,0],[.00002,0,0,4,0]];
  // Cada termo: [coeficiente, potência de E, múltiplo de M, de M', de F]; mais o termo em Ω.
  function phaseTime(k) {
    const T = k / 1236.85, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    let jde = 2451550.09766 + 29.530588861 * k + .00015437 * T2 - .00000015 * T3 + .00000000073 * T4;
    const E = 1 - .002516 * T - .0000074 * T2;
    const M = (2.5534 + 29.1053567 * k - .0000014 * T2 - .00000011 * T3) * rad;
    const Mp = (201.5643 + 385.81693528 * k + .0107582 * T2 + .00001238 * T3 - .000000058 * T4) * rad;
    const F = (160.7108 + 390.67050284 * k - .0016118 * T2 - .00000227 * T3 + .000000011 * T4) * rad;
    const omega = (124.7746 - 1.56375588 * k + .0020672 * T2 + .00000215 * T3) * rad;
    const terms = Number.isInteger(k) ? NEW_TERMS : FULL_TERMS;
    for (const [c, e, m, mp, f] of terms) jde += c * E ** e * Math.sin(m * M + mp * Mp + f * F);
    jde += -.00017 * Math.sin(omega);
    const deltaT = 69 / 86400; // TT − UT por volta de 2026–2027, em dias
    return Math.round((jde - deltaT - 2440587.5) * 86400000);
  }

  // Próximas lua nova e lua cheia depois de `at` (ms UT).
  function nextPhases(at) {
    if (!Number.isFinite(at)) return {full:null, new:null};
    const year = 1970 + at / (365.25 * 86400000);
    const base = Math.floor((year - 2000) * 12.3685) - 1;
    const result = {full:null, new:null};
    for (let k = base; k < base + 4 && (!result.full || !result.new); k++) {
      for (const [key, value] of [['new', k], ['full', k + .5]]) {
        if (result[key]) continue;
        const time = phaseTime(value);
        if (time > at) result[key] = time;
      }
    }
    return result;
  }

  // Longitude verdadeira do Sol referida a J2000 (Meeus, cap. 25; erro ~0,01°, uns 15 minutos).
  function solarLongitude(jd) {
    const T = (jd - 2451545) / 36525;
    const L0 = 280.46646 + 36000.76983 * T + .0003032 * T * T;
    const M = (357.52911 + 35999.05029 * T - .0001537 * T * T) * rad;
    const C = (1.914602 - .004817 * T - .000014 * T * T) * Math.sin(M) + (.019993 - .000101 * T) * Math.sin(2 * M) + .000289 * Math.sin(3 * M);
    return ((L0 + C - 1.397 * T) % 360 + 360) % 360;
  }
  // Instante (ms UT) em que o Sol passa pela longitude `lambda` no ano dado.
  function solarLongitudeTime(year, lambda) {
    let jd = Date.UTC(year, 0, 1) / 86400000 + 2440587.5;
    jd += ((lambda - solarLongitude(jd)) % 360 + 360) % 360 / .98564736;
    for (let i = 0; i < 5; i++) jd += (((lambda - solarLongitude(jd)) % 360 + 540) % 360 - 180) / .98564736;
    return Math.round((jd - 69 / 86400 - 2440587.5) * 86400000);
  }
  // Chuvas de um ano: a tabela IMO quando existe; senão, o pico pela longitude solar, na noite
  // brasileira (UTC−3) que termina na madrugada do pico.
  function showersFor(year) {
    if (year <= LAST_TABLE_YEAR) return SHOWERS.filter(shower => shower.night.startsWith(year + '-'));
    const typical = new Map(SHOWERS.filter(shower => shower.night.startsWith(LAST_TABLE_YEAR + '-')).map(shower => [shower.id, shower]));
    return Object.entries(PEAKS).map(([id, lambda]) => {
      const {name, zhr, dec} = typical.get(id);
      const night = new Date(solarLongitudeTime(year, lambda) - 15 * 3600000).toISOString().slice(0, 10);
      return {id, name, night, zhr, dec, computed:true};
    });
  }

  // Próxima chuva de meteoros a partir da data municipal `today` (inclui a noite de hoje),
  // visível da latitude: altura máxima do radiante = 90° − |lat − dec|.
  function nextShower(today, latitude, {showers} = {}) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today || '')) || !Number.isFinite(latitude)) return null;
    const year = +today.slice(0, 4);
    const candidates = showers || [...showersFor(year), ...showersFor(year + 1)];
    for (const shower of [...candidates].sort((a, b) => a.night.localeCompare(b.night))) {
      if (shower.night < today) continue;
      const altitude = 90 - Math.abs(latitude - shower.dec);
      if (altitude < MIN_RADIANT_ALTITUDE) continue;
      return {...shower, radiantAltitude:Math.round(altitude)};
    }
    return null;
  }

  return {nextPhases, phaseTime, nextShower, showersFor, solarLongitudeTime, SHOWERS, PEAKS, MIN_RADIANT_ALTITUDE};
});

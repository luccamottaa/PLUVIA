/* PLUVIA Sinal: regra pura, determinística e conservadora para decisão imediata. */
(() => {
  const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const values = (items, start, length) => (Array.isArray(items) ? items : []).slice(start, start + length).map(number).filter(Number.isFinite);
  const maximum = items => items.length ? Math.max(...items) : 0;
  const sum = items => items.reduce((total, value) => total + value, 0);

  function evaluate(input = {}) {
    const forecast = input.forecast;
    const hourly = forecast?.hourly;
    const current = forecast?.current;
    const start = Math.max(0, Number(input.start) || 0);
    const official = ['red', 'orange', 'yellow', 'none'].includes(input.officialSeverity) ? input.officialSeverity : 'unknown';
    const sourceStatus = input.sourceStatus || {};
    const factors = [];

    if (!hourly?.time?.length || !current) {
      return {
        level: 'unknown', label: 'Sem leitura', score: 0, confidence: 'low',
        summary: 'Os dados necessários estão temporariamente indisponíveis.',
        factors: ['A previsão do município ainda não respondeu.']
      };
    }

    const rain3h = sum(values(hourly.precipitation, start, 3));
    const rain6h = sum(values(hourly.precipitation, start, 6));
    const probability3h = maximum(values(hourly.precipitation_probability, start, 3));
    const gust3h = maximum([number(current.wind_gusts_10m), ...values(hourly.wind_gusts_10m, start, 3)].filter(Number.isFinite));
    const feels3h = maximum([number(current.apparent_temperature), ...values(hourly.apparent_temperature, start, 4)].filter(Number.isFinite));
    const uv3h = maximum(values(hourly.uv_index, start, 4));
    const weatherCodes = (hourly.weather_code || []).slice(start, start + 3).map(Number);
    const storm = weatherCodes.some(code => [95, 96, 99].includes(code));
    const aqi = number(input.aqi);
    const alertsReady = sourceStatus.alerts === 'ready';
    const airReady = sourceStatus.air === 'ready' && aqi !== null;

    factors.push(`Chuva prevista: ${rain3h.toFixed(1).replace('.', ',')} mm em 3h e ${rain6h.toFixed(1).replace('.', ',')} mm em 6h.`);
    factors.push(`Maior chance de chuva nas próximas 3h: ${Math.round(probability3h)}%.`);
    if (gust3h) factors.push(`Rajada máxima prevista nas próximas 3h: ${Math.round(gust3h)} km/h.`);
    if (feels3h) factors.push(`Maior sensação térmica considerada: ${Math.round(feels3h)} °C.`);
    if (uv3h) factors.push(`Maior índice UV considerado: ${uv3h.toFixed(1).replace('.', ',')}.`);
    if (airReady) factors.push(`Qualidade do ar estimada: US AQI ${Math.round(aqi)}.`);

    if (official === 'red') return {level:'danger',label:'Condição perigosa',score:100,confidence:'high',summary:'Há alerta vermelho do INMET vigente para a região. Evite sair se puder e siga as orientações oficiais.',factors:['Alerta vermelho vigente e com o município incluído.',...factors]};
    if (official === 'orange') return {level:'wait',label:'Melhor esperar',score:90,confidence:'high',summary:'Há alerta laranja do INMET vigente. Confira os riscos e as orientações antes de sair.',factors:['Alerta laranja vigente e com o município incluído.',...factors]};
    if (official === 'yellow') return {level:'attention',label:'Fica atento',score:72,confidence:'high',summary:'Há alerta amarelo do INMET vigente: perigo potencial. Dá para sair, mas confira o aviso e vá preparado.',factors:['Alerta amarelo vigente e com o município incluído.',...factors]};

    if ((storm && probability3h >= 70) || rain3h >= 15 || rain6h >= 25 || gust3h >= 70) {
      const cause = storm && probability3h >= 70 ? 'trovoadas' : gust3h >= 70 ? 'rajadas muito fortes' : 'volume alto de chuva';
      return {level:'danger',label:'Condição perigosa',score:92,confidence:alertsReady ? 'high' : 'moderate',summary:`O modelo indica ${cause} nas próximas horas. Evite exposição e acompanhe os alertas oficiais.`,factors};
    }
    if ((storm && probability3h >= 50) || rain3h >= 8 || rain6h >= 15 || gust3h >= 55) {
      const cause = storm ? 'trovoadas possíveis' : gust3h >= 55 ? 'rajadas fortes' : 'chuva de maior volume';
      return {level:'wait',label:'Melhor esperar',score:80,confidence:alertsReady ? 'high' : 'moderate',summary:`Há ${cause} no horizonte do modelo. Se puder, espere uma janela mais tranquila.`,factors};
    }

    const attention = [];
    if (probability3h >= 55 && rain3h >= .5) attention.push('chuva provável');
    if (feels3h >= 40) attention.push('calor forte');
    if (uv3h >= 8) attention.push('UV alto');
    if (airReady && aqi > 100) attention.push('ar ruim para grupos sensíveis');
    if (gust3h >= 40) attention.push('vento com rajadas');
    if (attention.length) return {level:'attention',label:'Fica atento',score:62,confidence:alertsReady ? 'high' : 'moderate',summary:`Dá para sair, mas há ${attention.join(', ')}. Ajuste o horário ou vá preparado.`,factors};

    if (official === 'unknown') return {level:'attention',label:'Fica atento',score:48,confidence:'low',summary:'Há informação oficial com severidade ou abrangência ainda não confirmada. Confira o aviso antes de decidir.',factors:['A leitura oficial não permitiu confirmar a severidade local.',...factors]};
    if (!alertsReady) return {level:'attention',label:'Fica atento',score:45,confidence:'low',summary:'O tempo parece tranquilo pelo modelo, mas os avisos oficiais não puderam ser confirmados agora.',factors:['Consulta automática de alertas oficiais indisponível.',...factors]};
    const confidence = airReady ? 'high' : 'moderate';
    if (!airReady) factors.push('Qualidade do ar indisponível; ela não entrou nesta classificação.');
    return {level:'good',label:'Pode sair',score:24,confidence,summary:'Não apareceu chuva relevante, rajada forte nem alerta oficial para as próximas horas.',factors};
  }

  const app = globalThis.PLUVIA = globalThis.PLUVIA || {};
  app.signal = {evaluate};
})();

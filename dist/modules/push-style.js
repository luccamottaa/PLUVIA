/* Aparência das notificações por tipo de evento: ícone da condição, título com a condição
   (o navegador já mostra "PLUVIA" como origem), botão e vibração. Usado pelo service worker
   (importScripts) e pelos testes (CommonJS). O texto e a severidade continuam vindo do servidor;
   avisos oficiais mantêm "INMET" e previsões de modelo continuam identificadas como modelo. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).pushStyle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const ICONS = './assets/notifications/';
  const GENERIC = /(^|\/)icon-192\.png$/;
  const STYLES = {
    rain_approaching: {icon:'rain', action:'Ver chuva por hora', fallback:'Chuva nas próximas horas'},
    heavy_rain:       {icon:'heavy-rain', action:'Ver chuva por hora', fallback:'Chuva forte prevista'},
    storm:            {icon:'storm', action:'Ver alertas', fallback:'Tempestade possível'},
    strong_wind:      {icon:'wind', action:'Ver agora', fallback:'Rajadas fortes possíveis'},
    extreme_heat:     {icon:'heat', action:'Ver agora', fallback:'Calor intenso'},
    air_quality:      {icon:'air', action:'Ver qualidade do ar', fallback:'Qualidade do ar em atenção'},
    weather_change:   {icon:'change', action:'Ver previsão', fallback:'Mudança no tempo'},
    daily_summary:    {icon:'daily', action:'Ver previsão do dia', fallback:'Previsão de hoje'},
    official_alert:   {icon:'alert', action:'Ver aviso oficial', fallback:'Aviso meteorológico'},
    test:             {icon:null, action:'Abrir o PLUVIA', fallback:'Notificações ativas'}
  };
  // Remove emoji/símbolos do começo do título do servidor; o ícone já representa a condição.
  const clean = value => String(value || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();

  function style(payload = {}) {
    const type = String(payload.type || 'weather');
    const known = STYLES[type];
    const severity = Math.min(4, Math.max(1, Math.round(Number(payload.severity) || 1)));
    const headline = clean(payload.title);
    const detail = String(payload.body || 'Há uma atualização meteorológica importante.');
    let title = headline && headline !== 'PLUVIA' ? headline : known?.fallback || 'PLUVIA';
    let body = detail;
    if (type === 'official_alert') title = `INMET · ${title}`;
    // Previsão de modelo continua identificada, sem repetir quando o texto já diz.
    else if (known?.icon && payload.source && !/modelo/i.test(detail)) body = `${detail} Previsão do modelo; pode mudar.`;
    let icon = payload.icon && !GENERIC.test(String(payload.icon)) ? payload.icon : './icon-192.png';
    if (known?.icon) icon = ICONS + (known.icon === 'alert' ? `alert-${Math.max(2, Math.min(4, severity))}` : known.icon) + '.png';
    return {
      title:title.slice(0, 80), body:body.slice(0, 500), icon,
      action:known?.action || 'Ver detalhes',
      // Vibração só para o que pede atenção agora (severidade 3+), mais longa no grande perigo.
      vibrate:severity >= 4 ? [300, 120, 300, 120, 300] : severity >= 3 ? [200, 100, 200] : undefined,
      severity
    };
  }

  return {style, STYLES, clean};
});

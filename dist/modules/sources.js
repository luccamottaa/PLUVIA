/* Registro comum; dataAt é o horário fornecido pela fonte, checkedAt é a consulta. */
(() => {
  const definitions = {
    weather:{name:'Open-Meteo',type:'Previsão meteorológica',kind:'estimate',ttl:600000},
    alerts:{name:'INMET',type:'Avisos meteorológicos',kind:'official',ttl:600000},
    'air-quality':{name:'Open-Meteo / CAMS',type:'Qualidade do ar',kind:'estimate',ttl:600000},
    disasters:{name:'Defesa Civil Manaus',type:'Comunicados municipais',kind:'official',ttl:600000},
    map:{name:'Open-Meteo',type:'Precipitação modelada',kind:'estimate',ttl:600000}
  };
  const states = new Map();
  const api = globalThis.PLUVIA = globalThis.PLUVIA || {};
  api.modules = Object.fromEntries(['weather','alerts','location','air-quality','disasters','auth','map','weather-layers','ui'].map(name => [name,{}]));
  api.sources = {
    definitions,
    reset(cityId) { for(const id of Object.keys(definitions)) states.set(id,{...definitions[id],cityId,status:'idle',dataAt:null,checkedAt:null}); },
    set(id, patch) { if(!definitions[id]) return; states.set(id,{...definitions[id],...states.get(id),...patch}); api.modules.ui.refresh?.(); },
    get(id) { const value = states.get(id) || {...definitions[id],status:'idle'}; return {...value,status:value.status === 'ready' && Date.now()-value.checkedAt > value.ttl ? 'stale' : value.status}; },
    all() { return Object.keys(definitions).map(id=>({id,...this.get(id)})); }
  };
})();

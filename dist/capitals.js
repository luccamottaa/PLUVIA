// Urban reference points (not device coordinates); IBGE municipality identifiers.
const CAPITALS = [
  ['2800308','Aracaju','SE','Sergipe',-10.911,-37.071,'America/Maceio'],
  ['1501402','Belém','PA','Pará',-1.456,-48.504,'America/Belem'],
  ['3106200','Belo Horizonte','MG','Minas Gerais',-19.920,-43.938,'America/Sao_Paulo'],
  ['1400100','Boa Vista','RR','Roraima',2.824,-60.675,'America/Boa_Vista'],
  ['5300108','Brasília','DF','Distrito Federal',-15.794,-47.883,'America/Sao_Paulo'],
  ['5002704','Campo Grande','MS','Mato Grosso do Sul',-20.443,-54.646,'America/Campo_Grande'],
  ['5103403','Cuiabá','MT','Mato Grosso',-15.601,-56.097,'America/Cuiaba'],
  ['4106902','Curitiba','PR','Paraná',-25.429,-49.272,'America/Sao_Paulo'],
  ['4205407','Florianópolis','SC','Santa Catarina',-27.595,-48.548,'America/Sao_Paulo'],
  ['2304400','Fortaleza','CE','Ceará',-3.732,-38.527,'America/Fortaleza'],
  ['5208707','Goiânia','GO','Goiás',-16.686,-49.264,'America/Sao_Paulo'],
  ['2507507','João Pessoa','PB','Paraíba',-7.115,-34.864,'America/Fortaleza'],
  ['1600303','Macapá','AP','Amapá',0.035,-51.070,'America/Belem'],
  ['2704302','Maceió','AL','Alagoas',-9.665,-35.735,'America/Maceio'],
  ['1302603','Manaus','AM','Amazonas',-3.119,-60.022,'America/Manaus'],
  ['2408102','Natal','RN','Rio Grande do Norte',-5.795,-35.209,'America/Fortaleza'],
  ['1721000','Palmas','TO','Tocantins',-10.185,-48.334,'America/Araguaina'],
  ['4314902','Porto Alegre','RS','Rio Grande do Sul',-30.034,-51.230,'America/Sao_Paulo'],
  ['1100205','Porto Velho','RO','Rondônia',-8.761,-63.900,'America/Porto_Velho'],
  ['2611606','Recife','PE','Pernambuco',-8.054,-34.881,'America/Recife'],
  ['1200401','Rio Branco','AC','Acre',-9.975,-67.825,'America/Rio_Branco'],
  ['3304557','Rio de Janeiro','RJ','Rio de Janeiro',-22.907,-43.173,'America/Sao_Paulo'],
  ['2927408','Salvador','BA','Bahia',-12.971,-38.501,'America/Bahia'],
  ['2111300','São Luís','MA','Maranhão',-2.530,-44.306,'America/Fortaleza'],
  ['3550308','São Paulo','SP','São Paulo',-23.551,-46.633,'America/Sao_Paulo'],
  ['2211001','Teresina','PI','Piauí',-5.092,-42.803,'America/Fortaleza'],
  ['3205309','Vitória','ES','Espírito Santo',-20.316,-40.312,'America/Sao_Paulo']
].map(([id,name,uf,state,lat,lon,timezone]) => Object.freeze({id,name,uf,state,lat,lon,timezone}));

function readPreference(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writePreference(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
let activeCity = CAPITALS.find(city => city.id === readPreference('pluvia-city', '1302603')) || CAPITALS.find(city => city.uf === 'AM');
const savedFavorites = readPreference('pluvia-favorites', []);
let favorites = new Set(Array.isArray(savedFavorites) ? savedFavorites.filter(id => CAPITALS.some(city => city.id === id)) : []);
const normalizeName = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function nearestCapital(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('Localização inválida');
  const radians = degrees => degrees * Math.PI / 180;
  const distance = city => {
    const a = Math.sin(radians(city.lat-latitude)/2)**2 + Math.cos(radians(latitude))*Math.cos(radians(city.lat))*Math.sin(radians(city.lon-longitude)/2)**2;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1,a)));
  };
  return CAPITALS.reduce((best, city) => distance(city) < distance(best) ? city : best);
}

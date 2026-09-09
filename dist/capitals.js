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
const stateNames = new Map(CAPITALS.map(city => [city.uf,city.state]));
const savedCityRecord = readPreference('pluvia-city-record', null);
let CITIES = [...CAPITALS];
if (savedCityRecord?.id && !CITIES.some(city => city.id === savedCityRecord.id)) CITIES.push(Object.freeze(savedCityRecord));
let cityById = new Map(CITIES.map(city => [city.id,city]));
// No city is selected until location permission succeeds or the visitor chooses.
let activeCity = null;
const savedFavorites = readPreference('pluvia-favorites', []);
let favorites = new Set(Array.isArray(savedFavorites) ? savedFavorites : []);
const normalizeName = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

let citySearchIndex = new Map(CITIES.map(city => [city.id,normalizeName(city.name + ' ' + city.uf + ' ' + city.state)]));
let cityNameIndex = new Map(CITIES.map(city => [city.id,normalizeName(city.name)]));
const cityCollator = new Intl.Collator('pt-BR');
let municipalitiesReady = typeof MUNICIPALITIES !== 'undefined';
let municipalitiesPromise = null;
let cityIndexReady = municipalitiesReady || Array.isArray(globalThis.PLUVIA_MUNICIPALITY_INDEX);
let cityIndexPromise = null;
const cityStatePromises = new Map();
const loadedCityStates = new Set();

function rebuildCityIndexes() {
  cityById = new Map(CITIES.map(city => [city.id,city]));
  citySearchIndex = new Map(CITIES.map(city => [city.id,normalizeName(city.name + ' ' + city.uf + ' ' + city.state)]));
  cityNameIndex = new Map(CITIES.map(city => [city.id,normalizeName(city.name)]));
}

function hydrateMunicipalities() {
  if (typeof MUNICIPALITIES === 'undefined') return false;
  CITIES = MUNICIPALITIES.rows.map(([id,name,uf,lat,lon,zone]) => {
    const capital = CAPITALS.find(city => city.id === id);
    return capital || Object.freeze({id,name,uf,state:stateNames.get(uf),lat,lon,timezone:MUNICIPALITIES.timezones[zone]});
  });
  rebuildCityIndexes();
  municipalitiesReady = true;
  cityIndexReady = true;
  return true;
}

function hydrateCityIndex() {
  const rows = globalThis.PLUVIA_MUNICIPALITY_INDEX;
  if (!Array.isArray(rows)) return false;
  const known = new Map(CITIES.map(city => [city.id,city]));
  CITIES = rows.map(([id,name,uf]) => known.get(id) || Object.freeze({id,name,uf,state:stateNames.get(uf),needsDetails:true}));
  rebuildCityIndexes();
  cityIndexReady = true;
  return true;
}

function ensureCityIndex() {
  if (cityIndexReady || hydrateCityIndex()) return Promise.resolve(CITIES);
  if (cityIndexPromise) return cityIndexPromise;
  cityIndexPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './municipality-index.js?v=cities-3';
    script.onload = () => hydrateCityIndex() ? resolve(CITIES) : reject(new Error('Índice de cidades inválido'));
    script.onerror = () => reject(new Error('Índice de cidades indisponível'));
    document.head.appendChild(script);
  }).finally(() => { cityIndexPromise = null; });
  return cityIndexPromise;
}

function hydrateCityState(uf) {
  const chunk = globalThis.PLUVIA_CITY_CHUNKS?.[uf];
  if (!chunk?.rows) return false;
  const replacements = new Map(chunk.rows.map(([id,name,rowUf,lat,lon,zone]) => {
    const capital = CAPITALS.find(city => city.id === id);
    return [id, capital || Object.freeze({id,name,uf:rowUf,state:stateNames.get(rowUf),lat,lon,timezone:chunk.timezones[zone]})];
  }));
  CITIES = CITIES.map(city => replacements.get(city.id) || city);
  rebuildCityIndexes();
  loadedCityStates.add(uf);
  return true;
}

function ensureCityState(uf) {
  if (municipalitiesReady || loadedCityStates.has(uf) || hydrateCityState(uf)) return Promise.resolve(CITIES);
  if (cityStatePromises.has(uf)) return cityStatePromises.get(uf);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `./cities/${uf.toLowerCase()}.js?v=cities-3`;
    script.onload = () => hydrateCityState(uf) ? resolve(CITIES) : reject(new Error('Base estadual inválida'));
    script.onerror = () => reject(new Error('Base estadual indisponível'));
    document.head.appendChild(script);
  }).finally(() => cityStatePromises.delete(uf));
  cityStatePromises.set(uf, promise);
  return promise;
}

async function ensureCityDetails(id) {
  await ensureCityIndex();
  const city = cityById.get(id);
  if (!city?.needsDetails) return city;
  await ensureCityState(city.uf);
  return cityById.get(id);
}

function ensureMunicipalities() {
  if (municipalitiesReady || hydrateMunicipalities()) return Promise.resolve(CITIES);
  if (municipalitiesPromise) return municipalitiesPromise;
  municipalitiesPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './municipalities.js?v=cities-2';
    script.onload = () => hydrateMunicipalities() ? resolve(CITIES) : reject(new Error('Base de cidades inválida'));
    script.onerror = () => reject(new Error('Base de cidades indisponível'));
    document.head.appendChild(script);
  }).finally(() => { municipalitiesPromise = null; });
  return municipalitiesPromise;
}

function oneTypoAway(term, value) {
  if (term.length < 5) return false;
  const words = value.split(/\s+/);
  return words.some(word => {
    if (Math.abs(word.length - term.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < term.length && j < word.length) {
      if (term[i] === word[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (term.length > word.length) i++; else if (word.length > term.length) j++; else { i++; j++; }
    }
    return edits + (i < term.length || j < word.length ? 1 : 0) <= 1;
  });
}
function searchCities(query, uf = '') {
  const terms = normalizeName(query).trim().split(/\s+/).filter(Boolean);
  const matches = CITIES.filter(city => (!uf || city.uf === uf) && terms.every(term => stateNames.has(term.toUpperCase()) ? city.uf === term.toUpperCase() : citySearchIndex.get(city.id).includes(term) || oneTypoAway(term, cityNameIndex.get(city.id))));
  const exact = normalizeName(query).trim();
  const priority = city => cityNameIndex.get(city.id) === exact ? 0 : favorites.has(city.id) ? 1 : 2;
  matches.sort((a,b) => priority(a)-priority(b) || cityCollator.compare(a.name,b.name) || a.uf.localeCompare(b.uf));
  return matches;
}
function nearestCity(latitude, longitude, candidates = CITIES) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('Localização inválida');
  const radians = degrees => degrees * Math.PI / 180;
  const distance = city => {
    const a = Math.sin(radians(city.lat-latitude)/2)**2 + Math.cos(radians(latitude))*Math.cos(radians(city.lat))*Math.sin(radians(city.lon-longitude)/2)**2;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1,a)));
  };
  const nearest = candidates.reduce((best, city) => distance(city) < distance(best) ? city : best);
  return {...nearest, distanceKm: distance(nearest)};
}

// Retained for the capital regression tests and the capital-only subset.
function nearestCapital(latitude, longitude) { return nearestCity(latitude, longitude, CAPITALS); }

if (municipalitiesReady) hydrateMunicipalities();
else if (cityIndexReady) hydrateCityIndex();

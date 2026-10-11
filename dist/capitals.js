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
// Uma página de cidade fora das capitais traz o registro completo do município no HTML
// (<meta name="pluvia-city-record">): a cidade abre sem esperar o índice de municípios.
const pageCityRecord = (() => {
  try {
    const record = JSON.parse(typeof document !== 'undefined' && document.querySelector?.('meta[name="pluvia-city-record"]')?.content || 'null');
    return /^\d{7}$/.test(record?.id) && typeof record.name === 'string' && /^[A-Z]{2}$/.test(record.uf) && typeof record.state === 'string' &&
      Number.isFinite(record.lat) && Number.isFinite(record.lon) && typeof record.timezone === 'string' ? record : null;
  } catch { return null; }
})();
let CITIES = [...CAPITALS];
for (const record of [pageCityRecord, savedCityRecord]) {
  if (record?.id && !CITIES.some(city => city.id === record.id)) CITIES.push(Object.freeze({...record}));
}
let cityById = new Map(CITIES.map(city => [city.id,city]));
// No city is selected until location permission succeeds or the visitor chooses.
let activeCity = null;
const savedFavorites = readPreference('pluvia-favorites', []);
let favorites = new Set(Array.isArray(savedFavorites) ? savedFavorites : []);
const normalizeName = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Public pages /clima/<nome>-<uf>/ (scripts/generate-city-pages.cjs): the capitals plus these
// municipalities (large regional centres and the main towns of Amazonas), by IBGE code.
const PAGE_CITY_IDS = Object.freeze([
  '3518800','3509502','3304904','3301702','3303500','3548708','3547809','3534401','2607901','3549904','3543402','3170206',
  '3552205','3118601','2910800','4209102','5201405','4113700','3136702','1500800','3205002','3303302','3300456','4305108',
  '3301009','3205200','3529401','3305109','3530607','3548500','3106705','3513801','3525904','4115200','3143302','3538709',
  '3510609','2609600','3201308','5201108','3506003','3523107','3551009','2303709','3516200','4314407','4304606','4119905',
  '4202404','2933307','2610707','3170107','2611101','2905701','3549805','1506807','4108304','4104808','2408003','2604106',
  '3303906','2307304','2105302','1504208','4204202','5003702','5107602','1100122','1505536','1302504','1301902','1303403',
  '1301852','1301209','1304203','1304062','1302900','1301704','1303536','1302702','1303809','1303569'
]);
// More pages, linked only from pages of the same state (keeps the Home footer short): all
// municipalities of Amazonas and the cities above ~100 thousand inhabitants.
const MORE_PAGE_CITY_IDS = Object.freeze([
  '3541000','3518701','3554102','3526902','3552502','3552809','3552403','3505708','3515004','3548906','3520509','3513009',
  '3501608','3529005','3522505','3503208','3524402','3519071','3541406','3543907','3502804','3515707','3545803','3516309',
  '3522208','3523909','3507605','3538006','3522307','3548807','3516408','3530706','3525300','3507506','3504107','3547304',
  '3503307','3513504','3556206','3551702','3525003','3506508','3543303','3557006','3505500','3511102','3556503','3518404',
  '3554003','3510500','3545209','3539806','3534708','3536505','3504008','3526704','3522109','3509007','3528502','3557105',
  '3523404','3555406','3506102','3527108','3550704','3306305','3302502','3301900','3302403','3300704','3302858','3303401',
  '3300407','3300100','3305802','3303203','3302700','3304144','3304524','3304201','3300209','3302007','3302270','3305208',
  '3302205','3305554','3300308','3305505','3306008','3306107','3154606','3127701','3131307','3167202','3122306','3157807',
  '3129806','3151800','3148004','3152501','3168606','3105608','3156700','3170701','3118304','3171204','3131703','3103504',
  '3147907','3169901','3119401','3143906','3134202','3104007','3138203','3144805','3132404','3133808','3147006','3113404',
  '3148103','3139409','3162500','3168705','3170404','3120904','3101607','3136207','3169307','3171303','3146107','3201209',
  '3203205','3204906','3202405','3201506','3200607','4125506','4105805','4109401','4118204','4101804','4127700','4101408',
  '4104204','4119152','4101507','4100400','4119509','4128104','4103701','4107652','4126256','4104303','4108403','4118402',
  '4118501','4105508','4127106','4216602','4208203','4211900','4204608','4208906','4209300','4202008','4202909','4218707',
  '4215802','4203204','4211306','4204301','4214805','4201406','4205902','4202305','4207502','4208302','4316907','4309209',
  '4323002','4313409','4318705','4315602','4300604','4314100','4320008','4303103','4316808','4322400','4301602','4302105',
  '4307005','4309308','4311403','4317103','4310207','4307708','4319901','4300406','4317509','4307906','4322608','4303509',
  '4312401','4303905','4321600','4304630','5218805','5200258','5212501','5221858','5221403','5208004','5215231','5220454',
  '5205109','5211503','5211909','5217609','5204508','5219753','5208608','5205497','5213103','5108402','5107909','5107958',
  '5102504','5107925','5105259','5107040','5101803','5100250','5008305','5003207','5006606','5005707','5006200','5007901',
  '5001102','2918407','2914802','2919207','2913606','2918001','2931350','2903201','2900702','2925303','2930709','2924009',
  '2910727','2928703','2932903','2906501','2911709','2917508','2930501','2930105','2910057','2919553','2916401','2914604',
  '2906006','2907202','2904605','2903904','2804805','2803500','2802908','2806701','2802106','2700300','2707701','2706307',
  '2709301','2706703','2708600','2702405','2702306','2602902','2603454','2606002','2616407','2606804','2613701','2612505',
  '2600054','2607208','2613909','2601102','2606408','2604007','2606200','2601706','2601201','2609907','2605202','2610905',
  '2614501','2610004','2601904','2504009','2513703','2510808','2501807','2516201','2503209','2503704','2506301','2515302',
  '2403251','2412005','2407104','2402600','2402006','2400208','2403103','2307650','2312908','2304202','2306405','2307700',
  '2305506','2311306','2309706','2301000','2311405','2302800','2311801','2304103','2313401','2301109','2303501','2309607',
  '2305407','2305233','2302602','2308708','2300200','2314102','2301901','2307601','2313302','2207702','2208007','2208403',
  '2203909','2201200','2202208','2211100','2200400','2205508','2207900','2207009','2203701','2111201','2112209','2103000',
  '2103307','2107506','2100055','2101202','2101400','2109908','2101608','2108603','2103208','2110005','2102325','2104800',
  '2105401','2103604','2101707','2114007','2105708','2112803','2112506','1502400','1500107','1502103','1504422','1501709',
  '1507300','1501303','1500602','1508100','1505502','1507953','1501808','1503606','1506138','1504703','1505064','1505304',
  '1506500','1502202','1505809','1501501','1503309','1500206','1508001','1508308','1501782','1506187','1504802','1503903',
  '1505106','1500404','1507904','1506203','1503705','1502707','1502939','1505437','1508407','1505031','1508159','1503804',
  '1502152','1502772','1508209','1507607','1600600','1600279','1600501','1600402','1600535','1400472','1400209','1400456',
  '1400308','1400175','1400050','1200203','1200500','1200609','1200302','1200104','1200450','1200385','1200708','1200252',
  '1100023','1100304','1100049','1100288','1100114','1100106','1100189','1100155','1100452','1100130','1100098','1100809',
  '1702109','1709500','1718204','1716109','1702208','1705508','1709302','1721208','1707009','1713205','1708205','1702554',
  '1300029','1300060','1300086','1300102','1300144','1300201','1300300','1300409','1300508','1300607','1300631','1300680',
  '1300706','1300805','1300839','1300904','1301001','1301100','1301159','1301308','1301407','1301506','1301605','1301654',
  '1301803','1301951','1302009','1302108','1302207','1302306','1302405','1302553','1302801','1303007','1303106','1303205',
  '1303304','1303502','1303601','1303700','1303908','1303957','1304005','1304104','1304237','1304260','1304302','1304401'
]);
const capitalIds = new Set(CAPITALS.map(city => city.id));
const pageCityIds = new Set([...capitalIds, ...PAGE_CITY_IDS, ...MORE_PAGE_CITY_IDS]);
const citySlug = city => normalizeName(city.name + ' ' + city.uf).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cityPagePath = city => pageCityIds.has(city?.id) ? `/clima/${citySlug(city)}/` : null;
const cityPageTitle = city => `Previsão do tempo em ${city.name} (${city.uf}) agora — PLUVIA`;

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
    script.src = '/municipality-index.js?v=cities-3';
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
    script.src = `/cities/${uf.toLowerCase()}.js?v=cities-3`;
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
    script.src = '/municipalities.js?v=cities-2';
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
// Apelidos comuns das capitais: a busca inteira precisa ser o apelido (sem casar pedaços de nomes).
const CITY_ALIASES = new Map([
  ['bh','3106200'],['beaga','3106200'],['sampa','3550308'],['poa','4314902'],['floripa','4205407'],
  ['bsb','5300108'],['jampa','2507507'],['ssa','2927408'],['rec','2611606'],['cwb','4106902'],
  ['rj','3304557'],['sp','3550308']
]);
function searchCities(query, uf = '') {
  const exact = normalizeName(query).trim().replace(/\s+/g, ' ');
  const alias = CITY_ALIASES.get(exact);
  const terms = exact.split(' ').filter(Boolean);
  const matches = CITIES.filter(city => (!uf || city.uf === uf) && (city.id === alias || terms.every(term => stateNames.has(term.toUpperCase()) ? city.uf === term.toUpperCase() : citySearchIndex.get(city.id).includes(term) || oneTypoAway(term, cityNameIndex.get(city.id)))));
  // Nome exato/apelido, favoritos, depois capitais e nomes que começam pelo texto: "rio" mostra
  // Rio Branco e Rio de Janeiro antes dos 40 municípios "Rio ...".
  const priority = city => {
    const name = cityNameIndex.get(city.id);
    if (name === exact || city.id === alias) return 0;
    if (favorites.has(city.id)) return 1;
    const prefix = name.startsWith(exact), capital = capitalIds.has(city.id);
    return prefix && capital ? 2 : prefix ? 3 : capital ? 4 : 5;
  };
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

const assert = require('node:assert/strict');
const fs = require('node:fs');

const map = fs.readFileSync('dist/weather-map.js','utf8');
const html = fs.readFileSync('dist/index.html','utf8');
const sources = fs.readFileSync('dist/modules/sources.js','utf8');
const docs = fs.readFileSync('docs/DATA-SOURCES.md','utf8');

assert.match(map,/api\.rainviewer\.com\/public\/weather-maps\.json/);
assert.match(map,/radar\?\.past[\s\S]+slice\(-7\)/);
assert.doesNotMatch(map,/MODIS_Aqua_CorrectedReflectance_TrueColor/);
assert.doesNotMatch(map,/GOES-East_ABI_GeoColor|NASA GIBS|loadClouds|renderCloudFrame/,'satélite retirado do radar a pedido');
assert.doesNotMatch(map,/createImageData|L\.rectangle|hourly:'cloud_cover'/);
assert.match(map,/Radar observado/);
assert.doesNotMatch(map,/renderSatelliteFrame|loadSatellite/);
assert.match(map,/PLUVIA\?\.http\?\.createClient/);
assert.match(map,/httpClient\?\.abortAll/);
assert.doesNotMatch(map,/await fetch\(/);
assert.match(map,/Esta camada está temporariamente indisponível\. Tente novamente\./);
assert.match(html, /class="weather-map-card panel"[\s\S]*?id="weatherMap"[\s\S]*?id="weatherPlay"/);
assert.doesNotMatch(html, /id="openWeatherMap"|id="weatherMapDialog"/);
assert.match(map, /IntersectionObserver[\s\S]*?observer\.observe\(mapCard\)/);
assert.match(map, /mapVisible \|\| radarDialog\?\.open/);
assert.match(map, /mapainterativo\.cemaden\.gov\.br/);
assert.match(map, /terrabrasilis\.dpi\.inpe\.br\/queimadas\/bdqueimadas/);
assert.match(map, /star\.nesdis\.noaa\.gov\/goes/);
assert.match(sources,/cemaden:\{name:'Cemaden',status:'prepared'/);
assert.match(sources,/fires:\{name:'INPE BDQueimadas',status:'prepared'/);
// Raios e satélite saíram do radar a pedido; a função lightning continua no servidor, sem chamada do app.
assert.doesNotMatch(sources,/Vaisala Xweather|NASA GIBS/);
assert.doesNotMatch(map,/functions\/v1\/lightning|Xweather|loadLightning/);
assert.doesNotMatch(html,/weatherLightningAttribution|data-weather-layer="(clouds|lightning)"/);
// Localização no radar: só por toque (sem watchPosition/background), ponto "você está aqui" em memória,
// sem trocar a cidade; sem permissão volta ao município. data-centered acompanha o movimento.
assert.match(html,/id="weatherMapRecenter"[^>]*type="button"[^>]*aria-label="Mostrar minha localização no mapa"[^>]*hidden/);
assert.match(map,/\$\('weatherMapRecenter'\)\?\.addEventListener\('click',recenter\)/);
assert.equal((map.match(/geolocation\.getCurrentPosition/g) || []).length,1,'uma única chamada, dentro do clique');
assert.doesNotMatch(map,/watchPosition|localStorage|sessionStorage|requestLocation|selectCity/);
assert.match(map,/function centerOn\(target, zoom\)[\s\S]*?\{animate:!reduceMotion\(\)\}/);
assert.match(map,/state\.map\.on\?\.\('moveend zoomend resize',updateRecenter\)/);
assert.match(docs,/RainViewer Weather Maps API/);
assert.doesNotMatch(map,/Math\.random|mock|fake/i);

console.log('PASS weather map: lazy real radar, recenter control, isolated failures and no mock movement.');

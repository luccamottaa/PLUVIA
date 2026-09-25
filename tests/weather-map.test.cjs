const assert = require('node:assert/strict');
const fs = require('node:fs');

const map = fs.readFileSync('dist/weather-map.js','utf8');
const html = fs.readFileSync('dist/index.html','utf8');
const sources = fs.readFileSync('dist/modules/sources.js','utf8');
const docs = fs.readFileSync('docs/DATA-SOURCES.md','utf8');

assert.match(map,/api\.rainviewer\.com\/public\/weather-maps\.json/);
assert.match(map,/radar\?\.past[\s\S]+slice\(-7\)/);
assert.doesNotMatch(map,/MODIS_Aqua_CorrectedReflectance_TrueColor/);
assert.match(map,/hourly:'cloud_cover'/);
assert.match(map,/Cobertura de nuvens estimada/);
assert.match(map,/Radar observado/);
assert.doesNotMatch(map,/renderSatelliteFrame|loadSatellite/);
assert.match(map,/PLUVIA\?\.http\?\.createClient/);
assert.match(map,/httpClient\?\.abortAll/);
assert.doesNotMatch(map,/await fetch\(/);
assert.match(map,/Esta camada está temporariamente indisponível\. As outras continuam funcionando\./);
assert.match(html, /class="weather-map-card panel"[\s\S]*?id="weatherMap"[\s\S]*?id="weatherPlay"/);
assert.doesNotMatch(html, /id="openWeatherMap"|id="weatherMapDialog"/);
assert.match(map, /IntersectionObserver[\s\S]*?observer\.observe\(mapCard\)/);
assert.match(map, /mapVisible && !initializing/);
assert.match(map, /mapainterativo\.cemaden\.gov\.br/);
assert.match(map, /terrabrasilis\.dpi\.inpe\.br\/queimadas\/bdqueimadas/);
assert.match(map, /star\.nesdis\.noaa\.gov\/goes/);
assert.match(sources,/cemaden:\{name:'Cemaden',status:'prepared'/);
assert.match(sources,/fires:\{name:'INPE BDQueimadas',status:'prepared'/);
assert.match(sources,/lightning:\{name:'Vaisala Xweather'/);
assert.match(map,/functions\/v1\/lightning/);
assert.match(map,/L\.circleMarker\(\[event\.lat,event\.lon\]/);
assert.match(html,/id="weatherLightningAttribution"[^>]*>Powered by Vaisala Xweather/);
assert.match(docs,/RainViewer Weather Maps API/);
assert.doesNotMatch(map,/Math\.random|mock|fake/i);

console.log('PASS weather map: lazy real radar, modeled clouds, isolated failures and no mock movement.');

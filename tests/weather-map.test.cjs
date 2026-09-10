const assert = require('node:assert/strict');
const fs = require('node:fs');

const map = fs.readFileSync('dist/weather-map.js','utf8');
const sources = fs.readFileSync('dist/modules/sources.js','utf8');
const docs = fs.readFileSync('docs/DATA-SOURCES.md','utf8');

assert.match(map,/api\.rainviewer\.com\/public\/weather-maps\.json/);
assert.match(map,/radar\?\.past[\s\S]+slice\(-7\)/);
assert.match(map,/MODIS_Aqua_CorrectedReflectance_TrueColor/);
assert.match(map,/hourly:'cloud_cover'/);
assert.match(map,/Cobertura de nuvens estimada/);
assert.match(map,/Radar observado/);
assert.match(map,/produto diário/);
assert.match(map,/NASA GIBS \/ MODIS Aqua/);
assert.match(map,/utcDate\(-3\),utcDate\(-2\),utcDate\(-1\)/);
assert.match(map,/state\.controller\?\.abort/);
assert.match(map,/Esta camada está temporariamente indisponível\. As outras continuam funcionando\./);
assert.match(sources,/cemaden:\{name:'Cemaden',status:'prepared'/);
assert.match(sources,/fires:\{name:'INPE BDQueimadas',status:'prepared'/);
assert.match(sources,/lightning:\{name:'Raios',status:'prepared'/);
assert.match(docs,/RainViewer Weather Maps API/);
assert.doesNotMatch(map,/Math\.random|mock|fake/i);

console.log('PASS weather map: lazy real radar, dated satellite, modeled clouds, isolated failures and no mock movement.');

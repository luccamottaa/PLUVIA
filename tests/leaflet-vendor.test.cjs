const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '../dist');
const map = fs.readFileSync(path.join(dist, 'weather-map.js'), 'utf8');

// The map library is first-party: a third-party CDN outage or tampering cannot break or alter it.
assert.doesNotMatch(map, /unpkg\.com|cdnjs|jsdelivr/);
assert.match(map, /const LEAFLET_JS = '\/vendor\/leaflet\/leaflet\.js\?v=1\.9\.4'/);
assert.match(map, /const LEAFLET_CSS = '\/vendor\/leaflet\/leaflet\.css\?v=1\.9\.4'/);

const js = fs.readFileSync(path.join(dist, 'vendor/leaflet/leaflet.js'), 'utf8');
assert.doesNotMatch(js, /sourceMappingURL/, 'the published bundle must not reference an unpublished source map');
assert.match(fs.readFileSync(path.join(dist, 'vendor/leaflet/LICENSE'), 'utf8'), /BSD 2-Clause/);
assert.ok(fs.statSync(path.join(dist, 'vendor/leaflet/leaflet.css')).size > 10000);

// The vendored file is the real Leaflet 1.9.4 UMD build and exposes the API the map consumes.
assert.match(js, /t\.version="1\.9\.4"/);
for (const api of ['map', 'tileLayer', 'circleMarker', 'latLng']) assert.match(js, new RegExp(`t\\.${api}=`), api);

// Lazy-loaded map assets stay out of the install precache; same-origin JS/CSS is cached at runtime.
const sw = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8');
assert.doesNotMatch(sw, /vendor\/leaflet/);
assert.match(sw, /\/\\\.\(js\|css\)\$\/\.test\(url\.pathname\)/);
console.log('Leaflet local vendor ok');

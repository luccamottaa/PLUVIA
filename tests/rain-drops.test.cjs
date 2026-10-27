// Gotas na tela (1.38): só com chuva no céu, mais gotas quanto mais forte; desliga sem WebGL/movimento reduzido.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const glass = require('../dist/modules/rain-drops.js');

assert.equal(glass.level('none'), null);
assert.equal(glass.level(undefined), null);
for (const kind of ['drizzle', 'light', 'moderate', 'heavy']) assert.ok(glass.level(kind), kind);
const order = ['drizzle', 'light', 'moderate', 'heavy'].map(kind => glass.level(kind));
for (let i = 1; i < order.length; i++) assert.ok(order[i].dens > order[i - 1].dens && order[i].slide > order[i - 1].slide, 'mais chuva, mais gotas');
// WebGL 1 com laços fixos e alfa pré-multiplicado (a cor nunca passa do alfa).
assert.match(glass.FS, /precision highp float/);
assert.match(glass.FS, /gl_FragColor=vec4\(vec3\(\.88,\.92,1\.\)\*min\(light,a\),a\)/);
assert.doesNotMatch(glass.FS, /for\(int i=0;i<[a-zA-Z]/);

const html = fs.readFileSync('dist/index.html', 'utf8'), sw = fs.readFileSync('dist/sw.js', 'utf8');
const css = fs.readFileSync('dist/sky.css', 'utf8'), src = fs.readFileSync('dist/modules/rain-drops.js', 'utf8');
const ref = html.match(/modules\/rain-drops\.js\?v=[\w-]+/)[0];
assert.ok(sw.includes('./' + ref), 'precache acompanha o HTML');
assert.match(css, /\.sky-glass \{ position:fixed; inset:0; z-index:-1;[^}]*opacity:0;/);
assert.match(css, /:root\[data-glass="on"\] \.sky-glass \{ opacity:1; \}/);
assert.match(css, /prefers-reduced-motion: reduce\) \{ \.sky-glass \{ display:none; \} \}/);
assert.match(src, /webglcontextlost/); assert.match(src, /off\('slow'\)/);
assert.match(src, /navigator\?\.webdriver && !qaForced\(\)/, 'QA mede o céu do CSS, a não ser com a chave');
assert.match(src, /attributeFilter:\['data-rain'\]/, 'segue a chuva mostrada no céu (que já inclui a medida)');
console.log('rain-drops ok');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const events = [];
const listeners = {};
const scripts = [];
const nodes = new Map();
const node = id => {
  if (!nodes.has(id)) nodes.set(id,{value:'',textContent:'',hidden:false,addEventListener(type,handler){this[type]=handler;}});
  return nodes.get(id);
};
const context = {
  window:{amplitude:{init(){},track(name,properties){events.push({name,properties});},setUserId(){},reset(){}}},
  location:{pathname:'/'},
  document:{
    head:{appendChild(script){scripts.push(script);}},
    createElement(){return {};},
    getElementById:node,
    querySelector(){return null;},
    addEventListener(type,handler){listeners[type]=handler;}
  },
  clearTimeout,
  setTimeout(handler){handler();return 1;}
};
let source = fs.readFileSync('dist/analytics.js','utf8').replace("const API_KEY = 'AMPLITUDE_API_KEY'","const API_KEY = 'public-test-key-123'");
vm.runInNewContext(source,context);
listeners.DOMContentLoaded();
context.window.pluviaAnalytics.track('Privacy Test',{email:'x@example.com',password:'secret',token:'abc',latitude:-3.1,city:'Manaus',nested:{bad:true},long:'x'.repeat(100)});

const privacy = events.find(event => event.name === 'Privacy Test').properties;
assert.equal(privacy.city,'Manaus');
assert.equal(privacy.long.length,80);
assert.equal(privacy.email,undefined);
assert.equal(privacy.password,undefined);
assert.equal(privacy.token,undefined);
assert.equal(privacy.latitude,undefined);
assert.equal(privacy.nested,undefined);
assert(events.some(event => event.name === 'PLUVIA Opened'));

node('citySearch').value='Manaus';
node('citySearch').input({target:node('citySearch')});
assert.deepEqual(events.find(event => event.name === 'City Searched').properties.query_length,6);
assert(!events.some(event => JSON.stringify(event.properties).includes('x@example.com')));
console.log('PASS analytics: useful events, query length only, blocked sensitive properties and bounded text.');

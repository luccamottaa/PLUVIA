const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('salva favoritos e cidade juntos e cancela fila ao sair', async () => {
  const nodes = new Map(), events = new Map(), timers = new Map(), writes = [];
  let nextTimer = 0, listener;
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, {value:'',hidden:false,textContent:'',events:{},
      setAttribute(){},focus(){},addEventListener(k,f){this.events[k]=f}});
    return nodes.get(id);
  };
  const user = {id:'account-a',user_metadata:{},email:'test@example.com'};
  const auth = {
    onAuthStateChange(fn){listener=fn},
    async getSession(){return {data:{session:{user}}}},
    async updateUser({data}){writes.push(data);return {data:{user}}},
  };
  const ctx = {
    setTimeout(fn){const id=++nextTimer;timers.set(id,fn);return id},
    clearTimeout(id){timers.delete(id)},
    document:{getElementById:get,createElement(){return {}},head:{appendChild(s){s.onload()}}},
    window:{supabase:{createClient(){return {auth}}},addEventListener(k,f){events.set(k,f)}},
    localStorage:{getItem(){return null}},
  };
  vm.runInNewContext(fs.readFileSync('dist/account.js','utf8'),ctx);
  for(let i=0;i<12;i++) await Promise.resolve();
  events.get('pluvia:favorites-changed')({detail:{ids:['1302603']}});
  events.get('pluvia:city-changed')({detail:{id:'3550308'}});
  assert.equal(timers.size,1);
  const task=[...timers.values()][0];timers.clear();await task();
  assert.deepEqual(JSON.parse(JSON.stringify(writes.at(-1))),{
    favorite_city_ids:['1302603'],primary_city_id:'3550308'
  });
  events.get('pluvia:city-changed')({detail:{id:'1302603'}});
  listener('SIGNED_OUT',null);
  assert.equal(timers.size,0);
});

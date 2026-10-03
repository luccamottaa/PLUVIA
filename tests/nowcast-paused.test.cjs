const test=require('node:test'),assert=require('node:assert/strict');
const {mount}=require('../dist/modules/nowcast.js');

test('Nowcast pausado mantém card oculto e não cria cliente, consultas ou listeners',async()=>{
 for(const enabled of [undefined,'false']) {
  const card={hidden:false,dataset:{enabled}};
  const root={document:{getElementById:id=>{assert.equal(id,'nowcastCard');return card;}},
   PLUVIA:{http:{createClient(){throw Error('não deve consultar fontes enquanto pausado');}}},
   addEventListener(){throw Error('não deve instalar atualização enquanto pausado');}};
  const api=mount(root);
  assert.equal(card.hidden,true);assert.equal(await api.refresh({id:'1302603'}),null);
  assert.equal(api.get(),null);assert.equal(api.regionFor({id:'1302603'}),null);
 }
});

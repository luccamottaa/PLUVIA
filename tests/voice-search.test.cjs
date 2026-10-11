const {test}=require('node:test');
const assert=require('node:assert/strict');
const voice=require('../dist/modules/voice-search.js');

function page(){
  const nodes={};
  const node=id=>nodes[id]||(nodes[id]={id,hidden:true,value:'',textContent:'',attrs:{},events:{},dispatched:[],
    setAttribute(k,v){this.attrs[k]=String(v);},removeAttribute(k){delete this.attrs[k];},getAttribute(k){return this.attrs[k]??null;},
    addEventListener(t,f){this.events[t]=f;},dispatchEvent(e){this.dispatched.push(e.type);},focus(){}});
  ['voiceSearch','citySearch','cityPickerStatus','cityDialog'].forEach(node);
  return {nodes,doc:{getElementById:id=>nodes[id]}};
}
class FakeRecognition{constructor(){FakeRecognition.last=this;this.started=false;this.aborted=false;}start(){this.started=true;}abort(){this.aborted=true;}}

test('sem reconhecimento de fala o microfone continua escondido',()=>{
  const {nodes,doc}=page();
  assert.equal(voice.mount({doc,Recognition:undefined}),null);
  assert.equal(nodes.voiceSearch.hidden,true);
});
test('fala vira texto no campo e dispara a busca normal',()=>{
  const {nodes,doc}=page();
  voice.mount({doc,Recognition:FakeRecognition});
  assert.equal(nodes.voiceSearch.hidden,false);
  nodes.voiceSearch.events.click();
  const rec=FakeRecognition.last;
  assert.equal(rec.lang,'pt-BR');assert.equal(rec.started,true);
  assert.equal(nodes.voiceSearch.attrs['aria-pressed'],'true');
  rec.onresult({results:[[{transcript:' Parintins. '}]]});
  rec.onend();
  assert.equal(nodes.citySearch.value,'Parintins');
  assert.deepEqual(nodes.citySearch.dispatched,['input']);
  assert.equal(nodes.voiceSearch.attrs['aria-pressed'],'false');
  assert.equal(nodes.cityPickerStatus.textContent,'');
});
test('permissão negada explica e fechar o diálogo encerra a escuta',()=>{
  const {nodes,doc}=page();
  voice.mount({doc,Recognition:FakeRecognition});
  nodes.voiceSearch.events.click();
  let rec=FakeRecognition.last;
  rec.onerror({error:'not-allowed'});rec.onend();
  assert.match(nodes.cityPickerStatus.textContent,/microfone/);
  nodes.voiceSearch.events.click();rec=FakeRecognition.last;
  nodes.cityDialog.events.close();
  assert.equal(rec.aborted,true);
  rec.onresult({results:[[{transcript:'Recife'}]]});
  assert.equal(nodes.citySearch.value,'','resultado depois de fechar não preenche o campo');
});
test('limpa pontuação e espaços da transcrição',()=>{
  assert.equal(voice.cleanTranscript('  são   paulo!'),'são paulo');
});

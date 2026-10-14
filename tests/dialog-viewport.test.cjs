const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const p0 = fs.readFileSync('dist/p0.js', 'utf8');
const source = p0.slice(p0.indexOf('(function setupDialogViewport()'));

function setup(withViewport = true) {
  const values = new Map(), frames = [], listeners = {}, rootWrites = [];
  let writes = 0;
  const dialog = {tagName:'DIALOG', style:{setProperty(name, value) {writes++; values.set(name, value);}}};
  const viewport = {height:852, offsetTop:0, addEventListener(type, fn) {listeners['viewport:' + type] = fn;}};
  const window = {innerHeight:852, addEventListener(type, fn) {listeners['window:' + type] = fn;}};
  if (withViewport) window.visualViewport = viewport;
  vm.runInNewContext(source, {
    window,
    document:{hidden:false,addEventListener(type,fn){listeners['document:' + type]=fn;},querySelectorAll:selector=>selector==='dialog'?[dialog]:[],
      documentElement:{style:{setProperty(name, value) {rootWrites.push(name);}}}},
    requestAnimationFrame(fn) {frames.push(fn);}
  });
  return {window, viewport, values, frames, listeners, dialog, rootWrites, writes:() => writes, flush() {while (frames.length) frames.shift()();}};
}

test('abertura: mede no próximo quadro e escreve nas janelas, nunca em <html>', () => {
  const s = setup();
  assert.equal(s.values.size, 0, 'nada é medido dentro da tarefa de abertura');
  assert.equal(s.frames.length, 1);
  s.flush();
  assert.equal(s.values.get('--dialog-height'), '852px');
  assert.deepEqual(s.rootWrites, [], 'variável herdada na raiz recalculava o estilo da página inteira');
  const before = s.writes();
  s.listeners['window:resize'](); s.flush();
  assert.equal(s.writes(), before, 'a mesma medida não é reescrita');
  s.listeners['document:toggle']({target:s.dialog});
  assert.equal(s.writes(), before, 'abrir uma janela com a mesma medida não reescreve');
});

test('busca acompanha a altura e o deslocamento visível do teclado iOS', () => {
  const s = setup();
  s.viewport.height = 430;
  s.viewport.offsetTop = 180;
  s.listeners['viewport:resize']();
  s.listeners['viewport:scroll']();
  assert.equal(s.frames.length, 1, 'resize e pan da mesma abertura não disputam o layout');
  s.flush();
  assert.equal(s.values.get('--dialog-height'), '430px');
  assert.equal(s.values.get('--dialog-offset-top'), '180px');
  // iOS can pan again without another resize while focusing an input.
  s.viewport.offsetTop = 230;
  s.listeners['viewport:scroll']();
  s.flush();
  assert.equal(s.values.get('--dialog-offset-top'), '230px');
});

test('fechar o teclado e retomar a PWA restaura a área inteira sem offset antigo', () => {
  const s = setup();
  s.viewport.height = 410; s.viewport.offsetTop = 200;
  s.listeners['viewport:resize'](); s.flush();
  s.viewport.height = 852; s.viewport.offsetTop = 0;
  s.listeners['window:pageshow'](); s.flush();
  assert.equal(s.values.get('--dialog-height'), '852px');
  assert.equal(s.values.get('--dialog-offset-top'), '0px');
});

test('sem VisualViewport, orientação e redimensionamento usam a altura da janela', () => {
  const s = setup(false);
  s.window.innerHeight = 390;
  s.listeners['window:orientationchange'](); s.flush();
  assert.equal(s.values.get('--dialog-height'), '390px');
  assert.equal(s.values.get('--dialog-offset-top'), '0px');
});

test('retomar pelo alternador de apps sincroniza o teclado sem depender de pageshow', () => {
  const s=setup();s.viewport.height=430;s.viewport.offsetTop=180;
  s.listeners['viewport:resize']();s.flush();
  s.viewport.height=852;s.viewport.offsetTop=0;
  s.listeners['document:visibilitychange']();s.flush();
  assert.equal(s.values.get('--dialog-height'),'852px');
  assert.equal(s.values.get('--dialog-offset-top'),'0px');
});
test('medição inválida do viewport não deixa a busca presa na altura do teclado', () => {
  const s=setup();s.viewport.height=0;s.viewport.offsetTop=NaN;s.window.innerHeight=700;
  s.listeners['viewport:resize']();s.flush();
  assert.equal(s.values.get('--dialog-height'),'700px');
  assert.equal(s.values.get('--dialog-offset-top'),'0px');
});

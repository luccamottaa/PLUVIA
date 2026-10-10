const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const app = fs.readFileSync('dist/app.js', 'utf8');
const slice = (from, to) => app.slice(app.indexOf(from), app.indexOf(to));
const storage = () => { const map = new Map(); return {map, getItem:k => map.has(k) ? map.get(k) : null, setItem:(k, v) => map.set(k, String(v))}; };

test('ordem dos favoritos fica no aparelho e favorito novo entra no fim', () => {
  const localStorage = storage(), events = [];
  const context = vm.createContext({localStorage, favorites:new Set(['1','2','3']), CustomEvent:class { constructor(type){ this.type = type; } }, globalThis:{dispatchEvent:e => events.push(e.type)}});
  vm.runInContext(slice('const FAVORITE_ORDER_KEY', 'if (globalThis.PLUVIA) globalThis.PLUVIA.favoriteOrder'), context);
  assert.deepEqual([...context.orderedFavorites()], ['1','2','3']);
  context.saveFavoriteOrder(['3','1','2']);
  assert.deepEqual(events, ['pluvia:favorites-ordered']);
  context.favorites.add('4');
  assert.deepEqual([...context.orderedFavorites()], ['3','1','2','4']);
  context.favorites.delete('1');
  assert.deepEqual([...context.orderedFavorites()], ['3','2','4']);
  localStorage.setItem('pluvia-favorite-order', '{quebrado');
  assert.deepEqual([...context.orderedFavorites()], ['2','3','4']);
});

test('dica do deslizar: só no toque, até 3 sessões, e some de vez no primeiro uso', () => {
  const localStorage = storage(); let sessionStorage = storage(), touch = true;
  const hint = {hidden:true};
  const context = vm.createContext({localStorage, get sessionStorage(){ return sessionStorage; }, $:() => hint, globalThis:{matchMedia:() => ({matches:touch})}});
  vm.runInContext(slice('const SWIPE_HINT_KEY', 'function renderCityDots('), context);
  context.updateSwipeHint(false); assert.equal(hint.hidden, true);
  touch = false; context.updateSwipeHint(true); assert.equal(hint.hidden, true);
  touch = true;
  for (let session = 1; session <= 3; session++) {
    sessionStorage = storage();
    context.updateSwipeHint(true); assert.equal(hint.hidden, false, 'sessão ' + session);
    context.updateSwipeHint(true); assert.equal(hint.hidden, false, 'mesma sessão continua');
  }
  sessionStorage = storage(); context.updateSwipeHint(true); assert.equal(hint.hidden, true);
  localStorage.setItem('pluvia-swipe-hint', '0'); sessionStorage = storage();
  context.updateSwipeHint(true); assert.equal(hint.hidden, false);
  context.finishSwipeHint(); assert.equal(hint.hidden, true);
  sessionStorage = storage(); context.updateSwipeHint(true); assert.equal(hint.hidden, true);
});

test('convite de avisos aparece com chuva ou aviso oficial, só quando a permissão pode ser pedida', () => {
  const box = {hidden:true, dataset:{}}, text = {textContent:''};
  let offer = true;
  const nodes = {alertNudge:box, alertNudgeText:text};
  const context = vm.createContext({$:id => nodes[id], settleBlock(){}, globalThis:{PLUVIA:{alertOffer:{canOffer:() => offer}}}});
  vm.runInContext(slice('function noteAlertNudge(', 'globalThis.addEventListener?.("pluvia:alert-offer-changed"'), context);
  context.updateAlertNudge(); assert.equal(box.hidden, true);
  context.noteAlertNudge('rain', true); assert.equal(box.hidden, false); assert.match(text.textContent, /chuva/);
  context.noteAlertNudge('official', true); assert.match(text.textContent, /INMET/);
  offer = false; context.updateAlertNudge(); assert.equal(box.hidden, true);
  offer = true; context.noteAlertNudge('rain', false); context.noteAlertNudge('official', false); assert.equal(box.hidden, true);
});

test('no iPhone fora da Tela de Início o convite leva ao passo a passo de instalar', () => {
  const box = {hidden:true, dataset:{}}, text = {textContent:''}, button = {textContent:'Ativar avisos'}, tracked = [];
  let install = true;
  const nodes = {alertNudge:box, alertNudgeText:text, alertNudgeEnable:button};
  const context = vm.createContext({$:id => nodes[id], settleBlock(){}, globalThis:{pluviaAnalytics:{track:(name, props) => tracked.push([name, props.offer])}, PLUVIA:{alertOffer:{canOffer:() => true, needsInstall:() => install}}}});
  vm.runInContext(slice('function noteAlertNudge(', 'globalThis.addEventListener?.("pluvia:alert-offer-changed"'), context);
  context.noteAlertNudge('rain', true);
  assert.equal(button.textContent, 'Como ativar'); assert.equal(box.dataset.offer, 'install');
  context.updateAlertNudge(); assert.deepEqual(tracked, [['Alert Nudge Shown', 'install']], 'conta só quando aparece');
  install = false; context.updateAlertNudge(); assert.equal(button.textContent, 'Ativar avisos'); assert.equal(box.dataset.offer, 'enable');
});

test('canOffer oferece instalar no iPhone fora da Tela de Início e respeita o "Agora não"', () => {
  const source = fs.readFileSync(__dirname + '/../dist/notifications.js', 'utf8');
  assert.match(source, /canOffer: \(\) => !promptDismissed\(\) && \(\(isIOS && !standalone\) \|\| \(pushActive === false && supported && Notification\.permission !== "denied"\)\)/);
  assert.match(source, /needsInstall: \(\) => isIOS && !standalone/);
});

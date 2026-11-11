const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 1.70.6 (pedido do dono, "a Home pula"): o convite de avisos usa a última resposta conhecida enquanto
// notifications.js ainda confere a inscrição, para já nascer no lugar.
const app = fs.readFileSync(path.join(__dirname, '../dist/app.js'), 'utf8');
const start = app.indexOf('const ALERT_OFFER_KEY');
const source = app.slice(start, app.indexOf('\nfunction noteAlertNudge(', start));
const {alertOfferAllowed, ALERT_OFFER_KEY} = vm.runInNewContext(source + ';({alertOfferAllowed, ALERT_OFFER_KEY})');
const storage = (initial = {}) => { const data = {...initial}; return {data, getItem:key => key in data ? data[key] : null, setItem:(key, value) => { data[key] = String(value); }}; };

test('resposta conhecida manda e fica guardada para a próxima abertura', () => {
  const store = storage();
  assert.equal(alertOfferAllowed({known:() => true, canOffer:() => true}, store), true);
  assert.equal(store.data[ALERT_OFFER_KEY], '1');
  assert.equal(alertOfferAllowed({known:() => true, canOffer:() => false}, store), false);
  assert.equal(store.data[ALERT_OFFER_KEY], '0');
});

test('ainda conferindo (ou notifications.js nem carregou): usa a última resposta, para o convite nascer no lugar', () => {
  assert.equal(alertOfferAllowed(undefined, storage({[ALERT_OFFER_KEY]:'1'})), true);
  assert.equal(alertOfferAllowed({known:() => false, canOffer:() => false}, storage({[ALERT_OFFER_KEY]:'1'})), true);
  assert.equal(alertOfferAllowed({known:() => false, canOffer:() => false}, storage({[ALERT_OFFER_KEY]:'0'})), false);
  assert.equal(alertOfferAllowed(undefined, storage()), false, 'primeira vez: espera a resposta, como antes');
});

test('sem storage não quebra; notifications.js sem known() segue o canOffer', () => {
  const broken = {getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }};
  assert.equal(alertOfferAllowed(undefined, broken), false);
  assert.equal(alertOfferAllowed({known:() => true, canOffer:() => true}, broken), true);
  assert.equal(alertOfferAllowed({canOffer:() => true}, storage()), true);
});

test('notifications.js diz quando já sabe a resposta', () => {
  const src = fs.readFileSync(path.join(__dirname, '../dist/notifications.js'), 'utf8');
  assert.match(src, /known: \(\) => promptDismissed\(\) \|\| \(isIOS && !standalone\) \|\| !supported \|\| Notification\.permission === "denied" \|\| pushActive !== null,/);
  assert.match(app, /const show = \(nudgeRain \|\| nudgeOfficial \|\| nudgeRegular \|\| nudgeRadar\) && alertOfferAllowed\(\);/);
});
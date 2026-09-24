const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
const css = fs.readFileSync(path.join(__dirname,'../dist/styles.css'),'utf8');
const source = app.slice(app.indexOf('function aqiLabel('),app.indexOf('\nfunction decodeHtml('));

test('o card colore cada faixa real de AQI e volta ao neutro sem dados', () => {
  const card = {dataset:{}};
  const elements = {
    airQuality:{textContent:''},airQualityCard:card,
    airNote:{textContent:''}
  };
  const {renderAirQuality} = vm.runInNewContext(`${source}\n({renderAirQuality})`,{$:id=>elements[id]});
  for (const [aqi,level,label] of [
    [0,'good','Boa'],[50,'good','Boa'],[51,'moderate','Moderada'],
    [100,'moderate','Moderada'],[101,'sensitive','Ruim para grupos sensíveis'],
    [150,'sensitive','Ruim para grupos sensíveis'],[151,'poor','Ruim'],
    [200,'poor','Ruim'],[201,'very-poor','Muito ruim'],
    [300,'very-poor','Muito ruim'],[301,'hazardous','Perigosa']
  ]) {
    renderAirQuality(aqi);
    assert.equal(card.dataset.aqiLevel,level,`AQI ${aqi}`);
    assert.equal(elements.airQuality.textContent,label);
    assert.match(css,new RegExp(`\\.air-metric\\[data-aqi-level="${level}"\\]`));
  }
  renderAirQuality(null);
  assert.equal(card.dataset.aqiLevel,undefined);
  assert.equal(elements.airQuality.textContent,'--');
  assert.equal(elements.airNote.textContent,'AQI indisponível');
});

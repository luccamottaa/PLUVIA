const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname,'../dist/p0.js'),'utf8');
const introSource = source.slice(source.indexOf('function pinTop()'),source.indexOf('function buildRainPhrase('));

test('Pular revela o clima imediatamente e a saída automática não dispara duas vezes', () => {
  const timers = [];
  const intro = {hidden:false,dataset:{},classList:{classes:[],add(name){this.classes.push(name);}}};
  const view = {hidden:true}, nav = {hidden:true}, welcome = {hidden:false};
  const skip = {addEventListener(name,callback){this[name]=callback;}};
  const nodes = {pluviaIntro:intro,locationWelcome:welcome,weatherView:view,siteNav:nav,skipIntro:skip};
  const context = {document:{getElementById:id=>nodes[id],documentElement:{scrollTop:12},body:{scrollTop:12}},
    window:{scrollTo(){}},requestAnimationFrame:callback=>callback(),setTimeout:(callback,delay)=>{timers.push({callback,delay});}};
  vm.runInNewContext(introSource,context);
  skip.click();
  assert.equal(view.hidden,false);
  assert.equal(nav.hidden,false);
  assert.equal(welcome.hidden,true);
  assert.equal(intro.dataset.done,'1');
  assert.deepEqual(intro.classList.classes,['is-leaving']);
  context.dismissIntro();
  assert.equal(intro.classList.classes.length,1);
  timers.find(timer=>timer.delay===480).callback();
  assert.equal(intro.hidden,true);
});

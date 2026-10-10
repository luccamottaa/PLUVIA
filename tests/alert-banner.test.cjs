const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','dist','app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','dist','continuous.css'),'utf8');
const source=app.slice(app.indexOf('function setAlertBanner('),app.indexOf('function renderInmetAlerts('));
function run(item,others=0){
  const attrs={},els={alertBannerTitle:{textContent:''},alertBannerTime:{textContent:''}};
  const banner={hidden:true,setAttribute:(k,v)=>{attrs[k]=v;},removeAttribute:k=>{delete attrs[k];}};
  els.alertBanner=banner;
  const ctx={$:id=>els[id],activeCity:{timezone:'America/Manaus'},globalThis:{},Intl,Date,Number,String,
    decodeHtml:v=>v,firstValue:(o,keys,fallback)=>keys.map(k=>o?.[k]).find(Boolean)??fallback};
  vm.runInNewContext(`${source}\nsetAlertBanner(item,0,others)`,Object.assign(ctx,{item,others}));
  attrs.time=els.alertBannerTime.textContent;
  return {banner,attrs,title:els.alertBannerTitle.textContent};
}
const severity={yellow:{className:'yellow',rank:1,label:'Alerta amarelo'},orange:{className:'orange',rank:2,label:'Alerta laranja'},
  red:{className:'red',rank:3,label:'Alerta vermelho'},unknown:{className:'unknown',rank:0,label:'Aviso meteorológico'}};
test('faixa no topo mostra aviso amarelo, laranja e vermelho vigentes; severidade desconhecida não sobe',()=>{
  for(const level of ['yellow','orange','red']){
    const {banner,attrs,title}=run({alert:{descricao:'Baixa Umidade'},severity:severity[level],end:Date.parse('2026-10-10T21:00:00-04:00')});
    assert.equal(banner.hidden,false,level);
    assert.equal(attrs['data-severity'],level);
    assert.match(title,/do INMET · Baixa Umidade$/);
  }
  assert.equal(run({alert:{},severity:severity.unknown}).banner.hidden,true);
  assert.equal(run(null).banner.hidden,true);
});
test('amarelo é discreto: mais baixo e sem sombra, ainda com alvo de 44 px',()=>{
  assert.match(css,/#weatherView \.alert-banner\[data-severity="yellow"\] \{ min-height:44px; [^}]*box-shadow:none; \}/);
});

test('com outros avisos na região, a faixa diz quantos (eles ficam no detalhe) e o cartão some',()=>{
  const item={alert:{descricao:'Baixa Umidade'},severity:severity.yellow,end:Date.parse('2026-10-13T22:59:00-04:00')};
  assert.equal(run(item).attrs.time,'Vigente até 13/10, 22:59');
  assert.equal(run(item,1).attrs.time,'Vigente até 13/10, 22:59 · +1 aviso na região');
  assert.equal(run(item,2).attrs.time,'Vigente até 13/10, 22:59 · +2 avisos na região');
  assert.match(css,/#weatherView #alertas\[data-alert-state="banner"\] \{ display:none !important; \}/);
  const risks=fs.readFileSync(path.join(__dirname,'..','dist','modules','risks.js'),'utf8');
  assert.match(risks,/Outros avisos na região[\s\S]*data-notice="\$\{i\}"/);
  assert.match(risks,/if \(!\$\('alertDetail'\)\.open\) \$\('alertDetail'\)\.showModal\(\)/,'trocar de aviso com o diálogo aberto não reabre o modal');
});

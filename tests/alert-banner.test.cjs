const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','dist','app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','dist','continuous.css'),'utf8');
const source=app.slice(app.indexOf('function setAlertBanner('),app.indexOf('function renderInmetAlerts('));
function run(item){
  const attrs={},els={alertBannerTitle:{textContent:''},alertBannerTime:{textContent:''}};
  const banner={hidden:true,setAttribute:(k,v)=>{attrs[k]=v;},removeAttribute:k=>{delete attrs[k];}};
  els.alertBanner=banner;
  const ctx={$:id=>els[id],activeCity:{timezone:'America/Manaus'},globalThis:{},Intl,Date,Number,String,
    decodeHtml:v=>v,firstValue:(o,keys,fallback)=>keys.map(k=>o?.[k]).find(Boolean)??fallback};
  vm.runInNewContext(`${source}\nsetAlertBanner(item,0)`,Object.assign(ctx,{item}));
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

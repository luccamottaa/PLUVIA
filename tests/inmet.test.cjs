const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "dist/app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "dist/index.html"), "utf8");
const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id]) => [id, {
  innerHTML:"", textContent:"", className:"", dataset:{}, children:[], appendChild(node){this.children.push(node)},
}]));
const now = Date.parse("2026-09-09T00:10:00Z");
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const context = vm.createContext({
  document:{getElementById:id => nodes.get(id), querySelectorAll:() => [], createElement:() => ({textContent:''})},
  Date:FixedDate, Intl, URL, AbortController, setTimeout, clearTimeout,
  DOMParser: class {parseFromString(text) {return {documentElement:{textContent:text}};}},
});
vm.runInContext(fs.readFileSync(path.join(root, "dist/municipalities.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(root, "dist/capitals.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(root, "dist/modules/sources.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(root, "dist/modules/signal.js"), "utf8"), context);
context.PLUVIA.sources.get = () => ({status:'ready'});
vm.runInContext(source.slice(0, source.lastIndexOf("\nsetupCityPicker();")), context);
vm.runInContext('activeCity = cityById.get("1302603")', context);

// Synthetic data in the Alert-AS hoje/futuro envelope. IDs are test values;
// this fixture is not a live alert, never shipped as weather data.
const aviso = overrides => ({
  id:900001, id_aviso:900001, descricao:"Tempestade", severidade:"Perigo Potencial",
  aviso_cor:"#FFCC00", estados:"Amazonas", geocodes:"1302603,1301852",
  data_inicio:"2026-09-08T00:00:00.000Z", hora_inicio:"08:47",
  data_fim:"2026-09-08T00:00:00.000Z", hora_fim:"23:59",
  riscos:["Chuva e ventos intensos."], encerrado:false, ...overrides
});
let checks = 0;
async function test(label, fn) {await fn(); checks++; console.log(`PASS ${label}`);}

(async () => {
  await test("Go-out advice respects every active official severity", () => {
    const forecast = {hourly:{time:["2026-09-08T20:00"],precipitation:[0],precipitation_probability:[0],wind_gusts_10m:[0],apparent_temperature:[25]},current:{}};
    for (const [severity,level] of [["yellow","attention"],["orange","wait"],["red","danger"],["unknown","attention"],["none","good"]]) {
      nodes.get("inmetCard").dataset.severity = severity;
      context.renderGoOut(forecast, {current:{us_aqi:20}});
      assert.equal(nodes.get("goOutCard").dataset.level, level, severity);
      if (severity === "yellow") assert.match(nodes.get("goOutReason").textContent, /alerta amarelo do INMET/);
    }
  });
  await test("Reads hoje and futuro, deduplicates and preserves all distinct notices", () => {
    const today = aviso();
    const tomorrow = aviso({id_aviso:900002, data_inicio:"2026-09-09", data_fim:"2026-09-10"});
    const rows = context.normalizeAlerts({hoje:[today], futuro:[today,tomorrow]});
    assert.equal(rows.length,2);
    assert.equal(rows[1].id_aviso,900002);
    assert.equal(context.normalizeAlerts({hoje:[],futuro:[]}).length,0);
  });
  await test("Unknown, malformed and error responses cannot become an empty success", () => {
    for (const response of [null, {}, {error:"unavailable"}, {hoje:{}}, {hoje:null,futuro:null}, {hoje:[{}]}]) {
      assert.throws(() => context.normalizeAlerts(response));
    }
  });
  await test("Array and GeoJSON envelopes remain supported", () => {
    assert.equal(context.normalizeAlerts([aviso()]).length,1);
    assert.equal(context.normalizeAlerts({features:[{properties:aviso()}]}).length,1);
  });
  await test("Uses the official Manaus municipality code even without a state or city name", () => {
    assert.equal(context.inmetArea(aviso({estados:"",geocodes:[1302603]})),"Manaus");
    assert.equal(context.inmetArea(aviso({geocodes:"1301852"})),null);
    assert.equal(context.inmetArea(aviso({geocodes:"",estados:"Amazonas"})),"Amazonas · confirme a área no mapa");
  });
  await test("Yellow, orange and red derive from severity, not words inside risk descriptions", () => {
    assert.equal(context.inmetSeverity(aviso({riscos:["Não significa grande perigo em todas as áreas"]})).className,"yellow");
    assert.equal(context.inmetSeverity(aviso({severidade:"Perigo",aviso_cor:"#F96602"})).className,"orange");
    assert.equal(context.inmetSeverity(aviso({severidade:"Grande Perigo",aviso_cor:"#FF0000"})).className,"red");
    assert.equal(context.inmetSeverity({severidade:"",aviso_cor:"",riscos:"perigo"}).className,"unknown");
  });
  await test("INMET Brasília times are combined with the hour field before conversion to Manaus", () => {
    assert.equal(context.inmetTime(aviso(),"fim"),Date.parse("2026-09-09T02:59:00Z"));
    assert.equal(context.inmetTime({fim:"2026-09-08 23:59"},"fim"),Date.parse("2026-09-09T02:59:00Z"));
    assert.equal(context.inmetTime({fim:"2026-09-09T02:59:00Z"},"fim"),Date.parse("2026-09-09T02:59:00Z"));
    assert(Number.isNaN(context.inmetTime({data_fim:"2026-09-08T00:00:00.000Z"},"fim")));
  });
  await test("Expired and closed notices are excluded; future notices are clearly separated", () => {
    const rows = context.selectInmetAlerts({hoje:[aviso(),aviso({id_aviso:900002,encerrado:true}),aviso({id_aviso:900003,hora_fim:"10:00"})],
      futuro:[aviso({id_aviso:900004,data_inicio:"2026-09-09",data_fim:"2026-09-10"})]},now);
    assert.equal(rows.length,2);
    assert.equal(rows[0].stage,"active");
    assert.equal(rows[1].stage,"future");
  });
  await test("Renders direct official links, yellow severity and the expiry in Manaus time", () => {
    context.renderInmetAlerts({hoje:[aviso()],futuro:[]});
    const content = nodes.get("inmetContent").innerHTML;
    assert(content.includes('https://avisos.inmet.gov.br/900001'));
    assert(content.includes('Alerta amarelo'));
    assert(content.includes('22:59'));
    assert.equal(nodes.get("inmetState").className,"source-state inmet-yellow");
  });
  await test("Renders every matching alert, with the most severe current notice first", () => {
    context.renderInmetAlerts({hoje:[aviso(),aviso({id_aviso:900010,severidade:"Grande Perigo",aviso_cor:"#FF0000"})],futuro:[]});
    const content = nodes.get("inmetContent").innerHTML;
    assert(content.indexOf('/900010') < content.indexOf('/900001'));
    assert.equal((content.match(/class="inmet-alert /g)||[]).length,2);
  });
  await test("Initial failure says unavailable; later failure keeps notices explicitly unconfirmed", async () => {
    context.fetchJson = async () => {throw new Error("network");};
    await context.loadInmetAlerts();
    assert(nodes.get("inmetState").innerHTML.includes("Consulta indisponível"));
    context.fetchJson = async () => ({hoje:[aviso()],futuro:[]});
    await context.loadInmetAlerts();
    context.fetchJson = async () => {throw new Error("network");};
    await context.loadInmetAlerts();
    assert(nodes.get("inmetState").innerHTML.includes("Sem confirmação recente"));
    assert(nodes.get("inmetContent").innerHTML.includes('/900001'));
    assert(!nodes.get("inmetContent").innerHTML.includes("Nenhum aviso"));
  });
  await test("Notice text is escaped and nonnumeric IDs cannot inject a destination URL", () => {
    context.renderInmetAlerts({hoje:[aviso({id_aviso:'\" onclick=\"alert(1)',descricao:'<img src=x onerror=alert(1)>'})],futuro:[]});
    const content = nodes.get("inmetContent").innerHTML;
    assert(!content.includes('<img'));
    assert(content.includes('href="https://alertas2.inmet.gov.br/"'));
  });
  console.log(`${checks} INMET regression checks passed.`);
})().catch(error => {console.error(error);process.exitCode=1;});

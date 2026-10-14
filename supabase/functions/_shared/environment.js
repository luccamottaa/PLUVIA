// Rios e focos de calor (pedido do usuário, outubro/2026): funções puras usadas por environment-refresh
// (e pelos testes). Nada aqui recebe dado de quem usa o app: o cron baixa as fontes públicas e guarda um
// resumo; o app só lê o resumo da cidade aberta.

// Estações telemétricas da ANA conferidas uma a uma (cota em cm, leitura a cada 15 min), com o
// município (IBGE) em que estão. Só entram estações na própria cidade: cota de outra cidade engana.
export const RIVER_STATIONS = [
  {code:"14990000", city:"1302603", river:"Rio Negro", place:"Manaus"},
  {code:"16030000", city:"1301902", river:"Rio Amazonas", place:"Itacoatiara"},
  {code:"16350002", city:"1303403", river:"Rio Amazonas", place:"Parintins"},
  {code:"14100000", city:"1302504", river:"Rio Solimões", place:"Manacapuru"},
  {code:"10100000", city:"1304062", river:"Rio Solimões", place:"Tabatinga"},
  {code:"13990000", city:"1300631", river:"Rio Purus", place:"Beruri"},
  {code:"15630000", city:"1301704", river:"Rio Madeira", place:"Humaitá"},
  {code:"15400000", city:"1100205", river:"Rio Madeira", place:"Porto Velho"},
  {code:"13600002", city:"1200401", river:"Rio Acre", place:"Rio Branco"},
  {code:"12500000", city:"1200203", river:"Rio Juruá", place:"Cruzeiro do Sul"},
  {code:"14620000", city:"1400100", river:"Rio Branco", place:"Boa Vista"},
  {code:"17050001", city:"1505106", river:"Rio Amazonas", place:"Óbidos"},
  {code:"17900000", city:"1506807", river:"Rio Tapajós", place:"Santarém"},
];

const HOUR = 3600_000, DAY = 24 * HOUR;
const pad = value => String(value).padStart(2, "0");
// A telemetria da ANA usa o horário de Brasília (UTC−3, sem horário de verão).
const brasilia = at => { const date = new Date(at - 3 * HOUR); return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`; };

export function anaUrl(code, now = Date.now()) {
  if (!/^\d{8}$/.test(String(code))) throw new Error("invalid_station");
  return `http://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos?codEstacao=${code}&dataInicio=${brasilia(now - 2 * DAY)}&dataFim=${brasilia(now)}`;
}

const median = list => { const sorted = [...list].sort((a, b) => a - b), mid = sorted.length >> 1; return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };

// XML da ANA → última cota (cm) e variação em 24 h. Cada ponta usa a mediana de uma hora de leituras,
// porque o sensor oscila 1–2 cm entre medições de 15 min. Sem leitura de até 12 h, null; sem leitura
// perto de 24 h antes, a variação fica null (nunca "estável" por falta de dado).
export function parseAna(xml, now = Date.now()) {
  if (typeof xml !== "string") return null;
  const readings = [];
  for (const match of xml.matchAll(/<DataHora>\s*(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):\d{2}\s*<\/DataHora>[\s\S]*?<Nivel>\s*(-?\d+(?:\.\d+)?)\s*<\/Nivel>/g)) {
    const [, y, mo, d, h, mi, level] = match;
    const at = Date.UTC(+y, +mo - 1, +d, +h + 3, +mi);
    const cm = Number(level);
    if (Number.isFinite(at) && Number.isFinite(cm) && cm >= -1000 && cm <= 6000 && at <= now + 15 * 60_000) readings.push({at, cm});
  }
  if (!readings.length) return null;
  readings.sort((a, b) => b.at - a.at);
  const latest = readings[0].at;
  if (now - latest > 12 * HOUR) return null;
  const around = target => readings.filter(item => Math.abs(item.at - target) <= 30 * 60_000).map(item => item.cm);
  const recent = readings.filter(item => latest - item.at <= HOUR).map(item => item.cm);
  const past = around(latest - DAY);
  const levelCm = Math.round(median(recent));
  return {at:new Date(latest).toISOString(), levelCm, change24hCm:past.length ? Math.round(median(recent) - median(past)) : null};
}

// Arquivos diários de focos do INPE (todos os satélites), de hoje e de ontem em UTC: juntos cobrem as
// últimas 24 h. O de hoje é atualizado ao longo do dia (~1 h de atraso).
export function inpeUrls(now = Date.now()) {
  return [now - DAY, now].map(at => {
    const date = new Date(at);
    return `https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/diario/Brasil/focos_diario_br_${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}.csv`;
  });
}

// CSV do INPE → focos das últimas 24 h, agrupados por célula de 0,01° (~1 km): o GOES-19 vê o mesmo fogo a
// cada 10 min e vários satélites passam pelo mesmo ponto, então contar linhas multiplicaria o mesmo foco.
// Saída em células de 1° ("lat,lon" pelo piso) para a consulta da cidade olhar só as vizinhas:
// {"-4,-61": [[lat, lon, minutoUnix], …]}. Coordenadas fora do Brasil e horários inválidos ficam de fora.
export function parseFires(texts, now = Date.now()) {
  const cells = new Map();
  for (const text of texts) {
    if (typeof text !== "string" || !text.startsWith("id,lat,lon,data_hora_gmt")) continue;
    let start = text.indexOf("\n") + 1;
    while (start > 0 && start < text.length) {
      const end = text.indexOf("\n", start), line = text.slice(start, end < 0 ? text.length : end);
      start = end < 0 ? -1 : end + 1;
      const c1 = line.indexOf(","), c2 = line.indexOf(",", c1 + 1), c3 = line.indexOf(",", c2 + 1), c4 = line.indexOf(",", c3 + 1);
      if (c4 < 0) continue;
      const lat = Number(line.slice(c1 + 1, c2)), lon = Number(line.slice(c2 + 1, c3));
      const at = Date.parse(line.slice(c3 + 1, c4).replace(" ", "T") + "Z");
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -34 || lat > 6 || lon < -75 || lon > -28) continue;
      if (!Number.isFinite(at) || now - at > DAY || at - now > 15 * 60_000) continue;
      const key = `${Math.round(lat * 100)},${Math.round(lon * 100)}`, minute = Math.floor(at / 60_000);
      const previous = cells.get(key);
      if (!previous || previous[2] < minute) cells.set(key, [Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000, minute]);
    }
  }
  const grouped = {};
  for (const spot of cells.values()) (grouped[`${Math.floor(spot[0])},${Math.floor(spot[1])}`] ||= []).push(spot);
  return {cells:grouped, count:cells.size};
}

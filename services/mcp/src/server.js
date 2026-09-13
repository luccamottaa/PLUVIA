import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { getAirQuality, getCurrentWeather, getRainForecast } from './weather.js';

const app = express();
app.use(express.json({ limit: '256kb' }));

const coordinateSchema = {
  latitude: z.number().min(-90).max(90).describe('Latitude em graus decimais.'),
  longitude: z.number().min(-180).max(180).describe('Longitude em graus decimais.')
};

function result(payload) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload
  };
}

function buildServer() {
  const server = new McpServer({ name: 'PLUVIA', version: '0.1.0' });

  server.tool('get_current_weather', 'Obtém as condições meteorológicas atuais modeladas para uma coordenada.', coordinateSchema, async (args) => result(await getCurrentWeather(args)));

  server.tool('get_rain_forecast', 'Obtém a previsão horária de chuva. Não representa radar nem chuva em nível de rua.', {
    ...coordinateSchema,
    hours: z.number().int().min(1).max(48).optional().describe('Horizonte entre 1 e 48 horas. Padrão: 12.')
  }, async (args) => result(await getRainForecast(args)));

  server.tool('get_air_quality', 'Obtém qualidade do ar modelada, incluindo US AQI e poluentes disponíveis.', coordinateSchema, async (args) => result(await getAirQuality(args)));

  return server;
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'pluvia-mcp', version: '0.1.0', time: new Date().toISOString() });
});

app.post('/mcp', async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Erro interno do PLUVIA MCP.' }, id: null });
  }
});

app.get('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').json({ error: 'Use POST para MCP.' }));
app.delete('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').json({ error: 'Servidor stateless.' }));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`PLUVIA MCP listening on :${port}`));

// Relatório mínimo de falhas para o Sentry, sem SDK. Só sai componente + código fixo:
// nada de mensagem bruta, stack, URL, usuário, cidade, endpoint ou token.
const CODE = /^[a-z][a-z0-9_-]{0,63}$/;
const DSN_HOST = /^o\d+\.ingest(\.[a-z]{2})?\.sentry\.io$/;
const LEVELS = new Set(["error", "warning"]);
const DEDUPE_MS = 5 * 60_000;
const recent = new Map();

export function safeCode(value) {
  const code = String(value ?? "").toLowerCase();
  return CODE.test(code) ? code : "unexpected";
}

export function parseDsn(dsn) {
  try {
    const url = new URL(String(dsn || ""));
    const project = url.pathname.replace(/^\/+|\/+$/g, "");
    if (url.protocol !== "https:" || url.port || url.password || !/^[0-9a-f]{32}$/.test(url.username) || !DSN_HOST.test(url.hostname) || !/^\d+$/.test(project)) return null;
    return { key: url.username, endpoint: `https://${url.hostname}/api/${project}/envelope/`, dsn: `https://${url.username}@${url.hostname}/${project}` };
  } catch { return null; }
}

export function buildEnvelope(target, { component, code, level = "error", count, now = new Date(), eventId = crypto.randomUUID().replace(/-/g, "") }) {
  const tags = { component: safeCode(component), code: safeCode(code) };
  const event = {
    event_id: eventId, timestamp: now.getTime() / 1000, platform: "javascript", logger: tags.component,
    level: LEVELS.has(level) ? level : "error", environment: "production",
    message: { formatted: `${tags.component}: ${tags.code}` }, tags, fingerprint: [tags.component, tags.code],
    sdk: { name: "pluvia.edge-report", version: "1.0.0" },
    ...(Number.isFinite(count) && count > 0 ? { extra: { count: Math.min(Math.round(count), 100_000) } } : {}),
  };
  return [
    JSON.stringify({ event_id: eventId, sent_at: now.toISOString(), dsn: target.dsn }),
    JSON.stringify({ type: "event", content_type: "application/json" }),
    JSON.stringify(event),
  ].join("\n");
}

// Nunca lança e nunca segura a resposta por mais de timeoutMs. Repetições do mesmo
// componente/código na mesma instância são puladas por 5 min para não gastar a cota.
export async function reportError(component, code, { level = "error", count, dsn, fetchImpl = globalThis.fetch, timeoutMs = 2_000, now = Date.now() } = {}) {
  try {
    const target = parseDsn(dsn ?? globalThis.Deno?.env.get("SENTRY_DSN"));
    if (!target || typeof fetchImpl !== "function") return false;
    const key = `${safeCode(component)}:${safeCode(code)}`;
    if (now - (recent.get(key) ?? -Infinity) < DEDUPE_MS) return false;
    recent.set(key, now);
    if (recent.size > 50) recent.delete(recent.keys().next().value);
    const response = await fetchImpl(target.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${target.key}, sentry_client=pluvia.edge-report/1.0.0` },
      body: buildEnvelope(target, { component, code, level, count, now: new Date(now) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    await response.body?.cancel();
    return response.ok;
  } catch { return false; }
}

// Deixa o envio para depois da resposta quando o runtime permite.
export function report(component, code, options) {
  const task = reportError(component, code, options);
  try { globalThis.EdgeRuntime?.waitUntil?.(task); } catch { /* sem waitUntil, o envio segue sozinho */ }
  return task;
}

export function resetReportsForTest() { recent.clear(); }

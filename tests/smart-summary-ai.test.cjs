const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const edge = fs.readFileSync('supabase/functions/smart-summary/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260913161000_smart_summary_ai.sql', 'utf8');
const advisorFix = fs.readFileSync('supabase/migrations/20260913162500_smart_summary_advisor_fixes.sql', 'utf8');
const app = fs.readFileSync('dist/app.js', 'utf8');

test('protege o provedor e exige usuário autenticado', () => {
  assert.match(edge, /authenticatedUser\(req\)/);
  assert.match(edge, /Deno\.env\.get\("OPENAI_API_KEY"\)/);
  assert.match(edge, /Deno\.env\.get\("OPENAI_MODEL"\) \|\| "gpt-4o-mini"/);
  assert.doesNotMatch(app, /OPENAI_API_KEY|api\.openai\.com/);
  assert.match(app, /account\?\.getUser\?\.\(\)/);
});

test('usa cache SHA-256, cota atômica e RLS sem acesso do cliente', () => {
  assert.match(edge, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(edge, /pluvia_take_summary_quota/);
  assert.match(migration, /alter table public\.smart_summary_cache enable row level security/);
  assert.match(migration, /revoke all on public\.smart_summary_cache, public\.smart_summary_quota from public, anon, authenticated/);
  assert.match(migration, /on conflict \(user_id, window_started_at\) do update/);
  assert.match(advisorFix, /to anon, authenticated[\s\S]*using \(false\)[\s\S]*with check \(false\)/);
});

test('mantém fallback imediato e só aplica IA validada ao contexto atual', () => {
  assert.match(app, /summary = smartSummary\.deterministic\(context\)/);
  assert.match(app, /smartSummary\.validate\(summary, currentContext\)/);
  assert.match(app, /data-ai-status/);
  assert.match(edge, /validSummary\(generated, context\)/);
  assert.match(edge, /provider_not_configured/);
  assert.match(edge, /provider_auth_failed/);
  assert.match(edge, /provider_rate_limited/);
  assert.match(edge, /provider_request_invalid/);
  assert.match(edge, /store: false/);
});

import { createClient } from "npm:@supabase/supabase-js@2.116.0";

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

export function adminClient(requestTimeout?: number) {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(requestTimeout ? { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {
      ...init, signal: AbortSignal.any([AbortSignal.timeout(requestTimeout), ...(init?.signal ? [init.signal] : [])]),
    }) } } : {}),
  });
}

export async function authenticatedUser(req: Request, requestTimeout?: number) {
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization },
      ...(requestTimeout ? { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {
        ...init, signal: AbortSignal.any([AbortSignal.timeout(requestTimeout), ...(init?.signal ? [init.signal] : [])]),
      }) } : {}),
    },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function pushSecrets(admin = adminClient()) {
  const { data, error } = await admin.rpc("pluvia_push_secret_bundle");
  const value = data?.[0];
  if (error || !value?.vapid_public_key || !value?.vapid_private_key || !value?.vapid_subject || !value?.cron_secret) {
    throw new Error("push_secrets_unavailable");
  }
  return value as { vapid_public_key: string; vapid_private_key: string; vapid_subject: string; cron_secret: string };
}


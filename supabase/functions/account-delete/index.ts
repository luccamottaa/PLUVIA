import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, authenticatedUser } from "../_shared/supabase.ts";
import { json, preflight, readJson, allowedOrigin } from "../_shared/http.ts";
import { recentAuthentication, deleteOwnAccount } from "../_shared/account-deletion.js";

Deno.serve(async req => {
  if(req.method === "OPTIONS") return preflight(req);
  if(req.method !== "POST") return json(req,{error:"Método não permitido."},405);
  const origin=req.headers.get("origin");
  if(origin && allowedOrigin(req)!==origin) return json(req,{error:"Origem não permitida."},403);
  try {
    const user=await authenticatedUser(req,8_000);
    if(!user) return json(req,{error:"Entre novamente para continuar."},401);
    const body=await readJson(req);
    if(body?.ownerId!==user.id || body?.confirmation!=="EXCLUIR") return json(req,{error:"Confirme a exclusão da sua conta."},400);
    const token=(req.headers.get("authorization") || "").slice(7);
    // getUser above validates the signature/user. Decoding alone never authorizes.
    let claims;
    try {claims=JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));} catch {return json(req,{error:"Entre novamente para continuar."},401);}
    if(!recentAuthentication(claims,user.id)) return json(req,{error:"Entre novamente antes de excluir sua conta.",code:"reauth_required"},403);
    await deleteOwnAccount(adminClient(8_000),token,user.id);
    return json(req,{deleted:true});
  } catch(error) {
    const invalid=error instanceof SyntaxError || ["empty_payload","payload_too_large"].includes(error instanceof Error ? error.message : "");
    if(!invalid) console.warn("account deletion unavailable",{code:"account_delete_failed"});
    return json(req,{error:invalid ? "Confirmação inválida." : "Não foi possível confirmar a exclusão. Tente novamente.",code:invalid ? "invalid_request" : "service_unavailable"},invalid ? 400 : 503);
  }
});

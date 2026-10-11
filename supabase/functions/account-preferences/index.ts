import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { report } from "../_shared/error-report.js";
import { adminClient, authenticatedUser } from "../_shared/supabase.ts";
import { json, preflight, readJson } from "../_shared/http.ts";
import { snapshot, operationsInput, applyOperations } from "../_shared/account-preferences.js";

Deno.serve(async req => {
  if(req.method==="OPTIONS") return preflight(req);
  if(req.method!=="POST") return json(req,{error:"Método não permitido."},405);
  try {
    const user=await authenticatedUser(req);
    if(!user) return json(req,{error:"Entre na sua conta para sincronizar."},401);
    const body=await readJson(req);
    if(!body || typeof body!=="object" || Array.isArray(body)) throw Error("invalid_operations");
    // Reject queued work whose session changed before the actual request.
    if(body.ownerId!==user.id) return json(req,{error:"A conta mudou. Tente novamente.",code:"account_changed"},409);
    if(body.action==="read") return json(req,{snapshot:snapshot(user.user_metadata)});
    if(body.action!=="apply") return json(req,{error:"Ação inválida."},400);
    const operations=operationsInput(body.operations),admin=adminClient(8_000);
    let metadata=user.user_metadata || {};
    for(let attempt=0;attempt<3;attempt++) {
      let patch;
      try { patch=applyOperations(metadata,operations); }
      catch(error) {
        const code=error instanceof Error ? error.message : "invalid_operations";
        if(code==="preference_conflict") return json(req,{error:"Este local foi alterado em outro dispositivo. Confira a lista antes de salvar novamente.",code,snapshot:snapshot(metadata)},409);
        if(code==="favorite_limit" || code==="place_limit") return json(req,{error:code==="favorite_limit" ? "Você pode favoritar até 30 cidades." : "Você pode salvar até 20 locais.",code,snapshot:snapshot(metadata)},409);
        throw error;
      }
      if(!Object.keys(patch).length) return json(req,{snapshot:snapshot(metadata)});
      const {data,error}=await admin.rpc("pluvia_account_patch",{p_user_id:user.id,p_expected:metadata,p_patch:patch});
      if(error) throw Error("preference_store_failed");
      if(data===true) return json(req,{snapshot:snapshot({...metadata,...patch})});
      const {data:latest,error:readError}=await admin.auth.admin.getUserById(user.id);
      if(readError || !latest.user) throw Error("preference_read_failed");
      metadata=latest.user.user_metadata || {};
    }
    return json(req,{error:"A conta está sendo atualizada em outro dispositivo. Tente novamente.",code:"sync_busy"},409);
  } catch(error) {
    const code=error instanceof Error ? error.message : "preference_failed";
    const invalid=["invalid_operations","empty_payload","payload_too_large"].includes(code) || error instanceof SyntaxError;
    if(!invalid) {
      console.warn("account preferences unavailable",{code:"preference_service_failed"});
      report("account-preferences",code);
    }
    return json(req,{error:invalid ? "Não foi possível validar esta alteração." : "Não foi possível sincronizar agora. Tente novamente.",code:invalid ? "invalid_operations" : "service_unavailable"},invalid ? 400 : 503);
  }
});

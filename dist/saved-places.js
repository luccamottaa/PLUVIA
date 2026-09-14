(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root.document) api.mount(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";
  const MAX = 20;
  const clean = (value, max) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0,max) : "";
  function makeId(runtime) {
    if (typeof runtime?.crypto?.randomUUID === "function") return runtime.crypto.randomUUID();
    if (typeof runtime?.crypto?.getRandomValues === "function") {
      const bytes = runtime.crypto.getRandomValues(new Uint8Array(16));
      return "local-" + Array.from(bytes, value => value.toString(16).padStart(2,"0")).join("");
    }
    return "local-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,12);
  }
  function normalize(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set(), result = [];
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const id = clean(item.id,64), name = clean(item.name,40);
      const cityId = String(item.cityId || ""), cityName = clean(item.cityName,80), uf = clean(item.uf,2);
      if (!/^[a-zA-Z0-9-]{1,64}$/.test(id) || !name || !/^\d{7}$/.test(cityId) || !cityName || !/^[A-Z]{2}$/.test(uf) || seen.has(id)) continue;
      seen.add(id); result.push({id,name,cityId,cityName,uf});
      if (result.length === MAX) break;
    }
    return result;
  }
  function upsert(records, entry) {
    const list = normalize(records), valid = normalize([entry])[0];
    if (!valid) throw new Error("invalid");
    const index = list.findIndex(item => item.id === valid.id);
    if (index >= 0) list[index] = valid;
    else {
      if (list.length >= MAX) throw new Error("limit");
      list.push(valid);
    }
    return list;
  }
  function mount(root) {
    const doc = root.document, el = id => doc.getElementById(id);
    if (!el("savedPlacesForm")) return;
    const guestKey = "pluvia-named-places-guest-v1";
    const account = () => root.pluviaAccount?.getUser?.() || null;
    const readGuest = () => { try {return normalize(JSON.parse(root.localStorage.getItem(guestKey) || "[]"));} catch {return [];} };
    let owner = account()?.id || null;
    let records = owner ? normalize(account()?.user_metadata?.named_places_v1) : readGuest();
    let busy = false, editing = null;
    const status = value => {el("savedPlacesStatus").textContent = value;};
    const reset = () => {editing=null;el("savedPlaceName").value="";el("savedPlaceSave").textContent="Salvar cidade atual";el("savedPlaceCancel").hidden=true;};
    function paint() {
      const list = el("savedPlacesList"); list.textContent = "";
      el("savedPlacesMode").textContent = owner
        ? "Sincronizado com sua conta. Não salve endereço completo no apelido."
        : "Salvo apenas neste navegador. Locais de visitante não são enviados à conta automaticamente.";
      if (!records.length) {const p=doc.createElement("li");p.textContent="Salve a cidade aberta como Casa, Faculdade ou Trabalho.";list.appendChild(p);}
      for (const item of records) {
        const row=doc.createElement("li");row.className="saved-place-row";
        const open=doc.createElement("button");open.type="button";open.dataset.placeOpen=item.id;
        const title=doc.createElement("strong"), detail=doc.createElement("span");
        title.textContent=item.name;detail.textContent=item.cityName+" — "+item.uf;
        open.append(title,detail);
        const rename=doc.createElement("button");rename.type="button";rename.dataset.placeEdit=item.id;rename.textContent="Renomear";rename.setAttribute("aria-label","Renomear "+item.name);
        const remove=doc.createElement("button");remove.type="button";remove.dataset.placeRemove=item.id;remove.textContent="Remover";remove.setAttribute("aria-label","Remover "+item.name);
        row.append(open,rename,remove);list.appendChild(row);
      }
      el("savedPlaceSave").disabled=busy;
      list.querySelectorAll("button").forEach(button=>{button.disabled=busy;});
    }
    async function save(next) {
      if (busy) return;
      busy=true;paint();
      const requestedOwner=owner;
      try {
        if (requestedOwner) {
          const client=await root.pluviaAccount.getClient();
          if (account()?.id !== requestedOwner) throw new Error("account");
          const {error}=await client.auth.updateUser({data:{named_places_v1:next}});
          if (error) throw error;
        } else root.localStorage.setItem(guestKey,JSON.stringify(next));
        if (owner !== requestedOwner) return;
        records=next;reset();status(requestedOwner ? "Locais salvos na conta." : "Locais salvos neste navegador.");
      } catch {
        if (owner===requestedOwner) status("Não foi possível salvar. Seus locais anteriores foram mantidos; tente novamente.");
      } finally {busy=false;paint();}
    }
    async function openPlace(item) {
      if (busy || typeof chooseCity !== "function") return;
      busy=true;status("Abrindo "+item.cityName+"…");paint();
      try {
        const city = typeof ensureCityDetails === "function" ? await ensureCityDetails(item.cityId) : null;
        if (city) chooseCity(city.id,city);
        else chooseCity(item.cityId);
        if (typeof activeCity === "undefined" || activeCity?.id !== item.cityId) throw new Error("city");
        status("");
      } catch {
        status("Não foi possível abrir esta cidade agora. Confira a conexão e tente novamente.");
      } finally {busy=false;paint();}
    }
    el("savedPlacesForm").addEventListener("submit",event=>{
      event.preventDefault();if(busy)return;
      const name=clean(el("savedPlaceName").value,40);
      const city=typeof activeCity !== "undefined" ? activeCity : null;
      const previous=records.find(item=>item.id===editing);
      if (!name) {status("Digite um nome para o local.");return;}
      if (!previous && !city) {status("Escolha uma cidade antes de salvar o local.");return;}
      const entry=previous ? {...previous,name} : {
        id:makeId(root),name,cityId:String(city.id),cityName:city.name,uf:city.uf
      };
      try {save(upsert(records,entry));} catch {status("Você pode salvar até 20 locais. Remova um para continuar.");}
    });
    el("savedPlaceCancel").addEventListener("click",()=>{reset();status("");});
    el("savedPlacesList").addEventListener("click",event=>{
      if(busy)return;
      const button=event.target.closest("button");if(!button)return;
      const id=button.dataset.placeOpen || button.dataset.placeEdit || button.dataset.placeRemove;
      const item=records.find(place=>place.id===id);if(!item)return;
      if(button.dataset.placeOpen) openPlace(item);
      else if(button.dataset.placeEdit) {
        editing=id;el("savedPlaceName").value=item.name;el("savedPlaceSave").textContent="Salvar nome";
        el("savedPlaceCancel").hidden=false;el("savedPlaceName").focus();
      } else save(records.filter(place=>place.id!==id));
    });
    root.addEventListener("pluvia:auth-changed",event=>{
      const user=event.detail?.user;
      const nextOwner=user?.id || null;
      if(owner!==nextOwner){reset();status("");}
      owner=nextOwner;
      records=owner ? normalize(user.user_metadata?.named_places_v1) : readGuest();
      paint();
    });
    paint();
  }
  return {MAX,normalize,upsert,makeId,mount};
});

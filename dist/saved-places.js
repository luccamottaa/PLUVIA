(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root.document) api.mount(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";
  const MAX = 20;
  const TOMBSTONE_MS = 30 * 24 * 60 * 60 * 1000;
  const clean = (value, max) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0,max) : "";
  function makeId(runtime) {
    if (typeof runtime?.crypto?.randomUUID === "function") return runtime.crypto.randomUUID();
    if (typeof runtime?.crypto?.getRandomValues === "function") {
      const bytes = runtime.crypto.getRandomValues(new Uint8Array(16));
      return "local-" + Array.from(bytes, value => value.toString(16).padStart(2,"0")).join("");
    }
    return "local-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,12);
  }
  function stamp(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function normalize(value, options = {}) {
    if (!Array.isArray(value)) return [];
    const keepDeleted = options.keepDeleted === true;
    const seen = new Set(), result = [];
    const now = Date.now();
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const id = clean(item.id,64), name = clean(item.name,40);
      const cityId = String(item.cityId || ""), cityName = clean(item.cityName,80), uf = clean(item.uf,2);
      if (!/^[a-zA-Z0-9-]{1,64}$/.test(id) || seen.has(id)) continue;
      const updatedAt = stamp(item.updatedAt);
      const deleted = item.deleted === true;
      if (deleted) {
        if (!keepDeleted) continue;
        if (updatedAt > 1e12 && now - updatedAt > TOMBSTONE_MS) continue;
        seen.add(id); result.push({id,name:name || "removido",cityId:cityId || "0000000",cityName:cityName || "—",uf:uf || "BR",updatedAt,deleted:true});
        continue;
      }
      if (!name || !/^\d{7}$/.test(cityId) || !cityName || !/^[A-Z]{2}$/.test(uf)) continue;
      seen.add(id); result.push({id,name,cityId,cityName,uf,updatedAt});
      if (!keepDeleted && result.length === MAX) break;
    }
    return result;
  }
  function visible(records) {
    return normalize(records).filter(item => !item.deleted).slice(0, MAX);
  }
  function merge(local, remote) {
    const map = new Map();
    for (const item of [...normalize(remote, {keepDeleted:true}), ...normalize(local, {keepDeleted:true})]) {
      const prev = map.get(item.id);
      if (!prev || item.updatedAt > prev.updatedAt || (item.updatedAt === prev.updatedAt && !item.deleted && prev.deleted)) map.set(item.id, item);
    }
    const merged = [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name, "pt-BR"));
    const living = merged.filter(item => !item.deleted).slice(0, MAX);
    const livingIds = new Set(living.map(item => item.id));
    const tombs = merged.filter(item => item.deleted && !livingIds.has(item.id)).slice(0, MAX);
    return [...living, ...tombs];
  }
  function upsert(records, entry, at = Date.now()) {
    const valid = normalize([{...entry, updatedAt: stamp(entry.updatedAt) || at, deleted:false}])[0];
    if (!valid) throw new Error("invalid");
    valid.updatedAt = at;
    const merged = merge(records, [valid]);
    if (visible(merged).length > MAX) throw new Error("limit");
    const living = visible(records);
    if (!living.some(item => item.id === valid.id) && living.length >= MAX) throw new Error("limit");
    return merge(records, [valid]);
  }
  function remove(records, id, at = Date.now()) {
    const current = normalize(records, {keepDeleted:true}).find(item => item.id === id);
    if (!current) return normalize(records, {keepDeleted:true});
    return merge(records, [{...current, deleted:true, updatedAt:at}]);
  }
  function persistable(records) {
    return normalize(records, {keepDeleted:true}).map(item => item.deleted
      ? {id:item.id,name:item.name,cityId:item.cityId,cityName:item.cityName,uf:item.uf,updatedAt:item.updatedAt,deleted:true}
      : {id:item.id,name:item.name,cityId:item.cityId,cityName:item.cityName,uf:item.uf,updatedAt:item.updatedAt});
  }
  function mount(root) {
    const doc = root.document, el = id => doc.getElementById(id);
    if (!el("savedPlacesForm")) return;
    const guestKey = "pluvia-named-places-guest-v1";
    const account = () => root.pluviaAccount?.getUser?.() || null;
    const readGuest = () => { try {return normalize(JSON.parse(root.localStorage.getItem(guestKey) || "[]"), {keepDeleted:true});} catch {return [];} };
    let owner = account()?.id || null;
    let records = owner ? normalize(account()?.user_metadata?.named_places_v1, {keepDeleted:true}) : readGuest();
    let busy = false, editing = null;
    const status = value => {el("savedPlacesStatus").textContent = value;};
    const reset = () => {editing=null;el("savedPlaceName").value="";el("savedPlaceSave").textContent="Salvar cidade atual";el("savedPlaceCancel").hidden=true;};
    function paint() {
      const list = el("savedPlacesList"); list.textContent = "";
      el("savedPlacesMode").textContent = owner
        ? "Sincronizado com sua conta. Em dois aparelhos, o apelido mais recente prevalece — não a lista inteira."
        : "Salvo apenas neste navegador. Locais de visitante não são enviados à conta automaticamente.";
      const shown = visible(records);
      if (!shown.length) {const p=doc.createElement("li");p.textContent="Salve a cidade aberta como Casa, Faculdade ou Trabalho.";list.appendChild(p);}
      for (const item of shown) {
        const row=doc.createElement("li");row.className="saved-place-row";
        const open=doc.createElement("button");open.type="button";open.dataset.placeOpen=item.id;
        const title=doc.createElement("strong"), detail=doc.createElement("span");
        title.textContent=item.name;detail.textContent=item.cityName+" — "+item.uf;
        open.append(title,detail);
        const rename=doc.createElement("button");rename.type="button";rename.dataset.placeEdit=item.id;rename.textContent="Renomear";rename.setAttribute("aria-label","Renomear "+item.name);
        const removeBtn=doc.createElement("button");removeBtn.type="button";removeBtn.dataset.placeRemove=item.id;removeBtn.textContent="Remover";removeBtn.setAttribute("aria-label","Remover "+item.name);
        row.append(open,rename,removeBtn);list.appendChild(row);
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
          const {data: latest} = await client.auth.getUser();
          next = merge(latest?.user?.user_metadata?.named_places_v1, next);
          const {error}=await client.auth.updateUser({data:{named_places_v1:persistable(next)}});
          if (error) throw error;
        } else root.localStorage.setItem(guestKey,JSON.stringify(persistable(next)));
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
      const previous=visible(records).find(item=>item.id===editing);
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
      const item=visible(records).find(place=>place.id===id);if(!item)return;
      if(button.dataset.placeOpen) openPlace(item);
      else if(button.dataset.placeEdit) {
        editing=id;el("savedPlaceName").value=item.name;el("savedPlaceSave").textContent="Salvar nome";
        el("savedPlaceCancel").hidden=false;el("savedPlaceName").focus();
      } else save(remove(records,id));
    });
    root.addEventListener("pluvia:auth-changed",event=>{
      const user=event.detail?.user;
      const nextOwner=user?.id || null;
      const switched = owner !== nextOwner;
      if (switched) { reset(); status(""); }
      owner = nextOwner;
      if (!owner) records = readGuest();
      else if (switched) records = normalize(user.user_metadata?.named_places_v1, {keepDeleted:true});
      else records = merge(records, user.user_metadata?.named_places_v1);
      paint();
    });
    paint();
  }
  return {MAX,normalize,upsert,remove,merge,visible,persistable,makeId,mount};
});

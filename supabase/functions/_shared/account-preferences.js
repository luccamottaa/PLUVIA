// Only preference data is interpreted here. Identity is verified by Auth.
const cityPattern = /^\d{7}$/;
const idPattern = /^[A-Za-z0-9-]{1,64}$/;
const clean = (value, limit) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,limit) : '';
const version = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
export function snapshot(metadata = {}) {
  const favoriteCityIds = [...new Set(Array.isArray(metadata.favorite_city_ids) ? metadata.favorite_city_ids.filter(id=>typeof id==='string' || Number.isInteger(id)).map(String).filter(id=>cityPattern.test(id)) : [])].slice(0,30);
  const namedPlaces = [], seen = new Set();
  for (const item of Array.isArray(metadata.named_places_v1) ? metadata.named_places_v1 : []) {
    if (!item || typeof item.id!=='string' || !idPattern.test(item.id || '') || seen.has(item.id)) continue;
    const place={id:item.id,name:clean(item.name,40),cityId:String(item.cityId || ''),cityName:clean(item.cityName,80),uf:clean(item.uf,2),updatedAt:version(item.updatedAt)};
    if (item.deleted===true) { place.deleted=true; place.name ||= 'removido'; place.cityId ||= '0000000'; place.cityName ||= '—'; place.uf ||= 'BR'; }
    else if (!place.name || !cityPattern.test(place.cityId) || !place.cityName || !/^[A-Z]{2}$/.test(place.uf)) continue;
    seen.add(place.id);namedPlaces.push(place);
    if(namedPlaces.length===40) break;
  }
  return {displayName:[metadata.name,metadata.full_name,metadata.display_name].map(value=>clean(value,60)).find(Boolean) || '',favoriteCityIds,primaryCityId:cityPattern.test(String(metadata.primary_city_id || '')) ? String(metadata.primary_city_id) : null,namedPlaces};
}
export function operationsInput(raw) {
  if(!raw || typeof raw!=='object' || Array.isArray(raw) || Object.keys(raw).some(key=>!['favoriteChanges','primaryCityId','placeChanges','displayName'].includes(key))) throw Error('invalid_operations');
  const result={};
  if(raw.displayName!==undefined){
    if(typeof raw.displayName!=='string' || !clean(raw.displayName,60))throw Error('invalid_operations');
    result.displayName=clean(raw.displayName,60);
  }
  if(raw.favoriteChanges!==undefined) {
    if(!Array.isArray(raw.favoriteChanges) || raw.favoriteChanges.length>60) throw Error('invalid_operations');
    const map=new Map();
    for(const item of raw.favoriteChanges) {
      if(!item || typeof item.cityId!=='string' || !cityPattern.test(item.cityId) || typeof item.enabled!=='boolean') throw Error('invalid_operations');
      map.set(item.cityId,{cityId:item.cityId,enabled:item.enabled});
    }
    // Removals precede additions so replacing a favorite at the cap works.
    result.favoriteChanges=[...map.values()].sort((a,b)=>Number(a.enabled)-Number(b.enabled));
  }
  if(raw.primaryCityId!==undefined) {
    if(typeof raw.primaryCityId!=='string' || !cityPattern.test(raw.primaryCityId)) throw Error('invalid_operations');
    result.primaryCityId=raw.primaryCityId;
  }
  if(raw.placeChanges!==undefined) {
    if(!Array.isArray(raw.placeChanges) || raw.placeChanges.length>20) throw Error('invalid_operations');
    const seen=new Set();
    result.placeChanges=raw.placeChanges.map(item=>{
      if(!item || typeof item.id!=='string' || !idPattern.test(item.id) || seen.has(item.id) || !(item.expectedUpdatedAt===null || Number.isSafeInteger(item.expectedUpdatedAt) && item.expectedUpdatedAt>=0) || typeof item.deleted!=='boolean') throw Error('invalid_operations');
      seen.add(item.id);
      const value={id:item.id,expectedUpdatedAt:item.expectedUpdatedAt,deleted:item.deleted};
      if(!item.deleted) {
        const place=item.place;
        if(!place || typeof place.cityId!=='string' || !cityPattern.test(place.cityId) || !/^[A-Z]{2}$/.test(place.uf || '') || !clean(place.name,40) || !clean(place.cityName,80)) throw Error('invalid_operations');
        value.place={name:clean(place.name,40),cityId:place.cityId,cityName:clean(place.cityName,80),uf:place.uf};
      }
      return value;
    });
  }
  return result;
}
export function applyOperations(metadata, operations, now=Date.now()) {
  const state=snapshot(metadata), patch={};
  if(operations.displayName!==undefined)patch.name=operations.displayName;
  if(operations.favoriteChanges?.length) {
    const favorites=new Set(state.favoriteCityIds);
    for(const item of operations.favoriteChanges) item.enabled ? favorites.add(item.cityId) : favorites.delete(item.cityId);
    if(favorites.size>30) throw Error('favorite_limit');
    patch.favorite_city_ids=[...favorites];
  }
  if(operations.primaryCityId!==undefined) patch.primary_city_id=operations.primaryCityId;
  if(operations.placeChanges?.length) {
    const places=new Map(state.namedPlaces.map(item=>[item.id,item]));
    for(const operation of operations.placeChanges) {
      const previous=places.get(operation.id);
      // A repeated successful request is harmless even if its response was lost.
      const same=operation.deleted ? !previous || previous.deleted : previous && !previous.deleted && Object.entries(operation.place).every(([key,value])=>previous[key]===value);
      if(same) continue;
      if((previous?.updatedAt ?? null)!==operation.expectedUpdatedAt || previous?.deleted && !operation.deleted) throw Error('preference_conflict');
      const updatedAt=Math.max(now,(previous?.updatedAt || 0)+1);
      const next=operation.deleted ? {...previous,deleted:true,updatedAt} : {id:operation.id,...operation.place,updatedAt};
      places.set(operation.id,next);
    }
    const all=[...places.values()].sort((a,b)=>b.updatedAt-a.updatedAt || a.id.localeCompare(b.id));
    const living=all.filter(item=>!item.deleted);
    if(living.length>20) throw Error('place_limit');
    patch.named_places_v1=[...living,...all.filter(item=>item.deleted).slice(0,20)];
  }
  return patch;
}

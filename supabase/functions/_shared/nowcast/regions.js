// Pilot area, not a declaration of operational radar coverage.
export const REGIONS = Object.freeze([Object.freeze({
  id:'manaus', name:'Manaus e entorno', center:{lat:-3.119,lon:-60.022},
  bounds:{south:-3.7,north:-2.5,west:-61.2,east:-59.2},
  stations:['SBEG'], radar:{id:'sipam-manaus',name:'Censipam/SIPAM',enabled:false,calibrated:false},
})]);
export const finite = value => typeof value==='number' && Number.isFinite(value);
export function within(point,bounds) {
  return !!point && finite(point.lat) && finite(point.lon) && !!bounds &&
    point.lat>=bounds.south && point.lat<=bounds.north && point.lon>=bounds.west && point.lon<=bounds.east;
}
export function regionFor(point) { return REGIONS.find(region=>within(point,region.bounds)) || null; }
export function distanceKm(a,b) {
  const radians=Math.PI/180, lat=(b.lat-a.lat)*radians,lon=(b.lon-a.lon)*radians;
  const h=Math.sin(lat/2)**2+Math.cos(a.lat*radians)*Math.cos(b.lat*radians)*Math.sin(lon/2)**2;
  return 6371*2*Math.asin(Math.min(1,Math.sqrt(h)));
}

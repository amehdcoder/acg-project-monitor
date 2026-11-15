import L from 'leaflet';
export const AREA_INSPECT_EVENT = 'microplan-area-inspect';
export function inspectMapArea(lat: number, lng: number) {
  window.dispatchEvent(new CustomEvent(AREA_INSPECT_EVENT,{detail:{lat,lng}}));
}
export function attachAreaInspection(map: L.Map) {
  const inspect = (e: L.LeafletMouseEvent) => { if (e.originalEvent?.target === map.getContainer() || !(e.originalEvent?.target as Element)?.closest('.leaflet-interactive,.leaflet-marker-icon,.leaflet-popup,.leaflet-control')) inspectMapArea(e.latlng.lat,e.latlng.lng); };
  map.on('click',inspect);
  const streets=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxNativeZoom:19,maxZoom:21,attribution:'© OpenStreetMap contributors'});
  const satellite=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:19,maxZoom:21,attribution:'© Esri, Vantor, Earthstar Geographics, GIS User Community'});
  const hybrid=L.layerGroup([L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:19,maxZoom:21,attribution:'© Esri, Vantor, Earthstar Geographics, GIS User Community'}),L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:18,maxZoom:21,attribution:'© Esri reference labels'})]);
  // Register the existing street layer so selecting imagery actually removes it.
  let base: L.Layer = streets;
  map.eachLayer(layer=>{if(layer instanceof L.TileLayer) base=layer;});
  L.control.layers({'Street map':base,'Satellite imagery':satellite,'Hybrid satellite + labels':hybrid},undefined,{position:'topright'}).addTo(map);
  return () => { map.off('click',inspect); };
}
import L from "leaflet";

/** Remove paths before their Canvas renderer, so no redraw is queued after disposal. */
export function disposeMap(map: L.Map) {
  map.stop();
  const paths: L.Layer[] = [];
  map.eachLayer(layer => { if (layer instanceof L.Path) paths.push(layer); });
  for (const path of paths) map.removeLayer(path);
  map.remove();
}
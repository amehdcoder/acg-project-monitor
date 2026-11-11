import L from "leaflet";

/** Remove paths before their Canvas renderer, so no redraw is queued after disposal. */
export function disposeMap(map: L.Map) {
  map.stop();
  const paths: L.Layer[] = [];
  const renderers: L.Layer[] = [];
  const groups: L.LayerGroup[] = [];
  map.eachLayer(layer => { if (layer instanceof L.LayerGroup) groups.push(layer); });
  // Drain groups while their renderer is still alive. Otherwise Map.remove()
  // removes the renderer first and a group's later path removal queues a frame
  // against the already-destroyed canvas context.
  for (const group of groups) { group.clearLayers(); map.removeLayer(group); }
  map.eachLayer(layer => { if (layer instanceof L.Canvas) renderers.push(layer); });
  map.eachLayer(layer => { if (layer instanceof L.Path) paths.push(layer); });
  for (const path of paths) map.removeLayer(path);
  // Removing an empty renderer cancels its pending frame; Map.remove's layer
  // order can otherwise remove a renderer before a group queues its last redraw.
  for (const renderer of renderers) map.removeLayer(renderer);
  map.remove();
}
/// <reference types="vite/client" />

declare module "leaflet.heat" {
  import * as L from "leaflet";
  namespace L {
    function heatLayer(
      latlngs: Array<[number, number, number?]>,
      options?: any
    ): any;
  }
}

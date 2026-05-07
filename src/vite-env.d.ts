/// <reference types="vite/client" />

declare const __APP_BUILD_ID__: string;

declare module "leaflet.heat" {
  import * as L from "leaflet";
  namespace L {
    function heatLayer(
      latlngs: Array<[number, number, number?]>,
      options?: any
    ): any;
  }
}

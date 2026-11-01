import { describe, expect, it } from "vitest";
import { facilityLocations, facilitiesInZone, distanceKm } from "../hotspots";
import type { EyeReportRow } from "../definition";
import type { EnvironmentalFeature } from "../environment";
const gps = (lat: number, lng: number) => ({ lat,lng,accuracy:10,captured_at:"2026-11-01T10:00:00Z" });
const report = { project_id:"project",facility_id:"facility",facility_name:"Clinic",report_date:"2026-11-01",gps:gps(11.5,9.5) } as EyeReportRow;
const zone = { type:"Feature",properties:{kind:"dust",name:"Cell",source:"CAMS",observed_at:"2026-10-31"},geometry:{type:"Polygon",coordinates:[[[9,11],[10,11],[10,12],[9,12],[9,11]]]}} as EnvironmentalFeature;
describe("Live hotspot facility counts",()=>{
  it("counts one facility across repeated reporting days",()=>{
    const f=facilityLocations([report,{...report,report_date:"2026-10-01"}],[]);
    expect(f.locations).toHaveLength(1); expect(facilitiesInZone(zone,f.locations)).toHaveLength(1);
  });
  it("uses registered location ahead of capture proxies and matches names to ids",()=>{
    const f=facilityLocations([{...report,facility_id:null}],[{id:"facility",name:"Clinic",latitude:13,longitude:9.5,state:"Jigawa",lga:null}]);
    expect(f.locations).toHaveLength(1); expect(f.locations[0].evidence).toBe("Registered facility coordinates"); expect(facilitiesInZone(zone,f.locations)).toHaveLength(0);
  });
  it("retains missing GPS as unknown not invented zero-risk locations",()=>{
    const f=facilityLocations([{...report,gps:null}],[]);expect(f.unlocated).toBe(1);expect(f.locations).toHaveLength(0);
  });
  it("counts water proximity using the specified 1 km radius not inferred WASH access",()=>{
    const water={...zone,properties:{...zone.properties,kind:"water" as const},geometry:{type:"Point" as const,coordinates:[9.5,11.5]}};
    const f=facilityLocations([report],[]).locations;
    expect(facilitiesInZone(water,f,1)).toHaveLength(1);expect(distanceKm(11.5,9.5,11.6,9.5)).toBeGreaterThan(1);
    expect(facilitiesInZone({...water,geometry:{type:"Point",coordinates:[9.5,11.6]}},f,1)).toHaveLength(0);
  });
});